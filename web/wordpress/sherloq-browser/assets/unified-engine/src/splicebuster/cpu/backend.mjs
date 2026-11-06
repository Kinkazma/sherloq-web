import "../../../../runtime-context.js?v=0.31.0";
/* Private Splicebuster CPU statistics. GRIP-UNINA nonprofit licence: LICENSE.txt. */
import createStatistics from './statistics.mjs';
const MiB=1024**2;
const failure=(code,message,details,cause)=>Object.assign(new Error(message,cause===undefined?undefined:{cause}),{code,...(details?{details}:{})});
const nativeAllocationFailure=/\baborted\(oom\)|\bstd::bad_alloc\b|\b(?:failed|unable|could not) to allocate memory\b|\bout of memory\b/i;
const integer=(n,label,maximum=0x7fffffff)=>{if(!Number.isSafeInteger(n)||n<1||n>maximum)throw failure('INPUT',`${label} is out of range`);};
const output=(Type,length)=>({Type,length,byteLength:Type.BYTES_PER_ELEMENT*length});
const typed=(value,Type,count,label)=>{if(!(value instanceof Type)||value.length!==count)throw failure('INPUT',`${label} must be ${Type.name}[${count}]`);};

/** Conservative per-instance WASM reservation, not a browser RSS measurement. */
export function cpuMemoryPlan({operation,nAll,nValid=nAll,features=50,dimensions=25,replicates=30}={}){
 nAll??=nValid;integer(nAll,'nAll');integer(nValid,'nValid');
 const d=dimensions,f=features;
 let inputBytes,outputBytes,temporaryBytes;
 if(operation==='prepare'){
  inputBytes=nAll*(4*f+1);outputBytes=8*((nAll+nValid)*d+f*d+d)+4*replicates+4;
  temporaryBytes=8*nValid*Math.max(f,d)+8*f*f*12+8*256*(f+d)+8*nValid*4;
 }else if(operation==='fit'){
  inputBytes=8*(nValid*d+d);outputBytes=8*(2*d+d*d+4);
  temporaryBytes=8*nValid*(3*d+8)+8*d*d*12;
 }else if(operation==='map'){
  inputBytes=8*(nAll*d+2*d+d*d);outputBytes=8*nAll;
  temporaryBytes=8*nAll*(d+2)+8*d*d*12;
 }else throw failure('INPUT','Unknown CPU statistics operation');
 const heapMaximumBytes=Math.ceil((16*MiB+1.25*(inputBytes+outputBytes+temporaryBytes))/(16*MiB))*16*MiB;
 return {inputBytes,outputBytes,temporaryBytes,heapMaximumBytes,maximumSingleArrayBytes:Math.max(inputBytes,outputBytes,temporaryBytes)};
}

