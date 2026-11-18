import "../../runtime-context.js?v=0.33.3";
import {requireValue} from './errors.js';
import {roundEven} from './pixel-utils.js';
// OpenCV getGaussianKernelFixedPoint_ED, with the same binary64 kernel and
// symmetric diffusion of rounding error, generalized to16 fraction bits.
export function quantizeSeparationGaussian16(exact){
 requireValue((Array.isArray(exact)||exact instanceof Float64Array)&&exact.length>=3&&exact.length<=51&&exact.length%2===1&&Array.from(exact).every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Invalid native16 Gaussian coefficients.');
 const radius=exact.length>>1,out=new Uint32Array(exact.length);let error=0,sum=0;
 for(let i=0;i<radius;i++){const adjusted=exact[i]*65536+error,value=roundEven(adjusted);error=adjusted-value;out[i]=out[out.length-1-i]=value;sum+=value;}
 requireValue(sum<=32768,'Native16 Gaussian coefficients do not normalize.');out[radius]=65536-2*sum;return out;
}
export const NATIVE16_SEPARATION_UNITS=Object.freeze({source:'Exact uint16 encoded channel values,0..65535; no implicit ICC or transfer conversion.',filter:'OpenCV4.11 typed median,Gaussian,box or bilateral; median uses REPLICATE physical borders,other filters use REFLECT101. Box and fixed-point Gaussian keep one final rounded division.',bilateral:'Historical L1 color distance; color sigma=257*sigmaUI native code units,spatial sigma=sigmaUI pixels. CPU/GPU preserve their declared floating/FMA arithmetic.',grayscale:'Historical integer BT.601 code-value weights; not physical linear luminance.',residual:'Absolute native16 source-minus-filtered difference before presentation.',levels:'UI8 threshold levels/255; native threshold levels*257.',zeroLevels:'Global per-channel histogram equalization of65536 residual codes to RGB8.',nlmGray:'UInt16GrayL2; historical integer gray,7x7 patch/21x21 search,halo13,scaled distance bins and fixed-point weights; true16-bit input.',nlmColor:'coded-nominal-Lab-D65; normalized native code values through Lab32F,unchanged L2 weights and inverse nominal conversion; not physical ICC Lab and no TRC/HDR/gainmap processing.',nlmStrength:'UI radius controls h=2*radius+1,not the fixed template/search support; no new norm.',output:'Residual is an RGB8 diagnostic; denoised output is true RGB16 scientific filter codes. The captured Original ICC/CICP is used only for display; scientific output codes remain unchanged.'});
