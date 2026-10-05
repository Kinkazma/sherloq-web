import {buildLoupeImage} from './loupe-full-image.js';
import {Budget} from './unified-engine/src/cache.js';
import {createTemporarySession} from './unified-engine/src/temporary-storage.js';
import {checkAbort,serializeEngineError} from './unified-engine/src/errors.js';
import {releaseAdjustWasm} from './unified-engine/src/adjust-math.js';

const budget=new Budget(128*1024**2),results=new Map(),jobs=new Map(),reads=new Map();
let serial=0,queue=Promise.resolve(),session=null;
const temporarySession=()=>session??=createTemporarySession({budget});
function sourceWindow(ticket,rect,signal){
 checkAbort(signal);const read=++serial;
 return new Promise((resolve,reject)=>{
  const abort=()=>{reads.delete(read);reject(Object.assign(Error('Loupe preparation cancelled'),{code:'CANCELLED'}));};
  reads.set(read,{resolve:pixels=>{signal.removeEventListener('abort',abort);resolve({pixels,release(){}});},reject:error=>{signal.removeEventListener('abort',abort);reject(error);}});
  signal.addEventListener('abort',abort,{once:true});self.postMessage({action:'source',ticket,read,rect});
 });
}
async function release(id){const record=results.get(id);if(!record)return;results.delete(id);await Promise.allSettled([...record.reads]);await record.surface.dispose();}
async function build(job,controller){
 const {signal}=controller;let output;
 try{
  checkAbort(signal);let sourceReads=0;
  const source={descriptor:{width:job.width,height:job.height,id:String(job.ticket),revision:1,format:'rgb8'},readWindow:(rect)=>{sourceReads++;return sourceWindow(job.ticket,rect,signal);}};
  output=await buildLoupeImage(source,job.effects,{storageBudget:budget,temporarySession,signal,maxWorkers:Math.max(1,Math.min(32,globalThis.navigator?.hardwareConcurrency??1))});
  const step=Math.max(1,Math.ceil(Math.sqrt(job.width*job.height/(2*1024**2))),Math.ceil(job.width/4096),Math.ceil(job.height/4096));
  const preview=await output.surface.readSampledWindow({x:0,y:0,w:job.width,h:job.height,step},{signal});
  try{checkAbort(signal);results.set(job.ticket,{...output,reads:new Set()});self.postMessage({ticket:job.ticket,resultId:job.ticket,preview:preview.pixels,metrics:{...output.metrics,sourceReads}},[preview.pixels.data.buffer]);output=null;}finally{preview.release();}
 }catch(error){self.postMessage({ticket:job.ticket,error:serializeEngineError(error)});}
 finally{await output?.surface.dispose();jobs.delete(job.ticket);releaseAdjustWasm();}
}
self.onmessage=({data:message})=>{
 if(message.action==='source'){const pending=reads.get(message.read);reads.delete(message.read);if(pending){if(message.error)pending.reject(Object.assign(Error(message.error.message),message.error));else pending.resolve(message.pixels);}return;}
 if(message.action==='build'){const controller=new AbortController();jobs.set(message.ticket,controller);const run=()=>build(message,controller);queue=queue.then(run,run);return;}
 if(message.action==='cancel'){jobs.get(message.ticket)?.abort();return;}
 if(message.action==='release'){void release(message.resultId);return;}
 if(message.action==='read'){
  const record=results.get(message.resultId);if(!record){self.postMessage({ticket:message.ticket,error:{code:'DISPOSED',message:'Loupe image released'}});return;}
  const task=(async()=>{let part;try{part=await record.surface.readSampledWindow(message.tile);self.postMessage({ticket:message.ticket,pixels:part.pixels},[part.pixels.data.buffer]);}catch(error){self.postMessage({ticket:message.ticket,error:serializeEngineError(error)});}finally{part?.release();}})();
  record.reads.add(task);task.finally(()=>record.reads.delete(task));return;
 }
 if(message.action==='dispose'){for(const controller of jobs.values())controller.abort();void queue.then(async()=>{await Promise.all([...results.keys()].map(release));if(session)await(await session).dispose();self.postMessage({action:'disposed'});}).catch(()=>self.postMessage({action:'disposed'}));}
};
