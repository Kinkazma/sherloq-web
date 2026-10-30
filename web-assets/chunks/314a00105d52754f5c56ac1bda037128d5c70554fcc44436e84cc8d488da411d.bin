import "../../runtime-context.js?v=0.30.0";
import {checkAbort,createCooperator,requireValue} from './errors.js';
import {DensePmGpu} from './dense-pm-gpu.js';
import {createDensePmReverse,densePmReverseHeapBound} from './dense-pm-reverse.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {onceDenseRetirement,denseConstructionOwner,retireDenseOwners,cleanupDenseOwners} from './dense-owner-retirement.js';
import {acquireDensePmJob} from './dense-pm-job-gate.js';
import {describeDensePmGeometry} from './dense-pm-geometry.js';

// Preserve native field IDs while gathering only eligible descriptor vectors.
// The publication remains a complete native-coordinate field for coherence.
export async function tryRunStoredDensePmGpu(input,options={}){
 const {budget,signal,maxWorkers=1,enableDenseGpu=false,backend='auto',onRetirementOwner}=options,{width,height,dimensions,first,second=first,mask,axes}=input,n=width*height;
 if(!enableDenseGpu||backend==='cpu'||first?.kind==='compact-sift'||!first?.readInto||!second?.readInto||!mask?.readInto||!Number.isSafeInteger(n)||width<1||height<1||![12,128].includes(dimensions)||width*width+height*height>=0x7fffffff)return null;
 const jobGate=await acquireDensePmJob(budget,signal),charges=[],workspace=onceDenseRetirement(()=>retireDenseOwners(charges)),charge=bytes=>{const free=budget.reserve(bytes);charges.push(onceDenseRetirement(free));};
 try{charge(n*9+(axes?(width+height)*4:0)+8*1024**2);}catch(error){jobGate();if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))return null;throw error;}
 const scheduler=getExecutionScheduler(budget,{maxWorkers}),temporary=[],outputs=[],cooperate=createCooperator(signal);let provider,reverse,nativeBacking,nativeCapacity=0,output,success=false,failed=false,primary,cpuLease,temporaryOwner,outputOwner,readBytes=0,readCalls=0;
 const retireBody=onceDenseRetirement(async()=>{await retireDenseOwners(temporary);await workspace();jobGate();});
 try{
  temporaryOwner=denseConstructionOwner(temporary,{onRetirementOwner},retireBody);provider=new DensePmGpu(budget,{maxWorkers});temporary.push(onceDenseRetirement(()=>provider.dispose()));outputOwner=denseConstructionOwner(outputs,{onRetirementOwner});
  const allocate=(Type,length)=>{try{return new Type(length);}catch(error){if(error instanceof RangeError)return null;throw error;}};
  const ownArray=(value,label)=>{let backing=budget.registerBacking?.('array-buffer',value.byteLength,{owner:'patchmatch',label,identity:value.buffer}),done=false;temporary.push(onceDenseRetirement(async()=>{const bytes=await backing?.();backing=null;if(!done){if(bytes!==0)budget.notifyBackingRelease?.('array-buffer',bytes??value.byteLength);done=true;}}));return value;};
  const readInto=async(store,bytes,offset=0)=>{checkAbort(signal);await store.readInto(bytes,offset);readBytes+=bytes.byteLength;readCalls++;await cooperate();};
  const read=async(store,array)=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);requireValue(store.byteLength===bytes.byteLength,'Dense stored bank length mismatch');for(let offset=0;offset<bytes.length;offset+=1024**2)await readInto(store,bytes.subarray(offset,Math.min(bytes.length,offset+1024**2)),offset);};
  cpuLease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',label:'dense-stored-native-plan'});
  let nativeAxes=null;if(axes){nativeAxes=[];requireValue(Array.isArray(axes)&&axes.length===2,'Invalid stored native axes');for(let axis=0;axis<2;axis++){const allocated=allocate(Float32Array,axis?height:width);if(!allocated)return null;const values=ownArray(allocated,'dense-stored-axis-'+axis);if(axes[axis] instanceof Float32Array){requireValue(axes[axis].length===values.length,'Native axis length mismatch');values.set(axes[axis]);}else{requireValue(axes[axis]?.byteLength===values.byteLength&&typeof axes[axis].readInto==='function','Native axis store length mismatch');await readInto(axes[axis],new Uint8Array(values.buffer));}nativeAxes.push(values);}}
  const geometry=describeDensePmGeometry(width,height,{...options,axes:nativeAxes});if(!geometry)return null;
  const maskArray=allocate(Uint8Array,n);if(!maskArray)return null;const allowed=ownArray(maskArray,'dense-stored-mask');await read(mask,allowed);let count=0;for(const value of allowed){if(value>3)return null;if(value)count++;}if(count<2)return null;
  const packed=count<n,indices=packed?allocate(Int32Array,count):undefined;if(packed&&!indices)return null;const activeIndices=packed?ownArray(indices,'dense-stored-active-native-indices'):undefined;let slot=0;if(packed)for(let i=0;i<n;i++)if(allowed[i])activeIndices[slot++]=i;
  const elements=(packed?count:n)*dimensions,bankBytes=elements*4*(first===second?1:2),nativeBytes=densePmReverseHeapBound(first===second?0:elements*4,first===second?0:elements*4,n,axes?(width+height)*4:0,packed?count:undefined);if(nativeBytes>=2**31)return null;
  try{charge(bankBytes+nativeBytes);}catch(error){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))return null;throw error;}
  await cpuLease.release();cpuLease=null;try{await provider.prepare(dimensions,Math.max(elements*4,n*16),signal,geometry.mode+(packed?'-active':''));}catch(error){if(provider.mayFallback(error))return null;throw error;}
  cpuLease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',label:'dense-stored-bank-publication'});
  const sourceArray=allocate(Float32Array,elements);if(!sourceArray)return null;const a=ownArray(sourceArray,'dense-stored-first');let b=a;if(first!==second){const targetArray=allocate(Float32Array,elements);if(!targetArray)return null;b=ownArray(targetArray,'dense-stored-second');}
  const gather=async(store,array)=>{requireValue(store.byteLength===n*dimensions*4,'Dense native source bank length mismatch');if(!packed){await read(store,array);return;}for(let begin=0;begin<count;){let end=begin+1;while(end<count&&end-begin<8192&&activeIndices[end]===activeIndices[begin]+end-begin)end++;await readInto(store,new Uint8Array(array.buffer,array.byteOffset+begin*dimensions*4,(end-begin)*dimensions*4),activeIndices[begin]*dimensions*4);begin=end;}};
  await gather(first,a);if(b!==a)await gather(second,b);
  nativeBacking=budget.registerBacking?.('wasm',nativeBytes,{owner:'patchmatch',label:'dense-stored-native-reverse',state:'reserved'});temporary.push(onceDenseRetirement(async()=>{await reverse?.dispose();reverse=null;await nativeBacking?.();nativeBacking=null;if(nativeCapacity)budget.notifyBackingRelease?.('wasm',nativeCapacity);nativeCapacity=0;}));
  reverse=await createDensePmReverse(a,b,allowed,width,height,{...options,dimensions,axes:nativeAxes,activeIndices,reuseSymmetricScores:a===b,nativeDistanceInvariant:true});nativeCapacity=reverse.heapBytes;nativeBacking?.materialize(nativeCapacity);await cpuLease.release();cpuLease=null;
  try{output=await provider.run({...options,first:a,second:b,mask:allowed,width,height,dimensions,axes:nativeAxes,activeIndices},{signal,onProgress:options.onProgress,reverse:async state=>{const lease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',label:'dense-stored-native-reverse'});try{return reverse.apply(state);}finally{await lease.release();}}});}catch(error){if(provider.mayFallback(error))return null;throw error;}
  temporary.push(onceDenseRetirement(()=>output.release()));const targets=await createSegmentedBytes(n*4,{...options,owner:'patchmatch',label:'dense-gpu-targets'});outputs.push(targets);const distancesSquared=await createSegmentedBytes(n*4,{...options,owner:'patchmatch',label:'dense-gpu-distances'});outputs.push(distancesSquared);
  const write=async(store,value)=>{const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);for(let offset=0;offset<bytes.length;offset+=1024**2){checkAbort(signal);await store.write(bytes.subarray(offset,Math.min(bytes.length,offset+1024**2)),offset);await cooperate();}await store.flush();};await write(targets,output.targets);await write(distancesSquared,output.distancesSquared);
  const comparisons=output.comparisons,execution={...output.metrics,bankStorage:packed?'eligible-native-coordinate-stores':'full-source-coordinate-stores',nativeReverseScoreReuse:reverse.symmetricScoreReuse===true,nativeReverseHeapCapacityBytes:nativeCapacity,sourceStoreReadBytes:readBytes,sourceStoreReadCalls:readCalls,sourceBankLogicalBytes:n*dimensions*4*(first===second?1:2)};
  await temporaryOwner.dispose();checkAbort(signal);outputOwner.publish();success=true;return{width,height,targets,distancesSquared,allowed:mask,ownsAllowed:false,comparisons,metrics:{execution},descriptorStorage:'stored-native-float32-gpu-matching',dispose:outputOwner.dispose};
 }catch(error){failed=true;primary=error;throw error;}
 finally{let cleanupFailed=false,cleanupPrimary;const attempt=async action=>{try{await action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}};if(cpuLease)await attempt(()=>cpuLease.release());if(!success)await attempt(()=>cleanupDenseOwners(()=>retireDenseOwners([temporaryOwner??retireBody,outputOwner]),{failed,primary}));if(cleanupFailed){if(!failed)throw cleanupPrimary;if(primary&&typeof primary==='object')try{primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanupPrimary];}catch{}}}
}
