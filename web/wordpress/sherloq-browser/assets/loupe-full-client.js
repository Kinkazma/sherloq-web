import {createRemoteSurface} from './remote-surface.js';
import {TileCache} from './tiled-surface.js';

// One background preparation worker, shared by all panels. Its completed images
// are retained separately from the active analysis and from the small R preview.
let shared=null;
function service(){
 if(shared)return shared;
 const worker=new Worker(new URL('./loupe-full-worker.js',import.meta.url),{type:'module'}),pending=new Map();let serial=0,users=0,failed=null;
 const api={get failed(){return failed;},retain(){users++;return api;},call(action,payload={},source){if(failed)return {ticket:0,promise:Promise.reject(failed)};const ticket=++serial,promise=new Promise((resolve,reject)=>{pending.set(ticket,{resolve,reject,source});worker.postMessage({action,ticket,...payload});});return{ticket,promise};},send:message=>worker.postMessage(message),release(){if(--users)return;if(shared===api)shared=null;worker.postMessage({action:'dispose'});}};
 worker.onmessage=async({data})=>{
  if(data.action==='disposed'){worker.terminate();return;}
  if(data.action==='source'){
   try{const input=pending.get(data.ticket)?.source;if(!input)throw Object.assign(Error('Source released'),{code:'CANCELLED'});const pixels=await (input.readDisplayPixels??input.readPixels).call(input,data.rect);worker.postMessage({action:'source',read:data.read,pixels},[pixels.data.buffer]);}
   catch(error){worker.postMessage({action:'source',read:data.read,error:{code:error.code,message:error.message}});}return;
  }
  const job=pending.get(data.ticket);if(!job)return;pending.delete(data.ticket);if(data.error)job.reject(Object.assign(Error(data.error.message),data.error));else job.resolve(data);
 };
 worker.onerror=event=>{failed=Error(event.message||'Loupe preparation worker failed');for(const job of pending.values())job.reject(failed);pending.clear();worker.terminate();if(shared===api)shared=null;};
 shared=api;return api;
}
function overviewCanvas(pixels){const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(pixels.width,pixels.height);for(let a=0,b=0;a<pixels.data.length;a+=3,b+=4){image.data[b]=pixels.data[a];image.data[b+1]=pixels.data[a+1];image.data[b+2]=pixels.data[a+2];image.data[b+3]=255;}ctx.putImageData(image,0,0);return canvas;}
const effectKey=effects=>JSON.stringify(Object.fromEntries(Object.entries(effects).filter(([,p])=>p.enabled)));
const cancelled=()=>Object.assign(Error('Loupe preparation superseded'),{code:'CANCELLED'});
export function createLoupeImageCache({changed=()=>{},state=()=>{}}={}){
 let api=null,source=null,wanted='',building=null,current=null,failed='',closed=false,builds=0,displayReads=0;
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
  return {key,source:input,id:result.resultId,overview,frames,metrics:result.metrics,acquire,width,height,release(){for(const frame of frames)frame.close();release();}};
 }
 function retire(){current?.release();current=null;}
 function cancel(){if(building){api.send({action:'cancel',ticket:building.ticket});building=null;}wanted='';}
 function ensure(input,effects){
  if(closed||!input?.readPixels)return null;
  if(source!==input){cancel();retire();source=input;failed='';}
  const key=effectKey(effects);
  if(building&&building.key!==key)cancel();wanted=key;
  if(api?.failed){retire();api.release();api=null;failed='';}
  if(current?.key===key)return current;
  if(building?.key===key||failed===key)return current;
  api??=service().retain();state({busy:true,scope:'image'});
  const jobApi=api,job=jobApi.call('build',{width:input.width,height:input.height,effects},input);building={...job,key};
  building.done=job.promise.then(result=>{
   if(closed||building?.ticket!==job.ticket||source!==input||wanted!==key){jobApi.send({action:'release',resultId:result.resultId});throw cancelled();}
   let next;try{next=prepared(result,input,key,jobApi);}catch(error){jobApi.send({action:'release',resultId:result.resultId});throw error;}
   retire();current=next;builds++;failed='';state({busy:false,scope:'image',metrics:result.metrics});changed();return next;
  }).catch(error=>{if(!closed&&building?.ticket===job.ticket&&error.code!=='CANCELLED'){failed=key;state({busy:false,error});changed();}throw error;}).finally(()=>{if(building?.ticket===job.ticket)building=null;});
  // Movement doesn't await preparation; full-image presentation does.
  building.done.catch(()=>{});
  return current;
 }
 return {ensure,cancel,get current(){return current;},get settled(){return !!current&&current.key===wanted&&!building;},get metrics(){return {builds,displayReads,...current?.metrics};},
  async acquire(input,effects,onChange=changed){
   const key=effectKey(effects);if(failed===key)failed='';ensure(input,effects);
   if(current?.key!==key){if(!building)throw cancelled();await building.done;}
   if(closed||source!==input||current?.key!==key)throw cancelled();return current.acquire(onChange);
  },
  draw(ctx,bounds,scale,index){if(!current)return false;ctx.drawImage(current.overview,0,0,current.width,current.height);current.frames[index].draw(ctx,bounds,scale);return true;},
  reset(){cancel();retire();source=null;failed='';},dispose(){closed=true;cancel();retire();api?.release();api=null;}
 };
}
