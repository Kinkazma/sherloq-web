// Native global traversal with bounded caches and externally stored planes.
// Input stores are borrowed; returned planes are owned until dispose(). No
// image resizing, tile-local candidates, or numerical approximation is used.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
export async function runPagedDenseField({first,second=first,mask,width,height,dimensions=12,axes=null}, {
 budget,temporarySession,getTemporarySession,storage='auto',pageBytes=4096,cachePages,
 residentPool,residentSiftBounds,pagedSiftBounds,initialBatchPixels,minimum=5,radius=600,iterations=8,compare=false,seed=729,gap=[0,0],signal,onProgress
}={}){
 const n=width*height,compact=first?.kind==='compact-sift';if(compact)dimensions=128;
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&n<=0x7fffffff&&[12,128].includes(dimensions),'Invalid paged dense shape.');
 const store=(s,bytes)=>s?.byteLength===bytes&&typeof s.readInto==='function';
 const compactValid=f=>f?.kind==='compact-sift'&&[f.width,f.height,f.patch,f.offset].every(Number.isSafeInteger)&&f.patch>=3&&f.patch<=32&&f.offset>=0&&f.viewWidth===width&&f.viewHeight===height&&f.width-3*f.patch-2*f.offset===width&&f.height-3*f.patch-2*f.offset===height&&typeof f.mirror==='boolean'&&typeof f.quarter==='boolean'&&f.weights instanceof Float32Array&&f.weights.length===4&&f.weights.every(Number.isFinite)&&store(f.hist,f.width*f.height*32)&&store(f.norms,(f.width-3*f.patch)*(f.height-3*f.patch)*12)&&store(f.turns,(f.width-3*f.patch)*(f.height-3*f.patch))&&store(f.diverse,(f.width-3*f.patch)*(f.height-3*f.patch));
 requireValue((compact?compactValid(first)&&compactValid(second):store(first,n*dimensions*4)&&store(second,n*dimensions*4))&&store(mask,n),'Invalid paged dense planes.');
 requireValue(!axes||axes.length===2&&store(axes[0],width*4)&&store(axes[1],height*4),'Invalid paged dense axes.');
 requireValue([minimum,radius,...gap].every(Number.isFinite)&&minimum>=0&&radius>=minimum&&radius<=0x1fffffff&&gap.length===2&&gap.every(v=>Math.abs(v)<=0x1fffffff)&&Number.isInteger(iterations)&&iterations>=1&&iterations<=0x7fffffff&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff&&typeof compare==='boolean','Invalid paged PatchMatch options.');
 const poolBytes=2*(Math.ceil(n/64)*8+(Math.ceil(Math.ceil(n/64)/16)+1)*4);
 residentPool??=poolBytes<=Math.min(40*1024**2,(budget.limit-budget.retained-budget.active-32*1024**2)*.3);
 requireValue(typeof residentPool==='boolean','Invalid resident candidate pool choice.');
 const residentPoolBytes=residentPool?poolBytes:0;
 cachePages??=Math.max(1,Math.min(4096,Math.floor((budget.limit-budget.retained-budget.active-16*1024**2-residentPoolBytes)*.65/((compact?4:3)*pageBytes))));
 requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%8===0&&Number.isSafeInteger(cachePages)&&cachePages>=1,'Invalid dense page cache.');
 const fullBoundBytes=compact&&store(second.bounds,(second.width-3*second.patch)*(second.height-3*second.patch)*128)?second.bounds.byteLength:0;
 pagedSiftBounds??=!!fullBoundBytes&&second.hist.storage!=='memory'&&second.hist.byteLength>cachePages*pageBytes;
 requireValue(typeof pagedSiftBounds==='boolean'&&(!pagedSiftBounds||fullBoundBytes>0),'Invalid paged SIFT bounds.');
 const lengths=[compact?first.hist.byteLength:n*dimensions*4,compact?second.hist.byteLength:n*dimensions*4,n,n*4,n*4,residentPool?0:n*4,residentPool?0:n*4,width*4,height*4,...(compact?[first.norms.byteLength,second.norms.byteLength,first.turns.byteLength,second.turns.byteLength,first.diverse.byteLength,second.diverse.byteLength,0,pagedSiftBounds?fullBoundBytes:0]:[])];
 const cacheBytes=lengths.reduce((sum,length,id)=>sum+Math.min(Math.ceil(length/pageBytes),id<2?cachePages:Math.ceil(cachePages/8))*(pageBytes+32),0);
 const boundBytes=compact&&store(second.boundSamples,(second.width-3*second.patch)*(second.height-3*second.patch)*4)?second.boundSamples.byteLength:0;
 residentSiftBounds??=!!boundBytes&&boundBytes<=Math.min(512*1024**2,(budget.limit-budget.retained-budget.active-16*1024**2-cacheBytes-residentPoolBytes)*.45);
 requireValue(typeof residentSiftBounds==='boolean'&&(!residentSiftBounds||boundBytes>0),'Invalid resident SIFT bounds.');
 const residentSiftBoundsBytes=residentSiftBounds?boundBytes:0;
 const baseWorkspace=16*1024**2+cacheBytes+residentPoolBytes+residentSiftBoundsBytes;
 const batchElementBytes=dimensions*4+24;
 // A larger shared budget must not plan a batch beyond the module's own heap.
 initialBatchPixels??=n>=65536?Math.max(0,Math.min(n,4194304,Math.floor((budget.limit-budget.retained-budget.active-baseWorkspace-12*1024**2)*.75/batchElementBytes),Math.floor((1000*1024**2-baseWorkspace-8*1024**2)/batchElementBytes))):0;
 requireValue(Number.isSafeInteger(initialBatchPixels)&&initialBatchPixels>=0&&initialBatchPixels<=0x7fffffff,'Invalid dense initialization batch.');
 const batchBytes=initialBatchPixels?8*1024**2+Math.min(n,initialBatchPixels)*batchElementBytes:0;
 const workspace=baseWorkspace+batchBytes;
 if(workspace>1000*1024**2)throw new EngineError('MEMORY_LIMIT','Dense page caches exceed the module allowance.');
 checkAbort(signal);const release=budget.reserve(workspace),owned=[];
 const metrics={workspaceBytes:workspace,initialBatchPixels,batchBytes,residentPool,residentPoolBytes,residentSiftBoundsBytes,pagedSiftBounds,cacheBytes,pageBytes,cachePages,reads:0,writes:0,readBytes:0,writeBytes:0,heapBytes:0};
 let m,errorPointer,countPointer,metadataPointer,weightsPointer,success=false;
 const allocate=async bytes=>{const s=await createSegmentedBytes(bytes,{budget,temporarySession,getTemporarySession,storage,signal});owned.push(s);return s;};
 try{
  const targets=await allocate(n*4),distancesSquared=await allocate(n*4),pool0=await allocate(residentPool?0:n*4),pool1=await allocate(residentPool?0:n*4);
  let allowed=mask,ownsAllowed=false;
  if(compact&&(first.quarter||second.quarter)){
   allowed=await allocate(n);ownsAllowed=true;const page=new Uint8Array(Math.min(1024**2,n));
   for(let offset=0;offset<n;offset+=page.length){await controlCheckpoint(signal);const part=page.subarray(0,Math.min(page.length,n-offset));await mask.readInto(part,offset);await allowed.write(part,offset);}
  }
  const stores=[compact?first.hist:first,compact?second.hist:second,allowed,targets,distancesSquared,pool0,pool1,...(axes??[null,null]),...(compact?[first.norms,second.norms,first.turns,second.turns,first.diverse,second.diverse,second.boundSamples,second.bounds]:[])];
  const {default:create}=await import('../vendor/dense-paged/dense-paged.js');
  m=await create();let lastYield=performance.now();
  // Observe only real descriptor/bound reads. No probe or calibration is run.
  // A cold, much larger bound plane can cost more than the exact histogram
  // reads it avoids; retiring that optional check preserves every decision.
  const io=pagedSiftBounds?{descriptor:{seen:0,count:0,ms:0},bound:{seen:0,count:0,ms:0}}:null;
  if(io)metrics.siftBoundsReadTiming={boundSamples:0,descriptorSamples:0,boundReadMeanMs:0,descriptorReadMeanMs:0};
  m.pageIO=(id,offset,length,pointer,write)=>{
   checkAbort(signal);const bytes=m.HEAPU8.subarray(pointer,pointer+length);
   const timing=io&&!metrics.siftBoundsFallback&&!write&&length===pageBytes?(id===16?io.bound:((id===0||id===1||id===9||id===10)?io.descriptor:null)):null;
   const sampled=timing&&((timing.seen++&15)===0),started=sampled?performance.now():0;
   const finish=()=>{
    if(sampled){
     timing.ms+=performance.now()-started;timing.count++;
     const observed=metrics.siftBoundsReadTiming;observed.boundSamples=io.bound.count;observed.descriptorSamples=io.descriptor.count;
     observed.boundReadMeanMs=io.bound.ms/Math.max(1,io.bound.count);observed.descriptorReadMeanMs=io.descriptor.ms/Math.max(1,io.descriptor.count);
     if(io.bound.count>=32&&io.descriptor.count>=32&&io.bound.ms/io.bound.count>8*Math.max(.01,io.descriptor.ms/io.descriptor.count)){
      m.HEAPU32[metadataPointer/4+15]&=~4;metrics.pagedSiftBounds=false;
      metrics.siftBoundsFallback={reason:'slow-bound-reads',boundReadMeanMs:io.bound.ms/io.bound.count,descriptorReadMeanMs:io.descriptor.ms/io.descriptor.count,boundSamples:io.bound.count,descriptorSamples:io.descriptor.count};
     }
    }
    if(write){metrics.writes++;metrics.writeBytes+=length;}else{metrics.reads++;metrics.readBytes+=length;}checkAbort(signal);if(performance.now()-lastYield>=20)return m.checkpoint();};
   const result=write?stores[id].write(bytes,offset):stores[id].readInto(bytes,offset);
   return result&&typeof result.then==='function'?result.then(finish):finish();
  };
  m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-lastYield>=20){onProgress?.({phase:'global-patchmatch',...m.fieldProgress,...metrics});await controlCheckpoint(signal);lastYield=performance.now();}};
  errorPointer=m._malloc(1024);countPointer=m._malloc(8);
  if(!errorPointer||!countPointer)throw new EngineError('MEMORY_LIMIT','Paged dense allocation failed.');
  if(compact){
   const metadata=new Int32Array([first,second].flatMap(f=>[f.width,f.height,f.patch,f.offset,f.viewWidth,+f.mirror,+f.quarter,1]));
   metadata[15]=1+(residentSiftBounds?2:0)+(pagedSiftBounds?4:0);
   const weights=new Float32Array([...first.weights,...second.weights]);metadataPointer=m._malloc(metadata.byteLength);weightsPointer=m._malloc(weights.byteLength);
   if(!metadataPointer||!weightsPointer)throw new EngineError('MEMORY_LIMIT','Paged compact metadata allocation failed.');
   m.HEAPU8.set(new Uint8Array(metadata.buffer),metadataPointer);m.HEAPU8.set(new Uint8Array(weights.buffer),weightsPointer);
  }
  const values=[width,height,dimensions,+compare,minimum,radius,iterations,seed,...gap,+!!axes,pageBytes,cachePages,countPointer,errorPointer,metadataPointer??0,weightsPointer??0,+residentPool,initialBatchPixels];
  const code=await m.ccall('dense_paged_field','number',values.map(()=> 'number'),values,{async:true});
  if(m.ioError)throw m.ioError;
  if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(errorPointer));
  checkAbort(signal);await targets.flush();await distancesSquared.flush();
  const comparisons=BigInt(m.HEAPU32[countPointer/4])+(BigInt(m.HEAPU32[countPointer/4+1])<<32n);
  metrics.heapBytes=m.HEAPU8.byteLength;metrics.siftBoundRejections=m.siftBoundRejections??0;
  await pool0.dispose();await pool1.dispose();success=true;
  let disposed=false;
  return {width,height,targets,distancesSquared,allowed,ownsAllowed,comparisons,metrics,descriptorStorage:compact?'paged-compact-sift':'paged-global',async dispose(){if(disposed)return;disposed=true;await Promise.all([targets.dispose(),distancesSquared.dispose(),ownsAllowed?allowed.dispose():undefined]);}};
 }finally{
  if(m){if(errorPointer)m._free(errorPointer);if(countPointer)m._free(countPointer);if(metadataPointer)m._free(metadataPointer);if(weightsPointer)m._free(weightsPointer);m.pageIO=null;m.checkpoint=null;}
  if(!success)await Promise.allSettled(owned.map(s=>s.dispose()));
  release();
 }
}
