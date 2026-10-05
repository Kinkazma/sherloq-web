import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';

const ROW_BYTES=24;
const bytesOf=values=>new Uint8Array(values.buffer,values.byteOffset,values.byteLength);
const keyAt=(rows,i,width)=>(rows[i+1]*width+rows[i])*3+2-rows[i+2];

// Stable numeric radix order is the native CSV order y,x,B,G,R. No JS array of
// all row objects and no uint32 truncation of the full-image coordinate key.
// On success ownership transfers to the returned store. On failure the input
// remains owned by the caller; every extra store is disposed here.
export async function sortCandidates(store,{width,height,budget,temporarySession,
 getTemporarySession,signal,onProgress,forceExternal=false,bucketRows=43690}={}){
 requireValue(store.byteLength%ROW_BYTES===0&&Number.isSafeInteger(width)&&width>0&&
  Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(width*height*3),
  'Invalid candidate table dimensions.');
 requireValue(Number.isSafeInteger(bucketRows)&&bucketRows>0,'Invalid candidate bucket size.');
 const count=store.byteLength/ROW_BYTES,maxKey=width*height*3-1;
 if(count<2){checkAbort(signal);return {store,metrics:{path:'already-ordered',passes:0}};}
 const io=()=>temporarySession?.backend==='indexeddb'||getTemporarySession?2*1024**2:0;
 const available=()=>budget.limit-budget.retained-budget.active-io();
 if(!forceExternal&&store.byteLength*2+2048<=available()){
  const release=budget.reserve(store.byteLength*2+2048);
  try{
   let a=new Uint32Array(count*6),b=new Uint32Array(count*6);
   await store.readInto(bytesOf(a));checkAbort(signal);
   const counts=new Float64Array(256);let passes=0;
   for(let divisor=1;divisor<=maxKey;divisor*=256){
    await controlCheckpoint(signal);counts.fill(0);
    for(let i=0;i<a.length;i+=6){if(i%(65536*6)===0)await controlCheckpoint(signal);counts[Math.floor(keyAt(a,i,width)/divisor)%256]++;}
    let offset=0;for(let j=0;j<256;j++){const n=counts[j];counts[j]=offset;offset+=n;}
    for(let i=0;i<a.length;i+=6){if(i%(65536*6)===0)await controlCheckpoint(signal);const to=counts[Math.floor(keyAt(a,i,width)/divisor)%256]++*6;for(let c=0;c<6;c++)b[to+c]=a[i+c];}
    [a,b]=[b,a];passes++;onProgress?.(Math.min(1,Math.log(divisor*256)/Math.log(maxKey+1)));
   }
   await controlCheckpoint(signal);await store.write(bytesOf(a));await store.flush();checkAbort(signal);
   return {store,metrics:{path:'memory-radix',passes}};
  }finally{release();}
 }

 // Sixteen fixed-size output buffers turn scattered record destinations into
 // sequential writes within each partition. Both arrays share normal ownership
 // and quota admission; actual quota errors remain explicit.
 let spare,planning,current=store,target;
 const inputBytes=Math.min(store.byteLength,Math.floor(1024**2/ROW_BYTES)*ROW_BYTES);
 const perBucket=Math.min(bucketRows*ROW_BYTES,store.byteLength,Math.floor((available()-inputBytes-384)/(16*ROW_BYTES))*ROW_BYTES);
 if(perBucket<ROW_BYTES)throw new EngineError('MEMORY_LIMIT','Candidate ordering buffers do not fit the shared budget.');
 const scratchBytes=inputBytes+16*perBucket+384;
 try{
  planning=budget.reserve(scratchBytes+io());
  spare=await createSegmentedBytes(store.byteLength,{budget,temporarySession,getTemporarySession,signal});
  planning();planning=null;target=spare;
  const release=budget.reserve(16*perBucket+384);
  try{
   const buffers=Array.from({length:16},()=>new Uint32Array(perBucket/4)),used=new Uint32Array(16),counts=new Float64Array(16),offsets=new Float64Array(16);
   let passes=0;const totalPasses=Math.ceil(Math.log(maxKey+1)/Math.log(16));
   for(let divisor=1;divisor<=maxKey;divisor*=16){
    counts.fill(0);used.fill(0);
    await current.visit(bytes=>{
     const rows=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
     for(let i=0;i<rows.length;i+=6)counts[Math.floor(keyAt(rows,i,width)/divisor)%16]++;
    },{signal,blockBytes:inputBytes});
    let offset=0;for(let j=0;j<16;j++){offsets[j]=offset;offset+=counts[j]*ROW_BYTES;}
    async function flush(j){if(!used[j])return;const bytes=bytesOf(buffers[j].subarray(0,used[j]));await target.write(bytes,offsets[j]);offsets[j]+=bytes.length;used[j]=0;checkAbort(signal);}
    await current.visit(async bytes=>{
     const rows=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
     for(let i=0;i<rows.length;i+=6){const j=Math.floor(keyAt(rows,i,width)/divisor)%16,to=used[j];for(let c=0;c<6;c++)buffers[j][to+c]=rows[i+c];used[j]+=6;if(used[j]===buffers[j].length)await flush(j);}
    },{signal,blockBytes:inputBytes});
    for(let j=0;j<16;j++)await flush(j);
    await target.flush();checkAbort(signal);[current,target]=[target,current];passes++;onProgress?.(passes/totalPasses);checkAbort(signal);
   }
   await target.dispose();return {store:current,metrics:{path:'external-radix',passes,bucketBytes:perBucket,inputBytes}};
  }finally{release();}
 }catch(error){await spare?.dispose();throw error;}finally{planning?.();}
}
