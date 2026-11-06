import "../../runtime-context.js?v=0.31.0";
import {createSelectedRgbRecompression,resolveSelectedPlan} from './recompression-probe.js';
import {usesAlternateRecompression} from './recompression-plan.js';
import {recompressionCodecWorkspace,recompressionCodecPlanningBytes} from './recompression-codec-client.js';
import {energyProbeKey} from './energy-pipeline.js';
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
 function pushBands(original,decoded,{y,rows},residual){return guarded(async()=>{
   requireValue(y===received&&Number.isInteger(rows)&&rows>0&&rows<=height-received&&original instanceof Uint8Array&&original.length===rows*width*3&&(residual||decoded instanceof Uint8Array&&decoded.length===original.length),'Consecutive matching full-width RGB bands required.');
   let last=performance.now();const vectorEnd=width-width%4;
   for(let local=0;local<rows;local++){
    if(residual)for(let x=0;x<width;x++){const i=(local*width+x)*3;gray[x]=energyGrayPixel(original[i],original[i+1],original[i+2],x>=vectorEnd);}
    else for(let x=0;x<width;x++){const i=(local*width+x)*3;gray[x]=energyGrayPixel(Math.abs(original[i]-decoded[i]),Math.abs(original[i+1]-decoded[i+1]),Math.abs(original[i+2]-decoded[i+2]),x>=vectorEnd);}
    const current=row(received);let total=0;for(let k=-3;k<=3;k++)total+=gray[reflect(k,width)];current[0]=total;
    for(let x=1;x<width;x++){total+=gray[reflect(x+3,width)]-gray[reflect(x-4,width)];current[x]=total;}
    received++;if(received>=4)await emit();
    if(performance.now()-last>=8){await controlCheckpoint(signal);last=performance.now();}
   }
  });}
 return {
  push(original,decoded,position){return pushBands(original,decoded,position,false);},
  pushResidual(residual,position){return pushBands(residual,null,position,true);},
  finish(){return guarded(async()=>{requireValue(received===height,'Incomplete energy source.');while(rendered<height)await emit();await flush();closed=true;release();});},
  dispose(){if(busy)throw new EngineError('BUSY','Energy row filter busy.');closed=true;gray=horizontal=sum=output=null;release();}
 };
}

export async function segmentedResidualEnergyPlane(surface,{budget,signal,onProgress,temporarySession,getTemporarySession}={}){
 const {width,height,format}=surface?.descriptor??{};
 requireValue(format==='rgb8'&&typeof surface.readWindow==='function','A complete native RGB8 residual surface is required.');
 let store,filter,ioWindow;
 try{
  store=await createSegmentedBytes(width*height*4,{budget,temporarySession,getTemporarySession,signal});ioWindow=store.pinIoWorkspace?.();
  filter=createEnergyRows(width,height,{budget,signal,write:(bytes,y)=>store.write(bytes,y*width*4)});
  for(let y=0;y<height;y+=32){checkAbort(signal);const rows=Math.min(32,height-y),part=await surface.readWindow({x:0,y,width,height:rows},{signal});
   try{await filter.pushResidual(part.pixels.data,{y,rows});}finally{await part.release();}
   onProgress?.({phase:'synthesis-energy-residual',completed:y+rows,total:height,fraction:(y+rows)/height});
  }
  await filter.finish();filter.dispose();filter=null;await store.flush();checkAbort(signal);
  return{width,height,format:'float32',layout:'row-major',store,dispose:()=>store.dispose(),metrics:{energyWorkspaceBytes:energyStreamBytes(width,height),energyBytes:store.byteLength,energyStorage:store.storage,recompressions:0,residualInput:'already-aggregated-synthesis-rgb8'}};
 }catch(error){await store?.dispose();throw error;}finally{filter?.dispose();await ioWindow?.release();}
}

// Single-quality primitive shared by the complete segmented scientific chain.
// Native panel references, statistics and regions are orchestrated separately.
export async function selectedEnergyCodec(image,params,budget){
 if(!usesAlternateRecompression(params)){image.rgbRecompression??=createRgbRecompression(image,budget);return image.rgbRecompression;}
 const key=energyProbeKey(params);if(image.selectedRecompression&&image.selectedRecompressionKey!==key){await image.selectedRecompression.dispose();image.selectedRecompression=null;}
 if(!image.selectedRecompression){image.selectedRecompression=createSelectedRgbRecompression(image,params,{budget,paletteAxis:'relative'});image.selectedRecompressionKey=key;}image.selectedRecompressionParams=params;return image.selectedRecompression;
}
export async function segmentedEnergyPlane(image,quality,{budget,signal,onProgress,params,selectedCodec}={}){
 const {width,height}=image.surface.descriptor,alternate=usesAlternateRecompression(params),resolved=alternate?await resolveSelectedPlan(params,image,{quality,signal,paletteAxis:'relative'}):null,plan=resolved?recompressionCodecWorkspace({width,height},resolved.stage):rgbRecompressionPlan(image.surface);let store,filter,planning,ioWindow;
 try{
  planning=budget.reserve((resolved?recompressionCodecPlanningBytes({width,height},resolved.stage,{budget,codecLane:selectedCodec?.codecLane??0}):plan.workingBytes)+(plan.windowAllowance??0)+energyStreamBytes(width,height));
  store=await createSegmentedBytes(width*height*4,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});ioWindow=store.pinIoWorkspace?.();planning();planning=null;
  filter=createEnergyRows(width,height,{budget,signal,write:(bytes,y)=>store.write(bytes,y*width*4)});
  const codec=selectedCodec??await selectedEnergyCodec(image,params,budget);
  const metrics=await codec.visit(quality,{signal,onProgress,onBand:(a,b,position)=>filter.push(a,b,position)});
  await filter.finish();filter.dispose();filter=null;await store.flush();checkAbort(signal);
  return {width,height,format:'float32',layout:'row-major',store,dispose:()=>store.dispose(),metrics:{...metrics,energyWorkspaceBytes:energyStreamBytes(width,height),energyBytes:store.byteLength,energyStorage:store.storage}};
 }catch(error){await store?.dispose();throw error;}finally{planning?.();filter?.dispose();await ioWindow?.release();}
}
