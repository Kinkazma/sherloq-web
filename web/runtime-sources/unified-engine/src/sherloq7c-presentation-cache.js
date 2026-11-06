import "../../runtime-context.js?v=0.31.0";
// Private, opportunistic cache for eligible simple RGB presentations.
// Every operation still passes the same metadata/resource ownership guards.
// It owns one immutable 7C source; public outputs retain their own source/state.
const fail=(code,message)=>Object.assign(new Error(message),{code});
import {equalizationOperations} from './equalization-settings.js';
const eligibleOperations=new Set(Object.keys(equalizationOperations));
const maxKeyCharacters=65536,maxMetadataBytes=1024*1024;
function copyPlain(value,{skipPixels=false,maxBytes=maxMetadataBytes}={}){
 let estimate=0;const seen=new Set();
 function copy(v,top=false,depth=0){
  if(depth>128)throw fail('CACHE_UNQUALIFIED','Metadata nesting is not qualified.');
  estimate+=32;if(estimate>maxBytes)throw fail('CACHE_UNQUALIFIED','Metadata too large for optional cache.');
  if(v===null||v===undefined||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))throw fail('CACHE_UNQUALIFIED','Non-finite metadata.');return v;}
  if(typeof v==='string'){estimate+=2*v.length;return v;}
  if(typeof v!=='object'||ArrayBuffer.isView(v)||v instanceof ArrayBuffer||seen.has(v))throw fail('CACHE_UNQUALIFIED','Non-portable metadata.');
  const proto=Object.getPrototypeOf(v);if(!Array.isArray(v)&&proto!==Object.prototype&&proto!==null)throw fail('CACHE_UNQUALIFIED','Metadata prototype is not qualified.');
  const keys=Reflect.ownKeys(v);
  if(Array.isArray(v)&&(keys.length!==v.length+1||keys.some(key=>key!=='length'&&(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=v.length||String(Number(key))!==key))))throw fail('CACHE_UNQUALIFIED','Only dense arrays with canonical index keys are qualified.');
  seen.add(v);const result=Array.isArray(v)?[]:Object.create(null);
  for(const key of keys){
   if(Array.isArray(v)&&key==='length'||top&&skipPixels&&key==='pixels')continue;
   if(typeof key!=='string')throw fail('CACHE_UNQUALIFIED','Symbol metadata is not qualified.');
   const property=Object.getOwnPropertyDescriptor(v,key);if(!property.enumerable)throw fail('CACHE_UNQUALIFIED','Non-enumerable metadata is not qualified.');if(!Object.hasOwn(property,'value'))throw fail('CACHE_UNQUALIFIED','Accessor metadata is not qualified.');
   estimate+=2*key.length+32;result[key]=copy(property.value,false,depth+1);
  }
  seen.delete(v);return result;
 }
 const result=copy(value,true);if(estimate>maxBytes)throw fail('CACHE_UNQUALIFIED','Metadata budget exceeded.');return{value:result,estimatedBytes:estimate};
}
function stable(value){if(Object.is(value,-0))return'-0';if(value===undefined)return'undefined';if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(stable).join(',')+']';return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';}
function scientificKey(task,plan,image){
 if(!eligibleOperations.has(task.operation))return null;
 try{
  // Only the root request id is temporal. Nested ids/seeds and ALL scientific
  // fields stay in the key. Unsupported transports simply miss this cache.
  for(const key of Reflect.ownKeys(task)){const property=Object.getOwnPropertyDescriptor(task,key);if(typeof key!=='string'||!property.enumerable||!Object.hasOwn(property,'value'))throw fail('CACHE_UNQUALIFIED','Task properties must be plain enumerable values.');}
  const {id,...baseTask}=task,{value}=copyPlain({...baseTask,params:plan.base},{maxBytes:4*maxKeyCharacters});
  const descriptor=image.surface?.descriptor??{};
  const text=stable({task:value,original:{sha256:image.sha256,width:image.width??descriptor.width,height:image.height??descriptor.height,id:descriptor.id,revision:descriptor.revision,format:descriptor.format}});
  return text.length<=maxKeyCharacters?text:null;
 }catch(error){if(error.code==='CACHE_UNQUALIFIED')return null;throw error;}
}
function snapshotAnswer(answer,image,inputDescriptor){
 if(answer?.status!=='ok')return null;
 for(const name of['planeSurfaces','rgbSurfaces','maskSurfaces','flagSurfaces','tables'])if(Object.keys(answer[name]??{}).length)return null;
 const primary=answer.surface?.id,original=image.surface?.descriptor?.id;
 try{
  // Copy first: this rejects cycles/accessors and leaves no reachable backing
  // store. Only the root primary descriptor is remapped by result publication.
  const snapshot=copyPlain(answer,{skipPixels:true});
  function resourceCheck(value){if(!value||typeof value!=='object')return true;if(value.id&&Number.isInteger(value.revision)&&((Number.isInteger(value.width)&&Number.isInteger(value.height))||Number.isInteger(value.rowCount))&&value.id!==original)return false;return Object.entries(value).every(([key,part])=>!(['surfaceId','tableId'].includes(key)&&typeof part==='string'&&(key==='tableId'||part!==original))&&resourceCheck(part));}
  for(const [key,value]of Object.entries(snapshot.value)){
   if(key==='surface')continue;
   if(key==='layers'){if(!Array.isArray(value))return null;for(const layer of value){const{surfaceId,...rest}=layer;if(surfaceId&&surfaceId!==primary&&surfaceId!==original||!resourceCheck(rest))return null;}}
   else if(!resourceCheck(value))return null;
  }
  if(answer.sourceRegionSourceSurface&&answer.sourceRegionSourceSurface.id!==original)return null;
  snapshot.value.surface??=copyPlain(inputDescriptor).value;return snapshot;
 }catch(error){if(error.code==='CACHE_UNQUALIFIED')return null;throw error;}
}
export function createSherloqPresentationCache({budget}={}){
 if(!budget?.reserve)throw fail('INVALID_INPUT','Central presentation-cache budget required.');
 let current=null,active=null,closed=false;const pending=new Set();
 function retire(entry,{clearCore=false}={}){
  if(!entry)return Promise.resolve();if(clearCore)entry.clearCoreRequested=true;
  if(entry.retiring)return entry.retiring;
  const task=(async()=>{
   if(current===entry)current=null;pending.add(entry);
   if(entry.clearCoreRequested&&!entry.coreCleared){if(entry.core.memory?.().busy)throw fail('BUSY','Presentation runtime still computing.');await entry.core.clearCache();entry.coreCleared=true;}
   if(entry.input){await entry.input.release();entry.input=null;}
   if(entry.metadataLease){entry.metadataLease();entry.metadataLease=null;}
   entry.answer=entry.descriptor=entry.image=entry.core=null;pending.delete(entry);
  })();
  entry.retiring=task;void task.finally(()=>{if(entry.retiring===task)entry.retiring=null;}).catch(()=>{});return task;
 }
 async function drain(){for(const entry of[...pending])await retire(entry,{clearCore:entry.clearCoreRequested===true});}
 async function retryPending(){if(active)throw fail('BUSY','Await presentation operation before cleanup retry.');const retrying={retrying:true};active=retrying;try{await drain();}finally{if(active===retrying)active=null;}}
 function withRetry(error){const previous=error?.retryCleanup;if(error&&typeof error==='object'&&Object.isExtensible(error))error.retryCleanup=async()=>{if(active)throw fail('BUSY','Await presentation operation before cleanup retry.');await previous?.();await retryPending();};return error;}
 async function clear(){if(active)throw fail('BUSY','Await presentation-cache operation.');const clearing={clearing:true};active=clearing;try{if(current){current.clearCoreRequested=true;await retire(current,{clearCore:true});}await drain();}catch(error){throw withRetry(error);}finally{if(active===clearing)active=null;}}
 const unregister=budget.registerAsyncReclaimer?.(async()=>{if(active||closed||current?.core.memory?.().busy)return 0;const before=budget.total();await clear();return Math.max(0,before-budget.total());},{owner:'sherloq7c-presentation-cache',label:'idle-qualified-presentation-source',allocationKind:'array-buffer'});
 return{
  async begin(task,plan,image,core){
   if(closed)throw fail('DISPOSED','Presentation cache closed.');if(active)throw fail('BUSY','One presentation transaction at a time.');const preparing={preparing:true};active=preparing;try{await drain();
   const key=scientificKey(task,plan,image),hit=key!==null&&current?.key===key&&current.image===image&&current.core===core;
   if(!hit&&current){current.clearCoreRequested=true;await retire(current,{clearCore:true});}
   const entry=hit?current:{key,image,imageId:task.imageId,core,input:null,answer:null,descriptor:null,metadataLease:null,metadataBytes:0,coreCleared:false};
   const programIdentity=Object.freeze({sourceKey:key,maxSide:plan.state.sherloq7c.maxSide??512,precision:plan.state.sherloq7c.precision,computationMode:plan.state.sherloq7c.computationMode??'precision'});const token={entry,hit,committed:hit,finished:false,importing:null,finishing:null};active=token;
   return{
    hit,programIdentity,
    answer(){if(!hit||!entry.answer)throw fail('CACHE_MISS','No retained upstream presentation.');const answer=structuredClone(entry.answer),prepared=answer.metrics;answer.id=task.id;answer.metrics={upstreamPresentationReused:true,currentUpstreamMs:0,upstreamPreparedMetrics:prepared};return answer;},
    surface(){if(!hit)return null;return{descriptor:entry.descriptor,readWindow(){throw fail('CACHE_MISS','Retained 7C source is required for this presentation.');}};},
    async source(factory){
     if(token.finished||active!==token)throw fail('DISPOSED','Presentation transaction retired.');
     if(entry.input)return entry.input;
     token.importing??=Promise.resolve().then(()=>{if(token.finished||active!==token)throw fail('DISPOSED','Presentation transaction retired before source import.');return factory();}).then(input=>{entry.input=input;return input;});
     const input=await token.importing;
     if(token.finished||active!==token){const stale=fail('DISPOSED','Presentation source arrived after its transaction retired.');try{await retire(entry);}catch(cleanup){withRetry(cleanup);stale.cleanupError=cleanup;stale.retryCleanup=()=>cleanup.retryCleanup?.();}throw stale;}
     return input;
    },
    commit(answer,inputDescriptor){
     if(token.finished||active!==token)throw fail('DISPOSED','Presentation transaction retired.');if(hit)return true;
     if(key===null||!entry.input)return false;const snapshot=snapshotAnswer(answer,image,inputDescriptor);if(!snapshot)return false;
     let descriptor;try{descriptor=copyPlain(inputDescriptor);}catch(error){if(error.code==='CACHE_UNQUALIFIED')return false;throw error;}
     const metadataBytes=snapshot.estimatedBytes+descriptor.estimatedBytes+key.length*2+1024;if(metadataBytes>maxMetadataBytes)return false;
     let lease;try{lease=budget.reserve(metadataBytes);}catch(error){if(error.code==='MEMORY_LIMIT'||error.code==='MEMORY_ALLOCATION')return false;throw error;}
     entry.metadataLease=lease;entry.metadataBytes=metadataBytes;entry.answer=snapshot.value;entry.descriptor=Object.freeze(descriptor.value);current=entry;token.committed=true;return true;
    },
    finish(options={}){
     if(token.finishing)return token.finishing;token.finished=true;
     token.finishing=(async()=>{try{
      // The factory's eventual owner is recorded before either path retires it.
      // Constructor failures remain the source() caller's primary error.
      if(token.importing)try{await token.importing;}catch{}
      if(!token.committed)await retire(entry);
     }catch(error){withRetry(error);if(!Object.hasOwn(options,'primary'))throw error;const primary=options.primary;if(!primary||typeof primary!=='object'||!Object.isExtensible(primary))throw new AggregateError([primary,error],'Presentation and source retirement failed.',{cause:primary});const previous=primary.retryCleanup;primary.cleanupError=error;primary.retryCleanup=async()=>{await previous?.();await error.retryCleanup?.();};}finally{if(active===token)active=null;}})();return token.finishing;
    }
   };
   }catch(error){if(active===preparing)active=null;throw withRetry(error);}
  },
  clear,
  async clearImage(imageId){if(current?.imageId===imageId||current?.answer?.imageId===imageId||[...pending].some(entry=>entry.imageId===imageId))await clear();},
  async dispose(){if(active)throw fail('BUSY','Await presentation operation before disposal.');closed=true;await clear();unregister?.();},
  snapshot:()=>({entries:current?1:0,pendingRetirements:pending.size,busy:!!active,sourceBytes:current?.input?.byteLength??0,metadataBytes:current?.answer?current.metadataBytes??0:0})
 };
}
