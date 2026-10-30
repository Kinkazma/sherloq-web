// UI state only. Numerical validation and defaults belong to the engine too.
export const GRADIENT_METHODS=Object.freeze(['sobel','krawetz']);
const fields=Object.freeze(['method','intensity','mode','invert','equalize']);
export const gradientMethod=value=>value==='krawetz'?'krawetz':'sobel';
export function gradientDefaults(method='sobel'){
 method=gradientMethod(method);
 return{method,intensity:method==='krawetz'?0:95,mode:2,invert:false,equalize:false};
}
export function gradientSettings(parameters={}){
 const defaults=gradientDefaults(parameters.method),out={...defaults};
 for(const key of fields)if(key!=='method'&&Object.hasOwn(parameters,key))out[key]=parameters[key];
 if(parameters.equalization!==undefined)out.equalization=structuredClone(parameters.equalization);
 if(out.method==='krawetz')out.mode=2;
 return out;
}
export function restoreGradientSettings(value){
 const out={};
 if(value&&typeof value==='object'&&!Array.isArray(value))for(const method of GRADIENT_METHODS){
  const settings=value[method];
  if(settings&&typeof settings==='object'&&!Array.isArray(settings))out[method]=gradientSettings({...settings,method});
 }
 return out;
}
export function changeGradientMethod(parameters,method,retained={}){
 const previous=gradientSettings(parameters),saved=restoreGradientSettings(retained);
 saved[previous.method]=previous;
 method=gradientMethod(method);
 const next=gradientSettings(saved[method]??gradientDefaults(method));
 return{parameters:next,retained:saved};
}
