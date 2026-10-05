import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createBytePager} from './byte-pager.js';
const MiB=1024**2;
export async function detectSegmentedPanels(image,{budget,signal,onProgress,storage='auto'}={}){
 const cooperate=createCooperator(signal);const {width:w,height:h,format}=image.surface.descriptor,n=w*h;requireValue(format==='rgb8'&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&n<2**31,'RGB8 source surface required.');const step=Math.max(1,Math.ceil(Math.max(w,h)/1800)),sw=Math.ceil(w/step),sh=Math.ceil(h/step),sampleBytes=32768*4+8*3*256*4+sw*6,workBytes=w*196+8192,pagerBytes=Math.min(n,4*MiB)+Math.min(8*Math.ceil(w/2)*h,MiB/4)+2*65536,stores=[],pagers=[],proposalReleases=[];let sampleRelease,workRelease,planning,resultRelease;
 try{
  sampleRelease=budget.reserve(sampleBytes);const counts=new Uint32Array(32768);let previous=new Uint8Array(sw*3),current=new Uint8Array(sw*3);
  async function samples(visit,pass){const last=await image.surface.readWindow({x:0,y:(sh-1)*step,width:w,height:1},{signal});try{for(let x=0;x<sw;x++)for(let c=0;c<3;c++)previous[x*3+c]=last.pixels.data[x*step*3+c];}finally{last.release();}let sampled=0;
   for(let sy=0;sy<h;){await cooperate();const rows=Math.min(32,h-sy),band=await image.surface.readWindow({x:0,y:sy,width:w,height:rows},{signal});let next=sy;try{for(let y=sy;y<sy+rows;y+=step){const row=(y-sy)*w*3;for(let x=0;x<sw;x++){const p=row+x*step*3;for(let c=0;c<3;c++)current[x*3+c]=band.pixels.data[p+c];}for(let x=0;x<sw;x++){const p=x*3,left=(x?x-1:sw-1)*3;let flat=true;for(let c=0;c<3;c++)if(Math.abs(current[p+c]-previous[p+c])>2||Math.abs(current[p+c]-current[left+c])>2){flat=false;break;}if(flat)visit((current[p+2]>>3)*1024+(current[p+1]>>3)*32+(current[p]>>3),current,p);}[previous,current]=[current,previous];sampled++;next=y+step;}}finally{band.release();}sy=next;onProgress?.({phase:'panel-palette',fraction:(pass+sampled/sh)/2});}}
  await samples(code=>counts[code]++,0);const palette=[];for(let code=0;code<counts.length;code++)if(counts[code]){palette.push(code);palette.sort((a,b)=>counts[b]-counts[a]||a-b);if(palette.length>8)palette.pop();}
  if(!palette.length){return {polygons:[],metrics:{sampleStep:step,paletteColors:0},dispose(){}};}
  const indices=new Map(palette.map((code,i)=>[code,i])),hist=palette.map(()=>[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)]);await samples((code,row,p)=>{const index=indices.get(code);if(index!==undefined)for(let c=0;c<3;c++)hist[index][c][row[p+c]]++;},1);
  const median=(hist,count)=>{const lo=Math.floor((count-1)/2),hi=Math.floor(count/2);let total=0,a=-1;for(let v=0;v<256;v++){total+=hist[v];if(a<0&&total>lo)a=v;if(total>hi)return Math.floor((a+v)/2);}throw Error('Missing panel color sample.');},colors=palette.map((code,i)=>hist[i].map(channel=>median(channel,counts[code])));
  planning=budget.reserve(workBytes+pagerBytes+w*99+4*MiB);const options={budget,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal},make=async bytes=>{const s=await createSegmentedBytes(bytes,options);stores.push(s);return s;},mask=await make(n),scratch=await make(n),queue=await make(8*Math.ceil(w/2)*h);planning();planning=null;workRelease=budget.reserve(workBytes);
  const input=new Uint8Array(w*Math.min(h,66)),horizontal=new Uint8Array(input.length),output=new Uint8Array(w*Math.min(h,64)),proposals=[];
  const near=(data,p,color)=>Math.max(Math.abs(data[p]-color[0]),Math.abs(data[p+1]-color[1]),Math.abs(data[p+2]-color[2]))<=14;
  async function close(){for(let pass=0;pass<2;pass++){const source=pass?scratch:mask,destination=pass?mask:scratch;
   for(let y=0;y<h;y+=64){await cooperate();const end=Math.min(h,y+64),lo=Math.max(0,y-1),hi=Math.min(h,end+1),rows=hi-lo;await source.readInto(input.subarray(0,rows*w),lo*w);for(let yy=0;yy<rows;yy++)for(let x=0;x<w;x++){const i=yy*w+x;horizontal[i]=pass?input[i]&(x?input[i-1]:1)&(x+1<w?input[i+1]:1):input[i]|(x?input[i-1]:0)|(x+1<w?input[i+1]:0);}for(let yy=y;yy<end;yy++)for(let x=0;x<w;x++){const i=(yy-lo)*w+x;output[(yy-y)*w+x]=pass?horizontal[i]&(yy?horizontal[i-w]:1)&(yy+1<h?horizontal[i+w]:1):horizontal[i]|(yy?horizontal[i-w]:0)|(yy+1<h?horizontal[i+w]:0);}await destination.write(output.subarray(0,(end-y)*w),y*w);}await destination.flush();}}
  async function border(x0,y0,x1,y1,color){if(x1<=x0||y1<=y0)return 1;let count=0,good=0;for(let y=y0;y<y1;y+=32){await cooperate();const rows=Math.min(32,y1-y),part=await image.surface.readWindow({x:x0,y,width:x1-x0,height:rows},{signal});try{const rgb=part.pixels.data;for(let p=0;p<rgb.length;p+=3){count++;if(near(rgb,p,color))good++;}}finally{part.release();}}return good/count;}
  for(let ci=0;ci<colors.length;ci++){
   const color=colors[ci];for(let y=0;y<h;y+=32){await cooperate();const rows=Math.min(32,h-y),part=await image.surface.readWindow({x:0,y,width:w,height:rows},{signal});try{const rgb=part.pixels.data;for(let i=0;i<w*rows;i++)output[i]=near(rgb,i*3,color)?0:1;await mask.write(output.subarray(0,w*rows),y*w);}finally{part.release();}}await mask.flush();await close();
   const wp=createBytePager(mask,{budget,signal,maxPages:64,mutable:true});pagers.push(wp);const qp=createBytePager(queue,{budget,signal,maxPages:4,mutable:true});pagers.push(qp);let visited=0,nextYield=8192;
   // Global eight-connected components, queued as maximal horizontal runs.
   // Only count and bounds are consumed; no per-pixel queue or traversal labels.
   for(let first=0;first<n;){
    await cooperate();const scan=Math.min(n-first,65536-first%65536);let wait=wp.prepare(first,scan);if(wait)await wait;const found=wp.span(first,scan).findIndex(v=>v!==0);if(found<0){first+=scan;continue;}const seed=first+found;first=seed+1;
    let tail=0,pixels=0,x0=w,x1=0,y0=h,y1=0;
    const enqueue=async(x,y)=>{
     let pending=wp.prepare(y*w,w);if(pending)await pending;let left=x,right=x;while(left>0&&wp.get8(y*w+left-1))left--;while(right+1<w&&wp.get8(y*w+right+1))right++;
     const start=y*w+left,end=y*w+right+1;for(let at=start;at<end;){const length=Math.min(end-at,65536-at%65536);wp.span(at,length,{write:true}).fill(0);at+=length;}
     pending=qp.prepare(tail*8,8);if(pending)await pending;qp.set32(tail*8,start);qp.set32(tail*8+4,end);tail++;pixels+=end-start;x0=Math.min(x0,left);x1=Math.max(x1,right);y0=Math.min(y0,y);y1=Math.max(y1,y);return right;
    };
    await enqueue(seed%w,Math.floor(seed/w));
    for(let head=0;head<tail;head++){
     if((head&1023)===0)await cooperate();if(visited+pixels>=nextYield){nextYield=visited+pixels+8192;onProgress?.({phase:'panel-components',color:ci+1,visited:visited+pixels});checkAbort(signal);}
     wait=qp.prepare(head*8,8);if(wait)await wait;const start=qp.get32(head*8),end=qp.get32(head*8+4),y=Math.floor(start/w),lo=Math.max(0,start%w-1),hi=Math.min(w-1,(end-1)%w+1);
     for(const yy of [y-1,y+1])if(yy>=0&&yy<h){wait=wp.prepare(yy*w,w);if(wait)await wait;for(let x=lo;x<=hi;x++)if(wp.get8(yy*w+x))x=await enqueue(x,yy);}
    }
    visited+=pixels;const bw=x1-x0+1,bh=y1-y0+1,area=bw*bh;if(bw<Math.max(24,w*.012)||bh<Math.max(16,h*.012)||area<n*.0005||area>n*.95||pixels/area<.82)continue;
    const borders=[await border(x0,Math.max(0,y0-2),x0+bw,y0,color),await border(x0,y0+bh,x0+bw,Math.min(h,y0+bh+2),color),await border(Math.max(0,x0-2),y0,x0,y0+bh,color),await border(x0+bw,y0,Math.min(w,x0+bw+2),y0+bh,color)];if(Math.min(...borders)>=.65){proposalReleases.push(budget.reserve(2048));proposals.push([x0,y0,bw,bh,pixels/area]);}
   }
   for(const p of pagers)p.dispose();pagers.length=0;onProgress?.({phase:'panel-colors',fraction:(ci+1)/colors.length});
  }
  proposals.sort((a,b)=>b[2]*b[3]-a[2]*a[3]||a[1]-b[1]||a[0]-b[0]);const selected=[];for(const p of proposals){await cooperate();const[x,y,bw,bh]=p;let overlaps=false;for(const[a,b,c,d]of selected){const inter=Math.max(0,Math.min(x+bw,a+c)-Math.max(x,a))*Math.max(0,Math.min(y+bh,b+d)-Math.max(y,b));if(inter/Math.min(bw*bh,c*d)>.2){overlaps=true;break;}}if(!overlaps)selected.push(p);}
  selected.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);const rows=[];for(const panel of selected){if(!rows.length||panel[1]-rows.at(-1)[0][1]>Math.max(4,h*.02))rows.push([]);rows.at(-1).push(panel);}resultRelease=budget.reserve(selected.length*1024);const polygons=rows.flatMap(row=>row.sort((a,b)=>a[0]-b[0])).map(([x,y,bw,bh])=>[[x,y],[x+bw-1,y],[x+bw-1,y+bh-1],[x,y+bh-1]]);checkAbort(signal);const release=resultRelease;resultRelease=null;return {polygons,metrics:{sampleStep:step,paletteColors:colors.length,proposals:proposals.length,panelWorkspaceBytes:sampleBytes+workBytes+pagerBytes,maskStorage:mask.storage},dispose:release};
 }finally{for(const p of pagers)p.dispose();sampleRelease?.();workRelease?.();planning?.();resultRelease?.();for(const release of proposalReleases)release();await Promise.allSettled(stores.map(s=>s.dispose()));}
}
