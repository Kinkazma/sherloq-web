import "../../runtime-context.js?v=0.14.5";
// Native core/auto_zones.py panel detector. Integer RGB input; BGR palette order.
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {parameters} from './pixel-utils.js';
export const subimageParams=(p={})=>parameters(p,{});
export function subimageWorkspaceBytes({width,height}){const step=Math.max(1,Math.ceil(Math.max(width,height)/1800));return width*height*6+Math.ceil(width/step)*Math.ceil(height/step)*2+32768*4+8192;}
export async function subimageData(image,p,hooks={},context={}){
 const polygons=await detectPanels(image,{...hooks,account:context.reserveMemory});
 const regions=polygons.map((polygon,i)=>({id:'panel-'+i,bounds:[polygon[0][0],polygon[0][1],polygon[2][0]+1,polygon[2][1]+1]}));
 return {data:{regions,polygons,coordinates:'original-pixel-centres',boundsConvention:'half-open'},semantics:'Rectangular panels separated by flat coloured gutters. Geometric proposals, not evidence of tampering. Empty detection stays empty; no whole-image fallback or complete analysis is implied.'};
}
export async function detectPanels(image,{signal,onProgress,account=()=>{}}={}){
 const {width:w,height:h,data}=image,n=w*h;
 requireValue(image.format==='rgb8'&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&n<2**31&&data instanceof Uint8Array&&data.length===n*3,'RGB8 image required');
 const step=Math.max(1,Math.ceil(Math.max(w,h)/1800)),sw=Math.ceil(w/step),sh=Math.ceil(h/step);
 checkAbort(signal);account(subimageWorkspaceBytes(image));
 let lastYield=performance.now();
 const yieldWork=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
 const counts=new Uint32Array(32768),codes=new Uint16Array(sw*sh);codes.fill(65535);
 for(let y=0;y<sh;y++){
  for(let x=0;x<sw;x++){
   const p=(y*step*w+x*step)*3,up=((y?y-1:sh-1)*step*w+x*step)*3,left=(y*step*w+(x?x-1:sw-1)*step)*3;
   let flat=true;for(let c=0;c<3;c++)if(Math.abs(data[p+c]-data[up+c])>2||Math.abs(data[p+c]-data[left+c])>2){flat=false;break;}
   if(flat){const code=(data[p+2]>>3)*1024+(data[p+1]>>3)*32+(data[p]>>3);codes[y*sw+x]=code;counts[code]++;}
  }
  await yieldWork();
 }
 const palette=[];for(let code=0;code<counts.length;code++)if(counts[code]){palette.push(code);palette.sort((a,b)=>counts[b]-counts[a]||a-b);if(palette.length>8)palette.pop();}
 if(!palette.length){onProgress?.(1);return [];}
 onProgress?.(.1);
 const mask=new Uint8Array(n),scratch=new Uint8Array(n),queue=new Int32Array(n),proposals=[];
 const median=(hist,count)=>{const lo=Math.floor((count-1)/2),hi=Math.floor(count/2);let total=0,a=-1;for(let v=0;v<256;v++){total+=hist[v];if(a<0&&total>lo)a=v;if(total>hi)return Math.floor((a+v)/2);}throw Error('Missing sample median');};
 const near=(p,color)=>Math.max(Math.abs(data[p]-color[0]),Math.abs(data[p+1]-color[1]),Math.abs(data[p+2]-color[2]))<=14;
 async function close(){
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x;scratch[i]=mask[i]|(x?mask[i-1]:0)|(x+1<w?mask[i+1]:0);}await yieldWork();}
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x;mask[i]=scratch[i]|(y?scratch[i-w]:0)|(y+1<h?scratch[i+w]:0);}await yieldWork();}
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x;scratch[i]=mask[i]&(x?mask[i-1]:1)&(x+1<w?mask[i+1]:1);}await yieldWork();}
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x;mask[i]=scratch[i]&(y?scratch[i-w]:1)&(y+1<h?scratch[i+w]:1);}await yieldWork();}
 }
 async function border(x0,y0,x1,y1,color){let count=0,good=0;for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){count++;if(near((y*w+x)*3,color))good++;if((count&8191)===0)await yieldWork();}}return count?good/count:1;}
 for(let ci=0;ci<palette.length;ci++){
  const code=palette[ci],hist=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];
  for(let y=0;y<sh;y++){for(let x=0;x<sw;x++)if(codes[y*sw+x]===code){const p=(y*step*w+x*step)*3;for(let c=0;c<3;c++)hist[c][data[p+c]]++;}await yieldWork();}
  const color=hist.map(values=>median(values,counts[code]));
  for(let y=0;y<h;y++){for(let x=0;x<w;x++)mask[y*w+x]=near((y*w+x)*3,color)?0:1;await yieldWork();}
  await close();
  for(let first=0;first<n;first++){
   if((first&8191)===0)await yieldWork();
   if(!mask[first])continue;
   let head=0,tail=1,x0=first%w,x1=x0,y0=Math.floor(first/w),y1=y0;queue[0]=first;mask[first]=0;
   while(head<tail){
    const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    // The centre is already visited. Enumerate its eight neighbours once,
    // preserving discovery order and avoiding a nested coordinate scan.
    if(y){const j=i-w;if(x&&mask[j-1]){mask[j-1]=0;queue[tail++]=j-1;}if(mask[j]){mask[j]=0;queue[tail++]=j;}if(x+1<w&&mask[j+1]){mask[j+1]=0;queue[tail++]=j+1;}}
    if(x&&mask[i-1]){mask[i-1]=0;queue[tail++]=i-1;}if(x+1<w&&mask[i+1]){mask[i+1]=0;queue[tail++]=i+1;}
    if(y+1<h){const j=i+w;if(x&&mask[j-1]){mask[j-1]=0;queue[tail++]=j-1;}if(mask[j]){mask[j]=0;queue[tail++]=j;}if(x+1<w&&mask[j+1]){mask[j+1]=0;queue[tail++]=j+1;}}
    if(head%8192===0)await yieldWork();
   }
   const bw=x1-x0+1,bh=y1-y0+1,area=bw*bh;
   if(bw<Math.max(24,w*.012)||bh<Math.max(16,h*.012)||area<n*.0005||area>n*.95||tail/area<.82)continue;
   const borders=[await border(x0,Math.max(0,y0-2),x0+bw,y0,color),await border(x0,y0+bh,x0+bw,Math.min(h,y0+bh+2),color),await border(Math.max(0,x0-2),y0,x0,y0+bh,color),await border(x0+bw,y0,Math.min(w,x0+bw+2),y0+bh,color)];
   if(Math.min(...borders)>=.65){account(2048);proposals.push([x0,y0,bw,bh,tail/area]);}
   await yieldWork();
  }
  onProgress?.(.1+.8*(ci+1)/palette.length);
 }
 proposals.sort((a,b)=>b[2]*b[3]-a[2]*a[3]||a[1]-b[1]||a[0]-b[0]);const selected=[];
 for(const p of proposals){await yieldWork();const [x,y,bw,bh]=p;let overlaps=false;for(const [a,b,c,d]of selected){const inter=Math.max(0,Math.min(x+bw,a+c)-Math.max(x,a))*Math.max(0,Math.min(y+bh,b+d)-Math.max(y,b));if(inter/Math.min(bw*bh,c*d)>.2){overlaps=true;break;}}if(!overlaps)selected.push(p);}
 selected.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);const rows=[];
 for(const panel of selected){await yieldWork();if(!rows.length||panel[1]-rows.at(-1)[0][1]>Math.max(4,h*.02))rows.push([]);rows.at(-1).push(panel);}
 checkAbort(signal);onProgress?.(1);
 return rows.flatMap(row=>row.sort((a,b)=>a[0]-b[0])).map(([x,y,bw,bh])=>[[x,y],[x+bw-1,y],[x+bw-1,y+bh-1],[x,y+bh-1]]);
}
