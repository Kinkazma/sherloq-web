import {requireValue} from './errors.js';
/** Inactive exact ORT sessions only. The pool funds this allowance in addition
 * to the current graph and reclaims the complete idle worker under pressure.
 * No tensor, graph, operator or provider changes on a cache hit. */
export function createNeuralSessionCache(){
 const items=new Map();let bytes=0,hits=0,evictions=0;
 async function evict(){const entry=items.entries().next().value;if(!entry)return;const [key,item]=entry;items.delete(key);bytes-=item.bytes;evictions++;await item.value.session.release();}
 return {
  take(key){const item=items.get(key);if(!item)return null;items.delete(key);bytes-=item.bytes;hits++;return item.value;},
  async put(key,value,cost,maximum){
   requireValue(typeof key==='string'&&value?.session&&Number.isSafeInteger(cost)&&cost>0&&Number.isSafeInteger(maximum)&&maximum>=0,'Invalid neural session cache admission.');
   if(items.has(key)){const old=items.get(key);items.delete(key);bytes-=old.bytes;await old.value.session.release();}
   if(cost>maximum){await value.session.release();return false;}
   while(items.size&&bytes+cost>maximum)await evict();
   items.set(key,{value,bytes:cost});bytes+=cost;return true;
  },
  async clear(){while(items.size)await evict();},
  snapshot(){return {sessions:items.size,bytes,hits,evictions};}
 };
}
