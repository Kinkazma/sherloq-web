import {d2prlInputSide} from './input-side.js';
import {requireValue} from '../../src/errors.js';
const MiB=1024**2;
export const D2PRL_ROLE_MODEL=Object.freeze({bytes:19943135,sha256:'33b7b17588e96a2bcda1e1d8de203770bd782d0edc1c0ad890ee9fe425f1365b',inputs:Object.freeze(['rgb','x_cor','y_cor','x_cor2','y_cor2','union']),outputs:Object.freeze(['target','source'])});
export const D2PRL_ROLE_RUNTIME_256=Object.freeze({runtimeId:'ort130-wasm-256mib-d2prl',memoryMaximumBytes:256*MiB});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateRoleRuntime(runtime,model){
 const old=runtime?.runtimeId==='ort130-wasm-512mib'&&runtime.memoryMaximumBytes===512*MiB;
 const narrow=runtime?.runtimeId===D2PRL_ROLE_RUNTIME_256.runtimeId&&runtime.memoryMaximumBytes===D2PRL_ROLE_RUNTIME_256.memoryMaximumBytes;
 const spatial=runtime?.runtimeId==='ort130-wasm-2048mib-d2prl-spatial'&&runtime.memoryMaximumBytes===2*1024**3||runtime?.runtimeId==='ort130-wasm-1024mib-d2prl-spatial'&&runtime.memoryMaximumBytes===1024**3;
 requireValue(old||narrow||spatial,'Pinned bounded ORT runtime');
 if(narrow)requireValue(model?.modelBytes===D2PRL_ROLE_MODEL.bytes&&model.modelSha256===D2PRL_ROLE_MODEL.sha256&&same(model.inputs,D2PRL_ROLE_MODEL.inputs)&&same(model.outputs,D2PRL_ROLE_MODEL.outputs),'D2PRL256 role model identity or fixed input/output contract differs');
 return Object.freeze({runtimeId:runtime.runtimeId,memoryMaximumBytes:runtime.memoryMaximumBytes});
}
export function validateRoleFactory(runtime,factory){
 requireValue(typeof factory?.heapBytes==='function','Role factory must report its actual heap');
 if(['ort130-wasm-2048mib-d2prl-spatial','ort130-wasm-1024mib-d2prl-spatial'].includes(runtime.runtimeId))requireValue(factory.runtimeId===runtime.runtimeId&&factory.memoryMaximumBytes===runtime.memoryMaximumBytes,'D2PRL spatial role factory metadata differs');
 if(runtime.runtimeId===D2PRL_ROLE_RUNTIME_256.runtimeId)requireValue(factory.runtimeId===runtime.runtimeId&&factory.memoryMaximumBytes===runtime.memoryMaximumBytes&&same(factory.modelIdentity,D2PRL_ROLE_MODEL),'D2PRL256 role factory metadata differs');
}
export function validateRoleHeap(runtime,bytes){requireValue(Number.isSafeInteger(bytes)&&bytes>0&&bytes<=runtime.memoryMaximumBytes,'Role runtime heap exceeds its admitted cap');return bytes;}
export function validateRoleInputs(runtime,inputs,inputSide=448){
 const side=d2prlInputSide(inputSide);
 if(runtime.runtimeId!==D2PRL_ROLE_RUNTIME_256.runtimeId&&!['ort130-wasm-2048mib-d2prl-spatial','ort130-wasm-1024mib-d2prl-spatial'].includes(runtime.runtimeId))return;
 requireValue(same(Object.keys(inputs??{}),D2PRL_ROLE_MODEL.inputs)&&Object.entries(inputs).every(([name,view])=>view instanceof Float32Array&&view.length===(name==='rgb'?3:1)*side**2),'D2PRL requires all six role inputs at the declared input side');
}

/** Passive per-run role ceiling selection; no module or worker is created. */
export function selectStrictRoleRuntime(runtime,inputSide,budgetBytes){
 const side=d2prlInputSide(inputSide);
 requireValue(Number.isSafeInteger(budgetBytes)&&budgetBytes>0,'Actual D2PRL budget required for role profile');
 if(side!==1344||budgetBytes>2*1024**3)return runtime;
 const selected=runtime?.roles1344LowMemory;
 requireValue(selected?.rolesRuntime?.runtimeId==='ort130-wasm-1024mib-d2prl-spatial'&&selected.rolesRuntime.memoryMaximumBytes===1024**3&&typeof selected.rolesFactoryUrl==='string'&&selected.rolesFactoryUrl.length>0,'Qualified1344 bounded role profile required');
 return {...runtime,rolesRuntime:selected.rolesRuntime,rolesFactoryUrl:selected.rolesFactoryUrl};
}
