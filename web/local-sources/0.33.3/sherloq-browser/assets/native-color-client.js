import {removeTerminatedTemporarySession} from './unified-engine/src/temporary-storage.js';
import {EngineError,requireValue,checkAbort,deserializeEngineError} from './unified-engine/src/errors.js';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';
import {Budget} from './unified-engine/src/cache.js';
import {createBlobSource} from './unified-engine/src/blob-source.js';
import {inspectTiffSource} from './unified-engine/src/tiff-header-source.js';
import {displayGeometry} from './unified-engine/src/display-sampling.js';

const MiB=1024**2,CONSUMER_BYTES=48*MiB;
// The grant includes the transferred native CMYK16 window, exact 16-bit bins,
// cumulative/snapshot arrays and local/global presentations outside the child's
// own Budget. Original's loan survives until worker AND storage close ACKs.
async function createLegacyNativeColorClient({blob,sourceSha256,width,height,parentBudgetSource,signal,onProgress=()=>{},consumerBytes=CONSUMER_BYTES,workspaceFactory,workerFactory=(url,options)=>new Worker(url,options),removeTemporarySession=removeTerminatedTemporarySession}={}){
 requireValue(blob instanceof Blob&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(width*height),'A native Original Blob and grid are required.');
 requireValue(parentBudgetSource&&typeof parentBudgetSource.getClient==='function','Native colour inspection needs the real Original resource owner.');
 const parent=parentBudgetSource,current=()=>parent.file===blob&&parent.hash===sourceSha256&&parent.source?.width===width&&parent.source?.height===height&&parent.isCurrent?.()!==false;
 const assertCurrent=()=>{checkAbort(signal);if(!current())throw new EngineError('CANCELLED','The Original colour source changed.');};
 let worker,grant,serial=0,closing=false,closed=false,retiredWorker=false,workerTermination,disposal,fatalError,temporarySessionId,readTail=Promise.resolve();const pending=new Map(),sessions=new Map();
 const message=action=>new EngineError('CANCELLED','Native colour '+action+' was cancelled.');
 function failAll(error){for(const entry of pending.values())entry.reject(error);pending.clear();}
 function request(action,payload){
  if(fatalError)return Promise.reject(fatalError);if(!worker||closed||closing&&action!=='dispose')return Promise.reject(message(action));
  const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{worker.postMessage({id,action,payload});}catch(error){pending.delete(id);reject(error);}});
 }
 function abort(){if(closed)return;closing=true;try{worker?.postMessage({action:'cancel'});}catch{}void dispose().catch(()=>{});}
 async function terminateWorker(){if(retiredWorker)return;if(!workerTermination)workerTermination=Promise.resolve(worker?.terminate()).then(()=>{retiredWorker=true;});return workerTermination;}
 async function dispose(){
  if(closed)return;if(disposal)return disposal;closing=true;
  return disposal=(async()=>{
   if(worker&&!retiredWorker){if(!fatalError){worker.postMessage({action:'cancel'});const ack=await request('dispose');if(ack?.disposed!==true)throw new EngineError('BUSY','Native colour retirement was not acknowledged.');sessions.clear();}await terminateWorker();}
   for(const [id,backend]of sessions){if(backend)await removeTemporarySession(id,backend);else{if(typeof navigator!=='undefined'&&typeof navigator.storage?.getDirectory==='function')await removeTemporarySession(id,'opfs');if(typeof indexedDB!=='undefined')await removeTemporarySession(id,'indexeddb');}sessions.delete(id);}
   if(grant){const ack=await grant.release();if(ack===false||ack===0)throw new EngineError('BUSY','Original native-colour credit retirement was not acknowledged.');grant=null;}
   closed=true;signal?.removeEventListener('abort',abort);failAll(message('reader'));worker=null;
  })().finally(()=>{disposal=null;});
 }
 try{
  assertCurrent();const signature=new Uint8Array(await blob.slice(0,4).arrayBuffer());assertCurrent();
  const tiff=signature[0]===73&&signature[1]===73||signature[0]===77&&signature[1]===77,jpeg=signature[0]===255&&signature[1]===216;
  if(!tiff&&!jpeg)throw new EngineError('NATIVE_COLOR_UNSUPPORTED','This source has no qualified native colour-window reader.');
  const preferred=Math.max(128*MiB,4*width*height+96*MiB),choices=(tiff?[32*MiB]:[preferred,...[256*MiB,192*MiB,128*MiB].filter(value=>value<preferred)]).filter((value,index,array)=>array.indexOf(value)===index).sort((a,b)=>b-a).map(engineBytes=>({engineBytes,totalBytes:engineBytes+consumerBytes}));
  requireValue(choices.every(choice=>Number.isSafeInteger(choice.totalBytes)),'Native colour grant exceeds the safe integer range.');
  const owner=await parent.getClient();assertCurrent();grant=await (workspaceFactory?workspaceFactory({imageId:parent.imageId,sourceSha256,width,height,choices}):owner.reserveNativeWorkspace({imageId:parent.imageId,sourceSha256,width,height,choices}));assertCurrent();
  requireValue(grant&&Number.isSafeInteger(grant.engineBytes)&&grant.engineBytes>0&&typeof grant.release==='function'&&choices.some(choice=>choice.engineBytes===grant.engineBytes&&choice.totalBytes===grant.bytes),'Original did not return a matching native colour grant.');
  temporarySessionId='native-color-'+crypto.randomUUID();worker=workerFactory(new URL('./native-color-worker.js?v=0.33.3',import.meta.url),{type:'module'});sessions.set(temporarySessionId,null);
  worker.onmessage=({data})=>{
   if(closed||retiredWorker)return;
   if(data?.temporarySession){const item=data.temporarySession;if(typeof item.id==='string'&&typeof item.backend==='string')sessions.set(item.id,item.backend);return;}
   const entry=pending.get(data?.id);if(!entry)return;if(data.progress){try{onProgress(data.progress);}catch{}return;}pending.delete(data.id);data.error?entry.reject(deserializeEngineError(data.error)):entry.resolve(data.result);
  };
  const fatal=event=>{if(closed||fatalError)return;fatalError=new EngineError('WORKER_FAILED',event?.message||'Native colour worker failed.');failAll(fatalError);void dispose().catch(()=>{});};worker.onerror=fatal;worker.onmessageerror=fatal;
  signal?.addEventListener('abort',abort,{once:true});assertCurrent();
  const loaded=await request('load',{blob,sourceSha256,width,height,memoryBudgetBytes:grant.engineBytes,temporarySessionId});assertCurrent();
  const capability=loaded?.capability;requireValue(capability&&capability.width===width&&capability.height===height&&capability.sourceSha256===sourceSha256,'Native colour capabilities differ from Original.');
  const readFrame=(region,sampled=false)=>{const grid=sampled?displayGeometry(capability,region):region;const task=readTail.then(async()=>{assertCurrent();if(closing)throw message('read');const answer=await request(sampled?'read-sampled':'read',sampled?{tile:region}:{rect:region});assertCurrent();if(closing)throw message('read');const pixels=answer?.pixels;requireValue(pixels&&['cmyk8','cmyk16','rgb8','rgb16','gray8','gray16'].includes(pixels.format)&&pixels.width===grid.width&&pixels.height===grid.height&&pixels.channels===capability.channels.length&&pixels.depth===capability.depth&&(pixels.depth===16?pixels.data instanceof Uint16Array:pixels.data instanceof Uint8Array)&&pixels.data.length===grid.width*grid.height*pixels.channels,'Native colour transport returned another sample grid.');if(sampled)requireValue(pixels.origin?.x===region.x&&pixels.origin?.y===region.y&&pixels.samplingStep===region.step&&pixels.logicalRect?.x===region.x&&pixels.logicalRect?.y===region.y&&pixels.logicalRect?.width===region.w&&pixels.logicalRect?.height===region.h,'Native sampled transport returned another logical grid.');return pixels;});readTail=task.catch(()=>{});return task;};
  return{capability,metrics:loaded.metrics??null,readPixels:readFrame,readSampledPixels:tile=>readFrame(tile,true),dispose};
 }catch(error){try{await dispose();}catch(cleanup){throw withRetirementOwner(error,{dispose},cleanup);}throw error;}
}


