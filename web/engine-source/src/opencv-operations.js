import {parameters} from './pixel-utils.js';import {requireValue} from './errors.js';import {cvPixels,cvPca} from './opencv.js';
import {pcaParams,pcaData,pcaView} from './pca.js';
import {separationComputeGpu} from './separation-compute-gpu.js';
import {gradientParams} from './gradient-parameters.js';
import {krawetzGradient} from './krawetz-gradient.js';
import {GRADIENT_HEAP_BYTES} from './gradient-math.js';
const spaces=['rgb','cmyk','gray','hsv','hls','ycrcb','xyz','lab','luv'];
const spaceParams=(p={})=>{const v=parameters(p,{space:'rgb',channel:0},{channel:[0,3]},{space:spaces});requireValue(v.channel<(['cmyk','gray'].includes(v.space)?4:3),'Invalid color channel.');return v;};
const echoParams=(p={})=>parameters(p,{radius:2,contrast:85,grayscale:false},{radius:[1,15],contrast:[0,100]},{},['grayscale']);
const noiseParams=(p={})=>parameters(p,{mode:0,radius:1,sigma:3,grayscale:false,denoised:false,levels:32},{mode:[0,4],radius:[1,10],sigma:[1,200],levels:[0,255]},{},['grayscale','denoised']);
const adjustParams=(p={})=>parameters(p,{brightness:0,saturation:0,hue:0,gamma:10,shadows:0,highlights:0,sweep:127,width:255,sharpen:0,threshold:255,equalize:0,invert:false},{brightness:[-255,255],saturation:[-255,255],hue:[0,180],gamma:[1,50],shadows:[-100,100],highlights:[-100,100],sweep:[0,255],width:[0,255],sharpen:[0,100],threshold:[0,255],equalize:[0,5]},{},['invert']);
const operation=(validate,code,values,native)=>({validate,compute:async(image,p,hooks)=>({pixels:await cvPixels(image,code,values(p),hooks),semantics:'Native parameter semantics and order; derived visualization, original unchanged.'}),scratchFactor:64,extraBytes:32*1024**2,native,exports:['json'],evidence:'fixtures/opencv-reference.json',parity:'4020 native output comparisons exact across five operations; see fixtures/opencv-reference.json'});
export const OPENCV_OPERATIONS={
 'colors.pca':{validate:pcaParams,compute:pcaData,view:pcaView,cacheParams:()=>({}),scratchFactor:32,extraBytes:32*1024**2,native:'pca.py',exports:['json'],parity:'360 native renders and mean/eigenvectors/eigenvalues exact; includes repeated eigenvalues and 1/2-pixel inputs'},
 'colors.space':operation(spaceParams,1,p=>[spaces.indexOf(p.space),p.channel],'color_spaces.py'),
 'noise.separation':{...operation(noiseParams,2,p=>[p.mode,p.radius,p.sigma,Number(p.grayscale),Number(p.denoised),p.levels],'noise.py'),compute:separationComputeGpu,backends:['webgpu']},
 'detail.gradient':{...operation(gradientParams,3,p=>[p.intensity,p.mode,Number(p.invert),Number(p.equalize)],'gradient.py; reconstructed Krawetz direction variant'),methods:['sobel','krawetz'],parity:'Sobel historical native output corpus remains bit-exact. Reconstructed Krawetz integer derivatives are exact against independent Python fixtures; RGB differs by at most1 code at Python/Wasm libm truncation boundaries. Local direction and available-neighbour borders are separate method contracts.',admissionBytes:(_image,p)=>p.method==='krawetz'?GRADIENT_HEAP_BYTES:0,compute:async(image,p,hooks)=>p.method==='krawetz'?krawetzGradient(image,p,hooks):({pixels:await cvPixels(image,3,[p.intensity,p.mode,Number(p.invert),Number(p.equalize)],hooks),semantics:'Native Sobel gradient parameter semantics and order; derived visualization, original unchanged.'})},
 'inspection.adjust':operation(adjustParams,4,p=>Object.values(p).map(Number),'adjust.py'),
 'detail.echo':operation(echoParams,5,p=>[p.radius,p.contrast,Number(p.grayscale)],'interactive.py:EchoEngine')
};
