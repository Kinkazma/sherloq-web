import {requireValue} from './errors.js';
export const FIELD_METHODS=Object.freeze(['sobel','krawetz','disk','central','prewitt','scharr','farid','gaussian','kirsch']);
export const FIELD_KEYS=Object.freeze(['view','kernelSize','sampleStep','sigma','diskFill','preSigma','preSize','tensorSigma','tensorSize','luma','border']);
export function nativeGradientField(p={}){
 const method=p.method??'sobel';if(!['sobel','krawetz'].includes(method))return false;
 const defaults=gradientFieldDefaults(method);
 return ['kernelSize','sampleStep','preSigma','luma','border'].every(k=>p[k]===undefined||p[k]===defaults[k]);
}
export const historicalGradientRequest=p=>p?.view==='native'&&nativeGradientField(p);
export const isGradientField=p=>historicalGradientRequest(p)?false:!['sobel','krawetz'].includes(p?.method??'sobel')||FIELD_KEYS.some(k=>Object.hasOwn(p??{},k));
export function gradientFieldDefaults(method='sobel'){
 return{view:'native',kernelSize:method==='farid'?5:method==='gaussian'?9:3,sampleStep:1,sigma:1,diskFill:1,preSigma:0,preSize:9,tensorSigma:1.5,tensorSize:11,luma:'bt601',border:method==='krawetz'?'omit':'reflect'};
}
export function validateGradientField(input,base){
 const p={...base,...gradientFieldDefaults(base.method)};
 for(const key of FIELD_KEYS)if(Object.hasOwn(input,key))p[key]=input[key];
 const real=(k,a,b)=>requireValue(typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=a&&p[k]<=b,'Invalid gradient '+k+'.');
 const odd=(k,a,b)=>{real(k,a,b);requireValue(Number.isInteger(p[k])&&p[k]%2===1,'Gradient '+k+' must be odd.');};
 requireValue(['native','angle','coherence'].includes(p.view),'Unknown gradient view.');
 odd('kernelSize',3,63);odd('preSize',3,127);odd('tensorSize',3,127);
 real('sampleStep',1,16);requireValue(Number.isInteger(p.sampleStep),'Gradient sampleStep must be an integer.');
 real('sigma',.1,32);real('diskFill',.1,1);real('preSigma',0,32);real('tensorSigma',.1,32);
 requireValue(['bt601','linear709'].includes(p.luma),'Unknown luminance convention.');
 requireValue(['reflect','nearest','omit'].includes(p.border),'Unknown gradient boundary.');
 if(['central','scharr','kirsch','krawetz'].includes(p.method))requireValue(p.kernelSize===3,'This named operator has a fixed three-tap kernel; use its sampling step or prefilter.');
 if(p.method==='farid')requireValue([5,7].includes(p.kernelSize),'Published Farid filters have five or seven taps.');
 return p;
}
export const gradientFieldIdentity=p=>JSON.stringify([p.method,p.kernelSize,p.sampleStep,p.method==='gaussian'?p.sigma:null,p.method==='disk'?p.diskFill:null,p.preSigma,p.preSigma?p.preSize:null,p.luma,p.border]);
export const gradientFieldRadius=p=>(p.preSigma?(p.preSize-1)/2:0)+(p.kernelSize-1)/2*p.sampleStep;

// Scheduling cost is shared by nearby parameter values; scientific cache keys remain exact.
export const gradientFieldCostIdentity=p=>JSON.stringify([p.method,p.kernelSize,p.sampleStep,p.preSigma>0?p.preSize:0,p.luma,p.border]);