// This adapter owns leases, not another engine or a copy of the source pixels.
// The histogram consumer must drop/return every leased frame before release.
export async function createNativeColorClient(options={}){
 const rawSensor=options.rawSensor===true,representation=options.rawRepresentation??null;if(options.originalChannels!==true&&!rawSensor&&!representation)return createLegacyNativeColorClient(options);
 const {blob,sourceSha256,width,height,parentBudgetSource:parent,signal,onInvalidate=()=>{},beforeRetire=()=>{}}=options;
 requireValue(blob instanceof Blob&&parent?.getClient,'A captured Original is required.');
 let control,legacy,capability,closed=false,disposal;
 const frames=new Map(),viewCapabilities=new Map();
 const current=()=>!closed&&!control?.unavailable&&!signal?.aborted&&parent.file===blob&&parent.hash===sourceSha256&&parent.isCurrent?.()!==false;
 const check=()=>{checkAbort(signal);if(!current())throw new EngineError('CANCELLED','The native colour Original changed.');};
 function developedCapability(d,view){const depth=view==='rgb16'?16:8,sampleType=depth===16?'uint16':'uint8';
  requireValue(d?.domain==='decoded'&&d.format==='native-samples'&&d.sampleType===sampleType&&d.containerBits===depth&&d.channels===3&&d.width===width&&d.height===height&&d.sampleModel===(depth===16?'raw-developed-rgb':'raw-developed-sdr-rgb')&&d.sampleSemantics?.developmentApplied===true&&d.sampleSemantics.qualityRequested===representation.quality&&d.sampleSemantics.view===view&&d.sampleSemantics.originalBanksUnchanged===true,'RAW development differs from the selected actual recipe.');
  return Object.freeze({space:'RGB',depth,sampleType,channels:Object.freeze(['R','G','B']),width,height,sourceSha256,sourceId:d.id,sourceRevision:d.revision,sampleRole:'developed',codedDepth:d.sourceDepth,codedSampleType:'unknown',sourceRepresentation:Object.freeze({...representation,view}),semantics:d.sampleSemantics,color:d.color});
 }
 async function readFrame(rect,view=representation?.view,sampled=false){
   check();if(legacy)return sampled?legacy.readSampledPixels(rect):legacy.readPixels(rect);const frameCapability=view?viewCapabilities.get(view):capability;
   requireValue(frameCapability,'The captured RAW view is not prepared.');
   const grid=sampled?displayGeometry(frameCapability,rect):rect;
   let wire,pixels;
   try{wire=await(sampled?(view&&view!==representation?.view?control.readSampledSibling(view,rect):control.readSampled(rect)):(view&&view!==representation?.view?control.readSibling(view,rect):control.read(rect)));check();if(view&&!control.isViewCurrent(view))throw new EngineError('CANCELLED','The RAW view is retiring.');
    const capability=frameCapability;
    requireValue(wire.domain===(rawSensor?'sensor':'decoded')&&wire.frame===0&&['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'].every(key=>wire.bindingOriginal?.[key]===control.binding[key])&&wire.sampleType===((rawSensor||representation)?capability.sampleType:'uint16')&&wire.containerBits===capability.depth&&wire.channels===capability.channels.length
     &&wire.sourceDepth===capability.codedDepth&&wire.sourceId===capability.sourceId&&wire.revision===capability.sourceRevision&&wire.width===grid.width&&wire.height===grid.height
     &&wire.origin?.[0]===rect.x&&wire.origin?.[1]===rect.y&&wire.samples instanceof(capability.sampleType==='float32'?Float32Array:capability.depth===8?Uint8Array:Uint16Array)
     &&wire.samples.length===grid.width*grid.height*wire.channels,'Native colour window differs from its captured representation.');
    if(sampled)requireValue(wire.samplingStep===rect.step&&wire.logicalRect?.x===rect.x&&wire.logicalRect?.y===rect.y&&wire.logicalRect?.width===rect.w&&wire.logicalRect?.height===rect.h,'Native sampled window differs from its logical grid.');
    pixels={width:grid.width,height:grid.height,format:capability.space.toLowerCase()+capability.depth,space:capability.space,channels:wire.channels,depth:capability.depth,data:wire.samples,originalColorWindowId:wire.windowLeaseId,...(view?{rawDevelopmentView:view}:{}),...(rawSensor?{sampleType:capability.sampleType,sensor:capability.sensor,origin:{x:rect.x,y:rect.y}}:{}),...(sampled?{sampleType:capability.sampleType??(capability.depth===16?'uint16':'uint8'),origin:{x:rect.x,y:rect.y},samplingStep:rect.step,logicalRect:{...wire.logicalRect}}:{})};
    frames.set(wire.windowLeaseId,new Set([pixels]));return pixels;
   }catch(primary){if(wire){if(pixels)pixels.data=null;try{await control.retireWindow(wire.windowLeaseId);}catch(cleanup){throw withRetirementOwner(primary,reader,cleanup);}}throw primary;}
 }
 const reader={
  get capability(){return capability;},get metrics(){return legacy?.metrics??null;},get leasedWindows(){return !legacy;},get displayDescriptor(){return(control?.sourceDescriptorFor?.('sdr8')??control?.sourceDescriptor)?.displaySurface??null;},
  async prepareSibling(view){check();requireValue(representation&&['rgb16','sdr8'].includes(view),'A RAW sibling view is required.');const receipt=await control.prepareSibling(view);check();const c=developedCapability(receipt.descriptor,view);viewCapabilities.set(view,c);return c;},
  capabilityFor(view){return viewCapabilities.get(view)??null;},
  async readDisplay(tile){check();const answer=await control.readDisplay(tile);check();return answer.pixels;},
  async readRenderedPixels(rect){check();const answer=await control.readRenderedPixels(rect);check();const p=answer?.pixels??answer;requireValue(p?.format==='rgb8'&&p.data instanceof Uint8Array&&p.width===rect.width&&p.height===rect.height&&p.data.length===rect.width*rect.height*3,'The captured SDR rendered window differs from its grid.');return p;},
  readPixels:readFrame,readSibling:(view,rect)=>readFrame(rect,view),readSampledPixels:tile=>readFrame(tile,representation?.view,true),readSampledSibling:(view,tile)=>readFrame(tile,view,true),
  async releaseSibling(view){requireValue(representation&&['rgb16','sdr8'].includes(view),'A RAW sibling view is required.');try{await control.releaseSibling(view,()=>{for(const[id,holders]of frames)if([...holders].some(p=>p.rawDevelopmentView===view)){for(const p of holders)p.data=null;frames.delete(id);}return true;});viewCapabilities.delete(view);}catch(primary){throw withRetirementOwner(primary,reader,primary);}},
  adoptReturnedPixels(pixels){const framesForId=frames.get(pixels?.originalColorWindowId);if(!framesForId)throw new EngineError('SOURCE_CHANGED','Returned native pixels have no captured window owner.');framesForId.add(pixels);return pixels;},
  async releasePixels(pixels){const id=pixels?.originalColorWindowId;if(!id)return;const held=frames.get(id);if(!held)return;
   // Detached old holders and the returned holder all lose their data before
   // the exact captured SourceSamples receipt can be acknowledged.
   held.add(pixels);for(const value of held)value.data=null;
   if(control.unavailable)return{deferred:true};try{await control.retireWindow(id);frames.delete(id);return{retired:true};}catch(primary){throw withRetirementOwner(primary,reader,primary);}
  },
  dispose(){if(closed)return Promise.resolve();if(disposal)return disposal;const task=(async()=>{await control?.dispose();closed=true;})().catch(primary=>{throw withRetirementOwner(primary,reader,primary);});disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;},
 };
 try{
  const client=await parent.getClient();check();requireValue(typeof client[rawSensor?'openRawSensorSamples':'openOriginalColorChannels']==='function','The Original has no captured native-channel consumer.');
  control=await client[rawSensor?'openRawSensorSamples':'openOriginalColorChannels']({imageId:parent.imageId,sourceSha256,width,height},{signal,
   onOwner(value){control=value;},...(representation?{representation}:{}),
   onInvalidate(event){return onInvalidate(event);},
   async beforeRetire(event){const ack=await beforeRetire(event);if(ack===false||ack===0)throw new EngineError('BUSY','Native colour consumer references remain live.');if(legacy){await legacy.dispose();legacy=null;}for(const holders of frames.values())for(const pixels of holders)pixels.data=null;frames.clear();return true;},
  });check();
  // Preserve the existing strip-seek worker. Metadata parsing and its retained
  // directories are funded inside the already captured 48 MiB UI envelope.
  // Header metadata uses at most 32 MiB of this same captured 48 MiB
  // envelope; the remaining 16 MiB covers existing UI/aggregate workspaces.
  // This is not a child-engine grant. A seek Worker, if admitted, gets its
  // own actual 32 MiB credit below and closes before that credit is retired.
  let seek=false;
  if(!rawSensor&&!representation){const budget=new Budget(CONSUMER_BYTES-16*MiB),source=createBlobSource(blob,{budget}),credits=[];
  try{let inspected=await inspectTiffSource(source,{signal,account:bytes=>{const release=budget.reserve(bytes);credits.push(release);return()=>{};}});check();
   const h=inspected.header;seek=(h.compression??1)===1&&!h.tileWidth&&!h.tileHeight;
   inspected=null;
  }catch(error){if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;}
  finally{source.dispose();for(const release of credits)release();requireValue(budget.total()===0,'Native TIFF inspection credits are still owned.');}}
  if(seek){
   try{legacy=await createLegacyNativeColorClient({...options,consumerBytes:0,workspaceFactory:()=>control.reserveSeekWorkspace(32*MiB)});check();capability=legacy.capability;return reader;}
   catch(error){if(error?.cleanupOwner){legacy=error.cleanupOwner;throw error;}if(error?.code!=='NATIVE_COLOR_UNSUPPORTED')throw error;await control.releaseSeekWorkspace();}
  }
  const receipt=await control.prepare();check();const d=receipt.descriptor,model=d?.sampleModel;
  if(rawSensor){
   const sensor=d?.sampleSemantics?.sensor;
   requireValue(receipt.domain==='sensor'&&d?.domain==='sensor'&&d.format==='native-samples'&&d.orientation===1&&model==='raw-decoded-sensor'&&['uint16','float32'].includes(d.sampleType)&&d.containerBits===(d.sampleType==='float32'?32:16)&&[1,3,4].includes(d.channels)&&sensor?.schema==='sherloq.raw-sensor-facts/1'&&sensor.width===d.width&&sensor.height===d.height&&sensor.channels===d.channels&&sensor.sampleType===d.sampleType&&d.sampleSemantics?.developmentApplied===false,'Preserved RAW sensor representation differs from its factual grid.');
   capability=Object.freeze({space:'SENSOR',depth:d.containerBits,channels:Object.freeze([...d.channelMap]),width:d.width,height:d.height,sourceSha256,sourceId:d.id,sourceRevision:d.revision,sampleRole:'sensor',codedDepth:d.sourceDepth,codedSampleType:d.sampleType==='float32'?'float32':'unsigned-integer',sampleType:d.sampleType,sensor,semantics:d.sampleSemantics,color:d.color,decoder:'captured-original-raw-sensor/1'});
   return reader;
  }
  if(representation){capability=developedCapability(d,representation.view);viewCapabilities.set(representation.view,capability);return reader;}
  const space=model==='decoded-cmyk-samples'?'CMYK':model==='decoded-gray-samples'?'GRAY':null;
  requireValue(d?.domain==='decoded'&&d.format==='native-samples'&&space&&d.sampleType==='uint16'&&d.containerBits===16
   &&d.width===width&&d.height===height&&d.channels===(space==='CMYK'?4:1)
   &&d.sampleSemantics?.representation?.kind==='original-color-channels'&&d.sampleSemantics.colorConversionApplied===false,
   'Original native colour representation has another type, channel model or grid.');
  capability=Object.freeze({space,depth:16,channels:Object.freeze(space==='CMYK'?['C','M','Y','K']:['Gray']),width,height,sourceSha256,
   sourceId:d.id,sourceRevision:d.revision,sampleRole:'decoded',codedDepth:d.sourceDepth,codedSampleType:'unsigned-integer',iccApplied:false,
   originalChannels:true,sourceChannelMap:d.channelMap,semantics:d.sampleSemantics,sourceRepresentation:d.sampleSemantics.representation,color:d.color,
   decoder:'captured-original-color-channels/1',storedBitPatternClaimed:d.sampleSemantics.storedBitPatternClaimed===true});
  return reader;
 }catch(primary){try{await reader.dispose();}catch(cleanup){throw withRetirementOwner(primary,reader,cleanup);}throw primary;}
}
