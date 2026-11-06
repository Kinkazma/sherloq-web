import {aiDetectorGpuMethods,aiDetectorGpuBrowserFamilies} from './unified-engine/src/ai-detectors-backends.js';
import {aiDetectorQualification} from './unified-engine/src/ai-detectors-qualification.js';
const flights=new Map();
async function json(url,{signal}={}){
 const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok)throw Object.assign(new Error('AI detector configuration is not installed.'),{code:'MODEL_UNAVAILABLE'});
 const bytes=await response.arrayBuffer();if(bytes.byteLength>256*1024)throw Object.assign(new Error('AI detector configuration exceeds its metadata bound.'),{code:'MODEL_CONTRACT'});
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function aiDetectorConfiguration({url,signal}={}){
 if(!url){const deployment=await json(new URL('./integrated-config.json?v=0.32.0',import.meta.url),{signal});url=new URL('ai-detectors/model-manifest.json',new URL(deployment.assetBase,new URL('./integrated-config.json?v=0.32.0',import.meta.url))).href;}
 const key=String(url);if(flights.has(key)&&!signal)return structuredClone(await flights.get(key));
 const task=json(key,{signal}).then(value=>({...value,gpuQualifiedMethods:aiDetectorGpuMethods(value.gpuQualifiedMethods??[]),gpuQualifiedBrowserFamilies:aiDetectorGpuBrowserFamilies(value.gpuQualifiedBrowserFamilies??[]),qualificationEvidence:aiDetectorQualification(value.qualificationEvidence).qualificationEvidence}));
 if(!signal)flights.set(key,task);
 try{return structuredClone(await task);}finally{if(flights.get(key)===task)flights.delete(key);}
}
