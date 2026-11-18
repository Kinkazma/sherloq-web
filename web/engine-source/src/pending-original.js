// Private identity/ownership prototype. No Core or worker RPC is introduced.
import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {createRgbSurface} from './rgb-surface.js';
import {describeSourcePrecision} from './source-precision.js';
const keys=['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'];
const same=(a,b)=>a&&b&&keys.every(key=>a[key]===b[key]);
const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};

export function createPendingOriginal({imageId,budget,failedImports,images,surfaces,source,registry}={}){
 requireValue(typeof imageId==='string'&&imageId.length>0&&imageId.length<=128&&!imageId.includes('\0')
  &&budget?.reserve&&failedImports instanceof Map&&images instanceof Map&&surfaces instanceof Map
  &&source?.sha256&&source?.dispose&&registry?.preparePendingOriginal,'A captured canonical import owner is required.');
 requireValue(!failedImports.has(imageId)&&!images.has(imageId),'The canonical image id is already owned.');
 const surfaceIdentity=Object.freeze({id:crypto.randomUUID(),revision:1}),record={kind:'pending-original',source};
 const controller=new AbortController(),dependents=new Set(),operations=new Set();
 let fee,state='reserved',hash,identityFlight,samples,preparing,presentation,metadata,profileBorrow,closing,closed=false;
 const current=()=>!closed&&!controller.signal.aborted&&(['reserved','fixed','ready','adopting'].includes(state)
  ?failedImports.get(imageId)===owner:state==='adopted'&&images.get(imageId)===record);
 const owned=()=>{checkAbort(controller.signal);requireValue(current(),'The pending Original is no longer current.');};
 const fixed=()=>{requireValue(typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash),'Original content identity is not fixed.');return Object.freeze({imageId,sourceSurfaceId:surfaceIdentity.id,sourceRevision:1,sourceSha256:hash,kind:'encoded'});};
 const owner={imageId,budget,record,surfaceIdentity,signal:controller.signal,
  get state(){return state;},
  fixedBinding:fixed,
  matchesFixed(value){return current()&&hash!==undefined&&same(fixed(),value);},
  fixIdentity(){
   owned();if(hash)return Promise.resolve(fixed());if(identityFlight)return identityFlight;
   const task=(async()=>{const canonical=await source.sha256({signal:controller.signal});owned();
    requireValue(/^[a-f0-9]{64}$/.test(canonical),'The encoded owner did not establish a SHA.');hash=canonical;record.sha256=hash;state='fixed';return fixed();
   })();identityFlight=task;task.then(()=>identityFlight=null,()=>identityFlight=null);return task;
  },
  adoptDecodedMetadata(value){
   owned();const binding=fixed(),g=value?.sourceGrid,c=value?.canonicalGrid;
   requireValue(same(binding,value?.bindingOriginal)&&g&&c&&[g.width,g.height,c.width,c.height].every(n=>Number.isSafeInteger(n)&&n>0)
    &&Number.isInteger(g.orientation)&&g.orientation>=1&&g.orientation<=8
    &&c.width===(g.orientation>=5?g.height:g.width)&&c.height===(g.orientation>=5?g.width:g.height),
   'The useful Read metadata differs from the reserved Original.');
   const receipt=Object.freeze({bindingOriginal:binding,sourceGrid:Object.freeze({width:g.width,height:g.height,orientation:g.orientation}),canonicalGrid:Object.freeze({width:c.width,height:c.height})});
   requireValue(!metadata||JSON.stringify(metadata)===JSON.stringify(receipt),'The useful Read grid cannot be rebound.');
   metadata=receipt;profileBorrow=value.colorProfileOwner??null;return receipt;
  },
  prepareSamples(provider){
   owned();fixed();if(samples)return Promise.resolve(samples);if(preparing)return preparing;
   const task=registry.preparePendingOriginal(owner,provider).then(value=>{samples=value;owned();state='ready';return value;});
   preparing=task;task.then(()=>preparing=null,()=>preparing=null);return task;
  },
  adoptDependent(dependent){owned();requireValue(dependent&&typeof dependent.dispose==='function','A real dependent owner is required.');dependents.add(dependent);return dependent;},
  trackOperation(operation){owned();const task=Promise.resolve(operation);operations.add(task);task.then(()=>operations.delete(task),()=>operations.delete(task));return task;},
  createPresentation(store,{width,height}={}){
   owned();requireValue(samples&&metadata&&!presentation&&dependents.has(store)
    &&width===samples.source.descriptor.width&&height===samples.source.descriptor.height
    &&width===metadata.canonicalGrid.width&&height===metadata.canonicalGrid.height,
   'A real complete sample grid must precede its presentation.');
   const surface=createRgbSurface(store,{width,height,orientation:1,budget,surfaceId:surfaceIdentity.id});
   dependents.delete(store);dependents.add(surface);presentation=surface;return surface;
  },
  adopt({surface=presentation,nativeSurface,provenance={}}={}){
   owned();requireValue(state==='ready'&&samples&&metadata&&surface===presentation&&surface?.readWindow
    &&surface.descriptor.id===surfaceIdentity.id&&surface.descriptor.revision===1
    &&surface.descriptor.width===metadata.canonicalGrid.width&&surface.descriptor.height===metadata.canonicalGrid.height
    &&!images.has(imageId)&&!surfaces.has(surfaceIdentity.id),'The real surface cannot adopt the reserved Original.');
   requireValue(!nativeSurface||nativeSurface!==surface&&dependents.has(nativeSurface)&&nativeSurface.descriptor.format==='rgb16'
    &&nativeSurface.descriptor.id!==surfaceIdentity.id
    &&nativeSurface.descriptor.width===surface.descriptor.width&&nativeSurface.descriptor.height===surface.descriptor.height&&!surfaces.has(nativeSurface.descriptor.id),'The working RGB16 view is not an owned dependent.');
   const previous={...record};state='adopting';
   try{
    Object.assign(record,{kind:'image',surface,...(nativeSurface?{nativeSurface}:{}),provenance,
     sourcePrecision:{...describeSourcePrecision({provenance,nativeSurface:nativeSurface?.descriptor}),nativeDecodedSamplesRetained:true,originalDecoded:samples.source.descriptor},originalSamplesOwner:owner});
    images.set(imageId,record);surfaces.set(surfaceIdentity.id,{imageId,record});if(nativeSurface)surfaces.set(nativeSurface.descriptor.id,{imageId,record:{surface:nativeSurface}});
    registry.adoptPendingOriginal(owner,record);failedImports.delete(imageId);state='adopted';return record;
   }
   catch(error){images.delete(imageId);surfaces.delete(surfaceIdentity.id);if(nativeSurface)surfaces.delete(nativeSurface.descriptor.id);for(const key of Object.keys(record))delete record[key];Object.assign(record,previous);state='ready';throw error;}
  },
  abort(reason){controller.abort(reason);},
  dispose(){
   if(closed)return Promise.resolve();if(closing)return closing;state='retiring';controller.abort();registry.beginOriginalRetirement(record);
   const task=(async()=>{
    await Promise.allSettled([identityFlight,...operations].filter(Boolean));
    for(const dependent of [...dependents]){await ack(()=>dependent.dispose());dependents.delete(dependent);}
    // Views/loans must be gone before B attempts its underlying sample bank.
    await ack(()=>registry.closeRecord(record));
    await ack(()=>record.temporarySessionOwner?.dispose());
    await ack(()=>source.dispose());source=null;record.source=null;samples=null;metadata=null;profileBorrow=null;presentation=null;
    if(images.get(imageId)===record)images.delete(imageId);if(surfaces.get(surfaceIdentity.id)?.record===record)surfaces.delete(surfaceIdentity.id);
    if(record.nativeSurface&&surfaces.get(record.nativeSurface.descriptor.id)?.record.surface===record.nativeSurface)surfaces.delete(record.nativeSurface.descriptor.id);
    // This is our own record, never the caller's load input. Drop closed
    // dependency graphs only after all retirement acknowledgements succeeded.
    for(const key of ['surface','nativeSurface','provenance','sourcePrecision','originalSamplesOwner'])delete record[key];record.kind='retired-original';
    if(failedImports.get(imageId)===owner)failedImports.delete(imageId);fee?.();fee=null;closed=true;state='retired';
   })();closing=task;task.then(()=>closing=null,()=>closing=null);return task;
  },
 };
 failedImports.set(imageId,owner);
 try{fee=budget.reserve(4096);}catch(error){throw withRetirementOwner(error,owner,error);}
 return owner;
}
