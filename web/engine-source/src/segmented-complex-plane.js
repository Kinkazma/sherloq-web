import {createComplexRowSlabs} from './complex-plane-row-slabs.js';
import {createComplexPlaneTiles} from './complex-plane-tiles.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {EngineError,requireValue,controlCheckpoint,checkAbort} from './errors.js';
// The public coordinates are always row-major interleaved real/imaginary pairs.
// A tiled physical layout is chosen once, only for newly temporary backing.
export async function createComplexPlane(width,height,{ArrayType=Float32Array,components=2,rowSlabBytes=0,temporaryTileSize=0,...options}){
 requireValue(components===1||components===2,'Invalid transform plane component count.');
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'Invalid complex plane dimensions.');requireValue(ArrayType===Float32Array||ArrayType===Float64Array,'Invalid complex plane precision.');requireValue(Number.isSafeInteger(rowSlabBytes)&&rowSlabBytes>=0,'Invalid complex row staging limit.');requireValue(Number.isSafeInteger(temporaryTileSize)&&temporaryTileSize>=0&&temporaryTileSize<=128,'Invalid complex temporary tile size.');
 const stride=components*ArrayType.BYTES_PER_ELEMENT,store=await createSegmentedBytes(width*height*stride,options);
 const tiles=temporaryTileSize&&store.storage==='temporary'?createComplexPlaneTiles({store,width,height,stride,budget:options.budget,tileSize:temporaryTileSize}):null,slabs=!tiles&&rowSlabBytes?createComplexRowSlabs({store,width,stride,budget:options.budget,maximumBytes:rowSlabBytes}):null,guarded=!!(slabs||temporaryTileSize);let writes=Promise.resolve(),closing=false,closeFlight;const active=new Set(),readers=new Set();
 const track=(task,reading=false)=>{active.add(task);if(reading)readers.add(task);const done=()=>{active.delete(task);readers.delete(task);};task.then(done,done);return task;};
 const enqueueWrite=work=>{const previousReaders=[...readers],task=writes.then(async()=>{await Promise.allSettled(previousReaders);return work();});writes=task.catch(()=>{});return task;};
 const range=(x,y,w,h)=>requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height,'Complex region outside plane.');
 async function read(x,y,w,h,{signal,cooperate}={}){
  range(x,y,w,h);requireValue(cooperate===undefined||typeof cooperate==='function','Invalid complex transfer cooperator.');if(cooperate)checkAbort(signal);if(guarded){await writes;checkAbort(signal);}const out=new ArrayType(w*h*components),bytes=new Uint8Array(out.buffer);
  if(tiles){await tiles.read(bytes,x,y,w,h,{signal,cooperate});return out;}
  if(slabs&&await slabs.read(bytes,x,y,w,h,{signal,cooperate}))return out;
  if(x===0&&w===width){await store.readInto(bytes,y*width*stride);if(cooperate)checkAbort(signal);return out;}
  for(let row=0;row<h;row++){if(row%128===0){if(cooperate)checkAbort(signal);await(cooperate??controlCheckpoint)(signal);if(cooperate)checkAbort(signal);}const pending=store.readInto(bytes.subarray(row*w*stride,(row+1)*w*stride),((y+row)*width+x)*stride);if(pending&&typeof pending.then==='function')await pending;}if(cooperate)checkAbort(signal);return out;
 }
 async function write(values,x,y,w,h,{signal,cooperate}={}){
  range(x,y,w,h);requireValue(cooperate===undefined||typeof cooperate==='function','Invalid complex transfer cooperator.');if(cooperate)checkAbort(signal);requireValue(values instanceof ArrayType&&values.length===w*h*components,'Complex region size mismatch.');const bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength);
  if(tiles){await tiles.write(bytes,x,y,w,h,{signal,cooperate});return;}
  if(slabs&&await slabs.write(bytes,x,y,w,h,{signal,cooperate}))return;
  if(x===0&&w===width){await store.write(bytes,y*width*stride);if(cooperate)checkAbort(signal);return;}
  for(let row=0;row<h;row++){if(row%128===0){if(cooperate)checkAbort(signal);await(cooperate??controlCheckpoint)(signal);if(cooperate)checkAbort(signal);}const pending=store.write(bytes.subarray(row*w*stride,(row+1)*w*stride),((y+row)*width+x)*stride);if(pending&&typeof pending.then==='function')await pending;}if(cooperate)checkAbort(signal);
 }
 const plane={width,height,ArrayType,store,read,write,transportMetrics:()=>tiles?{...tiles.metrics(),backing:store.storage}:{layout:'row-major',tileSize:0,backing:store.storage,physicalBytes:store.byteLength},dispose:()=>store.dispose()};
 if(guarded){
  plane.read=(...args)=>closing?Promise.reject(new EngineError('DISPOSED','Complex plane is closing.')):track(read(...args),true);
  plane.write=(...args)=>closing?Promise.reject(new EngineError('DISPOSED','Complex plane is closing.')):track(enqueueWrite(()=>write(...args)));
  plane.dispose=()=>{if(closeFlight)return closeFlight;closing=true;const task=(async()=>{while(active.size)await Promise.allSettled([...active]);await store.dispose();})();closeFlight=task;void task.catch(()=>{if(closeFlight===task)closeFlight=null;});return task;};
 }
 if(temporaryTileSize){
  // Never publish physical tiled bytes as if they were a row-major plane.
  // Migration preserves byte order; the facade keeps its original layout.
  plane.store={byteLength:store.byteLength,chunkBytes:store.chunkBytes,get storage(){return store.storage;},get allocatedBackingBytes(){return store.allocatedBackingBytes;},async flush(){await writes;return store.flush();},async migrate(...args){await writes;return store.migrate(...args);},async promote(...args){await writes;return store.promote(...args);},async spill(...args){await writes;return store.spill(...args);},markCold(...args){store.markCold(...args);return this;}};
 }
 return plane;
}
// The fused inverse emits one scalar per pixel. It keeps the same bounded
// tiled transport and retirement barriers as complex DFT intermediates.
export const createDftMagnitudePlane=(width,height,options)=>createComplexPlane(width,height,{...options,components:1});
