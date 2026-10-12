import {requireValue} from '../../src/errors.js';
const MiB=1024**2;
export const D2PRL_ROLE_MODEL=Object.freeze({bytes:19943135,sha256:'33b7b17588e96a2bcda1e1d8de203770bd782d0edc1c0ad890ee9fe425f1365b',inputs:Object.freeze(['rgb','x_cor','y_cor','x_cor2','y_cor2','union']),outputs:Object.freeze(['target','source'])});
export const D2PRL_ROLE_RUNTIME_256=Object.freeze({runtimeId:'ort130-wasm-256mib-d2prl',memoryMaximumBytes:256*MiB});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateRoleRuntime(runtime,model){
 const old=runtime?.runtimeId==='ort130-wasm-512mib'&&runtime.memoryMaximumBytes===512*MiB;
 const narrow=runtime?.runtimeId===D2PRL_ROLE_RUNTIME_256.runtimeId&&runtime.memoryMaximumBytes===D2PRL_ROLE_RUNTIME_256.memoryMaximumBytes;
 requireValue(old||narrow,'Pinned bounded ORT runtime');
 if(narrow)requireValue(model?.modelBytes===D2PRL_ROLE_MODEL.bytes&&model.modelSha256===D2PRL_ROLE_MODEL.sha256&&same(model.inputs,D2PRL_ROLE_MODEL.inputs)&&same(model.outputs,D2PRL_ROLE_MODEL.outputs),'D2PRL256 role model identity or fixed input/output contract differs');
 return Object.freeze({runtimeId:runtime.runtimeId,memoryMaximumBytes:runtime.memoryMaximumBytes});
}
export function validateRoleFactory(runtime,factory){
 requireValue(typeof factory?.heapBytes==='function','Role factory must report its actual heap');
 if(runtime.runtimeId===D2PRL_ROLE_RUNTIME_256.runtimeId)requireValue(factory.runtimeId===runtime.runtimeId&&factory.memoryMaximumBytes===runtime.memoryMaximumBytes&&same(factory.modelIdentity,D2PRL_ROLE_MODEL),'D2PRL256 role factory metadata differs');
}
export function validateRoleHeap(runtime,bytes){requireValue(Number.isSafeInteger(bytes)&&bytes>0&&bytes<=runtime.memoryMaximumBytes,'Role runtime heap exceeds its admitted cap');return bytes;}
export function validateRoleInputs(runtime,inputs){
 if(runtime.runtimeId!==D2PRL_ROLE_RUNTIME_256.runtimeId)return;
 requireValue(same(Object.keys(inputs??{}),D2PRL_ROLE_MODEL.inputs)&&Object.entries(inputs).every(([name,view])=>view instanceof Float32Array&&view.length===(name==='rgb'?3:1)*448**2),'D2PRL256 requires all six fixed448 role inputs');
}
