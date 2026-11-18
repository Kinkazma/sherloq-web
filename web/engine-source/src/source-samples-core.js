import{createPrepareProviderRawDemosaic}from'./prepare-provider-raw-demosaic.js';
import{createPrepareProviderSensor}from'./prepare-provider-sensor.js';
import{createPrepareProviderNativeColor}from'./prepare-provider-native-color.js';
// Registry of the same Original-owned source samples service.
import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {createSourceSamplesService} from './source-samples-service.js';
import {createBorrowedSourceSamples} from './borrowed-source-samples.js';
const keys=['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'];
const same=(a,b)=>!!a&&!!b&&keys.every(key=>a[key]===b[key]);
export function createOriginalSamplesRegistry({budget,execution,getRecord,sourceSamplesControlFactory,sourceDisplayFactory}={}){
 requireValue(budget?.reserve&&typeof getRecord==='function','Original registry requires its Core owner.');
 const rows=new WeakMap(),live=new Set(),leases=new Map();let transport;
 const binding=(id,record)=>({imageId:id,sourceSurfaceId:record.surface?.descriptor.id,sourceRevision:record.surface?.descriptor.revision,sourceSha256:record.sha256,kind:'encoded'});
 const selectedSurface=record=>record.nativeSurface&&record.sourcePrecision?.defaultWorkingDepth===16?record.nativeSurface:record.surface;
 const isCurrent=row=>row.pendingOwner?row.pendingOwner.matchesFixed(row.binding):getRecord(row.id)===row.record&&same(binding(row.id,row.record),row.binding)
  &&selectedSurface(row.record)===row.surface&&row.record.sourcePrecision===row.precision
  &&row.surface.descriptor.id===row.surfaceId&&row.surface.descriptor.revision===row.surfaceRevision;
 const changed=()=>new EngineError('SOURCE_CHANGED','The captured Original sample view changed.');
 const publishedWindows=row=>row.service?.state.windows.some(window=>['posted','delivered-local','transport-uncertain'].includes(window.state))??false;
 const notify=row=>{if(!publishedWindows(row))for(const resolve of row.waiters.splice(0))resolve();};
 const receipt=request=>{const value=leases.get(request?.sourceLeaseId);requireValue(value&&same(value.row.binding,request.bindingOriginal)
  &&request.sourceId===value.sourceId&&request.revision===value.revision&&request.domain===value.request.domain&&(request.frame===undefined||request.frame===0),'No matching captured Original sample receipt.');return value;};
 async function drainUnpublished(row){
  for(const [id,entry]of [...row.receipts])if(entry.unpublished){
   await entry.displayOwner?.dispose();
   await row.service.retireSourceSamples(entry.request);
   if(row.control&&entry.capability){const retired=transport.discardUnpublishedSource(row.control,entry.request);if(retired===false||retired===0)throw retired;}
   entry.fee();row.receipts.delete(id);leases.delete(id);
  }
 }
 // These are private leases in the same service, not duplicate bank owners.
 async function retainRawPair(row,request){
  const quality=request.representation.quality;row.rawUse.set(quality,++row.rawClock);
  if(row.rawPins.has(quality))return;if(row.rawPinFlights.has(quality))return row.rawPinFlights.get(quality);
  requireValue(!row.closing&&isCurrent(row),'The captured RAW Original is retiring.');
  const task=(async()=>{const pin=await row.service.prepareSourceSamples({...request,representation:{...request.representation,view:'rgb16'}});
   row.rawPins.set(quality,pin);})();row.rawPinFlights.set(quality,task);
  task.then(()=>row.rawPinFlights.delete(quality),()=>row.rawPinFlights.delete(quality));return task;
 }
 async function rawRoom(row,bytes,quality,{all=false}={}){
  requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid RAW phase reservation.');
  for(const [other,pin]of [...row.rawPins].sort((a,b)=>(row.rawUse.get(a[0])??0)-(row.rawUse.get(b[0])??0))){
   if(!all&&budget.total()+bytes<=budget.limit)break;
   if(other===quality||row.rawPreparing.has(other)||[...row.receipts.values()].some(entry=>entry.rawQuality===other&&!entry.rawRetired))continue;
   const result=await row.service.retireSourceSamples(pin);if(result===false||result===0)throw result;
   row.rawPins.delete(other);row.rawUse.delete(other);
  }
 }
 function ensure(id,record,pendingOwner,importProvider){
  let row=rows.get(record);if(row&&!row.service){row.fee?.();row.fee=null;row.closed=true;rows.delete(record);live.delete(row);row=null;}
  if(row){requireValue(!row.closing&&!row.closed,'Original samples are closing.');if(!isCurrent(row))throw changed();return row;}
  requireValue(pendingOwner?pendingOwner.record===record&&record.kind==='pending-original'&&pendingOwner.matchesFixed(pendingOwner.fixedBinding()):record?.kind==='image'&&!record.originalSource&&record.surface?.readWindow&&/^[a-f0-9]{64}$/.test(record.sha256??''),'A canonical Original with fixed content identity is required.');
  requireValue(pendingOwner||!record.originalSamplesOwner||record.originalSamplesOwner.matchesFixed(binding(id,record)),'The adopted Original is retiring.');
  const selected=pendingOwner?null:selectedSurface(record);
  row={id,record,precision:record.sourcePrecision,surface:selected,surfaceId:selected?.descriptor.id,surfaceRevision:selected?.descriptor.revision,binding:Object.freeze(pendingOwner?pendingOwner.fixedBinding():binding(id,record)),pendingOwner,importProvider,importPin:null,importHandle:null,pinPreparing:null,
   rawPins:new Map(),rawPinFlights:new Map(),rawUse:new Map(),rawClock:0,rawPreparing:new Set(),rawUnregister:null,closing:false,closed:false,waiters:[],receipts:new Map(),fee:null,service:null,control:null,closeFlight:null};
  rows.set(record,row);live.add(row);
  try{row.fee=budget.reserve(4096);
   row.service=createSourceSamplesService({budget,representationExtension:true,bindingOriginal:row.binding,currentBinding:()=>isCurrent(row)?row.binding:null,onOwner:service=>row.service=service,
    prepareProvider:async context=>{if(context.representation?.kind==='raw-demosaic-rgb'){
      row.rawDemosaicProvider??=createPrepareProviderRawDemosaic({record,execution,isCurrent:()=>!row.closing&&isCurrent(row),
       workerFactory:url=>new Worker(url,{type:'module'}),beforeAdmission:(bytes,quality)=>rawRoom(row,bytes,quality),
       storageOptions:{storage:'auto',getTemporarySession:record.ensureTemporarySession,...(record.session?{temporarySession:record.session}:{})}});
      row.rawUnregister??=budget.registerAsyncReclaimer?.(async request=>{
       if(row.closing||row.closed)return 0;const before=budget.backingReleased?.get('array-buffer')??0;
       await rawRoom(row,request.bytes,undefined,{all:request.all===true});
       return Math.max(0,(budget.backingReleased?.get('array-buffer')??0)-before);
      },{allocationKind:'array-buffer',owner:'histogram-raw-demosaic',label:'inactive-RAW-interpolation-pair'});
      row.rawPreparing.add(context.representation.quality);try{return await row.rawDemosaicProvider(context);}
      finally{row.rawPreparing.delete(context.representation.quality);}
     }if(context.representation?.kind==='original-color-channels'){
      row.nativeColorProvider??=createPrepareProviderNativeColor({record,execution,isCurrent:()=>isCurrent(row),
       workerFactory:url=>new Worker(url,{type:'module'}),faithfulSurface:row.originalNativeSurface,
       storageOptions:{storage:'auto',getTemporarySession:record.ensureTemporarySession,...(record.session?{temporarySession:record.session}:{})}});
      return row.nativeColorProvider(context);
     }if(context.representation){
      if(!row.hdrProvider){const {createPrepareProviderHdr}=await import('./prepare-provider-hdr.js');const blob=record.source?.blob?.()??record.blob;
       requireValue((record.provenance?.sourceFormat??record.provenance?.format)==='avif'&&blob instanceof Blob,'HDR preparation requires a captured AVIF Original.');
       row.hdrProvider=createPrepareProviderHdr({blob,execution,workerFactory:url=>new Worker(url,{type:'module'}),storageOptions:{storage:'auto',getTemporarySession:record.ensureTemporarySession,...(record.session?{temporarySession:record.session}:{})}});
      }
      return row.hdrProvider(context);
     }if(context.domain==='decoded'&&row.importProvider)return row.importProvider({...context,publishSource:surface=>{
      context.publishSource(surface);row.originalNativeSurface=surface;
     }});if(context.domain==='sensor'){
      if(!row.sensorProvider){const blob=record.source?.blob?.()??record.blob,maximumMemoryBytes=record.provenance?.metrics?.codecHeapMaximumBytes;
       requireValue(record.provenance?.rawSensorAvailableFromOriginal===true&&blob instanceof Blob&&Number.isSafeInteger(maximumMemoryBytes)&&maximumMemoryBytes>=16*1024**2&&maximumMemoryBytes<=2**32&&maximumMemoryBytes%65536===0,'Sensor preparation requires the real admitted RAW Original/codec plan.');
       row.sensorProvider=createPrepareProviderSensor({blob,maximumMemoryBytes,workerFactory:url=>new Worker(url,{type:'module'}),storageOptions:{storage:'auto',getTemporarySession:record.ensureTemporarySession,...(record.session?{temporarySession:record.session}:{})}});
      }
      return row.sensorProvider(context);
     }
     requireValue(context.domain==='decoded','Unknown source samples domain.');
     const borrowed=createBorrowedSourceSamples({surface:row.surface,budget,bindingOriginal:row.binding,sourcePrecision:record.sourcePrecision,
      isCurrent:()=>isCurrent(row),onOwner:context.adoptSourceOwner});context.publishSource(borrowed);}});
  }catch(error){throw withRetirementOwner(error,api,error);}return row;
 }
 const api={
  beginOriginalRetirement(record){const row=rows.get(record);if(row&&!row.closed)row.closing=true;},
  preparePendingOriginal(owner,provider){
   requireValue(owner?.budget===budget&&typeof provider==='function','A captured pending Original and provider are required.');checkAbort(owner.signal);
   const fixed=owner.fixedBinding();requireValue(owner.matchesFixed(fixed),'The pending Original is not current.');
   const row=ensure(owner.imageId,owner.record,owner,provider);
   requireValue(row.pendingOwner===owner&&row.importProvider===provider,'The pending provider cannot be replaced.');
   if(row.importHandle)return Promise.resolve(row.importHandle);if(row.pinPreparing)return row.pinPreparing;
   const task=(async()=>{
    const source=await row.service.prepareSourceSamples({domain:'decoded',frame:0,bindingOriginal:fixed},{signal:owner.signal});row.importPin=source;
    row.importHandle=Object.freeze({source,service:row.service,
     readWindow(rect,hooks={}){requireValue(!hooks.publish,'Internal projection windows are not public transport.');checkAbort(hooks.signal);requireValue(!row.closing&&isCurrent(row),'Original samples are closing or changed.');return row.service.readSourceSamples({...source,rect},hooks);},
     async retireWindow(window){requireValue(window?.sourceLeaseId===source.sourceLeaseId,'The internal window belongs to another pin.');try{return await row.service.retireSourceSamples(window);}finally{notify(row);}},
    });
    checkAbort(owner.signal);requireValue(owner.matchesFixed(fixed),'Pending identity changed before its private receipt.');return row.importHandle;
   })();row.pinPreparing=task;task.then(()=>row.pinPreparing=null,()=>row.pinPreparing=null);return task;
  },
  adoptPendingOriginal(owner,record){
   const row=rows.get(record);requireValue(row&&row.pendingOwner===owner&&record===owner.record&&row.importHandle&&getRecord(row.id)===record,'No pending Original can adopt this record.');
   requireValue(record.kind==='image'&&record.surface?.readWindow&&same(binding(row.id,record),row.binding),'The real Original did not adopt its reserved identity.');
   const selected=selectedSurface(record);requireValue(selected?.readWindow,'The real working surface is unavailable.');
   row.surface=selected;row.surfaceId=selected.descriptor.id;row.surfaceRevision=selected.descriptor.revision;row.precision=record.sourcePrecision;row.pendingOwner=null;
  },
  async prepare(request,hooks={}){
   checkAbort(hooks.signal);requireValue(['decoded','sensor'].includes(request?.domain)&&(request.frame===undefined||request.frame===0),'Only decoded/sensor frame0 is installed.');
   const record=getRecord(request.imageId);requireValue(record,'Original is not loaded.');
   const canonical=binding(request.imageId,record);requireValue(same(canonical,request.bindingOriginal),'Original identity differs.');
   const row=ensure(request.imageId,record);let answer,entry,published=false;
   try{await drainUnpublished(row);checkAbort(hooks.signal);answer=await row.service.prepareSourceSamples(request,hooks);
    if(request.representation?.kind==='raw-demosaic-rgb')await retainRawPair(row,request);
    checkAbort(hooks.signal);requireValue(!row.closing&&isCurrent(row),'Original changed before source publication.');
    const fee=budget.reserve(1024);entry={row,fee,sourceId:answer.sourceId,revision:answer.revision,request:answer,...(request.representation?.kind==='raw-demosaic-rgb'?{rawQuality:request.representation.quality,rawRetired:false}:{})};row.receipts.set(answer.sourceLeaseId,entry);leases.set(answer.sourceLeaseId,entry);
    const display=row.service.displaySource(answer);
    if(display){requireValue(typeof sourceDisplayFactory==='function','A real display registry is required for the RAW SDR lease.');
     const owner=sourceDisplayFactory({surface:display,bindingOriginal:row.binding,isCurrent:()=>!row.closing&&!entry.rawRetired&&isCurrent(row),onOwner:value=>entry.displayOwner=value});
     requireValue(owner===entry.displayOwner&&owner?.descriptor?.format==='rgb8','The display owner was not adopted.');
     answer={...answer,descriptor:{...answer.descriptor,displaySurface:owner.descriptor}};
    }
    if(sourceSamplesControlFactory){transport??=sourceSamplesControlFactory();row.control??=transport.register({get state(){return row.service.state;},retireSourceSamples:value=>api.retire(value)},row.binding,budget);
     answer={...answer,sourceSamplesControl:transport.adoptSource(row.control,answer,{unpublished:!!hooks.publish})};entry.capability=true;}
    if(hooks.publish){requireValue(typeof hooks.publish==='function','A source preparation publisher is required.');
     if(row.control)await transport.publishSource(row.control,answer,hooks.publish);else{
      const token=new ArrayBuffer(1);entry.publicationToken=token;await hooks.publish({...answer,sourceSamplesPublication:token},[token]);
     }published=true;return;}
    return answer;
   }catch(primary){const peerMayOwn=answer&&(row.control&&answer.sourceSamplesControl?transport.sourceWasPublished(row.control,answer):entry?.publicationToken?.byteLength===0);
    if(peerMayOwn)throw withRetirementOwner(primary,api,primary);
    if(answer&&!published){if(entry)entry.unpublished=true;try{if(entry)await drainUnpublished(row);else await row.service.retireSourceSamples(answer);}
     catch(cleanup){throw withRetirementOwner(primary,api,cleanup);}}
    throw primary;
   }
  },
  read(request,hooks={}){
   checkAbort(hooks.signal);const {row}=receipt(request);requireValue(!row.closing&&!row.closed,'Original samples are closing.');if(!isCurrent(row))throw changed();
   return row.service.readSourceSamples(request,{...hooks,...(hooks.publish&&row.control?{publish:(wire,transfer)=>transport.publishWindow(row.control,wire,transfer,hooks.publish)}:{})});
  },
  async retire(request){const entry=receipt(request),{row}=entry;try{
   if(!request.windowLeaseId)await entry.displayOwner?.dispose();
   const result=await row.service.retireSourceSamples(request);if(result===false||result===0)throw result;
   if(!request.windowLeaseId&&entry.rawQuality!==undefined)entry.rawRetired=true;return result;
  }finally{notify(row);}},
  hasRecord(record){const row=rows.get(record);return!!row&&!row.closed;},
  closeRecord(record){const row=rows.get(record);if(!row||row.closed)return Promise.resolve();if(row.closeFlight)return row.closeFlight;row.closing=true;
   const task=(async()=>{await drainUnpublished(row);if(publishedWindows(row)){await new Promise(resolve=>row.waiters.push(resolve));}
    for(const entry of row.receipts.values())await entry.displayOwner?.dispose();
    await row.service?.dispose();row.rawPins.clear();row.rawUse.clear();row.rawUnregister?.();row.rawUnregister=null;if(row.control)await transport.close(row.control);
    for(const[id,entry]of row.receipts){entry.fee();leases.delete(id);}row.receipts.clear();row.fee?.();row.fee=null;row.closed=true;rows.delete(row.record);live.delete(row);row.importPin=null;row.importHandle=null;row.importProvider=null;row.pendingOwner=null;
   })();row.closeFlight=task;task.then(()=>row.closeFlight=null,()=>row.closeFlight=null);return task;
  },
  async dispose(){let failed=false,primary;for(const row of [...live])try{await api.closeRecord(row.record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;},
  get state(){return{originals:live.size,sourceReceipts:leases.size,windows:[...live].reduce((n,row)=>n+(row.service?.state.windowLeases??0),0)};},
 };
 return api;
}
