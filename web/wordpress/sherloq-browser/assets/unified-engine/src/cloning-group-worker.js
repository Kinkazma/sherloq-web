import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {cloningGroupRows} from './cloning-post.js';
let input;
self.onmessage=async({data})=>{try{
  if(data.kind==='init'){input=data.input;postMessage({ready:true});return;}
  const result=await cloningGroupRows(input,data.first,data.last);
  postMessage(result,[result.lengths.buffer,result.groups.buffer]);
}catch(error){postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}};
