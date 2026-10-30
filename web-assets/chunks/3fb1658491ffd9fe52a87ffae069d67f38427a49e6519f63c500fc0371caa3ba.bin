import "../../runtime-context.js?v=0.30.0";
import {ALIKED_MODELS} from './aliked-assets.js';
import {requireValue} from './errors.js';
import {neuralOutputTransfer} from './neural-output-transfer.js';
export const ALIKED_NATIVE_RUNTIME_POLICY='aliked-native14-fp32-runtime/1';
export const ALIKED_NATIVE_RUNTIME_HEAP_BYTES=2*1024**3;
const nativeGraph=asset=>Object.values(ALIKED_MODELS).flatMap(m=>Object.entries(m.graphs)).find(([,g])=>g.sha256===asset.sha256&&g.bytes===asset.bytes);
// A fixed native ALIKED recipe, never a generic session-options escape hatch.
export function alikedNativeSessionOptions(asset,provider){
 if(asset.alikedNativeRuntimePolicy===undefined)return null;
 requireValue(asset.alikedNativeRuntimePolicy===ALIKED_NATIVE_RUNTIME_POLICY&&provider==='webgpu','Pinned native ALIKED WebGPU runtime policy required.');
 const found=nativeGraph(asset);requireValue(found,'Native ALIKED runtime policy received another model.');
 const dense=found[0]==='dense',preferred=dense?{features:'gpu-buffer',scores:'cpu'}:undefined;
 requireValue(JSON.stringify(asset.preferredOutputLocation)===JSON.stringify(preferred),'Native ALIKED output placement differs.');
 return{executionProviders:['webgpu'],graphOptimizationLevel:'all',...(dense?{preferredOutputLocation:preferred}:{})};
}
export function alikedNativeHeapBytes(asset,provider,owner){
 const options=alikedNativeSessionOptions(asset,provider);if(!options)return 0;
 requireValue(owner==='aliked-strict-native','Native ALIKED heap belongs to its admitted pool.');return ALIKED_NATIVE_RUNTIME_HEAP_BYTES;
}
export async function alikedNativeOutputTransfer(outputs,feeds,outputBytes,options){
 if(!options?.preferredOutputLocation)return neuralOutputTransfer(outputs,feeds,outputBytes);
 const feature=outputs.features,score=outputs.scores;
 requireValue(Object.keys(outputs).length===2&&feature?.location==='gpu-buffer'&&feature.type==='float32'&&typeof feature.getData==='function'&&score?.location==='cpu'&&score.type==='float32','Native ALIKED dense output owners differ.');
 requireValue(feature.dims.length===4&&feature.dims[0]===1&&feature.dims[1]===128&&feature.dims.every(n=>Number.isSafeInteger(n)&&n>0)&&JSON.stringify(score.dims)===JSON.stringify([1,1,feature.dims[2],feature.dims[3]]),'Native ALIKED dense output shape differs.');
 const data=await feature.getData();requireValue(data instanceof Float32Array&&data.length===feature.dims.reduce((a,b)=>a*b,1),'Native ALIKED GPU readback differs.');
 // The true GPU Tensor stays owned by the Worker until its existing finally.
 // cpu-pinned forces the established transfer to copy the download, so posting
 // cannot detach storage still retained by the real ORT Tensor.
 return neuralOutputTransfer({features:{data,dims:feature.dims,type:feature.type,location:'cpu-pinned'},scores:score},feeds,outputBytes);
}
