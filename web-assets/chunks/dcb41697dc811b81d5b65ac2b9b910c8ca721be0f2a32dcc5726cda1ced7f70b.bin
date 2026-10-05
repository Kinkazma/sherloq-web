import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {gray} from './pixel-utils.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {summarizeEnergyValues} from './energy-statistics-stream.js';
const f=Math.fround,BLOCK=65536;
// Internal preparation for already detected native panels. An explicit empty
// detection requests the native whole-image fallback; missing geometry is invalid.
export async function prepareSegmentedEnergy(image,planes,quantiles,log,{polygons,budget,signal,onProgress,storage='auto'}={}){
 const cooperate=createCooperator(signal);
 const {width:w,height:h}=image.surface.descriptor,n=w*h;requireValue(image.surface.descriptor.format==='rgb8'&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&n<2**31&&Array.isArray(planes)&&planes.length===3&&planes.every(p=>p?.byteLength===n*4)&&typeof log==='function','Three complete energy planes and qualified logarithm required.');requireValue(Array.isArray(polygons),'Explicit native panel detection required.');requireValue(Array.isArray(quantiles)&&quantiles.length===2&&quantiles.every(Number.isFinite)&&quantiles[0]>=0&&quantiles[0]<=.5&&quantiles[1]>=.5&&quantiles[1]<=1,'Invalid energy quantiles.');
 if(!polygons.length)polygons=[[[0,0],[w-1,0],[w-1,h-1],[0,h-1]]];
 for(const p of polygons)requireValue(Array.isArray(p)&&p.length===4&&p.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isInteger))&&p[0][0]>=0&&p[0][1]>=0&&p[2][0]<w&&p[2][1]<h&&p[0][0]<=p[2][0]&&p[0][1]<=p[2][1]&&p[1][0]===p[2][0]&&p[1][1]===p[0][1]&&p[3][0]===p[0][0]&&p[3][1]===p[2][1],'Axis-aligned native panel bounds required.');
 const ownBytes=w*41+(5*BLOCK+8192)*4+8192,stores=[],summaries=[];let planning,workRelease,summaryRelease,values,success=false;
 try{
  summaryRelease=budget.reserve(polygons.length*2048);planning=budget.reserve(ownBytes+2*1024**2+w*99+4*1024**2);
  const options={budget,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal},make=async length=>{const s=await createSegmentedBytes(length,options);stores.push(s);return s;};
  const valid=await make(n),scope=await make(4*n),low=await make(4*n),high=await make(4*n),scores=[];for(let q=0;q<3;q++)scores.push(await make(4*n));planning();planning=null;workRelease=budget.reserve(ownBytes);
  const rowValid=new Uint8Array(w),rowPlane=new Float32Array(w),rowScore=new Float32Array(w),packed=new Float32Array(8192),buffers=Array.from({length:5},()=>new Float32Array(Math.min(BLOCK,n))),validBand=new Uint8Array(w*Math.min(32,h));
  for(const plane of planes)for(let at=0;at<n;at+=BLOCK){await cooperate();const length=Math.min(BLOCK,n-at);await plane.readInto(new Uint8Array(buffers[0].buffer,0,length*4),at*4);for(let i=0;i<length;i++)requireValue(Number.isFinite(buffers[0][i])&&buffers[0][i]>=0&&buffers[0][i]<=255,'Energy outside RGB8 residual domain.');}
  for(let y=0;y<h;y+=32){await cooperate();const rows=Math.min(32,h-y),part=await image.surface.readWindow({x:0,y,width:w,height:rows},{signal});try{const rgb=part.pixels.data;for(let i=0;i<w*rows;i++){const g=gray(rgb[i*3],rgb[i*3+1],rgb[i*3+2]);validBand[i]=g>3&&g<252?1:0;}await valid.write(validBand.subarray(0,w*rows),y*w);}finally{part.release();}onProgress?.({phase:'energy-valid',fraction:(y+rows)/h});}await valid.flush();
  for(let panel=0;panel<polygons.length;panel++){
   const p=polygons[panel],[x0,y0]=p[0],[x1,y1]=p[2],width=x1-x0+1,rv=rowValid.subarray(0,width),rp=rowPlane.subarray(0,width),rs=rowScore.subarray(0,width);let count=0;
   for(let y=y0;y<=y1;y++){if((y-y0)%32===0)await cooperate();await valid.readInto(rv,y*w+x0);for(const v of rv)count+=v;}if(count<64)continue;
   const scopeRow=new Int32Array(rowScore.buffer,0,width);for(let y=y0;y<=y1;y++){if((y-y0)%32===0)await cooperate();await valid.readInto(rv,y*w+x0);for(let x=0;x<width;x++)scopeRow[x]=rv[x]?panel+1:0;await scope.write(new Uint8Array(scopeRow.buffer,0,width*4),(y*w+x0)*4);}
   const probes=[];
   for(let q=0;q<3;q++){
    const future=budget.reserve(2*1024**2);try{values=await createSegmentedBytes(count*4,options);}finally{future();}let used=0,written=0;
    const flush=async()=>{if(used){await values.write(new Uint8Array(packed.buffer,0,used*4),written*4);written+=used;used=0;}};
    for(let y=y0;y<=y1;y++){if((y-y0)%32===0)await cooperate();await valid.readInto(rv,y*w+x0);await planes[q].readInto(new Uint8Array(rp.buffer,0,width*4),(y*w+x0)*4);for(let x=0;x<width;x++)if(rv[x]){packed[used++]=rp[x];if(used===packed.length)await flush();}}await flush();requireValue(written===count,'Energy selection count changed.');await values.flush();
    const probe=await summarizeEnergyValues(values,count,quantiles,{budget,signal,onProgress:e=>onProgress?.({...e,panel:panel+1,qualityIndex:q})});probes.push(probe);await values.dispose();values=null;
    for(let y=y0;y<=y1;y++){if((y-y0)%32===0)await cooperate();await valid.readInto(rv,y*w+x0);await planes[q].readInto(new Uint8Array(rp.buffer,0,width*4),(y*w+x0)*4);for(let x=0;x<width;x++)rs[x]=rv[x]?f(log(f(f(probe.central_mean+.25)/f(rp[x]+.25)))/f(.2)):0;await scores[q].write(new Uint8Array(rs.buffer,0,width*4),(y*w+x0)*4);}
   }
   summaries.push({id:panel+1,bbox:[x0,y0,x1+1,y1+1],probes});onProgress?.({phase:'energy-panel-scores',fraction:(panel+1)/polygons.length});
  }
  await scope.flush();for(const score of scores)await score.flush();
  for(let at=0;at<n;at+=BLOCK){await cooperate();const length=Math.min(BLOCK,n-at);for(let q=0;q<3;q++)await scores[q].readInto(new Uint8Array(buffers[q].buffer,0,length*4),at*4);for(let i=0;i<length;i++){const x=buffers[0][i],y=buffers[1][i],z=buffers[2][i],m=x>y?(y>z?y:Math.min(x,z)):(x>z?x:Math.min(y,z));buffers[3][i]=Math.max(m,0);buffers[4][i]=Math.max(-m,0);}await low.write(new Uint8Array(buffers[3].buffer,0,length*4),at*4);await high.write(new Uint8Array(buffers[4].buffer,0,length*4),at*4);onProgress?.({phase:'energy-quality-median',fraction:(at+length)/n});}
  await low.flush();await high.flush();await valid.dispose();for(const score of scores)await score.dispose();checkAbort(signal);success=true;let disposed=false;const releaseSummary=summaryRelease;summaryRelease=null;
  return {width:w,height:h,energy_low_score:low,energy_high_score:high,energy_scope:scope,energy_summary:summaries,metrics:{preparationWorkingBytes:ownBytes+2*1024**2,panels:summaries.length,sourcePanels:polygons.length,lowStorage:low.storage,highStorage:high.storage,scopeStorage:scope.storage},dispose:async()=>{if(disposed)return;disposed=true;try{const results=await Promise.allSettled([low,high,scope].map(s=>s.dispose()));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}finally{releaseSummary();}}};
 }finally{planning?.();workRelease?.();summaryRelease?.();await Promise.allSettled([values,...(!success?stores:[])].filter(Boolean).map(s=>s.dispose()));}
}
