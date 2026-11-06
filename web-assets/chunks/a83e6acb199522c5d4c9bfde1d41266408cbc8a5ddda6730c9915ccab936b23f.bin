import "../../../../../runtime-context.js?v=0.31.0";
import {requireValue} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// A one-use native frame must remain financed after run() returns and until
// its append is acknowledged. It is never an evictable normal ELA cache.
export function createElaSynthesisFrameOwner({budget,original,index,resultId}={}){
 requireValue(budget?.reserve&&original&&Number.isSafeInteger(index)&&index>=0&&typeof resultId==='string'&&resultId.length>0,'A live synthesis frame owner is required.');
 const buffers=new Map();let closed=false,retirement=null;
 return{
  original,index,resultId,get active(){return !closed;},get retainedBytes(){let bytes=0;for(const value of buffers.values())bytes+=value.data.byteLength;return bytes;},
  retain(data){
   requireValue(!closed&&!retirement&&data instanceof Uint8Array,'A live native RGB frame is required.');if(buffers.has(data))return data;
   const release=budget.reserve(data.byteLength);let backing;
   try{backing=budget.registerBacking?.('array-buffer',data.byteLength,{owner:'ela-synthesis',label:'one-use-native-frame',identity:data.buffer});}
   catch(error){release();throw error;}
   buffers.set(data,{data,release,backing});return data;
  },
  dispose(){
   if(retirement)return retirement;if(closed)return Promise.resolve();
   const task=retireCompositeOwners([...buffers.values()].map(value=>async()=>{const bytes=value.data.byteLength,retired=await value.backing?.();value.release();buffers.delete(value.data);value.data=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??bytes);})).then(()=>{closed=true;});
   retirement=task;void task.finally(()=>{if(retirement===task)retirement=null;}).catch(()=>{});return task;
  }
 };
}
