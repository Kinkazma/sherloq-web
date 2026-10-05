import "../../runtime-context.js?v=0.14.5";
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort,isResumableResourceError,normalizeResourceError} from './errors.js';
import {denseDescriptorShape} from './dense-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {planDensePreparation,densePreparationMigrationBytes} from './dense-preparation-plan.js';
import {ElasticWorkerPool} from './elastic-worker-pool.js';
export async function preparePagedSift(image,{patch=8,support=patch,mirror=false,quarter=false,region=null,budget,storage='auto',fullBounds,temporarySession=image.session,getTemporarySession=image.ensureTemporarySession,signal,onProgress,checkpoint,onCheckpoint,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-sift-stream-worker.js',import.meta.url),{type:'module'})}={}){
 const requestedStorage=storage;
 const source=image.surface?.descriptor;requireValue(source?.format==='rgb8','SIFT requires an RGB surface.');
 const [originX,originY,width,height]=region??[0,0,source.width,source.height];
 requireValue([originX,originY,width,height].every(Number.isSafeInteger)&&originX>=0&&originY>=0&&width>0&&height>0&&originX+width<=source.width&&originY+height<=source.height,'Invalid SIFT source region.');
 const shape=denseDescriptorShape(width,height,1,support);requireValue(Number.isInteger(patch)&&patch>=3&&patch<=support&&(support-patch)%2===0&&typeof mirror==='boolean'&&typeof quarter==='boolean'&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Invalid stored SIFT options.');
 const halo=3*patch+1,tile=128,area=Math.min(width,tile+2*halo)*Math.min(height,tile+2*halo);
 const kernelEnvelope=16*1024**2+Math.max(area*112,Math.max(width,height)*192),ioAllowance=2*1024**2+area*3+Math.max(width,height)*3;
 const stripeElements=Math.max(Math.max(width,height)*8,Math.floor((kernelEnvelope-12*1024**2)/24));
 const maxElements=Math.max(Math.min(width,256)*Math.min(height,256)*8,Math.min(width*height*8,stripeElements),Math.min(width,32+3*patch)*Math.min(height,32+3*patch)*8,Math.ceil(area*3/4),area),scratchBytes=Math.min(width,tile+2*halo)*3,bufferBytes=maxElements*8+scratchBytes;
 const total=Math.ceil(width/tile)*Math.ceil(height/tile),dw=width-3*patch,dh=height-3*patch;
 const filterTiles=(length,axes)=>Math.ceil(axes/Math.max(1,Math.floor(stripeElements/(length*8)))),checkpointBytes=[total,filterTiles(height,width),Math.ceil(width/256)*Math.ceil(height/256),filterTiles(width,height),Math.ceil(dw/32)*Math.ceil(dh/32)].reduce((bytes,count)=>bytes+Math.ceil(count/8),0);
 const workspace=Math.max(kernelEnvelope,16*1024**2+bufferBytes+checkpointBytes);
 const dataBytes=width*height*64+dw*dh*(18+(fullBounds?128:0));
 const migrationBytes=()=>densePreparationMigrationBytes(budget,Math.max(width*height*32,fullBounds?dw*dh*128:0),{storage,temporarySession,getTemporarySession});
 const identity=JSON.stringify([region,patch,support,mirror,quarter,fullBounds]);requireValue(!checkpoint||checkpoint.identity===identity&&checkpoint.source===image.surface&&!checkpoint.disposed,'SIFT preparation checkpoint identity changed');
 const state=checkpoint??{identity,source:image.surface,stores:{},phases:{},bitmaps:[],weights:null,owned:[],disposed:false};
 state.dispose??=async()=>{if(state.disposed)return;state.disposed=true;try{const settled=await Promise.allSettled(state.owned.map(store=>store.dispose())),failure=settled.find(value=>value.status==='rejected');if(failure)throw failure.reason;}finally{for(const owner of state.bitmaps)owner.release();state.owned=[];state.stores={};state.phases={};state.bitmaps=[];state.source=null;}};
 onCheckpoint?.(state);
 const desired=(checkpoint?0:dataBytes)+workspace+ioAllowance+migrationBytes();
 await budget.reclaim(desired<=budget.limit?desired:workspace+ioAllowance,{signal});
 const pool=new ElasticWorkerPool(budget,{resourceOwner:'patchmatch',maxWorkers,workerBytes:workspace-bufferBytes-checkpointBytes,ioBytes:ioAllowance,workBuffers:{input:{Type:Float32Array,length:maxElements},output:{Type:Float32Array,length:maxElements},scratch:{length:scratchBytes}},workerFactory,label:'dense-sift'});
 const layoutOperation=budget.beginOperation?.({owner:'patchmatch',id:'dense-sift/preparation-layout'});
 let planningLease;try{planningLease=await pool.scheduler.acquire({cpu:0,bytes:workspace+ioAllowance-state.bitmaps.reduce((n,owner)=>n+owner.data.byteLength,0),signal,resourceOwner:'patchmatch',operation:layoutOperation,label:'dense-sift/preparation-layout'});layoutOperation?.setState('io');}catch(error){layoutOperation?.release();pool.dispose();throw error;}
 const planning=()=>{planningLease.release();layoutOperation?.release();},owned=state.owned;let planLive=true,success=false,keep=false;
 let preparation;try{preparation=state.preparation??planDensePreparation({availableBytes:budget.limit-budget.active-budget.retained+workspace+ioAllowance,dataBytes,workspaceBytes:workspace,ioBytes:ioAllowance,migrationBytes:migrationBytes(),total,maxWorkers,storage});}catch(error){planning();pool.dispose();throw error;}
 state.preparation=preparation;storage=preparation.storage;
 const allocate=async (name,bytes)=>{if(state.stores[name])return state.stores[name];const s=await createSegmentedBytes(bytes,{budget,storage:requestedStorage==='auto'&&(temporarySession||getTemporarySession)&&budget.isBackingUnderPressure?.('array-buffer')?'temporary':storage,shared:true,temporarySession,getTemporarySession,signal,owner:'patchmatch',label:'sift-descriptors'});owned.push(s);state.stores[name]=s;onCheckpoint?.(state);return s;};
 const recoveries=()=>owned.map((store,index)=>({store:index,...store.allocationRecovery})).filter(item=>item.count);
 // Each publication overwrites disjoint stripes with the retained exact result;
 // even in-place axis filtering must never recompute from a partial write.
 const run=async(phase,total,prepare,consume)=>{
  let saved=state.phases[phase];if(!saved){const bitmap=allocateOwnedTypedArray(Uint8Array,Math.ceil(total/8),{budget,owner:'patchmatch',label:phase+'-committed'});state.bitmaps.push(bitmap);saved=state.phases[phase]={bitmap:bitmap.data,total};}requireValue(saved.total===total,'SIFT phase geometry changed');
  const prepared=async(index,hooks)=>{const item=await prepare(index,hooks);item.message.output=hooks.buffers.output;item.transfer.push(hooks.buffers.output.buffer);item.ack=(result,{takeBackBuffer})=>{takeBackBuffer('input',result.reusedInput.buffer);takeBackBuffer('output',result.reusedOutput.buffer);};return item;};
  return pool.run(total,{phase,prepare:prepared,consume,consumeIdempotent:true,isCommitted:index=>!!(saved.bitmap[index>>3]&(1<<(index&7))),onCommitted:index=>{saved.bitmap[index>>3]|=1<<(index&7);onCheckpoint?.(state);},signal,onProgress:progress=>{const allocationRecoveries=recoveries();onProgress?.({...progress,...(allocationRecoveries.length?{allocationRecoveries}:{})});}});
 };

 try{
  let vertical=await allocate('vertical',width*height*32),hist=await allocate('hist',width*height*32);
  fullBounds??=hist.storage==='temporary'&&hist.byteLength>16*1024**2;requireValue(typeof fullBounds==='boolean','Invalid SIFT bound storage option.');
  const norms=await allocate('norms',dw*dh*12),turns=await allocate('turns',dw*dh),diverse=await allocate('diverse',dw*dh);
  let boundsFallback=state.boundsFallback??null;
  const optionalFailure=e=>['STORAGE_QUOTA','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e?.code);
  const optional=async(name,bytes)=>{if(state.retired?.has(name))return null;try{return await allocate(name,bytes);}catch(e){if(!optionalFailure(e))throw e;state.boundsFallback=boundsFallback=e.code;(state.retired??=new Set()).add(name);return null;}};
  let boundSamples=await optional('boundSamples',dw*dh*4),bounds=fullBounds&&boundSamples?await optional('bounds',dw*dh*128):null;fullBounds=!!bounds;
  const writeBound=async(kind,bytes,offset,flush=false,reserve)=>{
   const target=kind==='full'?bounds:boundSamples;if(!target)return;
   try{if(flush)await target.flush();else await target.write(bytes,offset,{reserve});}catch(e){
    // A resource failure in an optional accelerator must not discard the
    // original exact descriptors. Other in-flight writes to that same retired
    // optional store may finish with DISPOSED/storage errors after its cleanup.
    if(target!==(kind==='full'?bounds:boundSamples)&&boundsFallback)return;
    if(!optionalFailure(e))throw e;state.boundsFallback=boundsFallback=e.code;(state.retired??=new Set()).add(kind==='full'?'bounds':'boundSamples');
    if(kind==='full'){bounds=null;fullBounds=false;}else boundSamples=null;
    await target.dispose();
   }
  };
  planning();planLive=false;
  let weights=state.weights;
  await run('sift-gradients',total,async(index,{signal,reserveInput,buffers,resourceOperation})=>{
   const x=index%Math.ceil(width/tile)*tile,y=Math.floor(index/Math.ceil(width/tile))*tile,cw=Math.min(tile,width-x),ch=Math.min(tile,height-y),x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),w=Math.min(width,x+cw+halo)-x0,h=Math.min(height,y+ch+halo)-y0;
   const rectangle={x:originX+x0,y:originY+y0,width:w,height:h},destination=new Uint8Array(buffers.input.buffer,0,w*h*3);const part=typeof image.surface.readWindowInto==='function'?await image.surface.readWindowInto(rectangle,destination,{signal,reserve:reserveInput,scratch:buffers.scratch,owner:'patchmatch',operation:resourceOperation}):await image.surface.readWindow(rectangle,{signal,reserve:reserveInput});if(part.pixels.data.buffer!==buffers.input.buffer){destination.set(part.pixels.data);part.pixels={...part.pixels,data:destination};}return {message:{stage:'gradients',rgb:part.pixels.data,width:w,height:h,patch,mirror,x:x-x0,y:y-y0,coreWidth:cw,coreHeight:ch},transfer:[part.pixels.data.buffer],release:part.release};
  },async(index,r,{reserveIO})=>{weights??=r.weights;state.weights=weights;const x=index%Math.ceil(width/tile)*tile,y=Math.floor(index/Math.ceil(width/tile))*tile,cw=Math.min(tile,width-x),ch=Math.min(tile,height-y),destX=mirror?width-x-cw:x;for(let col=0;col<cw;col++)await vertical.write(new Uint8Array(r.values.buffer,col*ch*32,ch*32),((destX+col)*height+y)*32,{reserve:reserveIO});});
  // Entire axes are filtered in the same backward/forward accumulation order.
  const filter=async(store,output,length,axisCount,phase)=>{
   const step=Math.max(1,Math.floor(stripeElements/(length*8)));
   await run(phase,Math.ceil(axisCount/step),async(index,{reserveIO,buffers})=>{const axes=Math.min(step,axisCount-index*step),values=buffers.input.subarray(0,axes*length*8);await store.readInto(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),index*step*length*32,{reserve:reserveIO});return {message:{stage:'columns',values,length,axes,patch},transfer:[values.buffer]};},async(index,r,{reserveIO})=>output.write(new Uint8Array(r.values.buffer,r.values.byteOffset,r.values.byteLength),index*step*length*32,{reserve:reserveIO}));
  };
  // Alternate the same two banks. No phase reads its own partially written output.
  await filter(vertical,hist,height,width,'sift-vertical');
  const transposeSize=256,transposeAcross=Math.ceil(width/transposeSize);
  await run('sift-transpose',transposeAcross*Math.ceil(height/transposeSize),async(index,{reserveIO,buffers})=>{
   const x=index%transposeAcross*transposeSize,y=Math.floor(index/transposeAcross)*transposeSize,cw=Math.min(transposeSize,width-x),ch=Math.min(transposeSize,height-y),values=buffers.input.subarray(0,cw*ch*8);
   for(let col=0;col<cw;col++)await hist.readInto(new Uint8Array(values.buffer,col*ch*32,ch*32),((x+col)*height+y)*32,{reserve:reserveIO});
   return {message:{stage:'transpose',values,width:cw,height:ch},transfer:[values.buffer]};
  },async(index,r,{reserveIO})=>{
   const x=index%transposeAcross*transposeSize,y=Math.floor(index/transposeAcross)*transposeSize,cw=Math.min(transposeSize,width-x),ch=Math.min(transposeSize,height-y);
   for(let row=0;row<ch;row++)await vertical.write(new Uint8Array(r.values.buffer,row*cw*32,cw*32),((y+row)*width+x)*32,{reserve:reserveIO});
  });
  await filter(vertical,hist,width,height,'sift-horizontal');
  const block=32,across=Math.ceil(dw/block);
  await run('sift-factors',across*Math.ceil(dh/block),async(index,{reserveIO,buffers})=>{const x=index%across*block,y=Math.floor(index/across)*block,cw=Math.min(block,dw-x),ch=Math.min(block,dh-y),w=cw+3*patch,h=ch+3*patch,values=buffers.input.subarray(0,w*h*8);
   for(let row=0;row<h;row++)await hist.readInto(new Uint8Array(values.buffer,row*w*32,w*32),((y+row)*width+x)*32,{reserve:reserveIO});
   return {message:{stage:'factors',values,width:w,height:h,patch,weights,quarter,fullBounds},transfer:[values.buffer]};
  },async(index,r,{reserveIO})=>{const x=index%across*block,y=Math.floor(index/across)*block,cw=Math.min(block,dw-x),ch=Math.min(block,dh-y);
   for(let row=0;row<ch;row++){const dest=(y+row)*dw+x;await norms.write(new Uint8Array(r.norms.buffer,row*cw*12,cw*12),dest*12,{reserve:reserveIO});await turns.write(r.turns.subarray(row*cw,(row+1)*cw),dest,{reserve:reserveIO});await diverse.write(r.diverse.subarray(row*cw,(row+1)*cw),dest,{reserve:reserveIO});if(bounds)await writeBound('full',r.bounds.subarray(row*cw*128,(row+1)*cw*128),dest*128,false,reserveIO);if(boundSamples)await writeBound('sample',r.boundSamples.subarray(row*cw*4,(row+1)*cw*4),dest*4,false,reserveIO);}
  });
  for(const s of [hist,norms,turns,diverse])await s.flush();await writeBound('full',null,0,true);await writeBound('sample',null,0,true);checkAbort(signal);await vertical.dispose();success=true;
  const execution=pool.snapshot();
  return {kind:'compact-sift',hist,norms,turns,diverse,bounds,boundSamples,weights,width,height,patch,offset:3*(support-patch)/2,viewWidth:shape.width,viewHeight:shape.height,mirror,quarter,origin:[originX,originY],metrics:{workers:execution.peakComputing,preparation,execution,workspaceBytes:execution.peakWorkers*workspace,heapBytes:execution.heapBytes,allocationRecoveries:recoveries(),boundsFallback,fullBounds,storedBytes:width*height*32+dw*dh*(14+(boundSamples?4:0)+(bounds?128:0))},dispose:state.dispose};
 }catch(error){const failure=normalizeResourceError(error);keep=!!onCheckpoint&&isResumableResourceError(failure)&&!signal?.aborted;throw failure;}finally{pool.dispose();if(planLive)planning();if(!success&&!keep)await state.dispose();}
}
