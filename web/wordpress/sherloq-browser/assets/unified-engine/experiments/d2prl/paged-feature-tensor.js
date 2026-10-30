import {createD2prlPagedBlockCache} from './paged-block-cache.js';
import {createSegmentedBytes} from '../../src/segmented-bytes.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';

const identities=new WeakMap(),types={float32:Float32Array,float16:Uint16Array},WINDOW=64*1024**2;
export const isPagedD2prlTensor=value=>identities.has(value);

/** Lossless CHW transport over the existing segmented store. The logical
 * tensor/grid is complete; only its borrowed byte windows are bounded. No
 * convolution, interpolation, reduction or conversion is performed here.
 * Construction is synchronous: the caller owns this actor before initialize()
 * can acquire a temporary store, and dispose waits every admitted I/O call. */
export function createPagedD2prlTensor(shape,{dtype='float32',budget,storage='temporary',temporarySession,getTemporarySession,signal,storeFactory=createSegmentedBytes,label='paged-native-tensor',windowBytes=WINDOW}={}){
 const Type=types[dtype];requireValue(Type&&Array.isArray(shape)&&shape.length===4&&shape[0]===1&&shape.every(v=>Number.isSafeInteger(v)&&v>0)&&shape[1]<=4096&&shape[2]<=8192&&shape[3]<=8192&&budget?.reserve&&Number.isSafeInteger(windowBytes)&&windowBytes>0&&windowBytes<=WINDOW,'Complete Native CHW tensor and bounded transport required');
 const [,channels,height,width]=shape,length=channels*height*width,byteLength=length*Type.BYTES_PER_ELEMENT;
 requireValue(Number.isSafeInteger(byteLength),'Native tensor byte extent');
 const metadata=budget.reserve(4096),life=new AbortController(),pending=new Set(),retirements=new Set();let store,initializing,sealing,sealed=false,closed=false,retired=false,closing;
 const combined=extra=>AbortSignal.any([life.signal,...(signal?[signal]:[]),...(extra?[extra]:[])]);
 const alive=extra=>{checkAbort(signal);checkAbort(extra);checkAbort(life.signal);if(closed)throw new EngineError('DISPOSED','Paged Native tensor closed');};
 const track=work=>{const promise=Promise.resolve().then(work);pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;};
 const initialize=extra=>{
  alive(extra);if(store)return Promise.resolve(store);if(initializing)return initializing;
  initializing=(async()=>{const next=await storeFactory(byteLength,{budget,storage,temporarySession,getTemporarySession,signal:combined(extra),owner:'d2prl',label});store=next;alive(extra);if(next.storage!=='memory')store=createD2prlPagedBlockCache(next,{budget,onOwner:value=>{store=value;}});alive(extra);return store;})();
  initializing.catch(()=>{if(!closed)initializing=null;});return initializing;
 };
 const bytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
 const flatRange=(offset,count)=>requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>=0&&offset+count<=length&&count*Type.BYTES_PER_ELEMENT<=windowBytes,'Bounded Native tensor byte window');
 const geometry=rect=>{
  const {channel=0,channels:count=channels,x=0,y=0,width:w=width,height:h=height}=rect;
  requireValue([channel,count,x,y,w,h].every(Number.isSafeInteger)&&channel>=0&&count>0&&channel+count<=channels&&w>0&&h>0&&count*w*h*Type.BYTES_PER_ELEMENT<=windowBytes,'Bounded Native rectangle');
  return{channel,count,x,y,w,h};
 };
 const actor={
  schema:'sherloq.d2prl-paged-tensor/1',dtype,shape:Object.freeze([...shape]),length,byteLength,
  initialize:({signal:extra}={})=>track(()=>initialize(extra)),
  readIntoRectangle(target,rect,{signal:extra}={}){return track(async()=>{
   alive(extra);requireValue(sealed,'Native tensor must be sealed before reading');const g=geometry(rect);requireValue(target instanceof Type&&target.length===g.count*g.w*g.h,'Exact caller-owned Native rectangle required');await initialize(extra);alive(extra);const ioSignal=combined(extra);target.fill(0);
   for(let c=0;c<g.count;c++)for(let row=0;row<g.h;row++){
    const yy=g.y+row;if(yy<0||yy>=height)continue;const left=Math.max(0,g.x),right=Math.min(width,g.x+g.w);if(right<=left)continue;
    const source=((g.channel+c)*height+yy)*width+left,destination=(c*g.h+row)*g.w+left-g.x;
    await store.readInto(bytes(target.subarray(destination,destination+right-left)),source*Type.BYTES_PER_ELEMENT,{signal:ioSignal});alive(extra);
   }
   return target;
  });},
  writeRectangle(source,rect,{signal:extra}={}){return track(async()=>{
   alive(extra);requireValue(!sealed&&!sealing,'Published Native tensor is immutable');const g=geometry(rect);requireValue(source instanceof Type&&source.length===g.count*g.w*g.h&&g.x>=0&&g.y>=0&&g.x+g.w<=width&&g.y+g.h<=height,'Exact in-domain Native rectangle required');await initialize(extra);alive(extra);const ioSignal=combined(extra);
   for(let c=0;c<g.count;c++)for(let row=0;row<g.h;row++){
    const at=(c*g.h+row)*g.w,destination=((g.channel+c)*height+g.y+row)*width+g.x;
    await store.write(bytes(source.subarray(at,at+g.w)),destination*Type.BYTES_PER_ELEMENT,{signal:ioSignal});alive(extra);
   }
  });},
  readFlat(offset,count,{signal:extra}={}){return track(async()=>{
   alive(extra);requireValue(sealed,'Native tensor must be sealed before reading');flatRange(offset,count);await initialize(extra);alive(extra);const output=allocateOwnedTypedArray(Type,count,{budget,owner:'d2prl',label:label+':read'});let complete=false,failed=false,primary;
   try{await store.readInto(bytes(output.data),offset*Type.BYTES_PER_ELEMENT,{signal:combined(extra)});alive(extra);complete=true;return output;}catch(error){failed=true;primary=error;throw error;}finally{if(!complete){retirements.add(output);try{output.release();retirements.delete(output);}catch(cleanup){if(!failed)throw cleanup;if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.details={...primary.details,pagedReadCleanup:cleanup};}catch{}}}}
  });},
  writeFlat(offset,source,{signal:extra}={}){return track(async()=>{
   alive(extra);requireValue(!sealed&&!sealing&&source instanceof Type,'Mutable exact Native tensor view required');flatRange(offset,source.length);await initialize(extra);alive(extra);await store.write(bytes(source),offset*Type.BYTES_PER_ELEMENT,{signal:combined(extra)});alive(extra);
  });},
  seal({signal:extra}={}){
   alive(extra);if(sealed)return Promise.resolve(actor);if(sealing)return sealing;
   // Existing callers have already adopted their I/O Promises before seal.
   const writes=[...pending];sealing=(async()=>{await Promise.all(writes);await initialize(extra);alive(extra);await store.flush();await store.visit(data=>{const view=new Type(data.buffer,data.byteOffset,data.byteLength/Type.BYTES_PER_ELEMENT);for(const value of view)requireValue(dtype==='float16'?(value&0x7c00)!==0x7c00:Number.isFinite(value),'Nonfinite Native paged tensor');},{signal:combined(extra),blockBytes:Math.min(windowBytes,4*1024**2)});alive(extra);store.markCold();sealed=true;return actor;})().finally(()=>{sealing=null;});return sealing;
  },
  snapshot(){return{shape:[...shape],dtype,byteLength,storage:store?.storage??null,initialized:!!store,sealed,pending:pending.size,retirements:retirements.size,closed,retired,...(typeof store?.snapshot==='function'?{transport:store.snapshot()}:{} )};},
  release(){return actor.dispose();},
  dispose(){
   if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();
   const waits=[...pending,...(initializing?[initializing]:[]),...(sealing?[sealing]:[])];
   closing=(async()=>{await Promise.allSettled(waits);let failed=false,primary;for(const output of [...retirements])try{output.release();retirements.delete(output);}catch(error){if(!failed){failed=true;primary=error;}}try{await store?.dispose();store=null;}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;metadata();retired=true;identities.delete(actor);})().finally(()=>{closing=null;});return closing;
  }
 };
 Object.freeze(actor);identities.set(actor,{shape:actor.shape,dtype,byteLength});return actor;
}
