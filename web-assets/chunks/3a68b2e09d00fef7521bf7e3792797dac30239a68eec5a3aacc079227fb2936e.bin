import "../../runtime-context.js?v=0.14.5";
import {echoDerivatives,echoRender} from './echo-math.js';
self.onmessage=async({data})=>{
 try{
  const result=data.kind==='derivatives'
   ?await echoDerivatives(data.image,data.start,data.rows,data.radius)
   :await echoRender(data.bytes,data.limits,data.params,data.total);
  if(data.kind==='derivatives')self.postMessage(result,[result.bytes.buffer,result.limits.buffer]);
  else self.postMessage({bytes:result},[result.buffer]);
 }catch(error){self.postMessage({error:error.code??'WORKER_FAILED'});}
};
