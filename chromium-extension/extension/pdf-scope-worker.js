import {detectPDFGeometricScope} from './pdf-geometric-scope.js';
const pending=[];let active=null,running=false,closed=false,priority=new Set();
async function pump(){
 if(running||closed)return;running=true;
 try{while(pending.length&&!closed){
  const preferred=pending.findIndex(job=>priority.has(job.id)),job=pending.splice(preferred<0?0:preferred,1)[0];active=job;job.controller=new AbortController();job.requeue=false;
  try{const scope=await detectPDFGeometricScope(job.image,{signal:job.controller.signal});if(!closed)self.postMessage({id:job.id,scope});}
  catch(error){if(job.requeue&&!closed)pending.push(job);else if(!closed)self.postMessage({id:job.id,error:{code:error.code,message:error.message,details:error.details}});}
  finally{active=null;}
 }}finally{running=false;}
}
self.onmessage=({data})=>{
 if(data.type==='dispose'){closed=true;pending.length=0;active?.controller.abort();return;}
 if(data.type==='priority'){
  priority=new Set(data.ids);
  if(active&&!priority.has(active.id)&&pending.some(job=>priority.has(job.id))){active.requeue=true;active.controller.abort();}
  return;
 }
 if(data.type!=='prepare'||closed)return;
 pending.push({id:data.id,image:data.image});void pump();
};
