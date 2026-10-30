import {d2prlInputSide} from './input-side.js';
import {D2PRL_SPATIAL_ROLES} from './spatial-role-models.js';
import {requireValue} from '../../src/errors.js';
export function d2prlRoleAsset(model,modelUrl,inputSide=448){
 const side=d2prlInputSide(inputSide);if(side===448)return{model,modelUrl};
 const record=D2PRL_SPATIAL_ROLES[side];requireValue(record?.inputSide===side&&record.sourceSha256===model.modelSha256,'Pinned derived spatial role model required');
 return{model:{...model,modelBytes:record.bytes,modelSha256:record.sha256,spatial:record},modelUrl:new URL(record.file,modelUrl).href};
}
export function d2prlRoleSource(inputSide=448){const side=d2prlInputSide(inputSide);return side===448?{bytes:19943135,sha256:'33b7b17588e96a2bcda1e1d8de203770bd782d0edc1c0ad890ee9fe425f1365b',nodes:454,initializers:146}:D2PRL_SPATIAL_ROLES[side];}