export async function createCpuBackend({memoryMaximumBytes=256*MiB,wasmURL=new URL('./statistics.wasm',import.meta.url),wasmBinary,moduleFactory=createStatistics,extension}={}){
 if(!Number.isSafeInteger(memoryMaximumBytes)||memoryMaximumBytes<16*MiB||memoryMaximumBytes>2*1024**3||memoryMaximumBytes%65536)
  throw failure('INPUT','WASM maximum must be 16MiB..2GiB, aligned to 64KiB');
 let memory;
 try{memory=new WebAssembly.Memory({initial:256,maximum:memoryMaximumBytes/65536});}
 catch(error){if(error instanceof RangeError)throw failure('MEMORY_ALLOCATION','Unable to allocate CPU WASM memory',{allocationKind:'wasm',requestedBytes:16*MiB,currentBytes:0,maximumBytes:memoryMaximumBytes},error);throw error;}
 let module;
 try{module=await moduleFactory({wasmMemory:memory,wasmBinary,locateFile:name=>name.endsWith('.wasm')?String(wasmURL):new URL(name,import.meta.url).href,print:()=>{},printErr:()=>{}});}
 catch(error){if(nativeAllocationFailure.test(String(error?.message??error)))throw failure('MEMORY_ALLOCATION','Unable to initialize CPU WASM memory',{allocationKind:'wasm',currentBytes:memory.buffer.byteLength,maximumBytes:memoryMaximumBytes},error);throw error;}
 let disposed=false;
 const live=()=>{if(disposed)throw failure('DISPOSED','CPU backend disposed');};
 function run(inputs,outputs,execute){
  live();const allocations=[];let pointers={},failed=false;
  try{
   for(const [key,array]of Object.entries({...inputs,...outputs})){
    const bytes=array.byteLength,pointer=module._malloc(bytes||8);
    if(!pointer)throw failure('MEMORY_ALLOCATION','CPU statistics allocation failed',{allocationKind:'wasm',requestedBytes:bytes||8,currentBytes:module.HEAPU8.buffer.byteLength,maximumBytes:memoryMaximumBytes});
    allocations.push(pointer);pointers[key]=pointer;
   }
   for(const [key,array]of Object.entries(inputs))module.HEAPU8.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),pointers[key]);
   const code=execute(pointers);
   if(code!==0)throw failure(code===2?'NO_VALID_BLOCKS':'STATISTICS_EXECUTION',`CPU statistics returned ${code}`);
   const result={};
   for(const [key,array]of Object.entries(outputs)){
    // Construct the view outside the allocation catch: invalid pointers/lengths
    // are program errors, not proof that an allocator ran out of memory.
    const view=new array.Type(module.HEAPU8.buffer,pointers[key],array.length);
    try{result[key]=view.slice();}
    catch(error){if(error instanceof RangeError)throw failure('MEMORY_ALLOCATION','Unable to allocate CPU output array',{allocationKind:'array-buffer',requestedBytes:array.byteLength},error);throw error;}
   }
   return result;
  }catch(error){
   failed=true;
   if(nativeAllocationFailure.test(String(error?.message??error))&&!error?.code)throw failure('MEMORY_ALLOCATION',String(error),{allocationKind:'wasm',currentBytes:module.HEAPU8.buffer.byteLength,maximumBytes:memoryMaximumBytes},error);
   throw error;
  }finally{let cleanupFailed=false,cleanupError;for(const pointer of allocations)try{module._free(pointer);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}if(cleanupFailed&&!failed)throw cleanupError;}
 }
 const api={
  prepare({spam,valid,shape,seed=0,replicates=30,dimensions=25}){
   live();
   if(!Array.isArray(shape)||shape.length!==3)throw failure('INPUT','Expected [rows,cols,50]');
   shape.forEach((v,i)=>integer(v,`shape[${i}]`));
   const [rows,cols,f]=shape,n=rows*cols;integer(n,'nAll');
   if(f!==50||dimensions!==25)throw failure('INPUT','Qualified CPU contract requires 50→25 features');
   typed(spam,Float32Array,n*f,'spam');typed(valid,Uint8Array,n,'valid');
   integer(replicates,'replicates',30);
   if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw failure('INPUT','seed must be uint32');
   let count=0;for(const flag of valid){if(flag!==0&&flag!==1)throw failure('INPUT','valid mask must be binary');count+=flag;}
   if(!count)return {empty:true,nAll:n,nValid:0,dimensions,projected:new Float64Array(),training:new Float64Array(),basis:new Float64Array(),variance:new Float64Array(),initialIndices:new Uint32Array()};
   const result=run({spam,valid},{projected:output(Float64Array,n*dimensions),training:output(Float64Array,count*dimensions),basis:output(Float64Array,f*dimensions),variance:output(Float64Array,dimensions),initialIndices:output(Uint32Array,replicates),count:output(Int32Array,1)},p=>module._sb_prepare(p.spam,p.valid,n,f,dimensions,seed,replicates,p.projected,p.training,p.basis,p.variance,p.initialIndices,p.count));
   if(result.count[0]!==count)throw failure('STATISTICS_EXECUTION','Training-row count mismatch');
   delete result.count;return {...result,nAll:n,nValid:count,dimensions,shape:[rows,cols,dimensions],empty:false};
  },
  fitReplica({training,nValid,dimensions=25,initialIndex,variance,maxIter=100,relErr=1e-5,outliersNlogl=42}){
   live();
   integer(nValid,'nValid');integer(dimensions,'dimensions',50);integer(maxIter,'maxIter',100);
   if(!Number.isInteger(initialIndex)||initialIndex<0||initialIndex>=nValid)throw failure('INPUT','initialIndex is out of range');
   if(!Number.isFinite(relErr)||relErr<=0||!Number.isFinite(outliersNlogl))throw failure('INPUT','Invalid scientific parameter');
   typed(training,Float64Array,nValid*dimensions,'training');typed(variance,Float64Array,dimensions,'variance');
   const result=run({training,variance},{mu:output(Float64Array,2*dimensions),Sigma:output(Float64Array,dimensions*dimensions),info:output(Float64Array,4)},p=>module._sb_fit(p.training,nValid,dimensions,initialIndex,p.variance,maxIter,relErr,outliersNlogl,p.mu,p.Sigma,p.info));
   const [score,outliersProb,iterations,converged]=result.info;delete result.info;
   return {...result,score,outliersProb,iterations,converged:!!converged};
  },
  map({projected,nAll,dimensions=25,mu,Sigma}){
   live();
   integer(nAll,'nAll');integer(dimensions,'dimensions',50);
   typed(projected,Float64Array,nAll*dimensions,'projected');typed(mu,Float64Array,2*dimensions,'mu');typed(Sigma,Float64Array,dimensions*dimensions,'Sigma');
   return run({projected,mu,Sigma},{map:output(Float64Array,nAll)},p=>module._sb_map(p.projected,nAll,dimensions,p.mu,p.Sigma,p.map)).map;
  },
  heapBytes(){live();return module.HEAPU8.buffer.byteLength;},
  dispose(){disposed=true;module=null;memory=null;},
 };
 return extension?Object.assign(api,Object.fromEntries(Object.entries(extension({run,invoke:(name,...args)=>module[name](...args)})).map(([name,method])=>[name,(...args)=>{live();return method(...args);}]))):api;
}
