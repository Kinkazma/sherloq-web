import {createLoupeImageCache} from './pdf-native-effects.js?v=0.31.0';
import {hasLoupeEffects} from './loupe-effects-settings.js?v=0.31.0';


// Four native images at most (the selected image plus three neighbours).
// Background decoding is bounded separately; a large selected image remains usable.
export function createImageMemory({makeSurface,getJob,changed=()=>{},beforePublish=async()=>{},maxBytes=128*1024**2,memoryBudgetBytes=128*1024**2}={}){
 const entries=new Map(),pending=new Map(),closing=new Set();let selected,closed=false,hits=0,decodes=0,builds=0,epoch=0;
 const keyOf=effects=>JSON.stringify(effects);
 const bytes=()=>[...entries.values()].reduce((n,e)=>n+e.bitmap.width*e.bitmap.height*4+(e.prepared?(e.prepared.metrics?.progressive?0:e.bitmap.width*e.bitmap.height*3)+e.prepared.byteLength:0),0);
 function release(entry){entry.closed=true;entry.prepared?.close();const task=entry.cache?.dispose();if(task){closing.add(task);void task.finally(()=>closing.delete(task));}if(entry.raw.release)entry.raw.release();else entry.bitmap.close();entries.delete(entry.id);}
 function trim(keep=new Set()){
  for(const entry of [...entries.values()].sort((a,b)=>a.used-b.used))if(entry.id!==selected&&!keep.has(entry.id)&&(entries.size>4||bytes()>maxBytes))release(entry);
 }
 async function get(id,{foreground=false}={}){
  if(entries.has(id)){const entry=entries.get(id);entry.used=performance.now();hits++;return entry;}
  if(pending.has(id))return pending.get(id);
  const task=(async()=>{
   const job=await getJob(id);if(!job||job.kind!=='image')return null;
   if(!foreground&&Number(job.width)*Number(job.height)*8+bytes()>maxBytes)return null;
   const bitmap=await createImageBitmap(job.blob);
   if(closed){bitmap.close();return null;}if(bitmap.width*bitmap.height>100_000_000){bitmap.close();throw Error('Image supérieure à 100 MP.');}
   decodes++;const entry={id,job,bitmap,raw:makeSurface(bitmap,job),used:performance.now(),prepared:null,preparedKey:null,cache:null};entries.set(id,entry);if(!foreground)trim(new Set([id]));return entry;
  })().finally(()=>pending.delete(id));pending.set(id,task);return task;
 }
 return {
  get,adopt(id,bitmap,job){const entry={id,job,bitmap,raw:makeSurface(bitmap,job),used:performance.now(),prepared:null,preparedKey:null,cache:null};entries.set(id,entry);decodes++;return entry;},select(id,keep=[]){if(selected!==id){epoch++;for(const entry of entries.values())if(entry.id!==id)entry.cache?.cancel();}selected=id;const entry=entries.get(id);if(entry)entry.used=performance.now();trim(new Set(keep));},
  prepared(entry,effects){return entry?.preparedSource===entry?.raw&&entry?.preparedKey===keyOf(effects)?entry.prepared:null;},
  displayed(entry){return entry?.prepared;},
  async prepare(entry,effects){
   if(this.prepared(entry,effects)||!hasLoupeEffects(effects))return;
   const ticket=epoch,key=keyOf(effects);if(entry.build?.epoch===ticket&&entry.build.key===key)return entry.build.promise;
   entry.cache??=createLoupeImageCache({changed,memoryBudgetBytes});const record={epoch:ticket,key};entry.build=record;
   record.promise=(async()=>{
    const lease=await entry.cache.acquire(entry.raw,effects,changed);
    if(closed||ticket!==epoch||!entries.has(entry.id)){lease.close();throw Object.assign(Error('Preparation superseded'),{code:'CANCELLED'});}
    try{await beforePublish(entry,effects);}catch(error){lease.close();throw error;}
    if(closed||ticket!==epoch||!entries.has(entry.id)){lease.close();throw Object.assign(Error('Preparation superseded'),{code:'CANCELLED'});}
    const old=entry.prepared;entry.prepared=lease;entry.preparedKey=key;entry.preparedSource=entry.raw;builds++;changed();queueMicrotask(()=>old?.close());
   })().finally(()=>{if(entry.build===record)entry.build=null;});return record.promise;
  },
  async warm(ids,effects){
   const ticket=epoch;
   for(const id of ids.slice(0,3)){
    if(closed||ticket!==epoch)return;
    const entry=await get(id);if(!entry)continue;
    if(hasLoupeEffects(effects)&&!this.prepared(entry,effects)&&bytes()+entry.bitmap.width*entry.bitmap.height*4<=maxBytes){
     try{await this.prepare(entry,effects);}catch(error){if(error.code!=='CANCELLED')console.warn('SHERLOQ : préparation voisine',error.message);}
    }
    changed();trim(new Set(ids));
   }
  },
  invalidate(){epoch++;for(const entry of entries.values())entry.cache?.cancel();},
  stats(){return {entries:entries.size,bytes:bytes(),hits,decodes,builds,prepared:[...entries.values()].filter(e=>e.prepared).length,nativeReads:[...entries.values()].reduce((n,e)=>n+(e.prepared?.nativeReads||0),0),fullPixels:entries.get(selected)?.prepared?.metrics?.fullPixels};},
  async dispose(){closed=true;epoch++;for(const entry of [...entries.values()])release(entry);await Promise.allSettled([...pending.values(),...closing]);}
 };
}
