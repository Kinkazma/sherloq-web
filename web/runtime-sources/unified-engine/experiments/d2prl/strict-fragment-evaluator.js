import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
import {getD2prlDescriptorLease,validateD2prlDescriptor} from './descriptor-ownership.js';

const PAGE=16*1024**2,MAX=512*1024**2;
/** Bounded transport to the genuine native half scorer. Source ZM/CNN banks
 * remain immutable native CHW and upload once per fragment. Target corners
 * carry their own fragment ownership; they are never read from source RGB. */
export async function createStrictFragmentEvaluator(factory,{budget,signal,residentForeignLimit=0}={}){
 requireValue(typeof factory==='function'&&budget?.reserve&&[0,1].includes(residentForeignLimit),'A pinned strict native evaluator factory and shared budget are required.');checkAbort(signal);
 const residency=[budget.reserve(PAGE)],sources=new Map();let module,backing,heapBytes=0,accounted=PAGE,busy=false,disposed=false,upload=null;
 const track=()=>{const next=module.HEAPU8.byteLength;requireValue(next<=accounted,'Strict scorer heap exceeded its admitted capacity.');if(next!==heapBytes){backing?.();backing=budget.registerBacking?.('wasm',next,{owner:'d2prl',label:'strict-fragment-evaluator'});heapBytes=next;}};
 try{module=await factory();track();checkAbort(signal);}catch(error){backing?.();for(const free of residency)free();throw error;}
 const alive=extra=>{checkAbort(signal);checkAbort(extra);if(disposed)throw new EngineError('DISPOSED','Strict native evaluator disposed.');};
 const admit=bytes=>{const required=Math.max(accounted,Math.ceil((bytes+PAGE)/PAGE)*PAGE);if(required>MAX)throw new EngineError('MEMORY_LIMIT','The strict scorer tile exceeds its bounded helper heap; split transport without changing scientific settings.');if(required>accounted){residency.push(budget.reserve(required-accounted));accounted=required;}};
 const allocate=bytes=>{const p=module._malloc(Math.max(8,bytes));track();if(!p)throw new EngineError('MEMORY_ALLOCATION','Strict native scorer refused an allocation.',{details:{allocationKind:'wasm',requestedBytes:bytes}});return p;};
 const keyFor=(channels,foreignSlot)=>{requireValue(foreignSlot===undefined||Number.isSafeInteger(foreignSlot)&&foreignSlot>=0&&foreignSlot<residentForeignLimit,'Foreign source slot exceeds the admitted resident capacity.');return foreignSlot===undefined?channels:'foreign:'+foreignSlot+':'+channels;};
 const sourceBytes=()=>[...sources.values()].reduce((sum,s)=>sum+s.bytes,0);
 const copy=(a,p)=>module.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);

 return{
  get residentForeignCapacity(){return residentForeignLimit;},
  beginSource({side,channels,identity,byteLength,foreignSlot}){
   alive();requireValue(!busy&&!upload&&Number.isSafeInteger(side)&&side>=2&&side<=448&&[36,96].includes(channels)&&byteLength===channels*side*side*2&&typeof identity==='string'&&identity.length>0,'A complete native source upload identity is required.');const key=keyFor(channels,foreignSlot),old=sources.get(key),reused=old?.bytes===byteLength;admit(sourceBytes()+(reused?0:byteLength));const pointer=reused?old.pointer:allocate(byteLength);if(old){sources.delete(key);if(!reused)module._free(old.pointer);}upload={pointer,bytes:byteLength,side,channels,identity,foreignSlot,key,at:0};busy=true;
  },
  async sourceChunk({at,data},{signal:extra}={}){
   alive(extra);requireValue(upload&&busy&&Number.isSafeInteger(at)&&at===upload.at&&data instanceof Uint16Array&&data.length>0&&data.byteLength<=8*1024**2&&at+data.byteLength<=upload.bytes,'Ordered bounded native descriptor upload required.');let borrowed,complete=false;try{borrowed=budget.reserve(data.byteLength);let stamp=performance.now();for(let i=0;i<data.length;i++){requireValue((data[i]&0x7c00)!==0x7c00,'Nonfinite strict source descriptor upload.');if((i&8191)===0){alive(extra);if(performance.now()-stamp>=8){await controlCheckpoint(extra??signal);stamp=performance.now();}}}alive(extra);copy(data,upload.pointer+at);upload.at+=data.byteLength;complete=true;}finally{borrowed?.();if(!complete&&upload){module._free(upload.pointer);upload=null;busy=false;}}
  },
  endSource(){alive();requireValue(upload&&busy&&upload.at===upload.bytes,'A partial strict source cannot be published.');sources.set(upload.key,{...upload,publication:null});upload=null;busy=false;},
  cancelSource(){if(!upload)return;module._free(upload.pointer);upload=null;busy=false;},
  async source({data,side,channels,identity,foreignSlot},{signal:extra}={}){
   alive(extra);requireValue(!busy&&data instanceof Uint16Array&&Number.isSafeInteger(side)&&side>=2&&side<=448&&[36,96].includes(channels)&&data.length===channels*side*side&&typeof identity==='string'&&identity.length>0,'A complete immutable native descriptor bank is required.');
   const key=keyFor(channels,foreignSlot),publication=getD2prlDescriptorLease(data),old=sources.get(key);if(publication&&old?.publication===publication&&old.identity===identity){requireValue(old.side===side,'A strict source identity cannot name another native grid.');return false;}busy=true;let p,complete=false,borrowed,reused=false;
   try{await validateD2prlDescriptor(data,{signal:extra??signal});alive(extra);reused=old?.bytes===data.byteLength;admit(sourceBytes()+(reused?0:data.byteLength));borrowed=budget.reserve(data.byteLength);p=reused?old.pointer:allocate(data.byteLength);copy(data,p);alive(extra);sources.set(key,{pointer:p,bytes:data.byteLength,side,channels,identity,publication,foreignSlot});complete=true;if(old&&!reused)module._free(old.pointer);return true;}
   finally{borrowed?.();if(!complete&&p){module._free(p);if(reused)sources.delete(key);}busy=false;}
  },
  async supports({x,y,side},{signal:extra}={}){
   alive(extra);requireValue(!busy&&x instanceof Float32Array&&y instanceof Float32Array&&x.length===y.length&&x.length>0&&x.length<=13*4096&&Number.isSafeInteger(side)&&side>=2&&side<=448,'A bounded native target-coordinate tile is required.');busy=true;const pointers=[];let output,complete=false,borrowed;
   try{admit(sourceBytes()+x.byteLength+y.byteLength+x.length*16);borrowed=budget.reserve(x.byteLength+y.byteLength);const put=a=>{const p=allocate(a.byteLength);pointers.push(p);copy(a,p);return p;},xp=put(x),yp=put(y),p=allocate(x.length*16);pointers.push(p);requireValue(module._d2prl_strict_supports(xp,yp,x.length,side,p)===1,'Strict target support escaped its real fragment grid.');alive(extra);output=allocateOwnedTypedArray(Int32Array,x.length*4,{budget,owner:'d2prl',label:'strict-target-supports'});output.data.set(module.HEAP32.subarray(p/4,p/4+x.length*4));complete=true;return output;}
   finally{for(const p of pointers)module._free(p);borrowed?.();if(!complete)output?.release();busy=false;}
  },
  async evaluate({channels,side,candidates,begin,end,corners,cornerOffsets,targetX,targetY,offsetX,offsetY,valid,originalX,originalY,bounds,referenceThreads=8},{signal:extra}={}){
   alive(extra);const source=sources.get(channels),count=end-begin,n=side*side;requireValue(!busy&&source?.side===side&&Number.isSafeInteger(candidates)&&candidates>=1&&candidates<=13&&Number.isSafeInteger(begin)&&Number.isSafeInteger(end)&&begin>=0&&end<=n&&count>0&&count<=4096&&Number.isSafeInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'A bounded source-matched native evaluator tile is required.');
   const hybrid=cornerOffsets!==undefined,resident=hybrid&&residentForeignLimit>0;requireValue(corners instanceof Uint16Array&&(hybrid?cornerOffsets instanceof Int32Array&&cornerOffsets.length===candidates*count&&corners.length%(channels*4)===0:corners.length===candidates*count*channels*4)&&[targetX,targetY,offsetX,offsetY].every(a=>a instanceof Float32Array&&a.length===candidates*count)&&valid instanceof Uint8Array&&valid.length===candidates*count&&[originalX,originalY].every(a=>a instanceof Float32Array&&a.length===count)&&Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)&&bounds[2]>=bounds[0]&&bounds[3]>=bounds[1],'Complete packed targets and original coordinate frame are required.');
   busy=true;const pointers=[];let output,complete=false,borrowed;const arrays=[corners,...(hybrid?[cornerOffsets]:[]),targetX,targetY,offsetX,offsetY,valid,originalX,originalY],bytes=arrays.reduce((sum,a)=>sum+a.byteLength,0);
   try{
    let stamp=performance.now();for(let i=0;i<count;i++)requireValue(Number.isFinite(originalX[i])&&Number.isFinite(originalY[i]),'Nonfinite strict source position.');
    for(let p=0;p<valid.length;p++){if((p&511)===0){alive(extra);if(performance.now()-stamp>=8){await controlCheckpoint(extra??signal);stamp=performance.now();}}requireValue(valid[p]===0||valid[p]===1,'Strict target membership must be boolean.');if(!valid[p])continue;requireValue(Number.isFinite(targetX[p])&&Number.isFinite(targetY[p])&&targetX[p]>=0&&targetX[p]<=side-1&&targetY[p]>=0&&targetY[p]<=side-1&&Number.isFinite(offsetX[p])&&Number.isFinite(offsetY[p]),'Nonfinite or out-of-grid admitted target.');const at=hybrid?cornerOffsets[p]:p*channels*4;if(hybrid)requireValue(at===-1||at<=-2&&resident&&-at-2<residentForeignLimit&&sources.get(keyFor(channels,-at-2))?.side===side||at>=0&&at%(channels*4)===0&&at+channels*4<=corners.length,'Strict foreign descriptor offset escaped its published resident or compact bank.');if(at>=0)for(let c=0;c<channels*4;c++)requireValue((corners[at+c]&0x7c00)!==0x7c00,'Nonfinite admitted target descriptor.');}
    alive(extra);admit(sourceBytes()+bytes+count*8);borrowed=budget.reserve(bytes);const put=a=>{const p=allocate(a.byteLength);pointers.push(p);copy(a,p);return p;},args=arrays.map(put),p=allocate(count*8);pointers.push(p);
    let residentPointer;if(resident){const table=Int32Array.from({length:residentForeignLimit},(_,slot)=>sources.get(keyFor(channels,slot))?.pointer??0);residentPointer=put(table);}const nativeArgs=resident?[args[0],args[1],residentPointer,residentForeignLimit,...args.slice(2)]:args;
    requireValue(module[resident?'_d2prl_strict_resident_tile':hybrid?'_d2prl_strict_hybrid_tile':'_d2prl_strict_packed_tile'](source.pointer,...nativeArgs,side,channels,candidates,begin,end,referenceThreads,...bounds,p,p+count*4)===1,'Strict native half evaluator rejected the source/target tile.');alive(extra);output=allocateOwnedTypedArray(Float32Array,count*2,{budget,owner:'d2prl',label:'strict-native-offsets'});output.data.set(module.HEAPF32.subarray(p/4,p/4+count*2));complete=true;return{data:output.data,x:output.data.subarray(0,count),y:output.data.subarray(count),release:output.release};
   }finally{for(const p of pointers)module._free(p);borrowed?.();if(!complete)output?.release();busy=false;}
  },
  snapshot(){return{heapCapacityBytes:heapBytes,admittedHeapBytes:accounted,sourceBytes:sourceBytes(),sources:[...sources.values()].map(({identity,side,channels,bytes,foreignSlot})=>({identity,side,channels,bytes,foreignSlot})),residentForeignLimit,busy};},
  dispose(){requireValue(!busy,'Strict native evaluator busy.');if(disposed)return;disposed=true;for(const source of sources.values())module._free(source.pointer);sources.clear();const bytes=heapBytes;module=null;backing?.();for(const free of residency)free();budget.notifyBackingRelease?.('wasm',bytes);}
 };
}
