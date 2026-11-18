import "../../runtime-context.js?v=0.33.3";
import {serializeEngineError} from './errors.js';
import {echoDerivatives,echoRender} from './echo-math.js';
let active=0,closing=false;
const closed=()=>{if(closing&&!active)self.postMessage({echoClosed:true});};
self.onmessage=async({data})=>{
 if(data.kind==='close'){closing=true;closed();return;}
 if(closing){self.postMessage({error:serializeEngineError(new Error('Echo worker is closing.'),'CANCELLED')});return;}
 active++;
 try{
  const result=data.kind==='derivatives'?await echoDerivatives(data.image,data.start,data.rows,data.radius):await echoRender(data.bytes,data.limits,data.params,data.total,{depth:data.inputDepth??8,rawKind:data.rawKind});
  if(data.kind==='derivatives')self.postMessage(result,[result.bytes.buffer,result.limits.buffer]);
  else self.postMessage({bytes:result},[result.buffer]);
 }catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}
 finally{active--;closed();}
};
