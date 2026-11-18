import "../../runtime-context.js?v=0.33.2";
import {nativeColorSpaceParametersAdmitted} from './opencv-operations.js';
import {defectParams} from './defect-pixels.js';
import {blockingParams} from './wavelet-blocking.js';
import {native16EchoParametersAdmitted} from './native16-echo-contract.js';
import {native16GradientRegionParametersAdmitted} from './native16-gradient-region-contract.js';
import {native16MagnifierParametersAdmitted} from './native16-magnifier-contract.js';
import {native16AdjustParametersAdmitted} from './native16-adjust-contract.js';
// Serializable capability rules are shared by UI and numerical dispatch.
// Validation never opens a decoder/GPU context or allocates a source backing.
export const SEPARATION16_PARAMETER_RULES=Object.freeze({mode:Object.freeze({oneOf:Object.freeze([0,1,2,3,4]),default:0}),denoised:Object.freeze({oneOf:Object.freeze([false,true]),default:false})});
export function native16CapabilityParametersAdmitted(capability,params={},shape='identity'){
 if(capability?.native!==true||!params||typeof params!=='object'||Array.isArray(params))return false;
 if(capability.shapes&&!capability.shapes.includes(shape))return false;
 if(capability.operation==='colors.space'&&!nativeColorSpaceParametersAdmitted(params))return false;
 if(capability.operation==='pixels.defects'&&!native16DefectsParametersAdmitted(params,shape))return false;
 if(capability.parameterContract==='echo-native-code-values'&&!native16EchoParametersAdmitted(params,shape))return false;
 if(capability.parameterContract==='adjust-native-code-values'&&!native16AdjustParametersAdmitted(params))return false;
 if(capability.parameterContract==='magnifier-native-code-values'&&!native16MagnifierParametersAdmitted(params))return false;
 if(capability.legacyOptions?.some(key=>params[key]!==undefined&&params[key]!==null&&params[key]!==false))return false;
 for(const[key,rule]of Object.entries(capability.parameterRules??{})){const value=Object.hasOwn(params,key)?params[key]:rule.default;if(rule.oneOf&&!rule.oneOf.includes(value)||Object.hasOwn(rule,'equals')&&value!==rule.equals)return false;}
 return true;
}
export function native16DefectsParametersAdmitted(params={},shape='identity'){
 if(shape!=='identity')return false;
 try{defectParams(params);return true;}catch{return false;}
}
export function native16BlockingParametersAdmitted(params={},shape='identity'){
 if(shape!=='identity')return false;
 try{blockingParams(params);return true;}catch{return false;}
}
export function native16ProxyParametersAdmitted(operation,params={},shape='identity'){
 if(operation==='colors.space')return shape==='identity'&&nativeColorSpaceParametersAdmitted(params);
 if(operation==='detail.echo')return native16EchoParametersAdmitted(params,shape);
 if(operation==='noise.blocking')return native16BlockingParametersAdmitted(params,shape);
 if(operation==='pixels.defects')return native16DefectsParametersAdmitted(params,shape);
 if(shape!=='identity')return operation==='detail.gradient'&&native16GradientRegionParametersAdmitted(params,shape);
 if(['colors.stats','noise.planes','noise.minmax'].includes(operation))return true;
 if(!['inspection.adjust','noise.separation','detail.gradient','detail.frequency','detail.wavelets','colors.pca'].includes(operation))return false;
 if(operation==='inspection.adjust')return native16AdjustParametersAdmitted(params);
 if(operation==='detail.gradient'&&params?.recompression)return false;
 if(operation==='noise.separation')for(const[key,rule]of Object.entries(SEPARATION16_PARAMETER_RULES)){const value=Object.hasOwn(params??{},key)?params[key]:rule.default;if(rule.oneOf&&!rule.oneOf.includes(value)||Object.hasOwn(rule,'equals')&&value!==rule.equals)return false;}
 return true;
}
export function native16ParameterProxyAdmitted(operation,params,capabilities,shape='identity'){
 if(!native16ProxyParametersAdmitted(operation,params,shape))return false;
 if(['colors.stats','noise.planes','noise.minmax'].includes(operation))return true;
 const declared=capabilities?.operations?.find(item=>item.operation===operation);return native16CapabilityParametersAdmitted(declared,params,shape);
}

// A retained final does not imply a sampled proxy. Magnifier ROI bounds use
// Original coordinates and its local display policy owns provisional views.
export function native16FinalParametersAdmitted(operation,params,capabilities,shape='identity'){
 if(operation!=='inspection.magnifier')return native16ParameterProxyAdmitted(operation,params,capabilities,shape);
 if(!['identity','rectangle'].includes(shape))return false;
 const declared=capabilities?.operations?.find(item=>item.operation===operation);
 return native16CapabilityParametersAdmitted(declared,params,shape);
}
