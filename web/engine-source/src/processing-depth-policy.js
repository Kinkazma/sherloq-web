import {sourceDefaultWorkingDepth} from './source-precision.js';
import {requireAdjustPerceptualLinearRgb16} from './adjust-perceptual-curve.js';

// Depth selection uses qualified source metadata and the existing numerical
// admissions. Only Loupe keeps a human override; ELAB is currently RGB8-only.
export const MANUAL_WORKING_DEPTH_OPERATION='inspection.magnifier';
export function operationWorkingDepth(operation,input,manualDepth){
 if(operation==='ela.bitrate')return 8;
 const surface=input?.nativeSurface?.descriptor??input?.nativeSurface;
 if(surface?.format!=='rgb16'||surface.depth!==16)return 8;
 if(operation===MANUAL_WORKING_DEPTH_OPERATION&&[8,16].includes(manualDepth))return manualDepth;
 return sourceDefaultWorkingDepth({...input,nativeSurface:surface})===16?16:8;
}

export function defaultPerceptualAdjustParams(input,params={},depth){
 if(depth!==16||Object.hasOwn(params,'toneDomain'))return params;
 const descriptor=input?.nativeSurface?.descriptor??input?.nativeSurface;
 try{requireAdjustPerceptualLinearRgb16(descriptor);}catch{return params;}
 return{...params,toneDomain:'perceptual-srgb-trc'};
}

// Explicit public/API depth and tone requests remain reproducible. Ordinary UI
// and batch calls get the accepted new route without an extra UI selector.
export function defaultPerceptualAdjustTask(task,image){
 if(task?.operation!=='inspection.adjust'||!image?.nativeSurface)return task;
 const depth=task.workingDepth??image.workingDepth??sourceDefaultWorkingDepth(image),params=defaultPerceptualAdjustParams(image,task.params??{},depth);
 return params===task.params?task:{...task,params};
}
