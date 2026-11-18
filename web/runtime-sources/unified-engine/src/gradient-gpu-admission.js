import "../../runtime-context.js?v=0.33.3";
import {native16GradientRegionParametersAdmitted} from './native16-gradient-region-contract.js';
// Both the useful-operation owner and the actual dispatch must describe the
// same existing renderer. Rectangles become segmented native-grid views;
// observed/masked derivatives and Krawetz retain their native CPU arithmetic.
import {isGradientField} from './gradient-field-parameters.js';
export function gradientGpuAdmitted(image,params,{cpuKernel='auto',shape='identity',workingDepth}={}){
 if(image?.nativeSurface&&(workingDepth??image.workingDepth??16)===16&&native16GradientRegionParametersAdmitted(params,shape))return cpuKernel!=='reference';
 if(isGradientField(params))return cpuKernel!=='reference'&&['identity','rectangle','native-regions','membership'].includes(shape);
 return cpuKernel!=='reference'&&params.method==='sobel'&&(shape==='rectangle'||shape==='identity'&&(image?.segmented||image?.provenance?.decoder==='bounded-parameter-preview'));
}
