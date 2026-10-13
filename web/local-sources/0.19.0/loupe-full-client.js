import {createRemoteSurface} from './remote-surface.js?v=0.19.0';
import {TileCache} from './tiled-surface.js?v=0.19.0';

// One background preparation worker, shared by all panels. Its completed images
// are retained separately from the active analysis and from the small R preview.
let shared=null;
function encodedError(error,seen=new Set()){
 if(seen.has(error))return {code:'WORKER_FAILED',message:'Circular error cause'};seen.add(error);
 const value={name:error?.name??'Error',code:error?.code??'WORKER_FAILED',message:error?.message??String(error),stack:error?.stack};
 if(error?.details!==undefined)try{value.details=structuredClone(error.details);}catch{value.details={diagnostic:String(error.details)};}
 if(error?.cause!==undefined)value.cause=encodedError(error.cause,seen);return value;
}
function receivedError(value){const error=Object.assign(Error(value?.message??String(value)),value&&typeof value==='object'?value:{});if(value?.cause!==undefined)error.cause=receivedError(value.cause);return error;}
function service(){
 if(shared)return shared;
 const sourceURL=new URL('./loupe-full-worker.js?v=0.19.0',import.meta.url);let worker;
 try{worker=new Worker(sourceURL,{type:'module'});}catch(cause){throw Object.assign(Error('Loupe preparation worker could not start.',{cause}),{code:'WORKER_FAILED',details:{sourceURL:String(sourceURL),executionPhase:'worker-startup'}});}
 const pending=new Map();let serial=0,users=0,failed=null;
 const fail=error=>{if(failed)return;failed=error;for(const job of pending.values())job.reject(error);pending.clear();worker.terminate();if(shared===api)shared=null;};
 const transportError=(message,cause,details={})=>Object.assign(Error(message,{cause}),{code:'WORKER_MESSAGE_FAILED',details:{sourceURL:String(sourceURL),...details}});
 const send=message=>{if(failed)return false;try{worker.postMessage(message);return true;}catch(cause){fail(transportError('Loupe worker message could not be sent.',cause,{action:message.action,executionPhase:'message-send'}));return false;}};
 const api={get failed(){return failed;},retain(){users++;return api;},call(action,payload={},source){if(failed)return {ticket:0,promise:Promise.reject(failed)};const ticket=++serial,promise=new Promise((resolve,reject)=>{pending.set(ticket,{resolve,reject,source});send({action,ticket,...payload});});return{ticket,promise};},send,release(){if(users<=0||--users)return;if(shared===api)shared=null;send({action:'dispose'});}};
 async function supplySource(data){
  try{const input=pending.get(data.ticket)?.source;if(!input)throw Object.assign(Error('Source released'),{code:'CANCELLED'});const pixels=await (input.readDisplayPixels??input.readPixels).call(input,data.rect);if(failed)return;try{worker.postMessage({action:'source',read:data.read,pixels},[pixels.data.buffer]);}catch(cause){fail(transportError('Loupe source pixels could not be transferred.',cause,{executionPhase:'source-transfer'}));}}
  catch(error){send({action:'source',read:data.read,error:encodedError(error)});}
 }
 worker.onmessage=({data})=>{
  if(!data||typeof data!=='object'||Array.isArray(data)){fail(transportError('Invalid loupe worker response.',undefined,{executionPhase:'message-receive'}));return;}
  if(data.fatal){fail(receivedError(data.error??data.fatal));return;}
  if(data.action==='disposed'){worker.terminate();return;}
  if(data.action==='source'){
   void supplySource(data).catch(error=>fail(error));return;
  }
  if(!Number.isInteger(data.ticket)||data.ticket<=0){fail(transportError('Loupe worker response has no request identity.',undefined,{executionPhase:'message-receive'}));return;}
  const job=pending.get(data.ticket);if(!job)return;pending.delete(data.ticket);if(data.error)job.reject(receivedError(data.error));else job.resolve(data);
 };
 worker.onerror=event=>fail(Object.assign(Error(event.message||'Loupe preparation worker failed',{cause:event.error}),{code:'WORKER_FAILED',details:{sourceURL:event.filename||String(sourceURL),line:event.lineno,column:event.colno,executionPhase:event.stage??'worker-event'}}));
 worker.onmessageerror=event=>fail(transportError('Loupe worker response could not be decoded.',event.error,{executionPhase:'message-receive'}));
 shared=api;return api;
}
function overviewCanvas(pixels){const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(pixels.width,pixels.height);for(let a=0,b=0;a<pixels.data.length;a+=3,b+=4){image.data[b]=pixels.data[a];image.data[b+1]=pixels.data[a+1];image.data[b+2]=pixels.data[a+2];image.data[b+3]=255;}ctx.putImageData(image,0,0);return canvas;}
const effectKey=effects=>JSON.stringify(Object.fromEntries(Object.entries(effects).filter(([,p])=>p.enabled)));
const cancelled=()=>Object.assign(Error('Loupe preparation superseded'),{code:'CANCELLED'});
export function createLoupeImageCache({changed=()=>{},state=()=>{}}={}){
 let api=null,source=null,wanted='',building=null,current=null,failed='',failure=null,closed=false,builds=0,displayReads=0;
 const tiles=new TileCache(24*1024**2);
 // A prepared image has one owner in this cache, plus lightweight presentation
 // leases. L, exports and previous-frame previews share the same stored pixels.
 function prepared(result,input,key,jobApi){
  const overview=overviewCanvas(result.preview),width=input.width,height=input.height;let references=1;
  jobApi.retain();
  const release=()=>{if(--references)return;overview.width=overview.height=0;jobApi.send({action:'release',resultId:result.resultId});jobApi.release();};
  const request=async(action,{tile,rect})=>{displayReads++;return jobApi.call('read',{resultId:result.resultId,tile:tile??{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1}}).promise;};
  const error=error=>{if(error.code!=='DISPOSED')state({error,busy:false});};
  function acquire(onChange=changed){
   references++;let released=false;const remote=createRemoteSurface({width,height},tiles,request,onChange,error);
   return {width,height,byteLength:0,preparedLoupe:true,metrics:result.metrics,
    prepare(bounds,scale){if(released)return false;remote.prepare(bounds,scale);return true;},
    draw(ctx,bounds,scale){if(released)return;ctx.drawImage(overview,0,0,width,height);remote.draw(ctx,bounds,scale);},
    readPixels:rect=>released?Promise.reject(cancelled()):remote.readPixels(rect),
    readDisplayPixels:rect=>released?Promise.reject(cancelled()):remote.readDisplayPixels(rect),
    fork:onChange=>released?null:acquire(onChange),freeze:()=>released?null:acquire(),
    close(){if(released)return;released=true;remote.close();release();}
   };
  }
  const frames=[0,1,2].map(()=>createRemoteSurface({width,height},tiles,request,changed,error));
  return {key,source:input,id:result.resultId,overview,frames,metrics:result.metrics,acquire,width,height,get available(){return !jobApi.failed;},release(){for(const frame of frames)frame.close();release();}};
 }
 function retire(){current?.release();current=null;}
 function cancel(){if(building){building.api.send({action:'cancel',ticket:building.ticket});building=null;}wanted='';}
 function rememberFailure(key,error){failed=key;failure=error;state({busy:false,error});changed();}
 function ensure(input,effects,{retry=false}={}){
  if(closed||!input?.readPixels)return null;
  if(source!==input){cancel();retire();source=input;failed='';failure=null;}
  const key=effectKey(effects);
  if(building&&building.key!==key)cancel();wanted=key;
  if(api?.failed){const error=api.failed;if(retry&&building?.api===api){cancel();wanted=key;}api.release();api=null;if(!retry&&!building&&current?.key===key&&failed!==key)rememberFailure(key,error);}
  if(current?.key===key&&current.available)return current;
  if(building?.key===key||failed===key)return current;
  try{api??=service().retain();}catch(error){rememberFailure(key,error);return current;}state({busy:true,scope:'image'});
  const jobApi=api,job=jobApi.call('build',{width:input.width,height:input.height,effects},input),record={...job,key,api:jobApi};building=record;
  record.done=job.promise.then(result=>{
   if(closed||building!==record||source!==input||wanted!==key){jobApi.send({action:'release',resultId:result.resultId});throw cancelled();}
   let next;try{next=prepared(result,input,key,jobApi);}catch(error){jobApi.send({action:'release',resultId:result.resultId});throw error;}
   retire();current=next;builds++;failed='';failure=null;state({busy:false,scope:'image',metrics:result.metrics});changed();return next;
  }).catch(error=>{if(!closed&&building===record&&error?.code!=='CANCELLED')rememberFailure(key,error);throw error;}).finally(()=>{if(building===record)building=null;});
  // Movement doesn't await preparation; full-image presentation does.
  record.done.catch(()=>{});
  return current;
 }
 return {ensure,cancel,get current(){return current;},get settled(){return !!current&&current.available&&current.key===wanted&&!building;},get metrics(){return {builds,displayReads,...current?.metrics};},
  async acquire(input,effects,onChange=changed){
   const key=effectKey(effects);if(failed===key){failed='';failure=null;}ensure(input,effects,{retry:true});
   if(current?.key!==key||!current.available){if(!building)throw failure??cancelled();await building.done;}
   if(closed||source!==input||current?.key!==key||!current.available)throw failure??cancelled();return current.acquire(onChange);
  },
  draw(ctx,bounds,scale,index){if(!current)return false;ctx.drawImage(current.overview,0,0,current.width,current.height);if(current.available)current.frames[index].draw(ctx,bounds,scale);return true;},
  reset(){cancel();retire();source=null;failed='';failure=null;},dispose(){closed=true;cancel();retire();api?.release();api=null;}
 };
}
