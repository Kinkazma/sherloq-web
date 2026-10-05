import {samplePixels} from './unified-engine/src/display-sampling.js';
import {serializeEngineError} from './unified-engine/src/errors.js';
import {renderEnergy} from './energy-render.js';
import {createEngine} from './unified-engine/src/index.js';
import {resolveComputeProfile} from './resource-policy.js';
import {energyExportChunks} from './streaming-export.js';
let engine,lastEnergy=null,lastPixels=null,controller,displayRevision=0,queue=Promise.resolve(),consumerBudget=0;
const descriptors=new Map(),acks=new Map();
const cancelled=()=>Object.assign(Error('Cancelled'),{code:'CANCELLED'});
async function windowPixels(display,rect){
 if(display.kind==='result'){
  if(!lastPixels||display.revision!==displayRevision)throw Error('Stale result surface');
  const {x,y,width,height}=rect;
  if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<=0||height<=0||x+width>lastPixels.width||y+height>lastPixels.height)throw Error('Invalid result window');
  const data=new Uint8Array(width*height*3);for(let row=0;row<height;row++)data.set(lastPixels.data.subarray(((y+row)*lastPixels.width+x)*3,((y+row)*lastPixels.width+x+width)*3),row*width*3);
  return {width,height,format:'rgb8',data};
 }
 return (await engine.readPixels({surfaceId:display.id,revision:display.revision,rect},{signal:controller.signal})).pixels;
}
async function displayTile(display,tile){
 if(display.kind==='result'){
  if(!lastPixels||display.revision!==displayRevision)throw Error('Stale result surface');
  const frame=await samplePixels(lastPixels,tile,{signal:controller.signal});try{return frame.pixels;}finally{frame.release();}
 }
 return (await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile},{signal:controller.signal})).pixels;
}

function resultDisplay(pixels){lastPixels=pixels;return {kind:'result',id:'result',revision:++displayRevision,width:pixels.width,height:pixels.height,format:'rgb8'};}
async function energyView(presentation){
 const desc=descriptors.get(lastEnergy.imageId);
 // Rendering consumes source rows without an imagePixels full-raster copy.
 return renderEnergy(lastEnergy.data,{width:desc.width,height:desc.height,readPixels:rect=>windowPixels(desc.surface,rect)},presentation);
}
async function handle({id,action,payload,options}){
 try{
  if(!engine){
   const profile=resolveComputeProfile(options?.computeProfile||'aggressive',options?.resourceHints);
   consumerBudget=Math.min(Math.max(0,options?.uiRGBBudgetBytes||0),Math.floor(profile.memoryBudgetBytes/3));
   const budget=profile.memoryBudgetBytes-Math.max(0,options?.uiReserveBytes||0)-consumerBudget;
   if(budget<32*1024**2)throw Object.assign(Error('UI reservations leave insufficient engine memory'),{code:'UI_MEMORY_BUDGET'});
   engine=createEngine({...options,memoryBudgetBytes:budget,onTemporarySession:session=>self.postMessage({temporarySession:session})});
  }
  if(action==='capabilities'){self.postMessage({id,result:await engine.capabilities()});return;}
  controller=new AbortController();let result;
  if(action==='load'){
   result=await engine.loadBlob(payload,{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
   descriptors.set(payload.id,result);lastEnergy=null;lastPixels=null;displayRevision++;
  }else if(action==='read-display')result={pixels:await displayTile(payload.display,payload.tile)};
  else if(action==='read-window')result={pixels:await windowPixels(payload.display,payload.rect)};
  else if(action==='export-raster'){
   if(payload.display.kind==='result'&&(!lastPixels||payload.display.revision!==displayRevision))throw Object.assign(Error('Stale result surface'),{code:'INVALID_INPUT'});
   let descriptor;
   try{descriptor=payload.display.kind==='result'?await engine.exportPixelBuffer({pixels:lastPixels,...payload.options,storage:'temporary'},{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})}):await engine.exportSurface({surfaceId:payload.display.id,revision:payload.display.revision,...payload.options,storage:'temporary'},{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
    for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){const {bytes}=await engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},{signal:controller.signal});const sequence=offset/1024**2+1;await new Promise((resolve,reject)=>{acks.set(id,{sequence,resolve,reject});self.postMessage({id,chunk:bytes,sequence},[bytes.buffer]);});}
    result={descriptor};
   }finally{if(descriptor)await engine.releaseExport(descriptor.id);}
  }
else if(action==='export-energy'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw Error('Stale energy result');
   let part=0,bytes=0;
   for await(const chunk of energyExportChunks(lastEnergy,payload.format)){
    if(controller.signal.aborted)throw cancelled();const data=chunk.slice(),sequence=++part;
    await new Promise((resolve,reject)=>{acks.set(id,{sequence,resolve,reject});self.postMessage({id,chunk:data,sequence},[data.buffer]);});bytes+=chunk.length;
   }
   result={streamed:true,bytesWritten:bytes,mime:payload.format==='npz'?'application/zip':'application/json'};
  }else if(action==='view-energy'){
   if(!lastEnergy||payload.resultId!==lastEnergy.id)throw Error('Stale energy result');
   result={display:resultDisplay(await energyView(payload.presentation))};
  }else if(action==='run'){
   const {presentation,...task}=payload;lastPixels=null;
   const descriptor=descriptors.get(payload.imageId);
   const required=descriptor.width*descriptor.height*(payload.operation==='ela.energy'?40:3);
   if(required>consumerBudget)throw Object.assign(Error('Result and presentation buffers exceed currently available memory; this operation still requires resident result arrays'),{code:'RESULT_MEMORY_BUDGET'});
   lastEnergy=null;
   const output=await engine.run(task,{signal:controller.signal,onProgress:progress=>self.postMessage({id,progress})});
   if(payload.operation==='ela.energy'){
    lastEnergy=output;const display=resultDisplay(await energyView(presentation));
    const {data,pixels,...meta}=output;result={...meta,data:{metadata:data.metadata,regions:data.regions,regionColors:data.regionColors},display};
   }else {const {pixels,...meta}=output;result={...meta,display:resultDisplay(pixels)};}
  }else throw Error('Unknown worker action');
  self.postMessage({id,result},result?.pixels?.data?[result.pixels.data.buffer]:[]);
 }catch(error){self.postMessage({id,error:serializeEngineError(error)});}
 finally{acks.delete(id);}
}
self.onmessage=({data})=>{
 if(data.action==='export-ack'){const ack=acks.get(data.id);if(ack?.sequence===data.sequence){acks.delete(data.id);data.error?ack.reject(Error(data.error)):ack.resolve();}return;}
 if(data.action==='cancel'){controller?.abort();for(const ack of acks.values())ack.reject(cancelled());return;}
 // Pixel-window requests and calculations must not race the engine's BUSY guard.
 queue=queue.then(()=>handle(data));return queue;
};
