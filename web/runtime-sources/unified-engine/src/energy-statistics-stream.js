import {selectFloat32Ranks} from './float32-ranks-stream.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {energyPairwise,energyQuantile} from './energy-prepare.js';
const f=Math.fround,BLOCK=65536,REDUCTION=8192;
// Exact order statistics without sorting or retaining a full panel. Finite
// nonnegative float32 words use the same unsigned ordering as native preparation.
export async function summarizeEnergyValues(store,count,quantiles,{budget,signal,onProgress}={}){
 const cooperate=createCooperator(signal);
 requireValue(Number.isInteger(count)&&count>0&&count<2**31&&store?.byteLength===count*4,'A complete compact float32 panel stream is required.');requireValue(Array.isArray(quantiles)&&quantiles.length===2&&quantiles.every(Number.isFinite)&&quantiles[0]>=0&&quantiles[0]<=.5&&quantiles[1]>=.5&&quantiles[1]<=1,'Invalid energy quantiles.');
 const endpoints=await selectFloat32Ranks(store,count,quantiles.flatMap(q=>{const lo=Math.floor((count-1)*q);return [lo,Math.min(lo+1,count-1)];}),{budget,signal,onProgress,maximum:255});
 const release=budget.reserve(512*1024);try{
  const buffer=new Float32Array(Math.min(BLOCK,count)),raw=new Uint8Array(buffer.buffer);
  async function scan(visit,phase){for(let at=0;at<count;at+=buffer.length){await cooperate();const length=Math.min(buffer.length,count-at);await store.readInto(raw.subarray(0,length*4),at*4);checkAbort(signal);visit(length);onProgress?.({phase,fraction:(at+length)/count});}}
  const q=quantiles.map((v,i)=>energyQuantile(Float32Array.of(endpoints[i*2],endpoints[i*2+1]),2,(count-1)*v-Math.floor((count-1)*v))),lower=f(q[0]),upper=f(q[1]),groups=Array.from({length:3},()=>({buffer:new Float32Array(REDUCTION),used:0,count:0,total:0,mean:0,variance:0}));
  const keep=(value,index)=>index===0?value>=lower&&value<=upper:index===1?value<=lower:value>=upper;
  function flush(group,variance){if(!group.used)return;group.total=f(group.total+energyPairwise(i=>{const value=group.buffer[i];if(!variance)return value;const d=f(value-group.mean);return f(d*d);},0,group.used,f));group.used=0;}
  for(let pass=0;pass<2;pass++){
   for(const group of groups){group.total=0;group.used=0;if(pass===0)group.count=0;}
   await scan(length=>{for(let i=0;i<length;i++){const value=buffer[i];for(let j=0;j<3;j++)if(keep(value,j)){const group=groups[j];group.buffer[group.used++]=value;if(pass===0)group.count++;if(group.used===REDUCTION)flush(group,pass===1);}}},pass?'energy-panel-variance':'energy-panel-mean');
   for(const group of groups){flush(group,pass===1);if(pass)group.variance=group.count?f(group.total/group.count):0;else group.mean=group.count?f(group.total/group.count):(q[0]+q[1])/2;}
  }
  checkAbort(signal);return {q10:q[0],q90:q[1],central_mean:groups[0].mean,central_variance:groups[0].variance,low_mean:groups[1].mean,low_variance:groups[1].variance,high_mean:groups[2].mean,high_variance:groups[2].variance};
 }finally{release();}
}
