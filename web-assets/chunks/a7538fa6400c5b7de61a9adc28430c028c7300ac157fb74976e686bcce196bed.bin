import "../../runtime-context.js?v=0.33.0";
import {parameters} from './pixel-utils.js';
import {requireValue} from './errors.js';
import {validateRecompressionOptions} from './recompression-plan.js';
import {FIELD_METHODS,FIELD_KEYS,isGradientField,validateGradientField,historicalGradientRequest} from './gradient-field-parameters.js';

// Krawetz's native blue channel is an amplitude, not one of Sobel's display
// alternatives. Keep the same public schema and canonicalize its unused mode.
export function gradientParams(input={}){
 const field=isGradientField(input),fieldInput=input;
 if((field||historicalGradientRequest(input))&&input&&typeof input==='object'&&!Array.isArray(input)){input={...input};for(const key of FIELD_KEYS)delete input[key];}
 const hasToneOrder=Object.hasOwn(input??{},'toneBeforeEqualize'),toneBeforeEqualize=input?.toneBeforeEqualize;
 if(hasToneOrder){requireValue(typeof toneBeforeEqualize==='boolean','Invalid toneBeforeEqualize.');input={...input};delete input.toneBeforeEqualize;}
 const recompression=validateRecompressionOptions(input?.recompression);
 if(recompression){input={...input};delete input.recompression;}
 const krawetz=input?.method==='krawetz';
 let result=parameters(input,{method:'sobel',intensity:field||krawetz?0:95,mode:2,invert:false,equalize:false},{intensity:[0,100],mode:[0,3]},{method:FIELD_METHODS},['invert','equalize']);
 if(result.method==='krawetz')result.mode=2;
 if(toneBeforeEqualize){requireValue(result.equalize,'Tone-before-equalization requires equalization.');result.toneBeforeEqualize=true;}
 if(field)result=validateGradientField(fieldInput,result);
 return recompression?{...result,recompression}:result;
}
export const GRADIENT_METHODS=FIELD_METHODS;
export const gradientSemantics=method=>method==='krawetz'
 ?'Reconstructed Krawetz luminance gradient: integer-floor BT.601 gray, available-neighbour 4:7:4 differences, local direction in R/G and clipped magnitude/9 in B; zero direction neutral127. Optional tone/equalization is one admitted-domain reduction.'
 :'Native Sobel luminance-gradient display with source-wide derivative maxima, blue-channel normalization and channel equalization; neutral zero derivative127.';
