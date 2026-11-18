import "../../runtime-context.js?v=0.33.3";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createBytePager} from './byte-pager.js';
const MiB=1024**2,PAGE_BYTES=65536,SCAN_PIXELS=65536;
// Private lossless mask: each row has ceil(width/32) little-endian uint32
// words, pixel x at bit(x%32), and zero padding after the physical right edge.
function packBinaryMask(rgb,outputView,w,rows,rowBytes,color,near){
 for(let y=0;y<rows;y++)for(let x=0;x<w;x+=32){let bits=0;const end=Math.min(w,x+32);for(let xx=x;xx<end;xx++)if(!near(rgb,(y*w+xx)*3,color))bits|=1<<(xx-x);outputView.setUint32(y*rowBytes+(x>>>5)*4,bits,true);}
}
function findBitForward(pager,row,start,end,value){
 let at=start;if(at>=end)return -1;
 // Most local searches finish in the first word: do not allocate a span/view
 // before that word actually fails, and never read/test the same word twice.
 {const index=at>>>5,stop=Math.min(end,(index+1)*32);let bits=pager.get32(row+index*4);if(!value)bits=~bits;bits&=0xffffffff<<(at&31);if(stop&31)bits&=0xffffffff>>>(32-(stop&31));if(bits)return index*32+31-Math.clz32(bits&-bits);at=stop;}
 for(;at<end;){
  const firstByte=row+(at>>>5)*4,lastByte=Math.min(row+Math.ceil(end/32)*4,firstByte+PAGE_BYTES-firstByte%PAGE_BYTES),length=lastByte-firstByte;
  // One lookup per prepared page fragment. A single word keeps the existing
  // direct read, avoiding two temporary view objects for a one-word search.
  const span=length>4?pager.span(firstByte,length):null,view=span?new DataView(span.buffer,span.byteOffset,span.byteLength):null;
  for(let offset=0;offset<length;offset+=4){const index=at>>>5,stop=Math.min(end,(index+1)*32);let bits=view?view.getUint32(offset,true):pager.get32(firstByte);if(!value)bits=~bits;bits&=0xffffffff<<(at&31);if(stop&31)bits&=0xffffffff>>>(32-(stop&31));if(bits)return index*32+31-Math.clz32(bits&-bits);at=stop;}
 }return -1;
}
function findBitBackward(pager,row,start,end,value){
 let at=end;if(at<=start)return -1;
 {const index=(at-1)>>>5,first=Math.max(start,index*32);let bits=pager.get32(row+index*4);if(!value)bits=~bits;if(at&31)bits&=0xffffffff>>>(32-(at&31));bits&=0xffffffff<<(first&31);if(bits)return index*32+31-Math.clz32(bits);at=first;}
 for(;at>start;){
  const lastByte=row+(((at-1)>>>5)+1)*4,firstByte=Math.max(row+(start>>>5)*4,Math.floor((lastByte-1)/PAGE_BYTES)*PAGE_BYTES),length=lastByte-firstByte;
  const span=length>4?pager.span(firstByte,length):null,view=span?new DataView(span.buffer,span.byteOffset,span.byteLength):null;
  for(let offset=length-4;offset>=0;offset-=4){const index=(at-1)>>>5,first=Math.max(start,index*32);let bits=view?view.getUint32(offset,true):pager.get32(firstByte);if(!value)bits=~bits;if(at&31)bits&=0xffffffff>>>(32-(at&31));bits&=0xffffffff<<(first&31);if(bits)return index*32+31-Math.clz32(bits);at=first;}
 }return -1;
}
function clearBitRun(pager,row,start,end){
 const first=start>>>5,last=(end-1)>>>5,lo=start&31,hi=end&31;
 if(first===last){const mask=(0xffffffff<<lo)&(hi?0xffffffff>>>(32-hi):0xffffffff),at=row+first*4;pager.set32(at,pager.get32(at)&~mask);return;}
 let fullFirst=first,fullEnd=last+1;if(lo){const at=row+first*4;pager.set32(at,pager.get32(at)&(0xffffffff>>>(32-lo)));fullFirst++;}if(hi)fullEnd--;
 for(let at=row+fullFirst*4,endByte=row+fullEnd*4;at<endByte;){const length=Math.min(endByte-at,PAGE_BYTES-at%PAGE_BYTES);pager.span(at,length,{write:true}).fill(0);at+=length;}
 if(hi){const at=row+last*4;pager.set32(at,pager.get32(at)&(0xffffffff<<hi));}
}
function closePackedBand(inputView,horizontalView,outputView,w,h,rowBytes,pass,y,end,lo,rows){
 const words=rowBytes/4,neutral=pass?0xffffffff:0,tail=w&31,tailMask=tail?0xffffffff>>>(32-tail):0xffffffff;
 for(let yy=0;yy<rows;yy++)for(let word=0;word<words;word++){
  const at=yy*rowBytes+word*4,last=word+1===words;let bits=inputView.getUint32(at,true);if(pass&&last)bits|=~tailMask;
  const previous=word?inputView.getUint32(at-4,true):neutral,next=last?neutral:inputView.getUint32(at+4,true),left=(bits<<1)|(previous>>>31),right=(bits>>>1)|(next<<31),value=pass?bits&left&right:bits|left|right;
  horizontalView.setUint32(at,last?value&tailMask:value,true);
 }
 for(let yy=y;yy<end;yy++)for(let word=0;word<words;word++){
  const at=(yy-lo)*rowBytes+word*4,bits=horizontalView.getUint32(at,true),up=yy?horizontalView.getUint32(at-rowBytes,true):neutral,down=yy+1<h?horizontalView.getUint32(at+rowBytes,true):neutral,value=pass?bits&up&down:bits|up|down;
  outputView.setUint32((yy-y)*rowBytes+word*4,word+1===words?value&tailMask:value,true);
 }
}
export async function detectSegmentedPanels(image,{budget,signal,onProgress,storage='auto'}={}){
 const cooperate=createCooperator(signal);const {width:w,height:h,format}=image.surface.descriptor,n=w*h;requireValue(format==='rgb8'&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&n<2**31,'RGB8 source surface required.');const step=Math.max(1,Math.ceil(Math.max(w,h)/1800)),sw=Math.ceil(w/step),sh=Math.ceil(h/step),sampleBytes=32768*4+8*3*256*4+sw*6,rowBytes=Math.ceil(w/32)*4,maskBytes=rowBytes*h,workBytes=rowBytes*(2*Math.min(h,66)+Math.min(h,64))+8192,pagerBytes=Math.min(maskBytes,4*MiB)+Math.min(8*Math.ceil(w/2)*h,MiB/4)+2*65536,stores=[],pagers=[],proposalReleases=[];let sampleRelease,workRelease,planning,resultRelease;
 try{
  sampleRelease=budget.reserve(sampleBytes);const counts=new Uint32Array(32768);let previous=new Uint8Array(sw*3),current=new Uint8Array(sw*3);
  async function samples(visit,pass){const last=await image.surface.readWindow({x:0,y:(sh-1)*step,width:w,height:1},{signal});try{for(let x=0;x<sw;x++)for(let c=0;c<3;c++)previous[x*3+c]=last.pixels.data[x*step*3+c];}finally{last.release();}let sampled=0;
   for(let sy=0;sy<h;){await cooperate();const rows=Math.min(32,h-sy),band=await image.surface.readWindow({x:0,y:sy,width:w,height:rows},{signal});let next=sy;try{for(let y=sy;y<sy+rows;y+=step){const row=(y-sy)*w*3;for(let x=0;x<sw;x++){const p=row+x*step*3;for(let c=0;c<3;c++)current[x*3+c]=band.pixels.data[p+c];}for(let x=0;x<sw;x++){const p=x*3,left=(x?x-1:sw-1)*3;let flat=true;for(let c=0;c<3;c++)if(Math.abs(current[p+c]-previous[p+c])>2||Math.abs(current[p+c]-current[left+c])>2){flat=false;break;}if(flat)visit((current[p+2]>>3)*1024+(current[p+1]>>3)*32+(current[p]>>3),current,p);}[previous,current]=[current,previous];sampled++;next=y+step;}}finally{band.release();}sy=next;onProgress?.({phase:'panel-palette',fraction:(pass+sampled/sh)/2});}}
  await samples(code=>counts[code]++,0);const palette=[];for(let code=0;code<counts.length;code++)if(counts[code]){palette.push(code);palette.sort((a,b)=>counts[b]-counts[a]||a-b);if(palette.length>8)palette.pop();}
  if(!palette.length){return {polygons:[],metrics:{sampleStep:step,paletteColors:0},dispose(){}};}
  const indices=new Map(palette.map((code,i)=>[code,i])),hist=palette.map(()=>[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)]);await samples((code,row,p)=>{const index=indices.get(code);if(index!==undefined)for(let c=0;c<3;c++)hist[index][c][row[p+c]]++;},1);
  const median=(hist,count)=>{const lo=Math.floor((count-1)/2),hi=Math.floor(count/2);let total=0,a=-1;for(let v=0;v<256;v++){total+=hist[v];if(a<0&&total>lo)a=v;if(total>hi)return Math.floor((a+v)/2);}throw Error('Missing panel color sample.');},colors=palette.map((code,i)=>hist[i].map(channel=>median(channel,counts[code])));
  planning=budget.reserve(workBytes+pagerBytes+w*99+4*MiB);const options={budget,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal},make=async bytes=>{const s=await createSegmentedBytes(bytes,options);stores.push(s);return s;},mask=await make(maskBytes),scratch=await make(maskBytes),queue=await make(8*Math.ceil(w/2)*h);planning();planning=null;workRelease=budget.reserve(workBytes);
  const input=new Uint8Array(rowBytes*Math.min(h,66)),horizontal=new Uint8Array(input.length),output=new Uint8Array(rowBytes*Math.min(h,64)),inputView=new DataView(input.buffer,input.byteOffset,input.byteLength),horizontalView=new DataView(horizontal.buffer,horizontal.byteOffset,horizontal.byteLength),outputView=new DataView(output.buffer,output.byteOffset,output.byteLength),proposals=[];let panelClosingMs=0,panelComponentsMs=0;
  const near=(data,p,color)=>{const r=data[p]-color[0];if(r<-14||r>14)return false;const g=data[p+1]-color[1];if(g<-14||g>14)return false;const b=data[p+2]-color[2];return b>=-14&&b<=14;};
  async function close(){for(let pass=0;pass<2;pass++){const source=pass?scratch:mask,destination=pass?mask:scratch;
   for(let y=0;y<h;y+=64){await cooperate();const end=Math.min(h,y+64),lo=Math.max(0,y-1),hi=Math.min(h,end+1),rows=hi-lo;await source.readInto(input.subarray(0,rows*rowBytes),lo*rowBytes);closePackedBand(inputView,horizontalView,outputView,w,h,rowBytes,pass,y,end,lo,rows);await destination.write(output.subarray(0,(end-y)*rowBytes),y*rowBytes);}await destination.flush();}}
  async function border(x0,y0,x1,y1,color){if(x1<=x0||y1<=y0)return 1;let count=0,good=0;for(let y=y0;y<y1;y+=32){await cooperate();const rows=Math.min(32,y1-y),part=await image.surface.readWindow({x:x0,y,width:x1-x0,height:rows},{signal});try{const rgb=part.pixels.data;for(let p=0;p<rgb.length;p+=3){count++;if(near(rgb,p,color))good++;}}finally{part.release();}}return good/count;}
  for(let ci=0;ci<colors.length;ci++){
   const color=colors[ci];for(let y=0;y<h;y+=32){await cooperate();const rows=Math.min(32,h-y),part=await image.surface.readWindow({x:0,y,width:w,height:rows},{signal});try{const rgb=part.pixels.data;packBinaryMask(rgb,outputView,w,rows,rowBytes,color,near);await mask.write(output.subarray(0,rowBytes*rows),y*rowBytes);}finally{part.release();}}await mask.flush();const closeStarted=performance.now();await close();panelClosingMs+=performance.now()-closeStarted;
   const wp=createBytePager(mask,{budget,signal,maxPages:64,mutable:true});pagers.push(wp);const qp=createBytePager(queue,{budget,signal,maxPages:4,mutable:true});pagers.push(qp);let visited=0,nextYield=8192;const componentsStarted=performance.now();
   // Global eight-connected components, queued as maximal horizontal runs.
   // Only count and bounds are consumed; no per-pixel queue or traversal labels.
   for(let first=0;first<n;){
    await cooperate();const scan=Math.min(n-first,SCAN_PIXELS-first%SCAN_PIXELS),stop=first+scan,startRow=Math.floor(first/w),endRow=Math.floor((stop-1)/w),startByte=startRow*rowBytes+((first%w)>>>5)*4,endByte=endRow*rowBytes+((((stop-1)%w)>>>5)+1)*4;let wait=wp.prepare(startByte,endByte-startByte);if(wait)await wait;let seed=-1;
    for(let at=first;at<stop;){const yy=Math.floor(at/w),end=Math.min(stop,(yy+1)*w),found=findBitForward(wp,yy*rowBytes,at-yy*w,end-yy*w,1);if(found>=0){seed=yy*w+found;break;}at=end;}if(seed<0){first=stop;continue;}first=seed+1;
    let tail=0,pixels=0,x0=w,x1=0,y0=h,y1=0;
    const commitRun=(left,right,y)=>{const start=y*w+left,end=y*w+right+1;qp.set32(tail*8,start);qp.set32(tail*8+4,end);tail++;pixels+=end-start;x0=Math.min(x0,left);x1=Math.max(x1,right);y0=Math.min(y0,y);y1=Math.max(y1,y);return right;};
    const enqueuePrepared=(x,y)=>{const row=y*rowBytes,before=findBitBackward(wp,row,0,x,0),after=findBitForward(wp,row,x+1,w,0),left=before<0?0:before+1,right=after<0?w-1:after-1;clearBitRun(wp,row,left,right+1);const pending=qp.prepare(tail*8,8);return pending?pending.then(()=>commitRun(left,right,y)):commitRun(left,right,y);};
    // Cache hits remain synchronous; only actual pager I/O creates a continuation.
    const enqueue=(x,y)=>{const pending=wp.prepare(y*rowBytes,rowBytes);return pending?pending.then(()=>enqueuePrepared(x,y)):enqueuePrepared(x,y);};
    const queued=enqueue(seed%w,Math.floor(seed/w));if(typeof queued!=='number')await queued;
    for(let head=0;head<tail;head++){
     if((head&1023)===0)await cooperate();if(visited+pixels>=nextYield){nextYield=visited+pixels+8192;onProgress?.({phase:'panel-components',color:ci+1,visited:visited+pixels});checkAbort(signal);}
     wait=qp.prepare(head*8,8);if(wait)await wait;const start=qp.get32(head*8),end=qp.get32(head*8+4),y=Math.floor(start/w),lo=Math.max(0,start%w-1),hi=Math.min(w-1,(end-1)%w+1);
     for(const yy of [y-1,y+1])if(yy>=0&&yy<h){wait=wp.prepare(yy*rowBytes,rowBytes);if(wait)await wait;for(let x=lo;x<=hi;){const found=findBitForward(wp,yy*rowBytes,x,hi+1,1);if(found<0)break;const queued=enqueue(found,yy);x=(typeof queued==='number'?queued:await queued)+1;}}
    }
    visited+=pixels;const bw=x1-x0+1,bh=y1-y0+1,area=bw*bh;if(bw<Math.max(24,w*.012)||bh<Math.max(16,h*.012)||area<n*.0005||area>n*.95||pixels/area<.82)continue;
    checkAbort(signal);const accepted=(await border(x0,Math.max(0,y0-2),x0+bw,y0,color))>=.65&&(await border(x0,y0+bh,x0+bw,Math.min(h,y0+bh+2),color))>=.65&&(await border(Math.max(0,x0-2),y0,x0,y0+bh,color))>=.65&&(await border(x0+bw,y0,Math.min(w,x0+bw+2),y0+bh,color))>=.65;checkAbort(signal);if(accepted){proposalReleases.push(budget.reserve(2048));proposals.push([x0,y0,bw,bh,pixels/area]);}
   }
   panelComponentsMs+=performance.now()-componentsStarted;for(const p of pagers)p.dispose();pagers.length=0;onProgress?.({phase:'panel-colors',fraction:(ci+1)/colors.length});
  }
  proposals.sort((a,b)=>b[2]*b[3]-a[2]*a[3]||a[1]-b[1]||a[0]-b[0]);const selected=[];for(const p of proposals){await cooperate();const[x,y,bw,bh]=p;let overlaps=false;for(const[a,b,c,d]of selected){const inter=Math.max(0,Math.min(x+bw,a+c)-Math.max(x,a))*Math.max(0,Math.min(y+bh,b+d)-Math.max(y,b));if(inter/Math.min(bw*bh,c*d)>.2){overlaps=true;break;}}if(!overlaps)selected.push(p);}
  selected.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);const rows=[];for(const panel of selected){if(!rows.length||panel[1]-rows.at(-1)[0][1]>Math.max(4,h*.02))rows.push([]);rows.at(-1).push(panel);}resultRelease=budget.reserve(selected.length*1024);const polygons=rows.flatMap(row=>row.sort((a,b)=>a[0]-b[0])).map(([x,y,bw,bh])=>[[x,y],[x+bw-1,y],[x+bw-1,y+bh-1],[x,y+bh-1]]);checkAbort(signal);const release=resultRelease;resultRelease=null;return {polygons,metrics:{sampleStep:step,paletteColors:colors.length,proposals:proposals.length,panelClosingMs,panelComponentsMs,panelWorkspaceBytes:sampleBytes+workBytes+pagerBytes,panelMaskLayout:'row-packed-u32le-lsb0',panelMaskBytes:maskBytes,panelMaskRowBytes:rowBytes,maskStorage:mask.storage},dispose:release};
 }finally{for(const p of pagers)p.dispose();sampleRelease?.();workRelease?.();planning?.();resultRelease?.();for(const release of proposalReleases)release();await Promise.allSettled(stores.map(s=>s.dispose()));}
}
