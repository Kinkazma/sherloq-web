import "../../runtime-context.js?v=0.24.0";
import {EngineError,requireValue,checkAbort,serializeEngineError,deserializeEngineError} from './errors.js';
const MAX_BYTES=1024*1024;
function rectangle(rect,width,height){requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=width&&rect.y+rect.height<=height,'Native preparation window exceeds its source.');return rect;}
const cancelled=()=>new EngineError('CANCELLED','Native preparation source channel closed.');
/** Serves a borrowed native reader; closing the channel never closes its owner. */
export function serveNativeSourceChannel(port,source,{signal,reserve=()=>()=>{}}={}){
 requireValue(port&&typeof port.postMessage==='function'&&typeof source?.readWindow==='function','A native source and message port are required.');let closed=false,resolveClosed;const active=new Set(),abort=new AbortController(),whenClosed=new Promise(resolve=>resolveClosed=resolve);const quiescent=()=>{if(closed&&active.size===0)resolveClosed();};
 function close(){if(closed)return;closed=true;abort.abort();signal?.removeEventListener('abort',close);try{port.postMessage({type:'closed'});}catch{}port.close?.();quiescent();}
 async function handle(message){if(closed)return;if(message?.type==='close'){close();return;}const ticket=message?.ticket;
  try{requireValue(message?.type==='read'&&Number.isSafeInteger(ticket)&&ticket>0,'Invalid native preparation read request.');const rect=rectangle(message.rect,source.width,source.height);requireValue(rect.width*rect.height*3<=MAX_BYTES,'Native preparation transport windows are limited to 1 MiB.');checkAbort(signal);checkAbort(abort.signal);let window,release;
   try{window=await source.readWindow(rect,{signal:abort.signal});checkAbort(signal);checkAbort(abort.signal);requireValue(window.pixels?.format==='rgb8'&&window.pixels.width===rect.width&&window.pixels.height===rect.height&&window.pixels.data instanceof Uint8Array&&window.pixels.data.length===rect.width*rect.height*3,'Native preparation reader returned another grid.');release=await reserve(window.pixels.data.length);const data=window.pixels.data.slice();if(!closed)port.postMessage({ticket,pixels:{width:rect.width,height:rect.height,format:'rgb8',data}},[data.buffer]);}
   finally{await window?.release?.();await release?.();}
  }catch(error){if(!closed)port.postMessage({ticket,error:serializeEngineError(error)});}
 }
 port.onmessage=({data})=>{const promise=handle(data);active.add(promise);promise.catch(()=>close()).finally(()=>{active.delete(promise);quiescent();});};port.onmessageerror=close;port.start?.();signal?.addEventListener('abort',close,{once:true});if(signal?.aborted)close();
 return{whenClosed,async dispose(){close();await whenClosed;},get closed(){return closed;}};
}
/** Native RGB windows cross the worker boundary, never encoded image bytes.
 * Large useful reads are admitted in the consumer budget and transported in
 * <=1 MiB parts without changing their resolution or pixel values. */
export function receiveNativeSourceChannel(input,{budget,signal}={}){
 requireValue(input?.format==='rgb8-window-source'&&[input.width,input.height].every(n=>Number.isSafeInteger(n)&&n>0)&&/^[a-f0-9]{64}$/.test(input.sha256??'')&&input.port&&typeof input.port.postMessage==='function','Invalid native preparation source descriptor.');
 const {port,width,height}=input,pending=new Map(),held=new Set();let serial=0,closed=false;
 function close(){if(closed)return;closed=true;signal?.removeEventListener('abort',close);for(const value of pending.values())value.reject(cancelled());pending.clear();for(const lease of[...held])lease.release();try{port.postMessage({type:'close'});}catch{}port.close?.();}
 port.onmessage=({data})=>{if(data?.type==='closed'){close();return;}const job=pending.get(data?.ticket);if(!job)return;pending.delete(data.ticket);if(data.error)job.reject(deserializeEngineError(data.error));else job.resolve(data.pixels);};port.onmessageerror=close;port.start?.();signal?.addEventListener('abort',close,{once:true});
 function request(rect){checkAbort(signal);if(closed)throw cancelled();const ticket=++serial;return new Promise((resolve,reject)=>{pending.set(ticket,{resolve,reject});try{port.postMessage({type:'read',ticket,rect});}catch(error){pending.delete(ticket);reject(error);}});}
 async function readWindow(value,{signal:extra}={}){
  checkAbort(signal);checkAbort(extra);if(closed)throw cancelled();const rect=rectangle(value,width,height),length=rect.width*rect.height*3,release=budget.reserve(length);let transient,committed=false;
  try{transient=budget.reserve(Math.min(length,MAX_BYTES));const data=new Uint8Array(length),chunkWidth=Math.min(rect.width,Math.floor(MAX_BYTES/3)),rows=Math.max(1,Math.floor(MAX_BYTES/(chunkWidth*3)));
   for(let y=0;y<rect.height;y+=rows)for(let x=0;x<rect.width;x+=chunkWidth){checkAbort(signal);checkAbort(extra);const w=Math.min(chunkWidth,rect.width-x),h=Math.min(rows,rect.height-y),pixels=await request({x:rect.x+x,y:rect.y+y,width:w,height:h});checkAbort(signal);checkAbort(extra);if(closed)throw cancelled();requireValue(pixels?.format==='rgb8'&&pixels.width===w&&pixels.height===h&&pixels.data instanceof Uint8Array&&pixels.data.length===w*h*3,'Native preparation response differs from its requested window.');for(let row=0;row<h;row++)data.set(pixels.data.subarray(row*w*3,(row+1)*w*3),((y+row)*rect.width+x)*3);}
   let done=false;const lease={pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){if(done)return;done=true;held.delete(lease);release();}};held.add(lease);committed=true;return lease;
  }finally{transient?.();if(!committed)release();}
 }
 if(signal?.aborted)close();return{width,height,sha256:input.sha256,readWindow,dispose:close};
}
