import {readFile,writeFile} from 'node:fs/promises';import create from '../.build/m3/sift-paged/sift-paged.js';
const m=await create({wasmBinary:await readFile(new URL('../.build/m3/sift-paged/sift-paged.wasm',import.meta.url)),print(){},printErr:console.error}),alloc=n=>{const p=m._malloc(Math.max(n,8));if(!p)throw Error('Allocation');return p;},copy=(p,n)=>m.HEAPF32.slice(p/4,p/4+n),records=[];
const forced=process.argv.includes('--force-continuation');
for(const [width,height,layers,contrast] of (forced?[[93,77,3,.04]]:[[193,157,3,.04],[333,257,3,.001],[271,197,4,.0066667]])){
 const start=performance.now(),gray=Uint8Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);return ((x*13+y*23)^((x>>3)*47+(y>>3)*29))%256;}),ip=alloc(gray.length);m.HEAPU8.set(gray,ip);const limit=400,count=m._m3_sift_reference(ip,width,height,limit,layers,contrast);if(count<0)throw Error('Reference');const expected=copy(m._m3_sift_points(),count*7),descExpected=copy(m._m3_sift_descriptors(),count*128);m._m3_sift_release();if(m._m3_sift_initial(ip,width,height)!==1)throw Error('Initial');let w=width*2,h=height*2,base=copy(m._m3_sift_initial_data(),w*h);m._m3_sift_release();m._free(ip);
 const octaves=Math.round(Math.log(Math.min(w,h))/Math.log(2)-2)+1,core=128,halo=256,bases=[],raw=[];let escapes=0,windows=0;
 const crop=(base,w,h,x0,y0,x1,y1)=>{const tw=x1-x0,th=y1-y0,ptr=alloc(tw*th*4);for(let yy=0;yy<th;yy++)m.HEAPF32.set(base.subarray((yy+y0)*w+x0,(yy+y0)*w+x1),ptr/4+yy*tw);if(m._m3_sift_build(ptr,tw,th,layers)!==1)throw Error('Build');return {ptr,tw,th};};
 for(let octave=0;octave<octaves;octave++){
  bases.push({base,w,h});const nw=Math.floor(w/2),nh=Math.floor(h/2),next=new Float32Array(nw*nh);
  for(let y=0;y<h;y+=core)for(let x=0;x<w;x+=core){const cw=Math.min(core,w-x),ch=Math.min(core,h-y),x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),x1=Math.min(w,x+cw+halo),y1=Math.min(h,y+ch+halo),{ptr,tw}=crop(base,w,h,x0,y0,x1,y1),lp=m._m3_sift_layer(layers)/4;
   for(let yy=Math.ceil(y/2);yy<Math.min(nh,Math.ceil((y+ch)/2));yy++)for(let xx=Math.ceil(x/2);xx<Math.min(nw,Math.ceil((x+cw)/2));xx++)next[yy*nw+xx]=m.HEAPF32[lp+(yy*2-y0)*tw+xx*2-x0];
   m._m3_sift_force_continuation(+forced);const n=m._m3_sift_detect(x0,y0,w,h,x-x0,y-y0,cw,ch,octave,contrast);if(n<0)throw Error('Detect');raw.push(copy(m._m3_sift_points(),n*7));const nc=m._m3_sift_escape_count(),seeds=m.HEAP32.slice(m._m3_sift_escapes()/4,m._m3_sift_escapes()/4+nc*6);escapes+=nc;windows++;m._m3_sift_release();m._free(ptr);
   if(nc){let view;const sp=alloc(16),np=alloc(108),kp=alloc(28);
    for(let id=0;id<nc;id++){m.HEAP32.set([seeds[id*6],seeds[id*6+1],seeds[id*6+2],0],sp/4);
     for(;;){const c=m.HEAP32[sp/4],r=m.HEAP32[sp/4+1],layer=m.HEAP32[sp/4+2];
      if(!view||view.x0>0&&c<view.x0+128||view.y0>0&&r<view.y0+128||view.x1<w&&c>=view.x1-128||view.y1<h&&r>=view.y1-128){if(view){m._m3_sift_release();m._free(view.ptr);}const x0=Math.max(0,c-256),y0=Math.max(0,r-256),x1=Math.min(w,c+257),y1=Math.min(h,r+257);view={...crop(base,w,h,x0,y0,x1,y1),x0,y0,x1,y1};}
      if(m._m3_sift_neighborhood(c-view.x0,r-view.y0,layer,np)!==1)throw Error('Neighborhood');const status=m._m3_sift_refine(sp,np,w,h,layers,octave,contrast,kp);if(status===0)break;if(status===2){const n=m._m3_sift_finish_orientation(kp,c,r,layer,octave,view.x0,view.y0);if(n<0)throw Error('Orientation');raw.push(copy(m._m3_sift_points(),n*7));break;}
     }
    }
    if(view){m._m3_sift_release();m._free(view.ptr);}m._free(sp);m._free(np);m._free(kp);
   }
  }
  base=next;w=nw;h=nh;
 }
 const nraw=raw.reduce((s,a)=>s+a.length,0),rp=alloc(nraw*4);let at=rp/4;for(const a of raw){m.HEAPF32.set(a,at);at+=a.length;}const n=m._m3_sift_select(rp,nraw/7,limit,0,width,height),points=copy(m._m3_sift_points(),n*7);m._m3_sift_release();m._free(rp);let pointDiff=0,pointMax=0;for(let i=0;i<points.length;i++){pointDiff+=points[i]!==expected[i];pointMax=Math.max(pointMax,Math.abs(points[i]-expected[i]));}
 const descriptors=new Float32Array(n*128),jobs=new Map();for(let i=0;i<n;i++){const encoded=points[i*7+5]|0,oct=(encoded&255)<128?(encoded&255):(encoded&255)-256,o=oct+1,scale=2**(-oct),x=Math.floor(points[i*7]*scale/core)*core,y=Math.floor(points[i*7+1]*scale/core)*core,key=o+':'+x+':'+y;let job=jobs.get(key);if(!job)jobs.set(key,job={o,x,y,ids:[]});job.ids.push(i);}
 for(const {o,x,y,ids} of jobs.values()){
  const {base,w,h}=bases[o],x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),x1=Math.min(w,x+core+halo),y1=Math.min(h,y+core+halo),{ptr}=crop(base,w,h,x0,y0,x1,y1),pp=alloc(ids.length*28);ids.forEach((id,i)=>m.HEAPF32.set(points.subarray(id*7,id*7+7),pp/4+i*7));if(m._m3_sift_describe(pp,ids.length,x0,y0)!==ids.length)throw Error('Describe');const dp=m._m3_sift_descriptors()/4;ids.forEach((id,i)=>descriptors.set(m.HEAPF32.subarray(dp+i*128,dp+(i+1)*128),id*128));m._m3_sift_release();m._free(pp);m._free(ptr);
 }
 let descriptorDiff=0,descriptorMax=0;for(let i=0;i<descriptors.length;i++){descriptorDiff+=descriptors[i]!==descExpected[i];descriptorMax=Math.max(descriptorMax,Math.abs(descriptors[i]-descExpected[i]));}
 const record={width,height,layers,contrast,octaves,windows,rawPoints:nraw/7,points:n,expectedPoints:count,pointDiff,pointMax,descriptorDiff,descriptorMax,escapes,totalMs:performance.now()-start,heapBytes:m.HEAPU8.byteLength};records.push(record);console.log(JSON.stringify(record));
 if(n!==count||pointDiff||descriptorDiff||(forced&&!escapes))throw Error('Support-window study mismatch');
}
await writeFile(new URL('../docs/m3-sift-paged'+(forced?'-continuation':'')+'-study.json',import.meta.url),JSON.stringify({qualification:'Development octave-support study; not a paged runtime or96MP qualification',records},null,2)+'\n');
