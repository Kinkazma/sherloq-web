import "../../runtime-context.js?v=0.25.0";
import {SELFDM_PROPOSAL_MODELS,verifySelfDMProposalModels} from './selfdm-proposal-assets.js';

const definitions=[
 ['proposal-point-owner-nms','selfdm-proposal-native-point-owner/2:owner-nms','superpoint-post','point','owner-nms'],
 ['proposal-point-rank','selfdm-proposal-native-point-owner/2:rank','superpoint-post','point','rank'],
 ['proposal-point-sampler','selfdm-proposal-native-point-owner/2:sampler','superpoint-post','point','sampler'],
 ['proposal-superglue-shape','selfdm-proposal-superglue-shapes/1','superglue','shape',null],
 ['proposal-crf-pool','selfdm-proposal-canonical-crf-support/2:pool','crf','crf','pool'],
 ['proposal-crf-relations','selfdm-proposal-canonical-crf-support/2:relations','crf','crf','relations'],
 ['proposal-crf-decode','selfdm-proposal-canonical-crf-support/2:decode','crf','crf','decode'],
];
export const SELFDM_PROPOSAL_NATIVE_TRANSFORMS=Object.freeze(definitions.map(([alias,id,model,family,stage])=>Object.freeze({alias,id,model,family,stage,sourceSha256:SELFDM_PROPOSAL_MODELS[model].sha256,sourceBytes:SELFDM_PROPOSAL_MODELS[model].bytes})));
const exact=new Map(SELFDM_PROPOSAL_NATIVE_TRANSFORMS.map(value=>[value.id,value]));
export function selfDMProposalNativeTransform(id){return exact.get(id)??null}

/** Original verified model URLs/bytes/weights and native FP32/backend options.
 * The shared native worker derives the received operator cuts in memory.
 * No private model URL, Blob, copied weights or product authorization seal. */
export function selfDMProposalWindowNativeAssets(models){
 const original=verifySelfDMProposalModels(models),assets={...original};
 for(const spec of SELFDM_PROPOSAL_NATIVE_TRANSFORMS)assets[spec.alias]={...original[spec.model],graphTransform:{id:spec.id,sourceSha256:spec.sourceSha256,maxAddedBytes:512*1024}};
 return assets;
}
