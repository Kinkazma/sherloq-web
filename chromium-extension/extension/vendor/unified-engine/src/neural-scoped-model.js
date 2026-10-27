import {requireValue} from './errors.js';

const SELFDM_SHA='933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59';
const CRF_SHA='e614ae178a99af889a0fbfc58be1e281281c41934e5b16d00ad475d3952482ff';
const qualifiedPolicies={'selfdm-native-scope-v2':SELFDM_SHA,'selfdm-proposal-crf-scope-v1':CRF_SHA};
export function neuralModelSessionIdentity(asset){
 return JSON.stringify([asset.sha256,asset.graphTransform?.id??null,asset.graphTransform?.sourceSha256??null]);
}
export function neuralGraphTransformAllowance(asset){
 const transform=asset.graphTransform;if(transform===undefined)return 0;
 const expected=qualifiedPolicies[transform?.id];
 requireValue(expected&&transform.sourceSha256===expected&&asset.sha256===expected,'Qualified neural scope graph identity required');
 requireValue(Number.isSafeInteger(transform.maxAddedBytes)&&transform.maxAddedBytes>0&&transform.maxAddedBytes<=512*1024,'Bounded neural scope graph allowance required');
 return transform.maxAddedBytes;
}
export async function adaptNeuralScopedModel(bytes,asset){
 const allowance=neuralGraphTransformAllowance(asset);if(!allowance)return {bytes,receipt:null};
 requireValue(bytes instanceof Uint8Array&&bytes.length===asset.bytes,'Verified original model bytes required before scope adaptation');
 let transform,policy;
 if(asset.graphTransform.id==='selfdm-native-scope-v2'){
  const module=await import('./selfdm-scoped-graph.js');transform=module.adaptSelfDMScopedGraph;policy=module.SELFDM_SCOPE_POLICY;
 }else{
  const module=await import('./selfdm-proposal-crf-scoped-graph.js');transform=module.adaptSelfDMProposalCRFScopedGraph;policy=module.SELFDM_PROPOSAL_CRF_SCOPE_POLICY;
 }
 requireValue(policy===asset.graphTransform.id&&typeof transform==='function','Loaded graph adapter policy differs from the requested session');
 const transformed=transform(bytes),adapted=transformed instanceof Uint8Array?transformed:transformed?.bytes;
 requireValue(adapted instanceof Uint8Array&&adapted.length<=bytes.length+allowance,'Scoped graph exceeds admitted model bytes');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',adapted)),v=>v.toString(16).padStart(2,'0')).join('');
 return {bytes:adapted,receipt:{schema:'sherloq.scoped-neural-graph/1',policy:asset.graphTransform.id,sourceSha256:asset.sha256,derivedSha256:digest,sourceBytes:bytes.length,derivedBytes:adapted.length,learnedWeights:'Original initializer payloads retained byte for byte',...(transformed?.metadata?{transformation:transformed.metadata}:{})}};
}
