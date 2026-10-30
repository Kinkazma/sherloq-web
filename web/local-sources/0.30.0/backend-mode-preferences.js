import {usefulOperationMethod} from './unified-engine/src/useful-operation-method.js';
import {backendScope} from './unified-engine/src/adaptive-runtime.js';
import {CLONE_ALGORITHMS} from './clone-methods.js?v=0.30.0';
import {SEGMENTATION_WINDOW_VARIANTS} from './unified-engine/src/segmentation-window-capabilities.js';
// Static registered routes only: preference defaults create no device, model,
// benchmark or admission. Runtime resource/backend checks remain authoritative.
const gpuOperations=new Set([
 'ela.classic','ela.biomes','ela.energy','tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb',
 'tampering.resampling','tampering.resampling.fourier','various.median','noise.noisesniffer','noise.prnu','comparison.image',
 'detail.frequency','noise.blocking','detail.wavelets','various.stereogram','jpeg.zero','jpeg.ghosts','jpeg.recompression','jpeg.quality','noise.separation',
 'ai.sources.safire','ai.localization.focal','ai.localization.adaifl','ai.generation.bfree','ai.generation.spai','ai.text.doctamper','jpeg.comprint',
 'm2.cfa','m2.trufor','m2.rita','m2.catnet','m2.forgeryscope','m2.composite','composite'
]);
export function gpuBackendEligible(tool,params={},extras={}){
 if(tool==='tampering.copyMove.sparse'||tool==='tampering.copyMove.dense')return CLONE_ALGORITHMS.includes(params.algorithm??params.profile??'SIFT + G2NN + RANSAC')&&(params.algorithm??params.profile)!=='SSG';
 if(tool==='ai.clones.d2prl'){const variant=extras.neuralMethod??'d2prl';return variant==='d2prl'||variant.startsWith('forgeryscope-')||SEGMENTATION_WINDOW_VARIANTS.includes(variant);}
 if(tool==='ai.clones.segmentation')return SEGMENTATION_WINDOW_VARIANTS.includes(params.variant??'');
 if(tool==='jpeg.multiple')return extras.jpegMethod==='jpeg.recompression';
 if(tool==='various.ocr')return params.prepareOnly!==true&&['ppocr-medium','tesseract'].includes(params.algorithm??params.engine??'ppocr-medium');
 return gpuOperations.has(tool);
}
export const defaultBackend=(tool,params={},extras={})=>gpuBackendEligible(tool,params,extras)&&!!globalThis.navigator?.gpu?'webgpu':'auto';
export function requestedBackend(task,extras={},store){
 if(task.backend!==undefined&&task.backend!==null)return task.backend;
 const identity=usefulOperationMethod(task.operation,task.params,extras),scope=backendScope(identity.tool,identity.method);
 if(store?.hasMode(scope))return store.mode(scope);
 return defaultBackend(task.operation,task.params,extras);
}
const modes=new Set(['auto','cpu','webgpu']);
const value=v=>typeof v==='string'&&v.length>0&&v.length<=128&&!/[\u0000-\u001f\u007f]/.test(v);
export function validateBackendChoices(input){
 if(!Array.isArray(input)||input.length>512)throw new TypeError('Invalid backend preferences');
 const keys=new Set();return input.map(c=>{
  if(!c||!value(c.tool)||!value(c.method)||!modes.has(c.mode))throw new TypeError('Invalid backend preference');
  const k=backendScope(c.tool,c.method);if(keys.has(k))throw new TypeError('Duplicate backend preference');keys.add(k);
  return {tool:c.tool,method:c.method,mode:c.mode};
 });
}
// Method identity is independent of numerical parameters and presentation.
// Adding a new compound tool requires an explicit method discriminator here.
export function backendMethod(tool,params={},extras={}){return usefulOperationMethod(tool,params,extras).method;}
export class BackendModePreferences {
 constructor({choices=[],legacyMode}={}){this.choices=validateBackendChoices(choices);this.legacy=modes.has(legacyMode)?legacyMode:null;}
 has(tool,method='default'){const key=backendScope(tool,method);return this.choices.some(c=>backendScope(c.tool,c.method)===key);}
 get(tool,method='default',fallback=defaultBackend(tool,method==='default'?{}:{algorithm:method},method==='default'?{}:{neuralMethod:method,jpegMethod:method})){
  const key=backendScope(tool,method),existing=this.choices.find(c=>backendScope(c.tool,c.method)===key);
  if(existing)return existing.mode;
  // A legacy panel-global setting seeds exactly one visited method. It must not
  // silently impose CPU/GPU on all other tools after migration.
  if(this.legacy!==null){const mode=this.legacy;this.legacy=null;this.set(tool,method,mode);return mode;}
  // A computed default is not an explicit choice and is never persisted here.
  return fallback;
 }
 set(tool,method,mode){if(!modes.has(mode))throw new TypeError('Invalid backend mode');const key=backendScope(tool,method);this.choices=this.choices.filter(c=>backendScope(c.tool,c.method)!==key);this.choices.push({tool,method,mode});while(this.choices.length>512)this.choices.shift();return mode;}
 restore({choices=[],legacyMode}={}){this.choices=validateBackendChoices(choices);this.legacy=modes.has(legacyMode)?legacyMode:null;}
 export(){return structuredClone(this.choices);}
}
