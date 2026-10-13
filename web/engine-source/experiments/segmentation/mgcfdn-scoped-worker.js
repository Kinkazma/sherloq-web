import {requireValue} from '../../src/errors.js';
import {scopeMgcfdnOnnx,MGCF_SCOPE_TRANSFORM} from '../../src/mgcfdn-scoped-graph.js';

function validateScope(data){
 if(!data.mgcfScope)return;
 const {indices,count,side,metadata}=data.mgcfScope;
 requireValue(indices instanceof BigInt64Array&&indices.length===count&&[16,40].includes(side)&&count>0&&count<side*side&&indices.every((v,i)=>v>=0n&&v<BigInt(side*side)&&(!i||v>indices[i-1])),'Ordered native scientific positions required');
 requireValue(metadata?.graphTransform===MGCF_SCOPE_TRANSFORM&&metadata.admittedSources===count&&metadata.admittedTargets===count&&metadata.grid[0]===side&&metadata.grid[1]===side&&/^[a-f0-9]{64}$/.test(metadata.gridSha256),'Scientific position receipt differs from the native grid');
}
export function mgcfdnWorkerSessionKey(data){validateScope(data);return JSON.stringify([data.model.sha256,data.mgcfScope?MGCF_SCOPE_TRANSFORM:null,data.mgcfScope?.side??null]);}
export async function adaptMgcfdnWorkerModel(bytes,data){
 if(!data.mgcfScope)return {bytes,receipt:null};
 validateScope(data);const {side}=data.mgcfScope;
 const transformed=scopeMgcfdnOnnx(bytes,{side});
 const derivedSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',transformed.bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 return {bytes:transformed.bytes,inputName:transformed.inputName,receipt:{schema:'sherloq.scoped-neural-graph/1',policy:MGCF_SCOPE_TRANSFORM,sourceSha256:data.model.sha256,derivedSha256,sourceBytes:bytes.byteLength,derivedBytes:transformed.bytes.byteLength,transformation:transformed.metadata}};
}
export function mgcfdnWorkerScopeTensor(ort,data){validateScope(data);return data.mgcfScope?new ort.Tensor('int64',data.mgcfScope.indices,[data.mgcfScope.count]):null;}
export function mgcfdnWorkerFeeds(feeds,tensor,inputName){return tensor?{...feeds,[inputName]:tensor}:feeds;}
