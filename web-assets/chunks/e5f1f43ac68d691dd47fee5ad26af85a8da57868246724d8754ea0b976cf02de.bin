import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {denseDescriptorShape} from './dense-math.js';
import {denseSearchContexts} from './dense-profiles.js';
import {createSegmentedBytes} from './segmented-bytes.js';
export async function createPagedRegionsMask(width,height,{method=0,patch=8,targetPatch=patch,regions=[],excluded=[],budget,storage='auto',temporarySession,getTemporarySession,signal}={}){
 const shape=denseDescriptorShape(width,height,method,Math.max(patch,targetPatch));denseSearchContexts(regions);denseSearchContexts(excluded);
 requireValue(regions.length<=2,'At most two dense regions per context.');
 const paths=[...regions,...excluded],count=paths.reduce((n,p)=>n+p.length,0),pageBytes=4096,cachePages=32,workspace=16*1024**2+count*160+cachePages*(pageBytes+32);
 if(workspace>120*1024**2)throw new EngineError('MEMORY_LIMIT','Polygon edges exceed the current native allowance.');
 checkAbort(signal);const release=budget.reserve(workspace),pointers=[];let mask,m,success=false;
 try{
  mask=await createSegmentedBytes(shape.width*shape.height,{budget,storage,temporarySession,getTemporarySession,signal});
  const {default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();let last=performance.now();
  m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-last>=20){await controlCheckpoint(signal);last=performance.now();}};
  m.pageIO=async(id,offset,length,pointer,write)=>{checkAbort(signal);const bytes=m.HEAPU8.subarray(pointer,pointer+length);if(write)await mask.write(bytes,offset);else await mask.readInto(bytes,offset);if(performance.now()-last>=20)await m.checkpoint();};
  const put=a=>{const p=m._malloc(Math.max(8,a.byteLength));if(!p)throw new EngineError('MEMORY_LIMIT','Polygon metadata allocation failed.');pointers.push(p);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
  const points=new Float64Array(count*2),polygons=new Int32Array(paths.length*2);let at=0;
  paths.forEach((poly,i)=>{polygons[i*2]=at;polygons[i*2+1]=poly.length;for(const [x,y] of poly){requireValue(Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<0x3fffffff&&Math.abs(y)<0x3fffffff,'Invalid dense polygon coordinate.');points[at*2]=x;points[at*2+1]=y;at++;}});
  const pp=put(points),polys=put(polygons),error=put(new Uint8Array(1024)),values=[width,height,shape.width,shape.height,shape.shift,pp,polys,paths.length,regions.length,pageBytes,cachePages,error];
  const code=await m.ccall('dense_paged_regions','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);await mask.flush();success=true;
  return {...shape,mask,metrics:{workspaceBytes:workspace,heapBytes:m.HEAPU8.byteLength},dispose:()=>mask.dispose()};
 }finally{if(m){for(const p of pointers)m._free(p);m.pageIO=null;m.checkpoint=null;}if(!success)await mask?.dispose();release();}
}

export async function preparePagedEligibility(image,{region=null,method=0,patch=8,targetPatch=patch,regions=[],excluded=[],texture=2,budget,storage='auto',temporarySession=image.session,getTemporarySession=image.ensureTemporarySession,signal,onProgress,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-texture-worker.js',import.meta.url),{type:'module'})}={}){
 const descriptor=image.surface?.descriptor;requireValue(descriptor?.format==='rgb8'&&Number.isFinite(texture)&&texture>=0&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Invalid stored eligibility source.');
 const [originX,originY,width,height]=region??[0,0,descriptor.width,descriptor.height];
 requireValue([originX,originY,width,height].every(Number.isSafeInteger)&&originX>=0&&originY>=0&&originX+width<=descriptor.width&&originY+height<=descriptor.height,'Invalid eligibility crop.');
 const plannedSupport=Math.max(patch,targetPatch),plannedHalo=2*Math.ceil((3*plannedSupport+1)/2),plannedBorder=method?3*plannedSupport:0,plannedArea=Math.min(width,128+plannedBorder+2*plannedHalo)*Math.min(height,128+plannedBorder+2*plannedHalo),plannedShape=denseDescriptorShape(width,height,method,plannedSupport);
 const maskStorage=storage==='auto'&&texture&&plannedShape.width*plannedShape.height+50*1024**2+plannedArea*67>budget.limit-budget.retained-budget.active?'temporary':storage;
 const options={method,patch,targetPatch,regions,excluded,budget,storage:maskStorage,temporarySession,getTemporarySession,signal};
 const result=await createPagedRegionsMask(width,height,options);if(!texture)return result;
 const support=Math.max(patch,targetPatch),border=method?3*support:0,halo=2*Math.ceil((3*support+1)/2),room=budget.limit-budget.retained-budget.active;
 let tile=128,workspace,ioAllowance;
 while(true){const w=Math.min(width,tile+border+2*halo),h=Math.min(height,tile+border+2*halo),area=w*h;workspace=48*1024**2+area*64;ioAllowance=area*3+Math.max(w,h)*3+2*1024**2;if(workspace+ioAllowance<=room)break;if(tile===1){await result.dispose();throw new EngineError('MEMORY_LIMIT','Native texture support does not fit.');}tile=Math.max(1,Math.floor(tile/2));}
 const across=Math.ceil(result.width/tile),total=across*Math.ceil(result.height/tile),workers=Math.min(maxWorkers,total,Math.floor(room/(workspace+ioAllowance))),release=budget.reserve(workers*workspace),active=new Map();let success=false,stopped=false,next=0,completed=0,heapBytes=0;
 const stop=()=>{stopped=true;for(const [worker,reject] of active){worker.terminate();reject?.(new EngineError('CANCELLED','Dense texture stopped.'));}active.clear();};signal?.addEventListener('abort',stop,{once:true});
 try{
  const task=async()=>{const worker=workerFactory();active.set(worker,null);try{while(next<total){checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Dense texture stopped.');const index=next++,x=index%across*tile,y=Math.floor(index/across)*tile,cw=Math.min(tile,result.width-x),ch=Math.min(tile,result.height-y),x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),w=Math.min(width,x+cw+border+halo)-x0,h=Math.min(height,y+ch+border+halo)-y0;
    const part=await image.surface.readWindow({x:originX+x0,y:originY+y0,width:w,height:h},{signal});let answer;
    try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Dense texture stopped.');answer=await new Promise((resolve,reject)=>{active.set(worker,reject);worker.onmessage=({data})=>{active.set(worker,null);data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);};worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message));worker.postMessage({width:w,height:h,rgb:part.pixels.data,x:x-x0,y:y-y0,coreWidth:cw,coreHeight:ch,settings:{method,patch,targetPatch,texture}},[part.pixels.data.buffer]);});}finally{part.release();}
    heapBytes=Math.max(heapBytes,answer.heapBytes);const row=new Uint8Array(cw);
    for(let yy=0;yy<ch;yy++){const offset=(y+yy)*result.width+x;await result.mask.readInto(row,offset);for(let xx=0;xx<cw;xx++)if(!answer.values[yy*cw+xx])row[xx]=0;await result.mask.write(row,offset);}
    onProgress?.({phase:'dense-texture',completed:++completed,total});
   }}finally{active.delete(worker);worker.terminate();}};
  const tasks=Array.from({length:workers},task);try{await Promise.all(tasks);}catch(e){stop();await Promise.allSettled(tasks);throw e;}
  await result.mask.flush();checkAbort(signal);result.metrics.texture={workers,tile,halo,workspaceBytes:workers*workspace,heapBytes};success=true;return result;
 }finally{signal?.removeEventListener('abort',stop);stop();release();if(!success)await result.dispose();}
}

export async function pagedGuideLabels(points,width,height,guides,{budget,signal}={}){
 denseSearchContexts(guides);requireValue(points instanceof Float32Array&&points.length%7===0&&points.every(Number.isFinite)&&[width,height].every(Number.isSafeInteger)&&width>0&&height>0,'Invalid stored guide points.');
 const vertices=guides.reduce((n,p)=>n+p.length,0),workspace=16*1024**2+points.length/7*96+vertices*160;
 if(workspace>120*1024**2)throw new EngineError('MEMORY_LIMIT','Guide metadata exceeds the native allowance.');
 checkAbort(signal);const release=budget.reserve(workspace),pointers=[];let m;
 try{
  const {default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();let last=performance.now();m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-last>=20){await controlCheckpoint(signal);last=performance.now();}};
  const put=a=>{const p=m._malloc(Math.max(8,a.byteLength));if(!p)throw new EngineError('MEMORY_LIMIT','Guide metadata allocation failed.');pointers.push(p);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
  const xy=new Float64Array(vertices*2),polys=new Int32Array(guides.length*2);let at=0;
  guides.forEach((poly,i)=>{polys[i*2]=at;polys[i*2+1]=poly.length;for(const [x,y] of poly){requireValue(Math.abs(x)<0x3fffffff&&Math.abs(y)<0x3fffffff,'Invalid guide coordinate.');xy[at*2]=x;xy[at*2+1]=y;at++;}});
  const pp=put(points),vp=put(xy),poly=put(polys),out=put(new Int32Array(points.length/7)),error=put(new Uint8Array(1024)),values=[pp,points.length/7,width,height,vp,poly,guides.length,out,error];
  const code=await m.ccall('dense_paged_guide_labels','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);return new Int32Array(m.HEAPU8.slice(out,out+points.length/7*4).buffer);
 }finally{if(m){for(const p of pointers)m._free(p);m.checkpoint=null;}release();}
}
