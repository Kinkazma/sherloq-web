import {parameters} from './pixel-utils.js';import {requireValue,EngineError,checkpoint,createCooperator} from './errors.js';import {allocateTypedArray} from './allocation.js';import {cvPixels,cvPca,cvColor16} from './opencv.js';
import {pcaParams,pcaData,pcaView} from './pca.js';
import {separationComputeGpu} from './separation-compute-gpu.js';
import {gradientParams} from './gradient-parameters.js';
import {krawetzGradient} from './krawetz-gradient.js';
import {GRADIENT_HEAP_BYTES} from './gradient-math.js';
import {contiguousAdjust} from './adjust-contiguous.js';
import {FIELD_METHODS,isGradientField} from './gradient-field-parameters.js';
import {contiguousGradientField} from './gradient-field.js';
const spaces=['rgb','cmyk','gray','hsv','hls','ycrcb','xyz','lab','luv'];
const spaceParams=(p={})=>{const v=parameters(p,{space:'rgb',channel:0},{channel:[0,3]},{space:spaces});requireValue(v.channel<(['cmyk','gray'].includes(v.space)?4:3),'Invalid color channel.');return v;};
export const NATIVE16_ALGEBRAIC_COLOR_SPACES=Object.freeze(spaces.slice(0,6));
export const NATIVE16_COLOR_SPACES=Object.freeze([...spaces]);
export function nativeColorSpaceParametersAdmitted(input){try{return NATIVE16_COLOR_SPACES.includes(spaceParams(input).space);}catch{return false;}}
export async function nativeColorSpacePixels(image,input,hooks={}){const p=spaceParams(input);return NATIVE16_ALGEBRAIC_COLOR_SPACES.includes(p.space)?cvColor16(image,spaces.indexOf(p.space),p.channel,hooks):cieColorSpacePixels(image,p,hooks);}
// CIE1976 physical coordinates from the common CMM's XYZ D50 Float32.
// No sRGB gamut projection and no 8-bit intermediate is involved.
export const CIE_CHANNEL_RANGES=Object.freeze({xyz:Object.freeze([[0,1],[0,1],[0,1]].map(Object.freeze)),lab:Object.freeze([[0,100],[-128,127],[-128,127]].map(Object.freeze)),luv:Object.freeze([[0,100],[-134,220],[-140,122]].map(Object.freeze))});
export function cieChannelValue(X,Y,Z,white,space,channel){
 if(![X,Y,Z].every(Number.isFinite))throw new EngineError('COLOR_DOMAIN_UNSUPPORTED','The CIE projection returned non-finite XYZ.',{details:{reason:'non-finite-xyz'}});
 if(space==='luv'&&X+15*Y+3*Z===0&&(X!==0||Y!==0||Z!==0))throw new EngineError('COLOR_DOMAIN_UNSUPPORTED','Nonblack XYZ has undefined CIELUV chromaticity.',{details:{reason:'zero-luv-denominator-nonblack'}});
 let value;if(space==='xyz')value=[X,Y,Z][channel];else{
  const epsilon=216/24389,kappa=24389/27,yr=Y/white[1],f=t=>t>epsilon?Math.cbrt(t):(kappa*t+16)/116,L=yr>epsilon?116*Math.cbrt(yr)-16:kappa*yr;
  if(channel===0)value=L;else if(space==='lab')value=channel===1?500*(f(X/white[0])-f(yr)):200*(f(yr)-f(Z/white[2]));
  else if(X===0&&Y===0&&Z===0)value=0;else{const D=X+15*Y+3*Z,Dn=white[0]+15*white[1]+3*white[2];if(D===0)throw new EngineError('COLOR_DOMAIN_UNSUPPORTED','Nonblack XYZ has undefined CIELUV chromaticity.',{details:{reason:'zero-luv-denominator-nonblack'}});value=13*L*(channel===1?4*X/D-4*white[0]/Dn:9*Y/D-9*white[1]/Dn);}
 }
 value=Math.fround(value);if(!Number.isFinite(value))throw new EngineError('COLOR_DOMAIN_UNSUPPORTED','The CIE coordinate exceeds finite Float32.',{details:{reason:'non-finite-cie-coordinate'}});return value;
}
export async function cieColorSpacePixels(image,p,{signal,referenceWhite}={}){
 requireValue(image?.format==='xyzFloat32'&&image.data instanceof Float32Array&&image.data.length===image.width*image.height*3&&CIE_CHANNEL_RANGES[p.space]?.[p.channel]&&Array.isArray(referenceWhite)&&referenceWhite.length===3&&referenceWhite.every(v=>Number.isFinite(v)&&v>0)&&referenceWhite[1]===1,'An exact CMM XYZ D50 band and its PCS white are required.');
 const cooperate=createCooperator(signal),output=allocateTypedArray(Uint16Array,image.data.length,{label:'cie-native16-channel'}),[low,high]=CIE_CHANNEL_RANGES[p.space][p.channel];
 for(let y=0;y<image.height;y++){for(let x=0;x<image.width;x++){if(x%4096===0)await cooperate();const i=(y*image.width+x)*3,X=image.data[i],Y=image.data[i+1],Z=image.data[i+2];
  const physical=cieChannelValue(X,Y,Z,referenceWhite,p.space,p.channel),code=Math.min(65535,Math.max(0,Math.trunc((physical-low)/(high-low)*65535)));output[i]=output[i+1]=output[i+2]=code;
 }}return{width:image.width,height:image.height,format:'rgb16',depth:16,range:[0,65535],data:output};
}

