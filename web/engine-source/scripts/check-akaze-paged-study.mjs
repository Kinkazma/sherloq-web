import {readFile,writeFile} from 'node:fs/promises';
import create from '../.build/m3/akaze-paged/akaze-paged.js';
const m=await create({wasmBinary:await readFile(new URL('../.build/m3/akaze-paged/akaze-paged.wasm',import.meta.url)),print(){},printErr:console.error}),records=[];
const alloc=n=>{const p=m._malloc(Math.max(8,n));if(!p)throw Error('Allocation');return p;},copy=(p,n)=>m.HEAPF32.slice(p/4,p/4+n);
for(const [width,height] of [[397,281],[640,480]]){
 const start=performance.now(),gray=Uint8Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);return ((x*13+y*23)^((x>>3)*47+(y>>3)*29))%256;}),ip=alloc(gray.length);m.HEAPU8.set(gray,ip);
 const n=m._m3_akaze_init(width,height),config=copy(m._m3_akaze_config(),n*10);if(n<=0||m._m3_akaze_reference(ip,width,height)!==1)throw Error('Reference');
 const expected=Array.from({length:n},(_,level)=>Array.from({length:4},(_,field)=>copy(m._m3_akaze_reference_plane(level,field),config[level*10]*config[level*10+1])));m._free(ip);
 const initial=new Float32Array(width*height),magnitudes=new Float32Array(width*height),core=96,halo=128;let windows=0;
 function window(source,w,h,x,y,cw,ch,halo,bytes){const x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),x1=Math.min(w,x+cw+halo),y1=Math.min(h,y+ch+halo),tw=x1-x0,th=y1-y0,p=alloc(tw*th*bytes),heap=bytes===1?m.HEAPU8:m.HEAPF32;for(let yy=0;yy<th;yy++)heap.set(source.subarray((yy+y0)*w+x0,(yy+y0)*w+x1),p/bytes+yy*tw);return {x0,y0,tw,th,p};}
 function extract(target,w,x,y,cw,ch,view,field){const offset=m._m3_akaze_plane(field)/4;for(let yy=0;yy<ch;yy++)target.set(m.HEAPF32.subarray(offset+(y+yy-view.y0)*view.tw+x-view.x0,offset+(y+yy-view.y0)*view.tw+x-view.x0+cw),(y+yy)*w+x);}
 for(let y=0;y<height;y+=core)for(let x=0;x<width;x+=core){const cw=Math.min(core,width-x),ch=Math.min(core,height-y),v=window(gray,width,height,x,y,cw,ch,halo,1);if(m._m3_akaze_prepare(v.p,v.tw,v.th)!==1)throw Error('Prepare');extract(initial,width,x,y,cw,ch,v,0);extract(magnitudes,width,x,y,cw,ch,v,1);m._m3_akaze_release();m._free(v.p);windows++;}
 const interior=new Float32Array((width-2)*(height-2));for(let y=1;y<height-1;y++)interior.set(magnitudes.subarray(y*width+1,(y+1)*width-1),(y-1)*(width-2));let maximum=0;for(const value of interior)maximum=Math.max(maximum,value);const hp=alloc(1200),mp=alloc(interior.byteLength);m.HEAP32.fill(0,hp/4,hp/4+300);m.HEAPF32.set(interior,mp/4);m._m3_akaze_histogram(mp,interior.length,maximum,hp);let contrast=m._m3_akaze_contrast(hp,interior.length,maximum);m._free(hp);m._free(mp);
 let base=initial,w=width,h=height;const levels=[];
 for(let level=0;level<n;level++){
  const nw=config[level*10],nh=config[level*10+1];if(nw!==w||nh!==h){const p=alloc(base.byteLength);m.HEAPF32.set(base,p/4);if(m._m3_akaze_resize(p,w,h,nw,nh)!==1)throw Error('Resize');base=copy(m._m3_akaze_plane(0),nw*nh);m._m3_akaze_release();m._free(p);w=nw;h=nh;contrast=Math.fround(contrast*.75);}
  const output=Array.from({length:5},()=>new Float32Array(w*h));
  for(let y=0;y<h;y+=core)for(let x=0;x<w;x+=core){const cw=Math.min(core,w-x),ch=Math.min(core,h-y),v=window(base,w,h,x,y,cw,ch,halo,4);if(m._m3_akaze_evolve(v.p,v.tw,v.th,level,contrast)!==1)throw Error('Evolve');for(let f=0;f<5;f++)extract(output[f],w,x,y,cw,ch,v,f);m._m3_akaze_release();m._free(v.p);windows++;}
  const fields=[0,2,3,4].map((f,k)=>{let differences=0,max=0;for(let i=0;i<w*h;i++){differences+=output[f][i]!==expected[level][k][i];max=Math.max(max,Math.abs(output[f][i]-expected[level][k][i]));}return {field:['Lt','Ldet','Lx','Ly'][k],differences,max};});levels.push({level,w,h,steps:config[level*10+9],contrast,fields});console.log(JSON.stringify(levels.at(-1)));base=output[0];
 }
 const record={width,height,windows,levels,totalMs:performance.now()-start,heapBytes:m.HEAPU8.byteLength};records.push(record);if(levels.some(l=>l.fields.some(f=>f.differences)))throw Error('Global evolution mismatch');
}
await writeFile(new URL('../docs/m3-akaze-paged-study.json',import.meta.url),JSON.stringify({qualification:'Development finite-support evolution study only; not a complete detector or96MP qualification',records},null,2)+'\n');
