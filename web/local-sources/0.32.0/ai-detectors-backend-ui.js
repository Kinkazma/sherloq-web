import {aiDetectorGpuAvailable} from './unified-engine/src/ai-detectors-backends.js';
// Labels and choices read the catalogue/capability declaration. They neither
// run a GPU probe nor turn that declaration into a new qualification receipt.
export function updateAiDetectorBackendControl(select,{method,configuration,capability,language='fr',value=select.value||'auto',gpuApiAvailable=Boolean(globalThis.navigator?.gpu),userAgent=globalThis.navigator?.userAgent??''}={}){
 const gpu=aiDetectorGpuAvailable(method,{configuration,capability,gpuApiAvailable,userAgent}),fr=language!=='en';
 const choices=[['auto',gpu?(fr?'Automatique · CPU / GPU':'Automatic · CPU / GPU'):(fr?'Automatique · CPU':'Automatic · CPU')],['cpu','CPU']];
 if(gpu)choices.push(['webgpu','GPU']);else if(value==='webgpu')choices.push(['webgpu',fr?'GPU · non disponible':'GPU · unavailable',true]);
 const options=choices.map(([key,label,disabled=false])=>{const option=select.ownerDocument.createElement('option');option.value=key;option.textContent=label;option.disabled=disabled;return option;});
 select.replaceChildren(...options);select.value=choices.some(([key])=>key===value)?value:'auto';
 return{gpuAvailable:gpu,choices:choices.map(([key])=>key),selected:select.value};
}
