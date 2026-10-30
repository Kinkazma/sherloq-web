import {ElaJpegArchiveGpu} from './ela-jpeg-archive-gpu.js';
import {ElaJpegCoefficientEncoder} from './ela-jpeg-coeff-encoder.js';
import {allocateTypedArray} from './allocation.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
// Optional ELA-only path. It emits real native encoded bytes before delivering
// borrowed exact RGB bands. Other JPEG consumers retain the native default.
export class ElaJpegArchiveBridge{
 constructor(budget,{createGpu=b=>new ElaJpegArchiveGpu(b),createEncoder=b=>new ElaJpegCoefficientEncoder(b)}={}){this.budget=budget;this.createGpu=createGpu;this.createEncoder=createEncoder;this.gpu=null;this.sources=new Set();this.leases=new Set();this.outputs=new Set();this.encoders=new Set();this.closed=false;this.busy=false;this.fallbackFailures=new WeakSet();this.unregister=budget.registerAsyncReclaimer?.(async()=>{if(this.busy)return 0;const before=budget.total();await this.retireChildren();return Math.max(0,before-budget.total());},{allocationKind:'array-buffer',owner:'ela',label:'retiring-ELA-JPEG-hosts'});}
 mark(error){if(error&&typeof error==='object')this.fallbackFailures.add(error);return error;}
 mayFallback(error){return !!error&&typeof error==='object'&&this.fallbackFailures.has(error);}
 async release(set,owner,method='release'){if(!owner)return;await owner[method]();set.delete(owner);}
 async source(surface,signal){
  const{width,height}=surface.descriptor,bytes=width*height*3,free=this.budget.reserve(bytes);let data;try{data=allocateTypedArray(Uint8Array,bytes,{label:'ELA-complete-native-JPEG-context'});}catch(error){free();throw this.mark(error);}const backings=[],owned=ownGpuArrays({rgb:data},free,backings,this.budget,{},this.sources);this.sources.add(owned);const acquired=new Set(),cooperate=createCooperator(signal);
  try{backings.push({bytes,release:this.budget.registerBacking?.('array-buffer',bytes,{owner:'ela',label:'ELA-complete-native-JPEG-context',identity:data.buffer})});
   const rows=Math.max(1,Math.min(32,Math.floor(65536/width)));
   for(let y=0;y<height;y+=rows){checkAbort(signal);const count=Math.min(rows,height-y),part=await surface.readWindow({x:0,y,width,height:count},{signal});this.leases.add(part);acquired.add(part);try{owned.rgb.set(part.pixels.data,y*width*3);}finally{await this.release(this.leases,part);acquired.delete(part);}await cooperate();}
   return owned;
  }catch(primary){await retireCompositeOwners([...[...acquired].map(part=>()=>this.release(this.leases,part)),()=>this.release(this.sources,owned)],{primary});throw primary;}
 }
 async retireChildren(){await retireCompositeOwners([...[...this.encoders].map(v=>()=>this.release(this.encoders,v,'dispose')),...[...this.outputs].map(v=>()=>this.release(this.outputs,v)),...[...this.sources].map(v=>()=>this.release(this.sources,v)),...[...this.leases].map(v=>()=>this.release(this.leases,v))]);}

 async visit(surface,quality,{signal,onProgress,writeEncoded,onEncoded,onBand,params,table}={}){
  const{width,height}=surface.descriptor,blocks=Math.ceil(width/8)*Math.ceil(height/8)+2*Math.ceil(width/16)*Math.ceil(height/16);
  requireValue([width,height,quality].every(Number.isInteger)&&width>0&&height>0&&width<=65500&&height<=65500&&quality>=1&&quality<=100&&typeof writeEncoded==='function'&&typeof onEncoded==='function'&&typeof onBand==='function','Native ELA JPEG archive context and consumers required.');checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','ELA JPEG archive bridge closed.');if(this.busy)throw new EngineError('BUSY','ELA JPEG archive bridge already running.');this.busy=true;this.fallbackFailures=new WeakSet();let original,output,encoder,failed=false,primary,phase='source',sourceGatherMs=0,encodedCommitMs=0,bandRenderMs=0;const started=performance.now();
  try{
   await this.retireChildren();if(blocks*128>24*1024**2)throw this.mark(new EngineError('GPU_LIMIT','Complete native JPEG coefficient context exceeds its bounded entropy heap.'));
   original=await this.source(surface,signal);sourceGatherMs=performance.now()-started;phase='gpu';this.gpu??=this.createGpu(this.budget);output=await this.gpu.run(original.rgb,width,height,quality,{signal,params,table});this.outputs.add(output);phase='entropy';encoder=this.createEncoder(this.budget);this.encoders.add(encoder);const entropy=await encoder.encode(output.coefficients,width,height,quality,{signal,writeEncoded,onProgress});await this.release(this.encoders,encoder,'dispose');encoder=null;checkAbort(signal);phase='commit';const commitAt=performance.now();await onEncoded(entropy);encodedCommitMs=performance.now()-commitAt;checkAbort(signal);phase='render';const renderAt=performance.now(),cooperate=createCooperator(signal);
   for(let y=0;y<height;y+=32){await cooperate();const rows=Math.min(32,height-y),begin=y*width*3,end=(y+rows)*width*3;await onBand(original.rgb.subarray(begin,end),output.rgb.subarray(begin,end),{y,rows,...(output.runtime?.fusedElaRender?{rendered:output.rendered.subarray(begin,end)}:{})});onProgress?.({phase:'jpeg-render',fraction:(y+rows)/height});}
   bandRenderMs=performance.now()-renderAt;return{workers:1,kernel:'native-ISLOW420-GPU-and-native-coefficient-entropy',backend:'webgpu',sampling:'420',recompressions:1,sourcePasses:1,rowsPerChunk:32,maxSourceWindowBytes:Math.max(1,Math.min(32,Math.floor(65536/width)))*width*3,codecHeapCapacityBytes:entropy.heapCapacityBytes,codecHeapMaximumBytes:entropy.heapMaximumBytes,gpu:output.runtime,nativeEntropyMs:entropy.totalMs,stages:{sourceGatherMs,gpuMs:output.runtime.totalMs,nativeEntropyMs:entropy.totalMs,encodedCommitMs,bandRenderMs},totalMs:performance.now()-started};
  }catch(error){failed=true;primary=error;if((phase==='gpu'&&this.gpu?.mayFallback?.(error))||(phase==='entropy'&&encoder?.mayFallback?.(error)))this.mark(error);throw error;}
  finally{try{await retireCompositeOwners([()=>this.release(this.encoders,encoder,'dispose'),()=>this.release(this.outputs,output),()=>this.release(this.sources,original)],failed?{primary}:{});}finally{this.busy=false;}}
 }
 async dispose(){if(this.busy)throw new EngineError('BUSY','ELA JPEG archive bridge must drain before disposal.');this.closed=true;await retireCompositeOwners([()=>this.retireChildren(),async()=>{if(this.gpu){await this.gpu.dispose();this.gpu=null;}}]);this.unregister?.();this.unregister=null;}
}
