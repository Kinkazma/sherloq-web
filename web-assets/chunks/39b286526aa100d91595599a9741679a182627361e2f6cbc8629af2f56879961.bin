import "../../runtime-context.js?v=0.14.5";
import {deserializeEngineError} from './errors.js';
import {serializeEngineError} from './errors.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {denseViewHelpers} from './dense-view.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
export async function renderPagedDenseCopy(image,result,input={}, {budget,signal,onProgress,workerFactory=()=>new Worker(new URL('./dense-view-worker.js',import.meta.url),{type:'module'})}={}){
 const p={low:0,high:100000,minimum:4,chosen:[],hidden:[],circles:true,lines:true,points:false,areas:true,...input}, {width,height}=image.surface.descriptor;
 requireValue(Number.isFinite(p.low)&&p.low>=0&&Number.isFinite(p.high)&&p.high>=p.low&&Number.isInteger(p.minimum)&&p.minimum>=1,'Invalid dense view filter.');
 for(const k of ['chosen','hidden'])requireValue(Array.isArray(p[k])&&p[k].every(i=>Number.isSafeInteger(i)&&i>=0),'Invalid dense selected group.');
 for(const k of ['circles','lines','points','areas'])requireValue(typeof p[k]==='boolean','Invalid dense drawing switch.');
 const {round,sides,distinct}=denseViewHelpers,metadataBytes=result.points.byteLength+result.pairs.byteLength+result.colors.byteLength+result.groups.reduce((n,g)=>n+g.length*32+256,0)+4096,drop=budget.reserve(metadataBytes),candidates=[];
 let release,worker,pending,output,surface,success=false,heapBytes=0;
 const abort=()=>{worker?.terminate();pending?.reject(new EngineError('CANCELLED','Dense renderer stopped.'));pending=null;};
 signal?.addEventListener('abort',abort,{once:true});
 const call=(message,transfer=[])=>{checkAbort(signal);return new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage(message,transfer);});};
 try{
  const chosen=new Set(p.chosen),hidden=new Set(p.hidden);let overlayBytes=0;
  const box=values=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let i=0;i<values.length;i+=2){const x=round(values[i]),y=round(values[i+1]);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return Math.min(width,x1-x0+1)*Math.min(height,y1-y0+1)*3;};
  for(let index=0;index<result.groups.length;index++){
   await controlCheckpoint(signal);const group=result.groups[index],rows=group.filter(row=>result.pairs[row*4+3]>=p.low&&result.pairs[row*4+3]<=p.high);if(rows.length<p.minimum)continue;
   const [a,b]=sides(result.points,result.pairs,rows);if(Math.min(distinct(a),distinct(b))<p.minimum)continue;
   const visible=!hidden.has(index)&&(!chosen.size||chosen.has(index));if(visible&&p.areas)overlayBytes=Math.max(overlayBytes,box(a),box(b));candidates.push({index,rows,a,b,visible});
  }
  const workspace=64*1024**2+width*height*3+overlayBytes+metadataBytes*3+8*1024**2;
  if(workspace>2**31)throw new EngineError('MEMORY_LIMIT','The native drawing framebuffer and largest overlay exceed WASM capacity.');
  release=budget.reserve(workspace);checkAbort(signal);worker=workerFactory();worker.onmessage=({data})=>{const task=pending;pending=null;if(!task)return;data.error?task.reject(deserializeEngineError(data.error)):task.resolve(data.result);};worker.onerror=e=>{pending?.reject(new EngineError('WORKER_FAILED',e.message));pending=null;};
  heapBytes=(await call({command:'init',width,height,points:result.points,pairs:result.pairs,colors:result.colors})).heapBytes;
  const rowsPerPage=Math.max(1,Math.floor(4*1024**2/(width*3)));
  for(let y=0;y<height;y+=rowsPerPage){const part=await image.surface.readWindow({x:0,y,width,height:Math.min(rowsPerPage,height-y)},{signal});try{await call({command:'write',offset:y*width*3,bytes:part.pixels.data},[part.pixels.data.buffer]);}finally{part.release();}onProgress?.({phase:'dense-view-source',completed:Math.min(height,y+rowsPerPage),total:height});}
  const visible=[],legend=[],selectedGroups=[],flags=(p.circles?1:0)|(p.lines?2:0)|(p.points?4:0)|(p.areas?8:0);
  for(const c of candidates){
   if(result.mirror_policy&&result.groups[c.index][0]>=result.mirror_policy.base_pair_count){const a=Float32Array.from(c.a,round),b=Float32Array.from(c.b,round),overlap=await call({command:'overlap',a,b},[a.buffer,b.buffer]);if(overlap.overlap>=result.mirror_policy.maximum_overlap)continue;}
   legend.push([c.index,c.rows.length,result.groups[c.index].length]);if(!c.visible)continue;visible.push([c.index,c.rows.length]);selectedGroups.push({index:c.index,rows:c.rows});heapBytes=Math.max(heapBytes,(await call({command:'group',rows:c.rows,color:result.bases[c.index],flags})).heapBytes);
  }
  output=await createSegmentedBytes(width*height*3,{budget,storage:'auto',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  for(let offset=0;offset<output.byteLength;offset+=4*1024**2){const r=await call({command:'read',offset,length:Math.min(4*1024**2,output.byteLength-offset)});await output.write(r.bytes,offset);heapBytes=Math.max(heapBytes,r.heapBytes);onProgress?.({phase:'dense-view-output',completed:Math.min(output.byteLength,offset+r.bytes.length),total:output.byteLength});}
  await output.flush();checkAbort(signal);surface=createRgbSurface(output,{width,height,budget});success=true;let released=false;
  return {surface,visible,legend,selectedGroups,style:p,metrics:{workspaceBytes:workspace,overlayBytes,heapBytes,framebufferBytes:width*height*3,storage:output.storage},async release(){if(released)return;released=true;try{await surface.dispose();}finally{drop();}}};
 }finally{signal?.removeEventListener('abort',abort);worker?.terminate();release?.();if(!success){await output?.dispose();drop();}}
}
