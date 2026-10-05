import {energyGrayPixel} from './energy-primitives.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbRecompression,rgbRecompressionPlan} from './jpeg-rgb-stream.js';

const reflect=(i,n)=>{if(n===1)return 0;while(i<0||i>=n)i=i<0?-i:2*n-i-2;return i;};
export function energyStreamBytes(width,height){return width*(68+4*Math.min(32,height));}

// Preserve global column recurrence across every delivery band. Restarting a box
// filter at stripe boundaries would change native floating-point accumulation.
export function createEnergyRows(width,height,{budget,write,signal}={}){
 requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&Number.isSafeInteger(width*height)&&typeof write==='function','Energy dimensions and awaited row consumer required.');
 const release=budget.reserve(energyStreamBytes(width,height));let gray,horizontal,sum,output;
 try{gray=new Float32Array(width);horizontal=new Float64Array(width*7);sum=new Float64Array(width);output=new Float32Array(width*Math.min(32,height));}catch(error){release();throw error;}
 let received=0,rendered=0,buffered=0,closed=false,busy=false,initialized=false,failed=false;
 const row=i=>horizontal.subarray((reflect(i,height)%7)*width,(reflect(i,height)%7+1)*width);
 async function flush(){if(!buffered)return;checkAbort(signal);await write(new Uint8Array(output.buffer,0,buffered*width*4),rendered-buffered,buffered);checkAbort(signal);buffered=0;}
 async function emit(){
  if(!initialized){for(let k=-3;k<3;k++){const part=row(k);for(let x=0;x<width;x++)sum[x]+=part[x];}initialized=true;}
  const entering=row(rendered+3),leaving=row(rendered-3),offset=buffered*width;
  for(let x=0;x<width;x++){const current=sum[x]+entering[x];output[offset+x]=current*(1/49);sum[x]=current-leaving[x];}
  rendered++;buffered++;if(buffered===output.length/width)await flush();
 }
 async function guarded(fn){if(busy)throw new EngineError('BUSY','Energy row filter busy.');requireValue(!closed&&!failed,'Energy row filter is closed or failed.');busy=true;try{checkAbort(signal);return await fn();}catch(error){failed=true;throw error;}finally{busy=false;}}
 return {
  push(original,decoded,{y,rows}){return guarded(async()=>{
   requireValue(y===received&&Number.isInteger(rows)&&rows>0&&rows<=height-received&&original instanceof Uint8Array&&decoded instanceof Uint8Array&&original.length===rows*width*3&&decoded.length===original.length,'Consecutive matching full-width RGB bands required.');
   let last=performance.now();const vectorEnd=width-width%4;
   for(let local=0;local<rows;local++){
    for(let x=0;x<width;x++){const i=(local*width+x)*3;gray[x]=energyGrayPixel(Math.abs(original[i]-decoded[i]),Math.abs(original[i+1]-decoded[i+1]),Math.abs(original[i+2]-decoded[i+2]),x>=vectorEnd);}
    const current=row(received);let total=0;for(let k=-3;k<=3;k++)total+=gray[reflect(k,width)];current[0]=total;
    for(let x=1;x<width;x++){total+=gray[reflect(x+3,width)]-gray[reflect(x-4,width)];current[x]=total;}
    received++;if(received>=4)await emit();
    if(performance.now()-last>=8){await controlCheckpoint(signal);last=performance.now();}
   }
  });},
  finish(){return guarded(async()=>{requireValue(received===height,'Incomplete energy source.');while(rendered<height)await emit();await flush();closed=true;release();});},
  dispose(){if(busy)throw new EngineError('BUSY','Energy row filter busy.');closed=true;gray=horizontal=sum=output=null;release();}
 };
}

// Single-quality primitive shared by the complete segmented scientific chain.
// Native panel references, statistics and regions are orchestrated separately.
export async function segmentedEnergyPlane(image,quality,{budget,signal,onProgress}={}){
 const {width,height}=image.surface.descriptor,plan=rgbRecompressionPlan(image.surface);let store,filter,planning,ioWindow;
 try{
  planning=budget.reserve(plan.workingBytes+plan.windowAllowance+energyStreamBytes(width,height));
  store=await createSegmentedBytes(width*height*4,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});ioWindow=store.pinIoWorkspace?.();planning();planning=null;
  filter=createEnergyRows(width,height,{budget,signal,write:(bytes,y)=>store.write(bytes,y*width*4)});
  image.rgbRecompression??=createRgbRecompression(image,budget);
  const metrics=await image.rgbRecompression.visit(quality,{signal,onProgress,onBand:(a,b,position)=>filter.push(a,b,position)});
  await filter.finish();filter.dispose();filter=null;await store.flush();checkAbort(signal);
  return {width,height,format:'float32',layout:'row-major',store,dispose:()=>store.dispose(),metrics:{...metrics,energyWorkspaceBytes:energyStreamBytes(width,height),energyBytes:store.byteLength,energyStorage:store.storage}};
 }catch(error){await store?.dispose();throw error;}finally{planning?.();filter?.dispose();await ioWindow?.release();}
}
