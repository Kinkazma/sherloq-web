import "../../runtime-context.js?v=0.30.0";
import {nativeWeightsGpuPage,nativeWeightsShaderSuffix,retireNativeWeightPointers,rememberNativeWeightsCleanup} from './native-weights-gpu-page.js';
import {CSR_NATIVE_SOFTMAX_WASM} from './sparse-glue-csr-native-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {allocateWasmMemory} from './allocation.js';
import {PagedGlueAttention} from './sparse-glue-paged-attention.js';
import {gpuTransaction,retireGpuTransaction} from './gpu-ack-retirement.js';
import {nativeGpuSync,nativeGpuAsync} from './gpu-native-boundary.js';
import {checkAbort} from './errors.js';
// Preserve the Native CSR candidate graph and reduction order. GPU dot/context
// pages use Native CPU weights; assignment and finish retain their CPU body.
export class AcknowledgedPagedGlueAttention extends PagedGlueAttention{
 constructor({signal}={}){super();this.signal=signal;this.ownership={budget:{},pending:new Set(),deviceDestroyed:false};this.transaction=gpuTransaction(this.ownership);this.closed=false;this.weightsPointers=new Set();this.weightsCleanupErrors=[];}
 async open(provider){await super.open(provider);checkAbort(this.signal);if(provider==='webgpu'){
   const factory=(await import('../vendor/sparse-glue-csr-native/attention-csr-native.js')).default;
   this.weightsCpu=await factory({wasmBinary:await fetchM3Asset(new URL('../vendor/sparse-glue-csr-native/attention-csr-native.wasm',import.meta.url),CSR_NATIVE_SOFTMAX_WASM),wasmMemory:allocateWasmMemory({initial:256,maximum:1024})});
   for(const entryPoint of ['dotOrdered','accumulateWeights'])this.pipelines[entryPoint]=await this.device.createComputePipelineAsync({layout:'auto',compute:{module:this.orderedShaderModule,entryPoint}});
   this.metrics.nativeCpuWeights=true;this.metrics.orderedGpuProducts=true;
  }checkAbort(this.signal);return this;}
 adoptDevice(raw){
  this.rawDevice=raw;this.transaction.device=raw;const self=this;
  return new Proxy(raw,{get(device,name){
   if(name==='createShaderModule')return options=>{const module=nativeGpuSync(()=>device.createShaderModule({...options,code:options.code+nativeWeightsShaderSuffix}),{signal:self.signal});self.orderedShaderModule=module;return module;};
   if(name==='createBuffer')return options=>{const buffer=nativeGpuSync(()=>device.createBuffer(options),{signal:self.signal});self.transaction.buffers.set(buffer,{bytes:options.size,destroyed:false,release:()=>0});return buffer;};
   if(name==='pushErrorScope')return filter=>{nativeGpuSync(()=>device.pushErrorScope(filter),{signal:self.signal});self.transaction.scopes++;};
   if(name==='popErrorScope')return async()=>{const value=await nativeGpuAsync(()=>device.popErrorScope());self.transaction.scopes--;return value;};
   const value=Reflect.get(device,name,device);return typeof value==='function'?value.bind(device):value;
  }});
 }
 async gpuPage(...args){checkAbort(this.signal);const result=await nativeWeightsGpuPage(this,...args);checkAbort(this.signal);return result;}
 async attention(...args){checkAbort(this.signal);const result=await super.attention(...args);checkAbort(this.signal);return result;}
 async assignment(...args){checkAbort(this.signal);const result=await super.assignment(...args);checkAbort(this.signal);return result;}
 dispose(){if(this.closed)return this.closing??Promise.resolve();if(this.closing)return this.closing;const task=(async()=>{
  let failed=false,primary;const attempt=async work=>{try{await work();}catch(error){rememberNativeWeightsCleanup(this,error);if(!failed){failed=true;primary=error;}}};
  await attempt(()=>{if(this.rawDevice&&!this.ownership.deviceDestroyed){nativeGpuSync(()=>this.rawDevice.destroy());this.ownership.deviceDestroyed=true;}});
  await attempt(()=>retireGpuTransaction(this.ownership,this.transaction));
  await attempt(()=>retireNativeWeightPointers(this));
  if(this.ownership.pending.size||this.weightsPointers.size)await attempt(()=>{throw Error('CSR attention still owns GPU or Native weight resources');});
  if(failed)throw primary;
  this.device=null;this.rawDevice=null;this.cpu=null;this.weightsCpu=null;this.orderedShaderModule=null;this.closed=true;
 })();this.closing=task;void task.catch(()=>{if(this.closing===task)this.closing=null;});return task;}
}
