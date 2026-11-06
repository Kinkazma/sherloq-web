import {fusedCpu} from './ela-lut.js';
import {EngineError,requireValue,serializeEngineError} from './errors.js';

let table=null,active=null,closed=false;
self.onmessage=async({data})=>{
 const id=data?.id;
 try{
  requireValue(Number.isSafeInteger(id)&&id>0,'A synthesis LUT request id is required.');
  if(data.method==='shutdown'){
   closed=true;active?.controller.abort();await active?.done;table=null;
   self.postMessage({id,retired:true});return;
  }
  if(closed)throw new EngineError('DISPOSED','Synthesis LUT worker is closed.');
  if(data.method==='install'){
   requireValue(!active&&data.table instanceof Uint8Array&&data.table.length===65536,'A complete native ELA LUT is required.');table=data.table;self.postMessage({id,ready:true});return;
  }
  requireValue(data.method==='compute'&&!active&&table&&data.a instanceof Uint8Array&&data.b instanceof Uint8Array&&data.a.length===data.b.length&&data.a.length%3===0,'A complete independent native RGB pair is required.');
  let done;const owner={controller:new AbortController(),done:new Promise(resolve=>done=resolve)};active=owner;
  try{const result=await fusedCpu(data.a,data.b,data.params,table,{signal:owner.controller.signal});self.postMessage({id,result},[result.buffer]);}
  finally{if(active===owner)active=null;done();}
 }catch(error){self.postMessage({id,error:serializeEngineError(error,'WORKER_FAILED')});}
};
