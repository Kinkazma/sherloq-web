import {serializeEngineError} from './errors.js';
import {fusedCpu} from './ela-lut.js';
let table;
self.onmessage=async({data})=>{
 try{
  if(data.table){table=data.table;postMessage({ready:true});return;}
  const result=await fusedCpu(data.a,data.b,data.params,table);
  postMessage({result},[result.buffer]);
 }catch(error){postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}
};
