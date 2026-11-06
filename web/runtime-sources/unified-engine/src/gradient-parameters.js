import "../../runtime-context.js?v=0.31.0";
import {parameters} from './pixel-utils.js';
import {requireValue} from './errors.js';
import {validateRecompressionOptions} from './recompression-plan.js';

// Krawetz's native blue channel is an amplitude, not one of Sobel's display
// alternatives. Keep the same public schema and canonicalize its unused mode.
export function gradientParams(input={}){
 const hasToneOrder=Object.hasOwn(input??{},'toneBeforeEqualize'),toneBeforeEqualize=input?.toneBeforeEqualize;
 if(hasToneOrder){requireValue(typeof toneBeforeEqualize==='boolean','Invalid toneBeforeEqualize.');input={...input};delete input.toneBeforeEqualize;}
 const recompression=validateRecompressionOptions(input?.recompression);
 if(recompression){input={...input};delete input.recompression;}
 const krawetz=input?.method==='krawetz';
 const result=parameters(input,{method:'sobel',intensity:krawetz?0:95,mode:2,invert:false,equalize:false},{intensity:[0,100],mode:[0,3]},{method:['sobel','krawetz']},['invert','equalize']);
 if(result.method==='krawetz')result.mode=2;
 if(toneBeforeEqualize){requireValue(result.equalize,'Tone-before-equalization requires equalization.');result.toneBeforeEqualize=true;}
 return recompression?{...result,recompression}:result;
}
export const GRADIENT_METHODS=Object.freeze(['sobel','krawetz']);
export const gradientSemantics=method=>method==='krawetz'
 ?'Reconstructed Krawetz luminance gradient: integer-floor BT.601 gray, available-neighbour 4:7:4 differences, local direction in R/G and clipped magnitude/9 in B; zero direction neutral127. Optional tone/equalization is one admitted-domain reduction.'
 :'Native Sobel luminance-gradient display with source-wide derivative maxima, blue-channel normalization and channel equalization; neutral zero derivative127.';
