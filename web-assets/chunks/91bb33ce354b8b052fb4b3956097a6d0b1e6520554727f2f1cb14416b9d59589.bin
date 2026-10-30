import createReference from '../ela-describe/describe.js';
export const ELA_DESCRIBE_FAST_ENABLED=false;
export default async function create(options={}){
 if(options.wasmBinary||options.nativeReference||!ELA_DESCRIBE_FAST_ENABLED&&!options.nativeCandidate)return createReference(options);
 try{
  const {default:instantiate}=await import('./describe-simd.js'),module=await instantiate(options),differences=module._sparse_fma_qualify();
  module.elaNativeKernel={fmaDifferences:differences,fused:module._sparse_fma_enabled()===1,gaussian:'Native coefficient/tap order; four independent pixels only when FMA qualifies'};return module;
 }catch(error){if(!(error instanceof WebAssembly.CompileError))throw error;return createReference(options);}
}
