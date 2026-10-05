import {allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createBytePager} from './byte-pager.js';
import {createSegmentedBytes} from './segmented-bytes.js';
const MiB=1024**2,PAGE=65536;
// Components are global. Seed traversal order can change their discovery order,
// but never their membership; restore native x-major order by each minimum seed.
export async function segmentedZeroRegions(votes,width,height,{budget,signal,onProgress,gridToExclude=-1,gridMax=63,excludeVotes,excludeGrid,storage='auto',temporarySession,getTemporarySession}={}){
 const n=width*height;requireValue(Number.isInteger(width)&&Number.isInteger(height)&&width>=16&&height>=16&&width<=65500&&height<=65500&&n<2**31&&votes?.byteLength===n,'Invalid ZERO region dimensions.');requireValue(Number.isInteger(gridToExclude)&&gridToExclude>=-1&&gridToExclude<64&&Number.isInteger(gridMax)&&gridMax>=0&&gridMax<64&&(!excludeVotes||excludeVotes.byteLength===n&&Number.isInteger(excludeGrid)&&excludeGrid>=0&&excludeGrid<64),'Invalid ZERO region grid selection.');
 const bandRows=Math.min(height,82),samples=width*bandRows,heapMaximumBytes=Math.ceil((8*MiB+3*samples)/(16*MiB))*16*MiB,workingBytes=heapMaximumBytes+8*MiB+2*samples+9*MiB;
 let reservation,m;const stores=[],pagers=[],pointers=[],regionReleases=[];let succeeded=false;
 try{
  reservation=budget.reserve(workingBytes);
  const options={budget,storage,temporarySession,getTemporarySession,signal};
  const make=async bytes=>{const store=await createSegmentedBytes(bytes,options);stores.push(store);return store;};
  const work=await make(n),queue=await make(4*n),mask=await make(n),maskReg=await make(n),aux=await make(n);
  const {default:create}=await import('../vendor/zero-stream/zero-stream.js');m=await create({wasmMemory:allocateWasmMemory({initial:256,maximum:heapMaximumBytes/65536})});checkAbort(signal);
  for(const bytes of [samples,width*Math.min(height,64)]){const p=m._malloc(bytes);if(!p)throw wasmAllocationFailure(m,'ZERO closing allocation failed.',bytes);pointers.push(p);}
  // Pagers are covered by their own reservations; the rest stays protected.
  reservation();reservation=budget.reserve(workingBytes-9*MiB);
  const pager=(store,maxPages)=>{const p=createBytePager(store,{budget,signal,mutable:true,maxPages});pagers.push(p);return p;};
  const w=pager(work,64),q=pager(queue,4),out=pager(mask,64),buffer=new Uint8Array(samples),excluded=excludeVotes?new Uint8Array(samples):null;
  for(let at=0;at<n;at+=samples){await controlCheckpoint(signal);const part=buffer.subarray(0,Math.min(samples,n-at));await votes.readInto(part,at);if(excluded)await excludeVotes.readInto(excluded.subarray(0,part.length),at);for(let i=0;i<part.length;i++)if(part[i]>gridMax||part[i]===gridToExclude||excluded&&excluded[i]===excludeGrid)part[i]=128;await work.write(part,at);}
  await work.flush();const minimum=m._zero_region_minimum(width,height),regions=[];let visited=0,components=0,nextYield=4096;
  for(let seed=0;seed<n;seed++){
   if(seed%PAGE===0){await controlCheckpoint(signal);onProgress?.({phase:'zero-regions',fraction:seed/n,visited,components});}
   let wait=w.prepare(seed,1);if(wait)await wait;const grid=w.get8(seed);if(grid===128)continue;
   const sx=seed%width,sy=Math.floor(seed/width);let x0=sx,x1=sx,y0=sy,y1=sy,minSeed=sx*height+sy,tail=1;
   w.set8(seed,128);wait=q.prepare(0,4);if(wait)await wait;q.set32(0,seed);
   for(let head=0;head<tail;head++){
    if(components===0&&head===0||visited+head>=nextYield){await controlCheckpoint(signal);nextYield=visited+head+4096;onProgress?.({phase:'zero-regions-component',visited:visited+head,queued:tail,components});}
    wait=q.prepare(head*4,4);if(wait)await wait;const pixel=q.get32(head*4),x=pixel%width,y=Math.floor(pixel/width),left=Math.max(0,x-9),right=Math.min(width-1,x+9),top=Math.max(0,y-9),bottom=Math.min(height-1,y+9);
    wait=w.prepare(top*width+left,(bottom-top)*width+right-left+1);if(wait)await wait;
    for(let yy=top;yy<=bottom;yy++)for(let at=yy*width+left,end=yy*width+right+1;at<end;){
     const size=Math.min(end-at,PAGE-at%PAGE),part=w.span(at,size,{write:true});
     for(let i=0;i<size;i++)if(part[i]===grid){part[i]=128;const p=at+i,xx=p%width;wait=q.prepare(tail*4,4);if(wait)await wait;q.set32(tail++*4,p);if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;minSeed=Math.min(minSeed,xx*height+yy);}
     at+=size;
    }
   }
   visited+=tail;components++;if(tail<minimum)continue;
   const lnfa=m._zero_region_nfa(width,height,(x1-x0+1)*(y1-y0+1),tail);if(lnfa>=0)continue;
   regionReleases.push(budget.reserve(256));regions.push({x0,y0,x1,y1,grid,log10_nfa:lnfa,seed:minSeed});
   for(let head=0;head<tail;head++){if(head%16384===0)await controlCheckpoint(signal);wait=q.prepare(head*4,4);if(wait)await wait;const pixel=q.get32(head*4);wait=out.prepare(pixel,1);if(wait)await wait;out.set8(pixel,255);}
  }
  await out.flush();for(const p of pagers)p.dispose();pagers.length=0;
  await work.dispose();await queue.dispose();
  for(let second=0;second<2;second++){
   const input=second?aux:mask,output=second?maskReg:aux;
   for(let y=0;y<height;y+=64){await controlCheckpoint(signal);const end=Math.min(height,y+64),lo=Math.max(0,y-9),hi=Math.min(height,end+9),part=buffer.subarray(0,(hi-lo)*width);await input.readInto(part,lo*width);m.HEAPU8.set(part,pointers[0]);if(!m._zero_close_band(pointers[0],pointers[1],width,hi-lo,lo,height,y-lo,end-y,second))throw wasmAllocationFailure(m,'ZERO closing workspace allocation failed.',undefined);await output.write(m.HEAPU8.subarray(pointers[1],pointers[1]+(end-y)*width),y*width);onProgress?.({phase:'zero-closing',fraction:(second+end/height)/2});}await output.flush();
  }
  await aux.dispose();checkAbort(signal);regions.sort((a,b)=>a.seed-b.seed);for(const r of regions)delete r.seed;succeeded=true;let disposed=false;
  return {width,height,mask,maskReg,regions,metrics:{components,visited,rowsPerClosingChunk:64,closingHaloRows:9,heapMaximumBytes,heapCapacityBytes:m.HEAPU8.buffer.byteLength,maskStorage:mask.storage,regularizedStorage:maskReg.storage},dispose:async()=>{if(disposed)return;disposed=true;try{await mask.dispose();}finally{try{await maskReg.dispose();}finally{for(const release of regionReleases)release();}}}};
 }finally{
  for(const p of pagers)p.dispose();if(m)for(const p of pointers)m._free(p);reservation?.();
  if(!succeeded){for(const release of regionReleases)release();await Promise.allSettled(stores.map(store=>store.dispose()));}
 }
}
