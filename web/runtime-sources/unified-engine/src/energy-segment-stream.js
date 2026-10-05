import {requireValue,checkAbort,createCooperator} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createBytePager} from './byte-pager.js';
import {selectFloat32Ranks} from './float32-ranks-stream.js';
const f=Math.fround,MiB=1024**2,BLOCK=65536;
// Whole-panel hysteresis; each reported class may contain disconnected support.
export async function segmentSegmentedEnergy(base,{threshold=5,thresholds=null,minimum=3,offset=0}={}, {budget,signal,onProgress,storage='auto',temporarySession,getTemporarySession}={}){
 const cooperate=createCooperator(signal);
 const {width:w,height:h,energy_scope:scope,energy_low_score:low,energy_high_score:high,energy_summary:summaries,energy_allowed:allowed,metadata}=base,n=w*h,block=metadata?.block,limits=thresholds??[threshold,threshold];
 requireValue(Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&n<2**31&&[scope,low,high].every(s=>s?.byteLength===4*n)&&Array.isArray(summaries),'Prepared segmented energy maps required.');requireValue(Array.isArray(limits)&&limits.length===2&&limits.every(t=>Number.isFinite(t)&&t>=0)&&Number.isFinite(minimum)&&minimum>=0&&Number.isInteger(block)&&block>0&&Number.isSafeInteger(block*block)&&Number.isInteger(offset)&&offset>=0&&offset+summaries.length*2<2**31&&(!allowed||allowed.byteLength===n),'Invalid energy segmentation options.');
 const ownBytes=w*14+BLOCK*8+8192,pagerBytes=2*(Math.min(n,4*MiB)+65536)+(Math.min(n*4,4*MiB)+65536)+(Math.min(n*4,MiB/4)+65536),stores=[],pagers=[],regionReleases=[],regions=[];let planning,working,values,success=false;
 try{
  planning=budget.reserve(ownBytes+pagerBytes+2*MiB);const options={budget,storage,temporarySession,getTemporarySession,signal},make=async bytes=>{const s=await createSegmentedBytes(bytes,options);stores.push(s);return s;},weak=await make(n),selected=await make(n),queue=await make(8*Math.ceil(w/2)*h),labels=await make(n*4);planning();planning=null;working=budget.reserve(ownBytes);
  const scopeRow=new Int32Array(w),scoreRow=new Float32Array(w),maskRow=new Uint8Array(w),allowedRow=new Uint8Array(w),labelsRow=new Int32Array(w),buffer=new Float32Array(BLOCK),packed=new Float32Array(BLOCK);
  for(const score of [low,high])for(let at=0;at<n;at+=BLOCK){await cooperate();const count=Math.min(BLOCK,n-at);await score.readInto(new Uint8Array(buffer.buffer,0,count*4),at*4);for(let i=0;i<count;i++)requireValue(Number.isFinite(buffer[i])&&buffer[i]>=0,'Finite nonnegative scores required.');}
  for(let ri=0;ri<summaries.length;ri++){
   const region=summaries[ri],b=region.bbox;requireValue(Number.isInteger(region.id)&&region.id>0&&Array.isArray(b)&&b.length===4&&b.every(Number.isInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=w&&b[3]<=h&&b[2]>b[0]&&b[3]>b[1],'Invalid energy reference panel.');const[x0,y0,x1,y1]=b,width=x1-x0,sr=scopeRow.subarray(0,width),vr=scoreRow.subarray(0,width),mr=maskRow.subarray(0,width),ar=allowedRow.subarray(0,width),lr=labelsRow.subarray(0,width);
   for(let kind=0;kind<2;kind++){
    const score=kind?high:low,t=limits[kind],weakThreshold=f(t/2),strongThreshold=f(t);let components=0,area=0,strongPixels=0,left=w,top=h,right=0,bottom=0,visited=0,nextYield=4096;
    for(let y=y0;y<y1;y++){if((y-y0)%32===0)await cooperate();await scope.readInto(new Uint8Array(sr.buffer,0,width*4),(y*w+x0)*4);await score.readInto(new Uint8Array(vr.buffer,0,width*4),(y*w+x0)*4);if(allowed)await allowed.readInto(ar,y*w+x0);for(let x=0;x<width;x++)mr[x]=sr[x]===region.id&&(!allowed||ar[x]!==0)&&(t===0?vr[x]>0:vr[x]>=weakThreshold)?1:0;await weak.write(mr,y*w+x0);mr.fill(0);await selected.write(mr,y*w+x0);}
    await weak.flush();await selected.flush();const pager=(store,maxPages,mutable)=>{const p=createBytePager(store,{budget,signal,maxPages,mutable});pagers.push(p);return p;},wp=pager(weak,64,true),sp=pager(score,64,false),op=pager(selected,64,true),qp=pager(queue,4,true);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
     const first=y*w+x;if((first&4095)===0)await cooperate();let wait=wp.prepare(first,1);if(wait)await wait;if(!wp.get8(first))continue;let tail=0,pixels=0,strong=0,l=x,r=x,t0=y,b0=y;
     // Global 8-connectivity via maximal horizontal runs. Membership and native
     // panel/class aggregation are unchanged; the queue no longer revisits a
     // broad BFS frontier one pixel at a time through the score-page cache.
     const enqueue=async(xx,yy)=>{
      let wait=wp.prepare(yy*w+x0,width);if(wait)await wait;
      let left=xx,right=xx;while(left>x0&&wp.get8(yy*w+left-1))left--;while(right+1<x1&&wp.get8(yy*w+right+1))right++;
      const start=yy*w+left,end=yy*w+right+1;
      for(let at=start;at<end;){const length=Math.min(end-at,65536-at%65536);wp.span(at,length,{write:true}).fill(0);at+=length;}
      wait=sp.prepare(start*4,(end-start)*4);if(wait)await wait;
      for(let i=start;i<end;i++){const value=sp.getFloat32(i*4);strong+=(t===0?value>0:value>=strongThreshold)?1:0;}
      wait=qp.prepare(tail*8,8);if(wait)await wait;qp.set32(tail*8,start);qp.set32(tail*8+4,end);tail++;pixels+=end-start;
      l=Math.min(l,left);r=Math.max(r,right);t0=Math.min(t0,yy);b0=Math.max(b0,yy);return right;
     };
     await enqueue(x,y);
     for(let head=0;head<tail;head++){
      if(visited+pixels>=nextYield){await cooperate();nextYield=visited+pixels+4096;onProgress?.({phase:'energy-region-growing',panel:region.id,kind:kind?'high':'low',visited:visited+pixels});}
      wait=qp.prepare(head*8,8);if(wait)await wait;const first=qp.get32(head*8),end=qp.get32(head*8+4),yy=Math.floor(first/w),ax=Math.max(x0,first%w-1),bx=Math.min(x1-1,(end-1)%w+1);
      for(const ny of [yy-1,yy+1])if(ny>=y0&&ny<y1){
       wait=wp.prepare(ny*w+x0,width);if(wait)await wait;
       for(let nx=ax;nx<=bx;nx++)if(wp.get8(ny*w+nx))nx=await enqueue(nx,ny);
      }
     }
     visited+=pixels;if(pixels>=minimum*block*block&&strong>=block*block){components++;area+=pixels;strongPixels+=strong;left=Math.min(left,l);right=Math.max(right,r+1);top=Math.min(top,t0);bottom=Math.max(bottom,b0+1);
      for(let j=0;j<tail;j++){if((j&1023)===0)await cooperate();wait=qp.prepare(j*8,8);if(wait)await wait;const start=qp.get32(j*8),end=qp.get32(j*8+4);wait=op.prepare(start,end-start);if(wait)await wait;for(let at=start;at<end;){const length=Math.min(end-at,65536-at%65536);op.span(at,length,{write:true}).fill(1);at+=length;}}
     }

    }
    await op.flush();for(const p of pagers)p.dispose();pagers.length=0;
    if(area){const future=budget.reserve(2*MiB);try{values=await createSegmentedBytes(area*4,options);}finally{future();}const id=offset+regions.length+1;let used=0,written=0;const flush=async()=>{if(used){await values.write(new Uint8Array(packed.buffer,0,used*4),written*4);written+=used;used=0;}};
     for(let y=y0;y<y1;y++){if((y-y0)%32===0)await cooperate();await selected.readInto(mr,y*w+x0);await score.readInto(new Uint8Array(vr.buffer,0,width*4),(y*w+x0)*4);await labels.readInto(new Uint8Array(lr.buffer,0,width*4),(y*w+x0)*4);for(let x=0;x<width;x++)if(mr[x]){lr[x]=id;packed[used++]=vr[x];if(used===packed.length)await flush();}await labels.write(new Uint8Array(lr.buffer,0,width*4),(y*w+x0)*4);}await flush();requireValue(written===area,'Energy selected area mismatch.');await values.flush();const middle=area>>1,ranks=await selectFloat32Ranks(values,area,area%2?[middle]:[middle-1,middle],{budget,signal,onProgress:e=>onProgress?.({...e,panel:region.id,kind:kind?'high':'low'})}),median=area%2?ranks[0]:f(f(ranks[0]+ranks[1])/2);await values.dispose();values=null;regionReleases.push(budget.reserve(1024));regions.push({id,kind:kind?'high':'low',energy_region:region.id,components,cells:Math.ceil(area/(block*block)),pixels:area,bbox:[left,top,right-left,bottom-top],score:median,strong_pixels:strongPixels,dominant_descriptor:kind?'energy_high':'energy_low',sources:[kind?'High ELA energy':'Low ELA energy']});
    }
    onProgress?.({phase:'energy-segmentation',fraction:(ri*2+kind+1)/(summaries.length*2)});
   }
  }
  await labels.flush();await weak.dispose();await selected.dispose();await queue.dispose();checkAbort(signal);success=true;let disposed=false;return {labels,regions,metrics:{connectivity:'global-8-connected-horizontal-runs',segmentationWorkingBytes:ownBytes+pagerBytes+2*MiB,labelStorage:labels.storage},dispose:async()=>{if(disposed)return;disposed=true;try{await labels.dispose();}finally{for(const release of regionReleases)release();}}};
 }finally{for(const p of pagers)p.dispose();planning?.();working?.();await Promise.allSettled([values,...(!success?stores:[])].filter(Boolean).map(s=>s.dispose()));if(!success)for(const release of regionReleases)release();}
}
