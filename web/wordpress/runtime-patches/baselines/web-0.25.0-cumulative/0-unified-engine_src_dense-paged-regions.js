import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {wasmRange,closeMemoryRanges} from './memory-range.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {denseDescriptorShape} from './dense-math.js';
import {denseSearchContexts} from './dense-profiles.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {ElasticWorkerPool} from './elastic-worker-pool.js';
import {densePreparationMigrationBytes} from './dense-preparation-plan.js';
export async function createPagedRegionsMask(width,height,{method=0,patch=8,targetPatch=patch,regions=[],excluded=[],budget,storage='auto',temporarySession,getTemporarySession,signal}={}){
 const shape=denseDescriptorShape(width,height,method,Math.max(patch,targetPatch));denseSearchContexts(regions);denseSearchContexts(excluded);
 requireValue(regions.length<=2,'At most two dense regions per context.');
 const paths=[...regions,...excluded],count=paths.reduce((n,p)=>n+p.length,0),pageBytes=4096,cachePages=32,workspace=16*1024**2+count*160+cachePages*(pageBytes+32);
 if(workspace>120*1024**2)throw new EngineError('MEMORY_LIMIT','Polygon edges exceed the current native allowance.');
 checkAbort(signal);const release=budget.reserve(workspace),pointers=[];let mask,m,success=false;
 try{
  mask=await createSegmentedBytes(shape.width*shape.height,{budget,storage,shared:true,temporarySession,getTemporarySession,signal,owner:'patchmatch',label:'dense-eligibility'});
  const {default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();let last=performance.now();
  m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-last>=20){await controlCheckpoint(signal);last=performance.now();}};
  m.pageIO=async(id,offset,length,pointer,write)=>{checkAbort(signal);const bytes=wasmRange(m,pointer,length);if(write)await mask.write(bytes,offset);else await mask.readInto(bytes,offset);if(performance.now()-last>=20)await m.checkpoint();};
  const put=a=>{const p=m._malloc(Math.max(8,a.byteLength));if(!p)throw wasmAllocationFailure(m,'Polygon metadata allocation failed.',Math.max(8,a.byteLength));pointers.push(p);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
  const points=new Float64Array(count*2),polygons=new Int32Array(paths.length*2);let at=0;
  paths.forEach((poly,i)=>{polygons[i*2]=at;polygons[i*2+1]=poly.length;for(const [x,y] of poly){requireValue(Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<0x3fffffff&&Math.abs(y)<0x3fffffff,'Invalid dense polygon coordinate.');points[at*2]=x;points[at*2+1]=y;at++;}});
  const pp=put(points),polys=put(polygons),error=put(new Uint8Array(1024)),values=[width,height,shape.width,shape.height,shape.shift,pp,polys,paths.length,regions.length,pageBytes,cachePages,error];
  const code=await m.ccall('dense_paged_regions','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);await mask.flush();success=true;
  return {...shape,mask,metrics:{workspaceBytes:workspace,heapBytes:m.HEAPU8.byteLength},dispose:()=>mask.dispose()};
 }finally{if(m){closeMemoryRanges(m);for(const p of pointers)m._free(p);m.pageIO=null;m.checkpoint=null;}if(!success)await mask?.dispose();release();}
}

export async function preparePagedEligibility(image,{region=null,method=0,patch=8,targetPatch=patch,regions=[],excluded=[],texture=2,budget,storage='auto',temporarySession=image.session,getTemporarySession=image.ensureTemporarySession,signal,onProgress,checkpoint,onCheckpoint,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-texture-worker.js',import.meta.url),{type:'module'})}={}){
 const descriptor=image.surface?.descriptor;requireValue(descriptor?.format==='rgb8'&&Number.isFinite(texture)&&texture>=0&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Invalid stored eligibility source.');
 const [originX,originY,width,height]=region??[0,0,descriptor.width,descriptor.height];
 requireValue([originX,originY,width,height].every(Number.isSafeInteger)&&originX>=0&&originY>=0&&originX+width<=descriptor.width&&originY+height<=descriptor.height,'Invalid eligibility crop.');
 const identity=JSON.stringify([region,method,patch,targetPatch,regions,excluded,texture]);
 requireValue(!checkpoint||(!checkpoint.textureCheckpoint?.disposed&&checkpoint.textureCheckpoint?.source===image.surface&&checkpoint.textureCheckpoint?.identity===identity),'Eligibility checkpoint does not match its source or recipe.');
 const plannedSupport=Math.max(patch,targetPatch),plannedHalo=2*Math.ceil((3*plannedSupport+1)/2),plannedBorder=method?3*plannedSupport:0,plannedWidth=Math.min(width,128+plannedBorder+2*plannedHalo),plannedHeight=Math.min(height,128+plannedBorder+2*plannedHalo),plannedArea=plannedWidth*plannedHeight,plannedShape=denseDescriptorShape(width,height,method,plannedSupport),maskBytes=plannedShape.width*plannedShape.height;
 const regionOperation=budget.beginOperation?.({owner:'patchmatch',id:'dense-regions'});let regionLease,result=checkpoint;
 if(!result)try{
  regionLease=await getExecutionScheduler(budget,{maxWorkers}).acquire({cpu:1,signal,resourceOwner:'patchmatch',operation:regionOperation,label:'dense-regions'});
  const migrationBytes=densePreparationMigrationBytes(budget,maskBytes,{storage,temporarySession,getTemporarySession});
  const maskStorage=storage==='auto'&&texture&&maskBytes+migrationBytes+50*1024**2+plannedArea*67+Math.max(plannedWidth,plannedHeight)*3+128*128+128+Math.ceil(Math.ceil(plannedShape.width/128)*Math.ceil(plannedShape.height/128)/8)>budget.limit-budget.retained-budget.active?'temporary':storage;
  result=await createPagedRegionsMask(width,height,{method,patch,targetPatch,regions,excluded,budget,storage:maskStorage,temporarySession,getTemporarySession,signal});
   regionOperation?.commit();
 }finally{regionLease?.release();regionOperation?.release();}else regionOperation?.release();if(!texture)return result;
 if(result.textureCheckpoint?.complete)return result;
 if(result.textureCheckpoint?.completed===result.textureCheckpoint?.total&&result.textureCheckpoint){await result.mask.flush();checkAbort(signal);result.textureCheckpoint.complete=true;return result;}
 const support=Math.max(patch,targetPatch),border=method?3*support:0,halo=2*Math.ceil((3*support+1)/2),room=budget.limit-budget.retained-budget.active;
 let tile=result.textureCheckpoint?.tile??128,workspace,ioAllowance;
 while(true){const w=Math.min(width,tile+border+2*halo),h=Math.min(height,tile+border+2*halo),area=w*h;workspace=48*1024**2+area*64;ioAllowance=area*3+Math.max(w,h)*3+tile*tile+tile+2*1024**2;const bitmapBytes=result.textureCheckpoint?0:Math.ceil(Math.ceil(result.width/tile)*Math.ceil(result.height/tile)/8);if(workspace+ioAllowance+bitmapBytes<=room)break;if(tile===1||result.textureCheckpoint){if(!checkpoint)await result.dispose();throw new EngineError('MEMORY_LIMIT','Native texture support does not fit.');}tile=Math.max(1,Math.floor(tile/2));}
 const across=Math.ceil(result.width/tile),total=across*Math.ceil(result.height/tile);
 if(!result.textureCheckpoint){
  let bitmap;try{bitmap=allocateOwnedTypedArray(Uint8Array,Math.ceil(total/8),{budget,owner:'patchmatch',label:'texture-committed-tiles'});const dispose=result.dispose,state={identity,source:image.surface,tile,total,committed:bitmap.data,completed:0,disposed:false};result.textureCheckpoint=state;result.dispose=async()=>{if(state.disposed)return;state.disposed=true;state.source=null;state.committed=null;try{await dispose();}finally{bitmap.release();}};}catch(error){bitmap?.release();await result.dispose();throw error;}
 }
 const checkpointState=result.textureCheckpoint;let retained=!!checkpoint;
 try{if(onCheckpoint){onCheckpoint(result);retained=true;}}catch(error){if(!retained)await result.dispose();throw error;}
 const maxWidth=Math.min(width,tile+border+2*halo),maxHeight=Math.min(height,tile+border+2*halo),bufferBytes=maxWidth*maxHeight*3+Math.max(maxWidth,maxHeight)*3+tile*tile+tile;
 const pool=new ElasticWorkerPool(budget,{workBuffers:{rgb:{length:maxWidth*maxHeight*3},scratch:{length:Math.max(maxWidth,maxHeight)*3},values:{length:tile*tile},row:{length:tile}},resourceOwner:'patchmatch',maxWorkers,workerBytes:workspace,ioBytes:ioAllowance-bufferBytes,workerFactory,label:'dense-texture'});let success=false;
 try{
  // A retained texture result only clears bits in its disjoint mask tile;
  // repeating a partially published tile is therefore idempotent.
  await pool.run(total,{signal,consumeIdempotent:true,isCommitted:index=>!!(checkpointState.committed[index>>3]&(1<<(index&7))),onCommitted:index=>{checkpointState.committed[index>>3]|=1<<(index&7);checkpointState.completed++;},phase:'dense-texture',onProgress,prepare:async(index,{signal,reserveInput,buffers,resourceOperation})=>{
   const x=index%across*tile,y=Math.floor(index/across)*tile,cw=Math.min(tile,result.width-x),ch=Math.min(tile,result.height-y),x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),w=Math.min(width,x+cw+border+halo)-x0,h=Math.min(height,y+ch+border+halo)-y0;
   const part=await image.surface.readWindowInto({x:originX+x0,y:originY+y0,width:w,height:h},buffers.rgb,{signal,reserve:reserveInput,scratch:buffers.scratch,owner:'patchmatch',operation:resourceOperation});
   return {message:{width:w,height:h,rgb:part.pixels.data,values:buffers.values,x:x-x0,y:y-y0,coreWidth:cw,coreHeight:ch,settings:{method,patch,targetPatch,texture}},transfer:[part.pixels.data.buffer,buffers.values.buffer],release:part.release,ack:(answer,{takeBackBuffer})=>{takeBackBuffer('rgb',answer.rgb.buffer);takeBackBuffer('values',answer.values.buffer);}};
  },consume:async(index,answer,{reserveIO,buffers})=>{
   const x=index%across*tile,y=Math.floor(index/across)*tile,cw=Math.min(tile,result.width-x),ch=Math.min(tile,result.height-y),row=buffers.row.subarray(0,cw);
   for(let yy=0;yy<ch;yy++){const offset=(y+yy)*result.width+x;await result.mask.readInto(row,offset,{reserve:reserveIO});for(let xx=0;xx<cw;xx++)if(!answer.values[yy*cw+xx])row[xx]=0;await result.mask.write(row,offset,{reserve:reserveIO});}
  }});
  const execution=pool.snapshot();result.metrics.texture={workers:execution.peakComputing,tile,halo,execution,workspaceBytes:execution.peakWorkers*workspace,heapBytes:execution.heapBytes};await result.mask.flush();checkAbort(signal);checkpointState.complete=true;success=true;return result;
 }finally{pool.dispose();if(!success&&!retained)await result.dispose();}
}

export async function pagedGuideLabels(points,width,height,guides,{budget,signal,resourceOperation}={}){
 const operation=budget.beginOperation?.({owner:'patchmatch',id:'dense-guide-labels',parent:resourceOperation??undefined});
 try{return await getExecutionScheduler(budget).run({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-guide-labels'},async()=>{const labels=await localPagedGuideLabels(points,width,height,guides,{budget,signal});operation?.commit();return labels;});}finally{operation?.release();}
}
async function localPagedGuideLabels(points,width,height,guides,{budget,signal}={}){
 denseSearchContexts(guides);requireValue(points instanceof Float32Array&&points.length%7===0&&points.every(Number.isFinite)&&[width,height].every(Number.isSafeInteger)&&width>0&&height>0,'Invalid stored guide points.');
 const vertices=guides.reduce((n,p)=>n+p.length,0),workspace=16*1024**2+points.length/7*96+vertices*160;
 if(workspace>120*1024**2)throw new EngineError('MEMORY_LIMIT','Guide metadata exceeds the native allowance.');
 checkAbort(signal);const release=budget.reserve(workspace),pointers=[];let m;
 try{
  const {default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();let last=performance.now();m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-last>=20){await controlCheckpoint(signal);last=performance.now();}};
  const put=a=>{const p=m._malloc(Math.max(8,a.byteLength));if(!p)throw wasmAllocationFailure(m,'Guide metadata allocation failed.',Math.max(8,a.byteLength));pointers.push(p);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
  const xy=new Float64Array(vertices*2),polys=new Int32Array(guides.length*2);let at=0;
  guides.forEach((poly,i)=>{polys[i*2]=at;polys[i*2+1]=poly.length;for(const [x,y] of poly){requireValue(Math.abs(x)<0x3fffffff&&Math.abs(y)<0x3fffffff,'Invalid guide coordinate.');xy[at*2]=x;xy[at*2+1]=y;at++;}});
  const pp=put(points),vp=put(xy),poly=put(polys),out=put(new Int32Array(points.length/7)),error=put(new Uint8Array(1024)),values=[pp,points.length/7,width,height,vp,poly,guides.length,out,error];
  const code=await m.ccall('dense_paged_guide_labels','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);return new Int32Array(copyTypedArray(m.HEAPU8.subarray(out,out+points.length/7*4),{label:'dense-paged-regions-output'}).buffer);
 }finally{if(m){closeMemoryRanges(m);for(const p of pointers)m._free(p);m.checkpoint=null;}release();}
}
