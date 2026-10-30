import {createPagedDescriptorStore} from './paged-descriptor-store.js';
import {isPagedD2prlTensor} from './paged-feature-tensor.js';
import {createSegmentedBytes} from '../../src/segmented-bytes.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
import {requireStrictFragmentPlan} from './strict-fragment-plan.js';
import {publishD2prlBankDescriptor} from './descriptor-ownership.js';

const types={float32:Float32Array,float16:Uint16Array};
/** Immutable native tensors, independently produced from each admitted RGB
 * crop. Storage may spill losslessly through the existing temporary session;
 * no fragment, channel, model grid or mantissa is dropped to fit a budget. */
export function createStrictFragmentBank(plan,{budget,temporarySession,getTemporarySession,storage='auto',signal}={}){
 requireStrictFragmentPlan(plan);requireValue(budget?.reserve,'A shared strict fragment budget is required.');
 const fields=new Map(),retiring=new Set(),pending=new Set(),lifetime=new AbortController(),leases=new Set();let closed=false,disposing;
 const key=(id,name)=>id+'\0'+name,fragment=id=>typeof id==='number'?plan.fragments[id]:plan.fragments.find(f=>f.id===id),alive=extra=>{checkAbort(signal);checkAbort(extra);checkAbort(lifetime.signal);if(closed)throw new EngineError('DISPOSED','The strict fragment bank is closed.');requireStrictFragmentPlan(plan);};
 const combined=extra=>AbortSignal.any([lifetime.signal,...(signal?[signal]:[]),...(extra?[extra]:[])]);
 const track=promise=>{pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;};
 function tensor(input){const Type=types[input?.dtype],shape=input?.shape;requireValue(Type&&input.data instanceof Type&&Array.isArray(shape)&&shape.length===4&&shape[0]===1&&shape.every(n=>Number.isSafeInteger(n)&&n>0)&&(shape[1]<=1344||input.dtype==='float32'&&plan.modelSide===1792&&shape[1]===1792&&shape[2]===1792&&shape[3]===2)&&shape[2]<=plan.modelSide&&shape[3]<=plan.modelSide&&input.data.length===shape.reduce((n,v)=>n*v,1),'A complete native CHW tensor is required.');return{Type,shape:[...shape]};}
 return{
  modelSide:plan.modelSide,planFingerprint:plan.fingerprint,
  storageContext(){alive();return Object.freeze({temporarySession,getTemporarySession,storage:'temporary'});},
  adoptPaged(id,name,input){
   alive();const f=fragment(id),channels=name==='zm'?36:name==='cnn'?96:0;requireValue(f&&channels&&isPagedD2prlTensor(input)&&input.dtype==='float16'&&input.snapshot().sealed&&!input.snapshot().closed&&JSON.stringify(input.shape)===JSON.stringify([1,channels,plan.modelSide,plan.modelSide]),'Complete original descriptor half bank required');const k=key(f.id,name);requireValue(!fields.has(k),'A strict native field is immutable');const metadata=budget.reserve(2048);let complete=false;try{const store=createPagedDescriptorStore(input),record={fragmentId:f.id,name,dtype:'float16',shape:[...input.shape],byteLength:input.byteLength,store,metadata};fields.set(k,record);complete=true;return Object.freeze({fragmentId:f.id,name,dtype:record.dtype,shape:input.shape,byteLength:record.byteLength,planFingerprint:plan.fingerprint});}finally{if(!complete)metadata();}
  },
  publish(id,name,input,{signal:extra}={}){return track((async()=>{
   alive(extra);const f=fragment(id);requireValue(f&&typeof name==='string'&&name.length>0&&name.length<=128,'A strict tensor needs its fragment and field identity.');const k=key(f.id,name);if(fields.has(k))throw new EngineError('INVALID_INPUT','A strict native tensor is immutable and cannot be overwritten.');const {Type,shape}=tensor(input),readSignal=combined(extra),metadata=budget.reserve(2048);let store,complete=false;
   // Reserve the metadata before allocating, and publish only after the full
   // tensor has been checked, copied and flushed. Failed writes stay invisible.
   const placeholder={publishing:true};fields.set(k,placeholder);
   try{
    store=await createSegmentedBytes(input.data.byteLength,{budget,temporarySession,getTemporarySession,storage,signal:readSignal,owner:'d2prl',label:'strict-fragment:'+name});
    const stride=65536;
    for(let at=0;at<input.data.length;at+=stride){await controlCheckpoint(readSignal);const values=input.data.subarray(at,Math.min(input.data.length,at+stride));for(const v of values)requireValue(input.dtype==='float16'?(v&0x7c00)!==0x7c00:Number.isFinite(v),'Nonfinite strict native tensor.');await store.write(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),at*Type.BYTES_PER_ELEMENT,{signal:readSignal});}
    await store.flush();alive(extra);store.markCold();const record={fragmentId:f.id,name,dtype:input.dtype,shape,byteLength:input.data.byteLength,store,metadata};fields.set(k,record);complete=true;return Object.freeze({fragmentId:f.id,name,dtype:input.dtype,shape:Object.freeze([...shape]),byteLength:record.byteLength,planFingerprint:plan.fingerprint});
   }finally{if(!complete){if(fields.get(k)===placeholder)fields.delete(k);await store?.dispose();metadata();}}
  })());},
  has(id,name){alive();const f=fragment(id),r=f&&fields.get(key(f.id,name));return !!r&&!r.publishing;},
  descriptor(id,name){alive();const f=fragment(id),r=f&&fields.get(key(f.id,name));requireValue(r&&!r.publishing,'The strict native tensor has not been published.');return Object.freeze({fragmentId:r.fragmentId,name:r.name,dtype:r.dtype,shape:Object.freeze([...r.shape]),byteLength:r.byteLength,storage:r.store.storage,planFingerprint:plan.fingerprint});},
  read(id,name,{signal:extra}={}){return track((async()=>{
   alive(extra);const f=fragment(id),r=f&&fields.get(key(f.id,name));requireValue(r&&!r.publishing,'The strict native tensor has not been published.');if((plan.modelSide===896&&budget.limit<8*1024**3||plan.modelSide===1344&&budget.limit<=2*1024**3)&&typeof budget.reclaim==='function'&&budget.total()+r.byteLength>budget.limit){await budget.reclaim(r.byteLength,{signal:combined(extra),owner:'d2prl'});alive(extra);}const owned=allocateOwnedTypedArray(types[r.dtype],r.byteLength/types[r.dtype].BYTES_PER_ELEMENT,{budget,owner:'d2prl',label:'strict-bank-read:'+name});let complete=false;
   try{await r.store.readInto(new Uint8Array(owned.data.buffer),0,{signal:combined(extra)});alive(extra);const revoke=r.dtype==='float16'?publishD2prlBankDescriptor(owned.data,owned,budget):()=>owned.release();let released=false;const lease={data:owned.data,shape:[...r.shape],dtype:r.dtype,fragmentId:r.fragmentId,release(){if(released)return;revoke();released=true;leases.delete(lease);lease.data=null;}};leases.add(lease);complete=true;return lease;}finally{if(!complete)owned.release();}
  })());},
  gatherHalfCorners(id,name,{positions,destinations,output},{signal:extra}={}){return track((async()=>{
   alive(extra);const f=fragment(id),r=f&&fields.get(key(f.id,name));requireValue(r&&!r.publishing&&r.dtype==='float16'&&r.shape[2]===r.shape[3]&&positions instanceof Int32Array&&destinations instanceof Int32Array&&positions.length===destinations.length&&positions.length<=13*4096*4&&output instanceof Uint16Array,'A bounded native half-corner gather is required.');const side=r.shape[2],n=side*side,channels=r.shape[1],readSignal=combined(extra),order=allocateOwnedTypedArray(Uint32Array,positions.length,{budget,owner:'d2prl',label:'strict-corner-order'});let scratch;try{
    let length=0;for(let i=0;i<positions.length;i++){requireValue(positions[i]>=-1&&positions[i]<n&&destinations[i]>=0&&destinations[i]+(channels-1)*4<output.length,'Strict gathered corner extent.');if(positions[i]<0){for(let c=0;c<channels;c++)output[destinations[i]+c*4]=0;}else order.data[length++]=i;}
    const sorted=order.data.subarray(0,length);sorted.sort((a,b)=>positions[a]-positions[b]);if(!length)return{values:0,readCalls:0,readBytes:0};scratch=allocateOwnedTypedArray(Uint16Array,Math.min(n,32768),{budget,owner:'d2prl',label:'strict-corner-read-window'});let readCalls=0,readBytes=0,stamp=performance.now();
    // The same spatial order is reused for all channels. Bounded coalesced
    // reads retain original half bits and avoid one disk request per corner.
    for(let c=0;c<channels;c++)for(let at=0;at<length;){alive(extra);const first=positions[sorted[at]];let end=at+1,last=first;while(end<length){const next=positions[sorted[end]];if(next-first>=scratch.data.length||next-last>64)break;last=next;end++;}const count=last-first+1;await r.store.readInto(new Uint8Array(scratch.data.buffer,0,count*2),(c*n+first)*2,{signal:readSignal});readCalls++;readBytes+=count*2;for(let i=at;i<end;i++){const sample=sorted[i];output[destinations[sample]+c*4]=scratch.data[positions[sample]-first];}at=end;if(performance.now()-stamp>=8){await controlCheckpoint(readSignal);stamp=performance.now();}}
    alive(extra);return{values:length*channels,readCalls,readBytes};
   }finally{scratch?.release();order.release();}
  })());},
  snapshot(){return{schema:'sherloq.d2prl-strict-fragment-bank/1',planFingerprint:plan.fingerprint,publishedTensors:[...fields.values()].filter(r=>!r.publishing).length,pending:pending.size,leases:leases.size,bytes:[...fields.values()].reduce((sum,r)=>sum+(r.byteLength??0),0),stores:[...fields.values()].filter(r=>!r.publishing).map(r=>({fragmentId:r.fragmentId,name:r.name,dtype:r.dtype,shape:[...r.shape],bytes:r.byteLength,storage:r.store.storage})),policy:'Every tensor remains on its complete native grid, lossless RAM or temporary storage; missing RGB is never encoded as black image data.'};},
  dispose(){if(disposing)return disposing;closed=true;lifetime.abort();disposing=(async()=>{await Promise.allSettled([...pending]);let failed=false,primary;const attempt=async work=>{try{const value=await work();if(value===0||value===false)throw value;}catch(error){if(!failed){failed=true;primary=error;}}};for(const lease of [...leases])await attempt(()=>lease.release());for(const record of fields.values())if(!record.publishing)retiring.add(record);fields.clear();for(const record of [...retiring]){if(!record.storeRetired)await attempt(async()=>{const value=await record.store.dispose();if(value===0||value===false)throw value;record.storeRetired=true;});if(record.storeRetired&&record.metadata)await attempt(async()=>{const value=await record.metadata();if(value===0||value===false)throw value;record.metadata=null;});if(record.storeRetired&&!record.metadata)retiring.delete(record);}if(failed)throw primary;requireValue(!retiring.size&&!leases.size,'Strict bank retirement remains unacknowledged');})();void disposing.catch(()=>{disposing=null;});return disposing;}
 };
}
