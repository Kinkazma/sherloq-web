import "../../runtime-context.js?v=0.14.5";
import {parameters,rows} from './pixel-utils.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {resamplingFft2,resamplingPyrUp,resamplingHeapBound,resamplingHeapBytes} from './resampling-math.js';
import {GRAY_PALETTE} from './gray-palette.js';

export function resamplingFourierParams(input={}){
 const p=parameters(input,{rect:null,window:'hanning',upsample:true,center:false,highpass:'simple',gamma:4,rescale:true});
 requireValue(p.rect===null||Array.isArray(p.rect)&&p.rect.length===4&&p.rect.every(Number.isSafeInteger),'Invalid Fourier rectangle.');
 requireValue(['hanning','radial'].includes(p.window)&&['simple','radial'].includes(p.highpass),'Invalid Fourier window or highpass.');
 requireValue([p.upsample,p.center,p.rescale].every(x=>typeof x==='boolean')&&Number.isFinite(p.gamma)&&p.gamma>=0&&p.gamma<=5,'Invalid Fourier presentation parameters.');if(p.rect)p.rect=p.rect.slice();return p;
}
function region(width,height,value){
 const r=value??[0,0,width,height];requireValue(r[0]>=0&&r[1]>=0&&r[2]<=width&&r[3]<=height&&r[2]-r[0]>=2&&r[3]-r[1]>=2,'Fourier region must lie in the source and be at least 2×2.');return r;
}
function radial(size,highpass){
 const center=Math.floor(size/2),radius=Math.sqrt(2*center*center),out=new Float64Array(size*size),root2=Math.sqrt(2);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const r=Math.sqrt((y-center)**2+(x-center)**2)/radius*root2;
  out[y*size+x]=highpass?(r<=root2?.5-.5*Math.cos(Math.PI*r/root2):0):(r<.75?1:r<=root2?.5+.5*Math.cos(Math.PI*(r-.75)/(root2-.75)):0);
 }return out;
}
export function resamplingFourierGeometry(width,height,p){
 const selected=region(width,height,p.rect),[x0,y0,x1,y1]=selected,half=Math.floor(Math.min(x1-x0,y1-y0)/2),side=half*2,left=x0+Math.floor((x1-x0)/2)-half,top=y0+Math.floor((y1-y0)/2)-half,size=side*(p.upsample?2:1),centerHalf=Math.floor(size/4),outputSize=p.center?2*centerHalf:size;
 requireValue(outputSize>=2,'The Fourier region is too small to take its center.');return {selected: selected.slice(),spatialSquare:[left,top,left+side,top+side],spatialSide:side,fftSide:size,outputSide:outputSize,fftOffset:p.center?size/2-centerHalf:0,upsample:p.upsample?2:1,domain:'fftshift complex spectrum; output is not an image-coordinate mask'};
}
export function resamplingFourierAdmission(image,p,bytes){
 const g=resamplingFourierGeometry(image.width,image.height,p),n=image.width*image.height,s=g.spatialSide**2,f=g.fftSide**2,o=g.outputSide**2;
 const heap=Math.max(resamplingHeapBound(g.fftSide,g.fftSide,'fft'),p.upsample?resamplingHeapBound(g.spatialSide,g.spatialSide,'pyrup'):0);
 // The core already reserves all resident heaps and retained/cached assets.
 // Here admit new heap growth, original-file grayscale decode (including codec
 // growth), full normalized gray, windows, transform copies, magnitude and the
 // defensive result/presentation copies. Caches also enter the shared budget.
 return Math.max(0,heap-resamplingHeapBytes())+bytes.byteLength*2+n*41+s*16+f*64+o*40+160*1024**2;
}
const stage=(hooks,low,high)=>({signal:hooks.signal,onProgress:f=>hooks.onProgress?.(low+(high-low)*f)});
export async function resamplingSpectrum(values,width,height,p,hooks={}){
 requireValue(values instanceof Float64Array&&values.length===width*height,'A complete binary64 field is required.');const geometry=resamplingFourierGeometry(width,height,p),{spatialSide:side,fftSide:size,spatialSquare:[left,top]}=geometry,source=new Float64Array(side*side);
 const hann=p.window==='hanning'?Float64Array.from({length:side},(_,i)=>.5+.5*Math.cos(Math.PI*(1-side+2*i)/(side-1))):null,weights=hann?null:radial(side,false);
 await rows(side,stage(hooks,0,.15),y=>{for(let x=0;x<side;x++){const value=values[(top+y)*width+left+x];requireValue(Number.isFinite(value),'Non-finite Fourier source.');source[y*side+x]=value*(hann?hann[y]*hann[x]:weights[y*side+x]);}});
 const input=p.upsample?await resamplingPyrUp(source,side,side,hooks):source;hooks.onProgress?.(.3);const raw=await resamplingFft2(input,size,size,hooks),shifted=new Float64Array(raw.length);hooks.onProgress?.(.8);
 await rows(size,stage(hooks,.8,1),y=>{for(let x=0;x<size;x++){const at=((y+size/2)%size*size+(x+size/2)%size)*2,to=(y*size+x)*2;shifted[to]=raw[at];shifted[to+1]=raw[at+1];}});return {values:shifted,geometry};
}
export async function resamplingMagnitude(spectrum,p,hooks={}){
 const geometry={...spectrum.geometry},size=geometry.fftSide,half=Math.floor(size/4),side=p.center?2*half:size,offset=p.center?size/2-half:0;requireValue(side>=2,'The Fourier region is too small to take its center.');geometry.outputSide=side;geometry.fftOffset=offset;
 const values=new Float64Array(side*side),weights=p.highpass==='radial'?radial(side,true):null,radius=Math.max(1,Math.trunc(.1*(side/2)));let low=Infinity,high=-Infinity;
 await rows(side,hooks,y=>{for(let x=0;x<side;x++){const at=((y+offset)*size+x+offset)*2,weight=weights?weights[y*side+x]:(Math.sqrt((x-side/2)**2+(y-side/2)**2)<=radius?0:1),value=Math.hypot(spectrum.values[at]*weight,spectrum.values[at+1]*weight);requireValue(Number.isFinite(value),'Non-finite Fourier magnitude.');values[y*side+x]=value;low=Math.min(low,value);high=Math.max(high,value);}});
 return {values,low,high,geometry};
}
export async function resamplingFourierData(image,p,hooks={},context){
 // Native normalization covers the complete decoded grayscale source before ROI.
 // This first adapter requires supported original image bytes; caller-only gray
 // fallback and probability-map sources are separate, currently unavailable paths.
 if(typeof context.codec.decodeGray!=='function')throw new EngineError('UNSUPPORTED_FORMAT','Fourier analysis requires qualified original-file grayscale decoding.');
 const metrics={fourierPreparationMs:0,fourierTransformMs:0,fourierMagnitudeMs:0};
 const prepare=async()=>{const start=performance.now(),decoded=await context.codec.decodeGray(context.bytes,{signal:hooks.signal});requireValue(decoded.width===image.width&&decoded.height===image.height,'Native grayscale dimensions differ.');let low=255,high=0;await rows(image.height,stage(hooks,0,.1),y=>{for(let x=0;x<image.width;x++){const value=decoded.data[y*image.width+x];low=Math.min(low,value);high=Math.max(high,value);}});const values=new Float64Array(decoded.data.length),span=high-low;await rows(image.height,stage(hooks,.1,.2),y=>{for(let x=0;x<image.width;x++){const i=y*image.width+x;values[i]=span?(decoded.data[i]-low)/span:0;}});metrics.fourierPreparationMs=performance.now()-start;return {values,low,high};};
 const gray=await(context.memoImage?context.memoImage('normalized-gray',prepare):prepare()),shape=resamplingFourierGeometry(image.width,image.height,p),key=JSON.stringify([shape.selected,p.window,p.upsample]);
 hooks.onProgress?.(.2);const transform=async()=>{const start=performance.now(),value=await resamplingSpectrum(gray.values,image.width,image.height,{...p,rect:shape.selected,center:false},stage(hooks,.2,.8));metrics.fourierTransformMs=performance.now()-start;return value;},spectrum=await(context.memo?context.memo('spectrum/'+key,transform):transform());
 hooks.onProgress?.(.8);const magnitude=async()=>{const start=performance.now(),value=await resamplingMagnitude(spectrum,p,stage(hooks,.8,1));metrics.fourierMagnitudeMs=performance.now()-start;return value;},base=await(context.memo?context.memo('magnitude/'+key+'/'+p.center+'/'+p.highpass,magnitude):magnitude());checkAbort(hooks.signal);
 return {data:{magnitude:base.values,minimumMagnitude:base.low,maximumMagnitude:base.high,geometry:base.geometry,grayNormalization:{minimum:gray.low,maximum:gray.high,scope:'whole decoded original grayscale image'}},engineMetrics:{...metrics,kernel:'resampling-numpy-fft-cpu',backend:'cpu',workers:1},semantics:'Fourier evidence from an explicitly selected source region. Numeric frequency-grid map and preview are not resampling probabilities or an authenticity decision. Probability-map EM is unavailable in this adapter.'};
}
export async function resamplingFourierView(result,p,hooks={},context,partialRows){
 const {magnitude,minimumMagnitude:low,maximumMagnitude:high,geometry}=result.data,side=geometry.outputSide;
 // Offline measurements include worker startup; below 1 MP it costs more than
 // useful work. No runtime probe or altered numerical parameters are involved.
 const parallel=magnitude.length>=1024**2?await context?.resamplingViewPool?.run(result.data,p,hooks):null;const values=parallel?.values??new Float64Array(magnitude.length),pixels=parallel?.pixels??new Uint8Array(magnitude.length*3);
 if(!parallel?.values)await rows(partialRows??side,hooks,y=>{for(let x=0;x<side;x++){const i=y*side+x,value=Math.pow(high>low?(magnitude[i]-low)/(high-low):0,p.gamma)*(p.rescale?high:1);values[i]=value;const gray=GRAY_PALETTE[Math.max(0,Math.min(255,Math.floor(value*256)))];pixels.fill(gray,i*3,i*3+3);}});
 result.data.values=values;result.pixels={width:side,height:side,format:'rgb8',data:pixels};result.layers=[{id:'fourier-spectrum',kind:'rgb',origin:[0,0],range:[0,255],coordinateSpace:'frequency-grid',semantics:'Gray LUT preview at fixed0–1 display range; source-region geometry is in data.geometry.'}];
 return parallel?.metrics??{fourierViewWorkers:1};
}
