import "../../runtime-context.js?v=0.30.0";
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Transport only: the caller still computes every binary64 mean in its
// original order. Only consecutive bytes of the unpublished next plane queue.
export async function createPrnuMeanPageWriter(plane,{budget,pool,readers=[],backend,signal,maximumBytes=1024**2,pageBytes=1024**2}={}){
 if(backend!=='indexeddb'||plane.store.storage!=='temporary')return null;
 requireValue(Number.isSafeInteger(maximumBytes)&&maximumBytes>0&&Number.isSafeInteger(pageBytes)&&pageBytes>0,'Invalid PRNU mean page window.');
 requireValue(typeof pool?.ownCleanup==='function','PRNU mean transport needs an acknowledged owner.');
 const stores=[...new Set([...readers.map(p=>p.store),plane.store])];if(stores.some(s=>typeof s.pinIoWorkspace!=='function'))return null;
 const byteLength=plane.width*plane.height*8;requireValue(Number.isSafeInteger(byteLength)&&byteLength>0,'Invalid PRNU mean byte length.');
 let scratch,closing=false,pending,failed=false,finished=false,used=0,cursor=0,written=0;const io=new Set();
 const cleanup=pool.ownCleanup(async()=>{
  if(pending)await pending.catch(()=>{});
  await retireCompositeOwners([
   async()=>{if(scratch){scratch.release();scratch=null;}},
   ...[...io].map(owner=>async()=>{await owner.release();io.delete(owner);})
  ]);
 });
 const dispose=()=>{closing=true;return cleanup.retire();};
 try{
  checkAbort(signal);
  // All three stores borrow the same existing serialized staging window.
  // Admit it together with the output buffer before the first mean read.
  for(const store of stores){const owner=store.pinIoWorkspace();if(owner)io.add(owner);}
  scratch=allocateOwnedTypedArray(Uint8Array,Math.min(maximumBytes,pageBytes,byteLength),{budget,owner:'prnu-training',label:'mean-output-page'});
 }catch(error){
  try{await dispose();}catch{throw error;}
  checkAbort(signal);if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))return null;throw error;
 }
 const flush=async()=>{if(!used)return;checkAbort(signal);await plane.store.write(scratch.data.subarray(0,used),written,{signal});written+=used;used=0;checkAbort(signal);};
 const run=work=>{
  if(closing||failed||finished)return Promise.reject(new EngineError('DISPOSED','PRNU mean page writer is closed.'));
  if(pending)return Promise.reject(new EngineError('BUSY','PRNU mean page write is active.'));
  const task=Promise.resolve().then(work).catch(error=>{failed=true;throw error;});pending=task;
  void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;
 };
 return{
  append(values,x,y,w,h){return run(async()=>{
   checkAbort(signal);requireValue(values instanceof Float64Array&&values.length===w*h&&[x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=plane.width&&y+h<=plane.height&&(h===1||x===0&&w===plane.width),'Invalid consecutive PRNU mean slice.');
   requireValue((y*plane.width+x)*8===cursor&&cursor+values.byteLength<=byteLength,'PRNU mean page writes must remain consecutive.');
   // Same maximum update as FloatPlane.write, including NaN and signed zero.
   for(const value of values)plane.maximum=Math.max(plane.maximum,Math.abs(value));
   const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength);let at=0;
   while(at<bytes.length){const n=Math.min(bytes.length-at,scratch.data.length-used);scratch.data.set(bytes.subarray(at,at+n),used);used+=n;cursor+=n;at+=n;if(used===scratch.data.length)await flush();}
  });},
  finish(){return run(async()=>{checkAbort(signal);requireValue(cursor===byteLength,'PRNU mean plane is incomplete.');await flush();finished=true;});},
  dispose
 };
}
