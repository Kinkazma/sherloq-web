import {cvPixels} from './opencv.js';
import {checkAbort,createCooperator} from './errors.js';
import {createComparisonGpu,comparisonGpuMayFallback} from './comparison-gpu.js';

const names=['brightness','saturation','hue','gamma','shadows','highlights','sweep','width','sharpen','threshold','equalize','invert'];
const native=(image,p,hooks)=>cvPixels(image,4,names.map(k=>Number(p[k])),hooks);
const identity={brightness:0,saturation:0,hue:0,gamma:10,shadows:0,highlights:0,sweep:127,width:255,sharpen:0,threshold:255,equalize:0,invert:false};
const observations=new WeakMap();
function stateFor(budget,image){let images=observations.get(budget);if(!images){images=new WeakMap();observations.set(budget,images);}let state=images.get(image);if(!state){state={cpu:[],webgpu:[],unavailable:false};images.set(image,state);}return state;}
export function chooseAdjustDisplayBackend(state,pixels,requested,gpuAvailable){
 if(requested==='cpu'||!gpuAvailable||state.unavailable)return'cpu';if(requested==='webgpu')return'webgpu';
 if(pixels<262144)return'cpu';
 // The two observations, when needed, are actual requested display frames.
 // They never duplicate a calculation, invent input, or replace a source.
 if(state.cpu.length<2)return'cpu';if(!state.webgpu.length)return Math.min(...state.cpu)>2?'webgpu':'cpu';
 return Math.min(...state.webgpu)<Math.min(...state.cpu)?'webgpu':'cpu';
}
export async function applyAdjustDisplayLut(image,lut,{signal}={},context={}){
 const {budget,backend='auto'}=context,state=budget?stateFor(budget,context.adjustDisplayOwner??image):null,selected=state?chooseAdjustDisplayBackend(state,image.width*image.height,backend,!!globalThis.navigator?.gpu):'cpu',started=performance.now(),data=new Uint8Array(image.data.length),cooperate=createCooperator(signal);let gpu,fallback=null,batches=0,used=selected;
 try{
  if(selected==='webgpu')try{
   gpu=await createComparisonGpu({budget});
   for(let at=0;at<data.length;at+=262144*3){checkAbort(signal);const output=await gpu.run(3,image.data.subarray(at,Math.min(data.length,at+262144*3)),null,{signal,lut});try{data.set(output.data,at);batches++;}finally{output.release();}}
  }catch(error){checkAbort(signal);if(!comparisonGpuMayFallback(error))throw error;fallback=error.code;used='cpu';if(state)state.unavailable=['GPU_UNAVAILABLE','GPU_FAILED'].includes(error.code);}
  if(used==='cpu')for(let at=0;at<data.length;at+=262144*3){await cooperate();const end=Math.min(data.length,at+262144*3);for(let i=at;i<end;i+=3){data[i]=lut[image.data[i]];data[i+1]=lut[256+image.data[i+1]];data[i+2]=lut[512+image.data[i+2]];}}
  checkAbort(signal);
 }finally{await gpu?.dispose();}
 const milliseconds=performance.now()-started;if(state&&!fallback){state[used].push(milliseconds);if(state[used].length>4)state[used].shift();}
 return{pixels:{...image,data},metrics:{backend:used,kernel:'native-adjustment-prefix-and-exact-display-LUT',finishMs:milliseconds,gpuBatches:batches,gpuFallback:fallback,displayBackendObservations:state?{cpu:[...state.cpu],webgpu:[...state.webgpu]}:null}};
}
export async function contiguousAdjust(image,p,hooks={},context={}){
 if(context.cpuKernel==='reference'||typeof context.memo!=='function')return{pixels:await native(image,p,hooks),semantics:'Native adjustment order and arithmetic; original unchanged.'};
 const started=performance.now(),displayState=context.budget?stateFor(context.budget,image):null,prefix={...p,threshold:255,invert:false},pure=!p.brightness&&!p.saturation&&!p.hue&&Math.floor(p.sharpen/4)===0&&!p.equalize;let prefixHit=true,source=image,lut,localMs=0;
 const compute=async()=>{prefixHit=false;return native(image,prefix,hooks);};
 // For a purely pointwise CPU frame OpenCV's SIMD LUT is faster than a
 // JavaScript byte walk. Keep that exact qualified kernel, including Otsu.
 if(pure&&(p.threshold===0||!displayState||chooseAdjustDisplayBackend(displayState,image.width*image.height,context.backend??'auto',!!globalThis.navigator?.gpu)==='cpu')){
  const pixels=await native(image,p,hooks),milliseconds=performance.now()-started;if(displayState){displayState.cpu.push(milliseconds);if(displayState.cpu.length>4)displayState.cpu.shift();}
  return{pixels,semantics:'Native SIMD pointwise adjustment; original unchanged.',engineMetrics:{backend:'cpu',kernel:'native-pointwise-adjustment',analysisCacheHit:false,localMs:milliseconds,finishMs:0,gpuBatches:0}};
 }
 if(pure){
  const key=JSON.stringify([p.gamma,p.shadows,p.highlights,p.width===255?0:p.sweep,p.width]);
  lut=await context.memo('adjustment-lut/'+key,async()=>{prefixHit=false;const data=Uint8Array.from({length:768},(_,i)=>Math.floor(i/3)),result=await native({width:256,height:1,format:'rgb8',data},prefix,hooks),table=new Uint8Array(768);for(let v=0;v<256;v++)for(let c=0;c<3;c++)table[c*256+v]=result.data[v*3+c];return table;});
 }else source=await context.memo('adjustment-prefix/'+JSON.stringify(names.slice(0,9).map(k=>prefix[k]).concat(prefix.equalize)),compute);
 localMs=performance.now()-started;checkAbort(hooks.signal);
 // Otsu retains the native histogram reduction and tie order. The expensive
 // sharpen/HSV/global equalization prefix is reused, not recomputed.
 if(p.threshold===0){let hit=true;const pixels=await context.memo('adjustment-otsu/'+JSON.stringify(names.slice(0,9).map(k=>prefix[k]).concat(prefix.equalize)),async()=>{hit=false;const values=pure?await applyAdjustDisplayLut(image,lut,hooks,{...context,backend:'cpu'}):{pixels:source};return native(values.pixels,{...identity,threshold:0},hooks);});if(!p.invert)return{pixels,semantics:'Native adjustment prefix and native Otsu; original unchanged.',engineMetrics:{backend:'cpu',kernel:'retained-native-adjustment-prefix',analysisCacheHit:prefixHit,otsuCacheHit:hit,localMs,finishMs:performance.now()-started-localMs}};source=pixels;lut=null;}
 if(!pure&&!p.invert&&p.threshold===255)return{pixels:source,semantics:'Native adjustment prefix; original unchanged.',engineMetrics:{backend:'cpu',kernel:'retained-native-adjustment-prefix',analysisCacheHit:prefixHit,localMs,finishMs:0}};
 const table=lut?lut.slice():Uint8Array.from({length:768},(_,i)=>i%256);
 for(let i=0;i<table.length;i++){let value=table[i];if(p.threshold>0&&p.threshold<255)value=value>p.threshold?255:0;table[i]=p.invert?255-value:value;}
 const result=await applyAdjustDisplayLut(source,table,hooks,{...context,adjustDisplayOwner:image});return{pixels:result.pixels,semantics:'Native adjustment prefix and exact byte lookup; original unchanged.',engineMetrics:{...result.metrics,analysisCacheHit:prefixHit,localMs}};
}
