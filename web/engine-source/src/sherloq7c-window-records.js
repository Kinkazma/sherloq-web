import {EngineError,requireValue,checkAbort} from './errors.js';
import {displayGeometry} from './display-sampling.js';
import {allocateOwnedTypedArray} from './allocation.js';

const NATIVE_WINDOW_BYTES=4*1024**2,FROZEN_WINDOW_BYTES=64*1024**2,MAX_HISTOGRAM_PIXELS=262144;
const withCleanup=(error,cleanupError)=>{if(error&&typeof error==='object'&&Object.isExtensible(error)){error.cleanupError=cleanupError;return error;}return Object.assign(new AggregateError([error,cleanupError],'Sherloq read and retirement failed.',{cause:error}),{code:error?.code??'CLEANUP_FAILED',cleanupError});};
const finish=(data,threshold,invert,native=false)=>{
 if(threshold>=255&&!invert)return;
 for(let i=0;i<data.length;i++){
  const byte=native?Math.round(data[i]/257):data[i],maximum=native?65535:255;
  const value=threshold<255?(byte>threshold?maximum:0):data[i];data[i]=invert?maximum-value:value;
 }
};

// A ticket stays live until the corresponding window retirement succeeds.
// No timer and no forced early retirement of a consumer's live window.
function readTickets(){
 const active=new Set();let closing=false,pending;
 function begin(){
  if(closing)throw new EngineError('DISPOSED','Sherloq surface is retiring.');
  const ticket={requested:false,failure:null,retry:null};
  const arm=()=>{ticket.promise=new Promise((resolve,reject)=>{ticket.resolve=resolve;ticket.reject=reject;});void ticket.promise.catch(()=>{});};arm();active.add(ticket);
  ticket.done=()=>{if(!active.delete(ticket))return;ticket.failure=null;ticket.resolve();};
  ticket.fail=error=>{ticket.failure=error;ticket.reject(error);};ticket.arm=arm;return ticket;
 }
 function lease(ticket,release){
  let retired=false,running;
  const retire=()=>{
   if(retired)return;if(running)return running;ticket.requested=true;
   if(ticket.failure){ticket.failure=null;ticket.arm();}
   try{
    const value=release();
    if(value?.then){const task=Promise.resolve(value).then(()=>{retired=true;ticket.done();},error=>{ticket.fail(error);throw error;}).finally(()=>{if(running===task)running=null;});running=task;return task;}
    retired=true;ticket.done();return value;
   }catch(error){ticket.fail(error);throw error;}
  };
  ticket.retry=retire;return retire;
 }
 return{begin,lease,
  dispose(retire){
   if(pending)return pending;closing=true;
   const task=(async()=>{for(const ticket of [...active])if(ticket.requested&&ticket.failure)await ticket.retry();await Promise.all([...active].map(ticket=>ticket.promise));await retire();})();pending=task;
   void task.catch(()=>{if(pending===task)pending=null;});return task;
  }
 };
}

