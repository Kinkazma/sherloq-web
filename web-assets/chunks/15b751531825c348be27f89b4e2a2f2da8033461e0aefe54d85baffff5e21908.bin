import "../../runtime-context.js?v=0.33.0";
// Both the useful-operation owner and the actual dispatch must describe the
// same existing renderer. Rectangles become segmented native-grid views;
// observed/masked derivatives and Krawetz retain their native CPU arithmetic.
import {isGradientField} from './gradient-field-parameters.js';
export function gradientGpuAdmitted(image,params,{cpuKernel='auto',shape='identity'}={}){
 if(isGradientField(params))return cpuKernel!=='reference'&&['identity','rectangle','native-regions','membership'].includes(shape);
 return cpuKernel!=='reference'&&params.method==='sobel'&&(shape==='rectangle'||shape==='identity'&&(image?.segmented||image?.provenance?.decoder==='bounded-parameter-preview'));
}
