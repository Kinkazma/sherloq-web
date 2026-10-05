import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {denseDescriptorShape} from './dense-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
export async function preparePagedSift(image,{patch=8,support=patch,mirror=false,quarter=false,region=null,budget,storage='auto',fullBounds,temporarySession=image.session,getTemporarySession=image.ensureTemporarySession,signal,onProgress,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-sift-stream-worker.js',import.meta.url),{type:'module'})}={}){
 const source=image.surface?.descriptor;requireValue(source?.format==='rgb8','SIFT requires an RGB surface.');
 const [originX,originY,width,height]=region??[0,0,source.width,source.height];
 requireValue([originX,originY,width,height].every(Number.isSafeInteger)&&originX>=0&&originY>=0&&width>0&&height>0&&originX+width<=source.width&&originY+height<=source.height,'Invalid SIFT source region.');
 const shape=denseDescriptorShape(width,height,1,support);requireValue(Number.isInteger(patch)&&patch>=3&&patch<=support&&(support-patch)%2===0&&typeof mirror==='boolean'&&typeof quarter==='boolean'&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Invalid stored SIFT options.');
 const halo=3*patch+1,tile=128,area=Math.min(width,tile+2*halo)*Math.min(height,tile+2*halo),room=budget.limit-budget.active-budget.retained;
 const workspace=16*1024**2+Math.max(area*112,Math.max(width,height)*192),ioAllowance=2*1024**2+area*3+Math.max(width,height)*3;
 const total=Math.ceil(width/tile)*Math.ceil(height/tile),count=Math.min(maxWorkers,total,Math.floor(room/(workspace+ioAllowance)));
 if(count<1)throw new EngineError('MEMORY_LIMIT','One complete SIFT axis and its native workspace do not fit.');
 const release=budget.reserve(count*workspace),planning=budget.reserve(count*ioAllowance),owned=[],active=new Map(),workers=[];let planLive=true,success=false,stopped=false,heapBytes=0;
 const stop=()=>{stopped=true;for(const [worker,reject] of active){worker.terminate();reject?.(new EngineError('CANCELLED','SIFT preparation stopped.'));}active.clear();};
 signal?.addEventListener('abort',stop,{once:true});
 const allocate=async bytes=>{const s=await createSegmentedBytes(bytes,{budget,storage,temporarySession,getTemporarySession,signal});owned.push(s);return s;};
 const run=async(phase,total,prepare,consume)=>{
  let next=0,completed=0;
  const work=async worker=>{while(next<total){checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','SIFT preparation stopped.');const index=next++,input=await prepare(index);let result;
   try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','SIFT preparation stopped.');result=await new Promise((resolve,reject)=>{active.set(worker,reject);worker.onmessage=({data})=>{active.set(worker,null);data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);};worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message));worker.postMessage(input.message,input.transfer);});}finally{input.release?.();}
   heapBytes=Math.max(heapBytes,result.heapBytes);await consume(index,result);onProgress?.({phase,completed:++completed,total});
  }};
  const tasks=workers.map(work);try{await Promise.all(tasks);}catch(e){stop();await Promise.allSettled(tasks);throw e;}
 };
 try{
  let vertical=await allocate(width*height*32),hist=await allocate(width*height*32);
  fullBounds??=hist.storage==='temporary'&&hist.byteLength>16*1024**2;requireValue(typeof fullBounds==='boolean','Invalid SIFT bound storage option.');
  const dw=width-3*patch,dh=height-3*patch,norms=await allocate(dw*dh*12),turns=await allocate(dw*dh),diverse=await allocate(dw*dh);
  let boundsFallback=null;
  const optionalFailure=e=>['STORAGE_QUOTA','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e?.code);
  const optional=async bytes=>{try{return await allocate(bytes);}catch(e){if(!optionalFailure(e))throw e;boundsFallback=e.code;return null;}};
  let boundSamples=await optional(dw*dh*4),bounds=fullBounds&&boundSamples?await optional(dw*dh*128):null;fullBounds=!!bounds;
  const writeBound=async(kind,bytes,offset,flush=false)=>{
   const target=kind==='full'?bounds:boundSamples;if(!target)return;
   try{if(flush)await target.flush();else await target.write(bytes,offset);}catch(e){
    // A resource failure in an optional accelerator must not discard the
    // original exact descriptors. Other in-flight writes to that same retired
    // optional store may finish with DISPOSED/storage errors after its cleanup.
    if(target!==(kind==='full'?bounds:boundSamples)&&boundsFallback)return;
    if(!optionalFailure(e))throw e;boundsFallback=e.code;
    if(kind==='full'){bounds=null;fullBounds=false;}else boundSamples=null;
    await target.dispose();
   }
  };
  planning();planLive=false;
  for(let i=0;i<count;i++){const worker=workerFactory();workers.push(worker);active.set(worker,null);}
  let weights;
  await run('sift-gradients',total,async index=>{
   const x=index%Math.ceil(width/tile)*tile,y=Math.floor(index/Math.ceil(width/tile))*tile,cw=Math.min(tile,width-x),ch=Math.min(tile,height-y),x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),w=Math.min(width,x+cw+halo)-x0,h=Math.min(height,y+ch+halo)-y0;
   const part=await image.surface.readWindow({x:originX+x0,y:originY+y0,width:w,height:h},{signal});return {message:{stage:'gradients',rgb:part.pixels.data,width:w,height:h,patch,mirror,x:x-x0,y:y-y0,coreWidth:cw,coreHeight:ch},transfer:[part.pixels.data.buffer],release:part.release};
  },async(index,r)=>{weights??=r.weights;const x=index%Math.ceil(width/tile)*tile,y=Math.floor(index/Math.ceil(width/tile))*tile,cw=Math.min(tile,width-x),ch=Math.min(tile,height-y),destX=mirror?width-x-cw:x;for(let col=0;col<cw;col++)await vertical.write(new Uint8Array(r.values.buffer,col*ch*32,ch*32),((destX+col)*height+y)*32);});
  // Entire axes are filtered in the same backward/forward accumulation order.
  const stripeElements=Math.max(Math.max(width,height)*8,Math.floor((workspace-12*1024**2)/24));
  const filter=async(store,length,axisCount,phase)=>{
   const step=Math.max(1,Math.floor(stripeElements/(length*8)));
   await run(phase,Math.ceil(axisCount/step),async index=>{const axes=Math.min(step,axisCount-index*step),values=new Float32Array(axes*length*8);await store.readInto(new Uint8Array(values.buffer),index*step*length*32);return {message:{stage:'columns',values,length,axes,patch},transfer:[values.buffer]};},async(index,r)=>store.write(new Uint8Array(r.values.buffer),index*step*length*32));
  };
  await filter(vertical,height,width,'sift-vertical');
  const transposeSize=64,buffer=new Float32Array(transposeSize*transposeSize*8),column=new Float32Array(transposeSize*8);
  for(let y=0;y<height;y+=transposeSize)for(let x=0;x<width;x+=transposeSize){await controlCheckpoint(signal);const cw=Math.min(transposeSize,width-x),ch=Math.min(transposeSize,height-y);
   for(let col=0;col<cw;col++){await vertical.readInto(new Uint8Array(column.buffer,0,ch*32),((x+col)*height+y)*32);for(let row=0;row<ch;row++)buffer.set(column.subarray(row*8,row*8+8),(row*cw+col)*8);}
   for(let row=0;row<ch;row++)await hist.write(new Uint8Array(buffer.buffer,row*cw*32,cw*32),((y+row)*width+x)*32);
  }
  await vertical.dispose();vertical=null;await filter(hist,width,height,'sift-horizontal');
  const block=32,across=Math.ceil(dw/block);
  await run('sift-factors',across*Math.ceil(dh/block),async index=>{const x=index%across*block,y=Math.floor(index/across)*block,cw=Math.min(block,dw-x),ch=Math.min(block,dh-y),w=cw+3*patch,h=ch+3*patch,values=new Float32Array(w*h*8);
   for(let row=0;row<h;row++)await hist.readInto(new Uint8Array(values.buffer,row*w*32,w*32),((y+row)*width+x)*32);
   return {message:{stage:'factors',values,width:w,height:h,patch,weights,quarter,fullBounds},transfer:[values.buffer]};
  },async(index,r)=>{const x=index%across*block,y=Math.floor(index/across)*block,cw=Math.min(block,dw-x),ch=Math.min(block,dh-y);
   for(let row=0;row<ch;row++){const dest=(y+row)*dw+x;await norms.write(new Uint8Array(r.norms.buffer,row*cw*12,cw*12),dest*12);await turns.write(r.turns.subarray(row*cw,(row+1)*cw),dest);await diverse.write(r.diverse.subarray(row*cw,(row+1)*cw),dest);if(bounds)await writeBound('full',r.bounds.subarray(row*cw*128,(row+1)*cw*128),dest*128);if(boundSamples)await writeBound('sample',r.boundSamples.subarray(row*cw*4,(row+1)*cw*4),dest*4);}
  });
  for(const s of [hist,norms,turns,diverse])await s.flush();await writeBound('full',null,0,true);await writeBound('sample',null,0,true);checkAbort(signal);success=true;
  return {kind:'compact-sift',hist,norms,turns,diverse,bounds,boundSamples,weights,width,height,patch,offset:3*(support-patch)/2,viewWidth:shape.width,viewHeight:shape.height,mirror,quarter,origin:[originX,originY],metrics:{workers:count,workspaceBytes:count*workspace,heapBytes,boundsFallback,fullBounds,storedBytes:width*height*32+dw*dh*(14+(boundSamples?4:0)+(bounds?128:0))},async dispose(){await Promise.all(owned.map(s=>s.dispose()));}};
 }finally{signal?.removeEventListener('abort',stop);stop();if(planLive)planning();release();if(!success)await Promise.allSettled(owned.map(s=>s.dispose()));}
}
