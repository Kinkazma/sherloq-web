import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
/** Exact float32 order statistics using four streamed radix passes. No
 * full-image sorted copy, approximation, histogram bins in value space or
 * per-tile percentile. Linear interpolation matches the native float32 delta.
 */
export async function neuralQuantiles(tensor,quantiles,{budget,signal,onProgress,chunkBytes=4*1024**2}={}){
 requireValue(Number.isSafeInteger(chunkBytes)&&chunkBytes>=4&&tensor.length>0&&quantiles.every(q=>Number.isFinite(q)&&q>=0&&q<=1),'Invalid global quantiles.');
 const positions=quantiles.map(q=>(tensor.length-1)*q),ranks=[...new Set(positions.flatMap(p=>[Math.floor(p),Math.min(tensor.length-1,Math.floor(p)+1)]))],states=ranks.map(rank=>({rank,left:rank,prefix:0})),size=Math.min(tensor.length,Math.floor(chunkBytes/4)),release=budget.reserve(size*4+states.length*256*8+4096);
 try{
  const values=new Float32Array(size),bits=new Uint32Array(values.buffer);
  for(let pass=0;pass<4;pass++){
   const shift=24-pass*8,groups=new Map();for(const s of states)if(!groups.has(s.prefix))groups.set(s.prefix,new Float64Array(256));
   for(let at=0;at<tensor.length;at+=size){await controlCheckpoint(signal);const count=Math.min(size,tensor.length-at);await tensor.readInto(values.subarray(0,count),at,{signal});for(let i=0;i<count;i++){requireValue(Number.isFinite(values[i]),'Nonfinite neural quantile field.');const key=bits[i]&0x80000000?(~bits[i])>>>0:(bits[i]^0x80000000)>>>0,prefix=pass===0?0:key>>>(32-pass*8),hist=groups.get(prefix);if(hist)hist[(key>>>shift)&255]++;}}
   for(const s of states){const hist=groups.get(s.prefix);let bucket=0;while(bucket<255&&s.left>=hist[bucket])s.left-=hist[bucket++];requireValue(hist[bucket]>s.left,'Invalid neural quantile population.');s.prefix=s.prefix*256+bucket;}
   onProgress?.({phase:'global-neural-quantiles',completed:pass+1,total:4});
  }
  const ranked=new Map(),word=new Uint32Array(1),value=new Float32Array(word.buffer);
  for(const s of states){word[0]=s.prefix&0x80000000?(s.prefix^0x80000000)>>>0:(~s.prefix)>>>0;ranked.set(s.rank,value[0]);}
  checkAbort(signal);return positions.map(p=>{const lo=Math.floor(p),t=p-lo,a=ranked.get(lo),b=ranked.get(Math.min(tensor.length-1,lo+1)),d=Math.fround(b-a);return t>=.5?b-d*(1-t):a+d*t;});
 }finally{release();}
}
