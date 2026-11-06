import {AI_GPU_BROWSER_FAMILIES,aiDetectorBrowserFamily,aiDetectorGpuMethods as eligibleGpuMethods} from './ai-detectors-gpu-policy.js';
import {aiDetectorQualification} from './ai-detectors-qualification.js';
export const AI_DETECTOR_METHODS=Object.freeze(['dda','prl','community-forensics','gapl']);
export function aiDetectorGpuMethods(value=[]){
 if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(method=>!AI_DETECTOR_METHODS.includes(method)))throw Object.assign(new Error('Invalid qualified AI detector GPU method list.'),{code:'MODEL_CONTRACT'});
 return [...value];
}
export function aiDetectorGpuBrowserFamilies(value=[]){
 if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(family=>!AI_GPU_BROWSER_FAMILIES.includes(family)))throw Object.assign(new Error('Invalid qualified AI detector GPU browser family list.'),{code:'MODEL_CONTRACT'});
 return [...value];
}
export function aiDetectorCapability({configured=false,gpuQualifiedMethods=[],gpuQualifiedBrowserFamilies=[],qualificationEvidence,gpuApiAvailable=Boolean(globalThis.navigator?.gpu),userAgent=globalThis.navigator?.userAgent??''}={}){
 const methods=aiDetectorGpuMethods(gpuQualifiedMethods);
 const families=aiDetectorGpuBrowserFamilies(gpuQualifiedBrowserFamilies),eligible=eligibleGpuMethods({gpuQualifiedMethods:methods,gpuQualifiedBrowserFamilies:families},{gpuAvailable:gpuApiAvailable,userAgent});
 return{id:'ai.generation.detect',...aiDetectorQualification(qualificationEvidence),configured,gpuApiAvailable,browserFamily:aiDetectorBrowserFamily(userAgent),backends:['cpu','auto',...(eligible.length?['webgpu']:[])],methods:[...AI_DETECTOR_METHODS],gpuQualifiedMethods:methods,gpuQualifiedBrowserFamilies:families,methodBackends:Object.fromEntries(AI_DETECTOR_METHODS.map(method=>[method,['cpu','auto',...(eligible.includes(method)?['webgpu']:[])]])),regions:['full-frame'],scoreCalibrated:false};
}
export function aiDetectorGpuAvailable(method,{configuration,capability,gpuApiAvailable=Boolean(globalThis.navigator?.gpu),userAgent=globalThis.navigator?.userAgent??''}={}){
 if(!gpuApiAvailable||!AI_DETECTOR_METHODS.includes(method))return false;
 const value=configuration??capability??{};
 const gpuQualifiedMethods=aiDetectorGpuMethods(value.gpuQualifiedMethods??[]),gpuQualifiedBrowserFamilies=aiDetectorGpuBrowserFamilies(value.gpuQualifiedBrowserFamilies??[]);
 return eligibleGpuMethods({gpuQualifiedMethods,gpuQualifiedBrowserFamilies},{gpuAvailable:gpuApiAvailable,userAgent}).includes(method);
}
