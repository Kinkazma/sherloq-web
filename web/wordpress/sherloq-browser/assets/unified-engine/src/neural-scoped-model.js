import "../../runtime-context.js?v=0.25.0";
import {requireValue} from './errors.js';
import {selfDMProposalNativeTransform} from './selfdm-proposal-native-assets.js';

const SELFDM_SHA='933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59';
const CRF_SHA='e614ae178a99af889a0fbfc58be1e281281c41934e5b16d00ad475d3952482ff';
const WINDOW_POLICY='selfdm-native-window-context-bank/2',WINDOW_STAGES=['encoder','attention','relations','global','decoder'];
const qualifiedPolicies={'selfdm-native-scope-v2':SELFDM_SHA,'selfdm-proposal-crf-scope-v1':CRF_SHA};
for(const stage of WINDOW_STAGES)qualifiedPolicies[WINDOW_POLICY+':'+stage]=SELFDM_SHA;
export function neuralModelSessionIdentity(asset){
 return JSON.stringify([asset.sha256,asset.graphTransform?.id??null,asset.graphTransform?.sourceSha256??null,...(asset.alikedNativeRuntimePolicy===undefined?[]:[asset.alikedNativeRuntimePolicy,asset.preferredOutputLocation??null])]);
}
export function neuralGraphTransformAllowance(asset){
 const transform=asset.graphTransform;if(transform===undefined)return 0;
 const expected=qualifiedPolicies[transform?.id]??selfDMProposalNativeTransform(transform?.id)?.sourceSha256;
 requireValue(expected&&transform.sourceSha256===expected&&asset.sha256===expected,'Qualified neural scope graph identity required');
 requireValue(Number.isSafeInteger(transform.maxAddedBytes)&&transform.maxAddedBytes>0&&transform.maxAddedBytes<=512*1024,'Bounded neural scope graph allowance required');
 return transform.maxAddedBytes;
}
export async function adaptNeuralScopedModel(bytes,asset){
 const allowance=neuralGraphTransformAllowance(asset);if(!allowance)return {bytes,receipt:null};
 requireValue(bytes instanceof Uint8Array&&bytes.length===asset.bytes,'Verified original model bytes required before scope adaptation');
 let transform,policy;
 if(selfDMProposalNativeTransform(asset.graphTransform.id)){
  const module=await import('./selfdm-proposal-native-transforms.js');transform=source=>module.adaptSelfDMProposalWindowGraph(source,asset.graphTransform.id,{admittedBytes:asset.bytes+allowance});policy=asset.graphTransform.id;
 }else if(asset.graphTransform.id==='selfdm-native-scope-v2'){
  const module=await import('./selfdm-scoped-graph.js');transform=module.adaptSelfDMScopedGraph;policy=module.SELFDM_SCOPE_POLICY;
 }else if(asset.graphTransform.id.startsWith(WINDOW_POLICY+':')){
  const stage=asset.graphTransform.id.slice(WINDOW_POLICY.length+1);requireValue(WINDOW_STAGES.includes(stage),'Qualified native SelfDM window stage required');
  const module=await import('./selfdm-window-context-graph.js');transform=source=>module.adaptSelfDMWindowContextGraph(source,stage,{admittedBytes:asset.bytes+allowance});policy=module.SELFDM_WINDOW_GRAPH_POLICY+':'+stage;
 }else{
  const module=await import('./selfdm-proposal-crf-scoped-graph.js');transform=module.adaptSelfDMProposalCRFScopedGraph;policy=module.SELFDM_PROPOSAL_CRF_SCOPE_POLICY;
 }
 requireValue(policy===asset.graphTransform.id&&typeof transform==='function','Loaded graph adapter policy differs from the requested session');
 const transformed=await transform(bytes),adapted=transformed instanceof Uint8Array?transformed:transformed?.bytes;
 requireValue(adapted instanceof Uint8Array&&adapted.length<=bytes.length+allowance,'Scoped graph exceeds admitted model bytes');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',adapted)),v=>v.toString(16).padStart(2,'0')).join('');
 return {bytes:adapted,receipt:{schema:'sherloq.scoped-neural-graph/1',policy:asset.graphTransform.id,sourceSha256:asset.sha256,derivedSha256:digest,sourceBytes:bytes.length,derivedBytes:adapted.length,learnedWeights:'Original initializer payloads retained byte for byte',...(transformed?.metadata?{transformation:transformed.metadata}:{})}};
}
