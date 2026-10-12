import {requireValue} from './errors.js';
import {fetchVerifiedAsset} from './fetch-verified-asset.js';

// Official checkpoints, strict native loading, actual Float32 ONNX subnetworks.
// This research-only local bundle is distinct from the initial SelfDM map.
export const SELFDM_PROPOSAL_MODELS = Object.freeze({
 selfdm: {file:'selfdm-map-512.onnx',bytes:62971505,sha256:'933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59'},
 deepmask: {file:'deepmask-heads.onnx',bytes:69701737,sha256:'86f9c9a82098f2e605d69aea0fb3227eb258b3b1921c7108949fb36ab74261cf'},
 superpoint: {file:'superpoint-full.onnx',bytes:5228681,sha256:'495d56929e749a463d29660551a62da0eff1f73496412773277201c17f0414e3'},
 superglue: {file:'superglue-indoor.onnx',bytes:48603642,sha256:'2964d7a675c295999c86b6ccaf90eb5297ca2b2200dbdeb813a21eabb2361b88'},
 crf: {file:'convcrf-dynamic.onnx',bytes:274800,sha256:'c90f0bcd30de0ccc1c0cae9b9b853d481452450e7b2d5a64c70c6074cdfd00d5'}
});
export const SELFDM_PROPOSAL_CV = Object.freeze({bytes:1151525,sha256:'6df92eebc58f69911146f0cf76e24bbeb11b56b48df7cf3f23aeca66dc6cd8e2'});
export const SELFDM_PROPOSAL_PREPARE = Object.freeze({bytes:9735,sha256:'7a6f800fa4ae9762ab4c50b7cefbf9b8984799b478926ddac7db62bc22832d13'});
export const SELFDM_PROPOSAL_REFERENCE = Object.freeze({
 sourceCommit:'ef7b4a00d0c5742a63b187d898979259c2aead40',initialNetworkDimensions:[512,512],outputCoordinates:'original source rectangle',
 sourceParameters:{rank:48,proposals:500,maskThreshold:.2,nmsRadius:4,keypointThreshold:0,maxKeypoints:2048,removeBorders:4,sinkhornIterations:20,matchThreshold:.4,seeds:[400,15,3,5,true,10],crfIterations:1},
 license:'SelfDM research-only; SuperGlue noncommercial/internal restrictions; public redistribution requires review',
 numerical:'Original Float32 model/CV formulas, original-grid CRF and receptive-field windows. CPU/GPU rounding is measured rather than claimed bit-exact universally:831x641 CPU differed at1 threshold-boundary pixel;512 GPU continuous maximum0.001056. Near-equal SuperPoint TopK scores can reorder. See integration qualification receipts.'
});
export function selfDMProposalRuntimes(){return {wasm:{
 factoryUrl:new URL('./selfdm-runtime-factory.mjs',import.meta.url).href,
 ortUrl:new URL('../vendor/m3-ort/ort.wasm.min.mjs',import.meta.url).href,
 wasmUrl:new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href
},webgpu:{factoryUrl:new URL('./selfdm-runtime-gpu-factory.mjs',import.meta.url).href,ortUrl:new URL('../vendor/m3-ort/ort.webgpu.min.mjs',import.meta.url).href,wasmUrl:new URL('../vendor/m3-ort/ort-wasm-simd-threaded.asyncify.wasm',import.meta.url).href}};}
export function verifySelfDMProposalModels(models){
 for(const [name,expected] of Object.entries(SELFDM_PROPOSAL_MODELS)){
  const actual=models?.[name];
  requireValue(actual?.bytes===expected.bytes&&actual.sha256===expected.sha256&&typeof actual.url==='string'&&/^https?:$/.test(new URL(actual.url).protocol),'Pinned SelfDM Proposal model required: '+name);
 }
 return Object.fromEntries(Object.entries(SELFDM_PROPOSAL_MODELS).map(([name,spec])=>[name,{...spec,...models[name],graphOptimizationLevel:'disabled',wasmMaximumBytes:2*1024**3,...(['selfdm','deepmask','superglue'].includes(name)?{gpuWasmWorkspaceBytes:128*1024**2}:{} )}]));
}
export async function loadSelfDMProposalBundle(identity,{budget,signal}={}){
 const release=budget?.reserve(identity.bytes*2);
 try{
  const bytes=await fetchVerifiedAsset(identity,{signal}),manifest=JSON.parse(new TextDecoder().decode(bytes));
  requireValue(manifest?.family==='selfdm-proposal'&&manifest.schema===1,'SelfDM Proposal bundle schema');
  const base=new URL('.',identity.url),models=Object.fromEntries(Object.entries(manifest.models??{}).map(([name,spec])=>[name,{...spec,url:new URL(spec.file,base).href}]));
  verifySelfDMProposalModels(models);
  requireValue(manifest.cv?.bytes===SELFDM_PROPOSAL_CV.bytes&&manifest.cv.sha256===SELFDM_PROPOSAL_CV.sha256,'SelfDM Proposal CV identity');
  requireValue(manifest.prepare?.bytes===SELFDM_PROPOSAL_PREPARE.bytes&&manifest.prepare.sha256===SELFDM_PROPOSAL_PREPARE.sha256,'SelfDM Proposal pyramid identity');
  return {manifest,models,cv:{...manifest.cv,url:new URL(manifest.cv.file,base).href}};
 }finally{release?.();}
}