const echoParams=(p={})=>parameters(p,{radius:2,contrast:85,grayscale:false},{radius:[1,15],contrast:[0,100]},{},['grayscale']);
const noiseParams=(p={})=>parameters(p,{mode:0,radius:1,sigma:3,grayscale:false,denoised:false,levels:32},{mode:[0,4],radius:[1,10],sigma:[1,200],levels:[0,255]},{},['grayscale','denoised']);
const adjustParams=(p={})=>parameters(p,{brightness:0,saturation:0,hue:0,gamma:10,shadows:0,highlights:0,sweep:127,width:255,sharpen:0,threshold:255,equalize:0,invert:false},{brightness:[-255,255],saturation:[-255,255],hue:[0,180],gamma:[1,50],shadows:[-100,100],highlights:[-100,100],sweep:[0,255],width:[0,255],sharpen:[0,100],threshold:[0,255],equalize:[0,5]},{},['invert']);
const operation=(validate,code,values,native)=>({validate,compute:async(image,p,hooks)=>({pixels:await cvPixels(image,code,values(p),hooks),semantics:'Native parameter semantics and order; derived visualization, original unchanged.'}),scratchFactor:64,extraBytes:32*1024**2,native,exports:['json'],evidence:'fixtures/opencv-reference.json',parity:'4020 native output comparisons exact across five operations; see fixtures/opencv-reference.json'});
async function contiguousGradient(image,p,hooks){
 if(isGradientField(p))return contiguousGradientField(image,p,hooks);
 if(p.method==='krawetz')return krawetzGradient(image,p,hooks);
 // The legacy Wasm gradient gives HE precedence over intensity. Compose its
 // existing tone render and channel HE only for the explicit modern order.
 // At zero strength the historical one-call path is already identical.
 const compose=p.toneBeforeEqualize&&p.equalize&&Math.trunc(p.intensity/100*127)>0;
 let pixels=await cvPixels(image,3,[p.intensity,p.mode,Number(p.invert),Number(p.equalize&&!compose)],hooks);
 if(compose)pixels=await cvPixels(pixels,9,[1,0],hooks);
 return{pixels,semantics:'Native Sobel gradient parameter semantics and order; derived visualization, original unchanged.'};
}
export const OPENCV_OPERATIONS={
 'colors.pca':{validate:pcaParams,compute:pcaData,view:pcaView,cacheParams:()=>({}),scratchFactor:32,extraBytes:32*1024**2,native:'pca.py',exports:['json'],parity:'360 native renders and mean/eigenvectors/eigenvalues exact; includes repeated eigenvalues and 1/2-pixel inputs'},
 'colors.space':operation(spaceParams,1,p=>[spaces.indexOf(p.space),p.channel],'color_spaces.py'),
 'noise.separation':{...operation(noiseParams,2,p=>[p.mode,p.radius,p.sigma,Number(p.grayscale),Number(p.denoised),p.levels],'noise.py'),compute:separationComputeGpu,backends:['webgpu']},
 'detail.gradient':{backends:['cpu','webgpu'],...operation(gradientParams,3,p=>[p.intensity,p.mode,Number(p.invert),Number(p.equalize)],'gradient.py; reconstructed Krawetz direction variant'),methods:[...FIELD_METHODS],parity:'Sobel historical native output corpus remains bit-exact. Reconstructed Krawetz integer derivatives are exact against independent Python fixtures; RGB differs by at most1 code at Python/Wasm libm truncation boundaries. Local direction and available-neighbour borders are separate method contracts.',admissionBytes:(_image,p)=>p.method==='krawetz'?GRADIENT_HEAP_BYTES:0,compute:contiguousGradient},
 'inspection.adjust':{...operation(adjustParams,4,p=>Object.values(p).map(Number),'adjust.py'),compute:contiguousAdjust,backends:['cpu','webgpu']},
 'detail.echo':operation(echoParams,5,p=>[p.radius,p.contrast,Number(p.grayscale)],'interactive.py:EchoEngine')
};
