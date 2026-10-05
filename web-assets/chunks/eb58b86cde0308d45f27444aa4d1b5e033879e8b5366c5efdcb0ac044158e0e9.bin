import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
const BLOCK=65536;
// Unsigned word order is the qualified radix ordering for nonnegative float32.
export async function selectFloat32Ranks(store,count,ranks,{budget,signal,onProgress,maximum=Infinity}={}){
 const cooperate=createCooperator(signal);
 requireValue(Number.isInteger(count)&&count>0&&count<2**31&&store?.byteLength===count*4&&Array.isArray(ranks)&&ranks.length>0&&ranks.length<=4&&ranks.every(r=>Number.isInteger(r)&&r>=0&&r<count),'Valid float32 stream and up to four ranks required.');requireValue(maximum>=0,'Invalid float32 domain.');const release=budget.reserve(2*1024**2);
 try{const buffer=new Float32Array(Math.min(BLOCK,count)),raw=new Uint8Array(buffer.buffer),words=new Uint32Array(buffer.buffer),hist=new Uint32Array(65536),targets=ranks.map(rank=>({rank}));
  async function scan(visit,phase){for(let at=0;at<count;at+=buffer.length){await cooperate();const length=Math.min(buffer.length,count-at);await store.readInto(raw.subarray(0,length*4),at*4);checkAbort(signal);visit(length);onProgress?.({phase,fraction:(at+length)/count});}}
  await scan(length=>{for(let i=0;i<length;i++){requireValue(Number.isFinite(buffer[i])&&buffer[i]>=0&&buffer[i]<=maximum,'Float32 value outside the admitted nonnegative domain.');hist[words[i]>>>16]++;}},'energy-quantile-prefix');
  const select=(table,rank)=>{let before=0;for(let i=0;i<table.length;i++){if(before+table[i]>rank)return {value:i,rank:rank-before};before+=table[i];}throw Error('Float32 rank exceeds stream count.');};
  const suffixes=new Map();for(const target of targets){const found=select(hist,target.rank);target.prefix=found.value;target.rank=found.rank;if(!suffixes.has(found.value))suffixes.set(found.value,new Uint32Array(65536));}
  await scan(length=>{for(let i=0;i<length;i++){const word=words[i],table=suffixes.get(word>>>16);if(table)table[word&65535]++;}},'energy-quantile-suffix');
  const scalar=new Float32Array(1),bits=new Uint32Array(scalar.buffer);return targets.map(target=>{bits[0]=(target.prefix<<16)|select(suffixes.get(target.prefix),target.rank).value;return scalar[0];});
 }finally{release();}
}
