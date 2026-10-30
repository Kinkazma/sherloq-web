import "../../runtime-context.js?v=0.30.0";
import {allocateTypedArray} from './allocation.js';
import {requireValue} from './errors.js';
/** Fresh transport buffers only, funded by the admitted envelope. Each
 * backing remains strongly reachable until its real release/notification ACK. */
export function createNeuralWindowOutputOwner({budget,maximumBytes,onOwner}={}){
 requireValue(budget?.registerBacking&&Number.isSafeInteger(maximumBytes)&&maximumBytes>=0&&typeof onOwner==='function','A prefunded output owner is required.');
 const entries=[],seen=new Set();let bytes=0,closed=false,flight;
 const register=(entry)=>{if(entry.data.byteLength){requireValue(!budget.resources?.backingIdentities?.has(entry.data.buffer),'Fresh transport outputs cannot alias an existing scientific backing.');entry.backing=budget.registerBacking('array-buffer',entry.data.buffer.byteLength,{owner:'neural-window',label:'complete-neural-window-output',identity:entry.data.buffer});}};
 const owner={get state(){return{bytes,entries:entries.length,closed};},
  allocate(Type,length){requireValue(!closed&&Number.isSafeInteger(length)&&length>=0&&Number.isSafeInteger(Type?.BYTES_PER_ELEMENT)&&bytes+length*Type.BYTES_PER_ELEMENT<=maximumBytes,'Window output exceeds its prepaid envelope.');const entry={data:null,backing:null,retired:false,notified:false,bytes:length*Type.BYTES_PER_ELEMENT};entries.push(entry);bytes+=entry.bytes;entry.data=allocateTypedArray(Type,length,{label:'neural-window-complete-output'});seen.add(entry.data.buffer);register(entry);return entry.data;},
  adopt(value){
   requireValue(!closed,'Window output owner is closed.');
   const visit=(v,depth)=>{requireValue(depth<=12,'Window output nesting exceeds its bound.');if(ArrayBuffer.isView(v)){if(seen.has(v.buffer))return;requireValue(bytes+v.buffer.byteLength<=maximumBytes,'Received neural output exceeds its prepaid envelope.');const entry={data:v,backing:null,retired:false,notified:false,bytes:v.buffer.byteLength};entries.push(entry);bytes+=entry.bytes;seen.add(v.buffer);register(entry);return;}if(v&&typeof v==='object')for(const child of Object.values(v))visit(child,depth+1);};visit(value,0);
  },
  dispose(){if(closed)return Promise.resolve();if(flight)return flight;flight=(async()=>{let failed=false,primary;for(const e of entries)try{
    if(!e.retired){if(e.backing){const ack=await e.backing();if(ack===0||ack===false)throw ack;e.retiredBytes=ack;}e.retired=true;}
    if(!e.notified){budget.notifyBackingRelease?.('array-buffer',e.retiredBytes??e.bytes);e.notified=true;}
    e.backing=e.data=null;
   }catch(error){if(!failed){failed=true;primary=error;}}
   if(failed)throw primary;entries.length=0;seen.clear();closed=true;
  })();void flight.catch(()=>{flight=null;});return flight;}
 };
 onOwner(owner);return owner;
}
