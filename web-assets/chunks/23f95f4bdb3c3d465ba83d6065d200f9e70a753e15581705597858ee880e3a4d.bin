import "../../runtime-context.js?v=0.33.3";
// Pure admission shared by the regional dispatch and proxy/UI predicates.
// Availability and identity of an actual native Source are checked by callers.
export const NATIVE16_GRADIENT_SHAPES=Object.freeze(['identity','rectangle','native-regions','membership']);
export function native16GradientRegionParametersAdmitted(params={},shape='identity'){
 return !!params&&typeof params==='object'&&!Array.isArray(params)&&!params.recompression&&NATIVE16_GRADIENT_SHAPES.includes(shape);
}
export function native16GradientRegionRequested(task,original,shape){
 const d=original?.nativeSurface?.descriptor;
 return task?.operation==='detail.gradient'&&d?.format==='rgb16'&&d.depth===16&&(task.workingDepth??original.workingDepth??16)===16&&native16GradientRegionParametersAdmitted(task.params??{},shape);
}