// Product surfaces retain one frozen result. They do not own independent full
// RGB8, RGB16 or Float64 images; each exact read is one qualified result window.
export function sherloq7cWindowRecords(result,budget,{threshold=255,invert=false}={}){
 requireValue(typeof result?.readWindow==='function'&&typeof result?.release==='function','Owned frozen 7C result required.');
 requireValue(Number.isInteger(threshold)&&threshold>=0&&threshold<=255&&typeof invert==='boolean','Invalid 7C presentation finish.');
 const {width,height}=result,proxy=result.metrics?.proxy??null,remaining=new Set(['rgb8','scalar','native16']);let finalRetirement;
 async function retire(key){
  if(!remaining.has(key))return;if(remaining.size>1){remaining.delete(key);return;}if(finalRetirement)return finalRetirement;
  const task=Promise.resolve().then(()=>result.release()).then(()=>{remaining.delete(key);});finalRetirement=task;
  try{await task;}finally{if(finalRetirement===task)finalRetirement=null;}
 }
 function surface(key,format){
  const id=crypto.randomUUID(),reads=readTickets(),scalar=format==='float64',native=format==='rgb16',channels=scalar?1:3,Type=scalar?Float64Array:native?Uint16Array:Uint8Array;
  const semantics=scalar?'Sherloq7C normalized scalar intensity before RGB quantization and optional presentation threshold/inversion.':native?(threshold<255||invert?'Native RGB16 after presentation threshold/inversion; the certificate describes the preceding scalar stage.':'Sherloq native unsigned RGB16 output; display RGB8 is separate.'):'Sherloq RGB8 presentation derived from the frozen native RGB16 output.';
  const view={descriptor:Object.freeze({id,revision:1,width,height,sourceWidth:width,sourceHeight:height,orientation:1,format,coordinates:'selected-output-resolution',storage:'memory',semantics,...(proxy?{proxy}:{}),...(native?{bitDepth:16,channelOrder:'RGB'}:{})}),
   async readWindow({x=0,y=0,width:w=width,height:h=height}={}, {signal}={}){
    checkAbort(signal);const ticket=reads.begin();
    try{
     requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h,'Sherloq window is outside the native image.');
     requireValue(native?w*h*6<=NATIVE_WINDOW_BYTES:w*h*(scalar?11:3)<=FROZEN_WINDOW_BYTES,'Sherloq window exceeds its qualified native/result transfer bound.');
     const part=await result.readWindow({x,y,width:w,height:h},{format:native?'rgb16':'rgb8',includeScalar:scalar,signal});
     const release=reads.lease(ticket,()=>part.release()),data=scalar?part.scalar:part.data;
     try{checkAbort(signal);if(!scalar)finish(data,threshold,invert,native);return{surfaceId:id,revision:1,origin:[x,y],pixels:{width:w,height:h,format,...(native?{bitDepth:16}:{}),data},release};}
     catch(error){try{await release();}catch(cleanupError){throw withCleanup(error,cleanupError);}throw error;}
    }catch(error){if(!ticket.retry)ticket.done();throw error;}
   },
   async readWindowInto(rect,target,options={}){
    const part=await view.readWindow(rect,options);try{requireValue(target instanceof Type&&target.length>=part.pixels.data.length,'Sherloq destination has the wrong type or extent.');target.set(part.pixels.data);return{...part,pixels:{...part.pixels,data:target.subarray(0,part.pixels.data.length)},release(){}};}finally{await part.release();}
   },
   async readSampledWindow(tile,{signal,budget:sampleBudget=budget}={}){
    const work=reads.begin();let owner;
    try{
     const g=displayGeometry({width,height},tile);
     if(g.step===1){const part=await view.readWindow({x:g.x,y:g.y,width:g.w,height:g.h},{signal});return{...part,metrics:{sourceBytes:part.pixels.data.byteLength}};}
     owner=allocateOwnedTypedArray(Type,g.width*g.height*channels,{budget:sampleBudget,label:'sherloq-sampled-window'});let sourceBytes=0;
     for(let row=0;row<g.height;row++){
      checkAbort(signal);const part=await view.readWindow({x:g.x,y:g.y+row*g.step,width:g.w,height:1},{signal});
      try{sourceBytes+=part.pixels.data.byteLength;for(let col=0;col<g.width;col++)for(let c=0;c<channels;c++)owner.data[(row*g.width+col)*channels+c]=part.pixels.data[col*g.step*channels+c];}finally{await part.release();}
     }
     checkAbort(signal);return{pixels:{width:g.width,height:g.height,format,data:owner.data},release:owner.release,metrics:{sourceBytes}};
    }catch(error){owner?.release();throw error;}finally{work.done();}
   },
   dispose:()=>reads.dispose(()=>retire(key))
  };if(native&&threshold===255&&!invert&&typeof result.pipePng==='function')view.pipeSherloqPng=async(writable,options={})=>{const ticket=reads.begin();try{return await result.pipePng(writable,options);}finally{ticket.done();}};return view;
 }
 return{surface:surface('rgb8','rgb8'),planeRecords:{intensity:{surface:surface('scalar','float64')},rgb16:{surface:surface('native16','rgb16')}}};
}

export async function sherloq7cWindowHistogram(result,gray,{budget,signal}={}){
 const owner=allocateOwnedTypedArray(Float64Array,256,{budget,owner:'sherloq-presentation',label:'sherloq-output-histogram'}),{width,height}=result;
 try{
  for(let y=0;y<height;y++)for(let x=0;x<width;x+=MAX_HISTOGRAM_PIXELS){
   checkAbort(signal);const part=await result.readWindow({x,y,width:Math.min(MAX_HISTOGRAM_PIXELS,width-x),height:1},{format:'rgb8',signal});
   try{for(let i=0;i<part.data.length;i+=3)owner.data[gray(part.data[i],part.data[i+1],part.data[i+2])]++;}finally{await part.release();}
  }return owner;
 }catch(error){owner.release();throw error;}
}
