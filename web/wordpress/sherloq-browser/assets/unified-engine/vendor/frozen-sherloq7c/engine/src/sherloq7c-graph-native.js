import "../../../../../runtime-context.js?v=0.31.0";
import factory from './graph-kernel.mjs';
import {cooperator,allocate7c} from './sherloq7c-math.js';
const MiB=1024*1024,page=65536;
const failure=(code,message,details)=>Object.assign(new Error(message),{code,details});
export function nativeGraphPlan(width,height){
 const n=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||n>0x7fffffff)throw failure('INVALID_INPUT','Native graph dimensions exceed supported addressing.');
 const wasmMaximumBytes=Math.ceil(Math.max(16*MiB,320*n+8*MiB)/page)*page;
 if(wasmMaximumBytes>2**31)throw failure('MEMORY_LIMIT','Native graph worst-case heap exceeds its supported maximum.',{requestedBytes:wasmMaximumBytes});
 return{pixels:n,wasmInitialBytes:16*MiB,wasmMaximumBytes,inputBytes:6*n,maximumOutputBytes:134*n};
}

// Caller must reserve the imported heap maximum and owned JS output separately.
// The integrating engine admits that plan before entering and releases it
// after this function retires all native state.
export async function prepare7cNative16Native({width,height,data},{signal,onProgress,memoryBudgetBytes,blockWork=65536}={}){
 const started=performance.now(),plan=nativeGraphPlan(width,height),n=plan.pixels,cooperate=cooperator(signal);
 if(!(data instanceof Uint16Array)||data.length!==n*3)throw failure('INVALID_INPUT','A native RGB16 source is required.');
 if(!Number.isSafeInteger(blockWork)||blockWork<1||blockWork>1048576)throw failure('INVALID_INPUT','Invalid native graph checkpoint block.');
 const maximum=memoryBudgetBytes??plan.wasmMaximumBytes;
 if(!Number.isSafeInteger(maximum)||maximum<16*MiB||maximum>2**31)throw failure('MEMORY_LIMIT','A native graph heap between 16 MiB and 2 GiB is required.',{maximumBytes:maximum});
 await cooperate();let memory,m,input=0,handle=0;
 const oom=(message,cause)=>failure('MEMORY_ALLOCATION',message,{allocationKind:'wasm',maximumBytes:maximum,currentBytes:m?.HEAPU8.buffer.byteLength??0,cause:String(cause??'')});
 try{
  try{memory=new WebAssembly.Memory({initial:256,maximum:Math.floor(maximum/page)});m=await factory({wasmMemory:memory});}catch(cause){if(cause instanceof RangeError)throw oom('Native graph heap allocation failed.',cause);throw cause;}
  await cooperate();input=m._malloc(data.byteLength);if(!input)throw oom('Native graph input allocation failed.');
  const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
  for(let at=0;at<bytes.length;at+=MiB){m.HEAPU8.set(bytes.subarray(at,Math.min(bytes.length,at+MiB)),input+at);await cooperate();}
  handle=m._graph_create(width,height,input);if(!handle)throw oom('Native graph workspace allocation failed.');
  let priorPhase=-1,status=0;
  while(status!==1){
   status=m._graph_step(handle,blockWork);
   if(status<0)throw status===-1?oom('Native graph allocation failed.'):failure(status===-3?'NUMERIC_RANGE':'NUMERIC_CONVERGENCE','Native graph preparation failed.',{status});
   const phase=m.HEAPF64[m._graph_info(handle)/8];
   if(phase!==priorPhase){priorPhase=phase;onProgress?.({phase:'sherloq-prepare-native',fraction:phase/18,nativePhase:phase});}
   await cooperate();
  }
  const info=m.HEAPF64.slice(m._graph_info(handle)/8,m._graph_info(handle)/8+8),count=info[2],edges=info[3];
  const p={width,height};
  const fields=[['source',Float64Array,n],['labels',Uint32Array,n],['levels',Float64Array,count],['nativeLevels',Uint16Array,count],['counts',Float64Array,count],['area',Float64Array,count],['low',Uint32Array,edges],['high',Uint32Array,edges],['difference',Float64Array,edges],['multiplicity',Float64Array,edges]];
  for(let field=0;field<fields.length;field++){
   const [name,Type,length]=fields[field],out=allocate7c(Type,length,'Native graph output '+name),to=new Uint8Array(out.buffer),from=m._graph_array(handle,field);
   for(let at=0;at<to.length;at+=MiB){to.set(m.HEAPU8.subarray(from+at,from+Math.min(to.length,at+MiB)),at);await cooperate();}
   p[name]=out;
  }
  Object.assign(p,{median:info[4],weakScale:info[5],sourceMin:info[6],sourceMax:info[7]});
  p.ownedBytes=fields.reduce((sum,[name])=>sum+p[name].byteLength,0);p.preparationMs=performance.now()-started;
  onProgress?.({phase:'sherloq-prepare',fraction:1,components:count,edges});await cooperate();return p;
 }finally{if(handle)m._graph_destroy(handle);if(input)m._free(input);m=null;memory=null;}
}
