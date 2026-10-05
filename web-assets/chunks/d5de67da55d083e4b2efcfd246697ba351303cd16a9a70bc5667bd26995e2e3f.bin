import "../../runtime-context.js?v=0.14.5";
import {catnetCompanionSource} from './catnet-companion-source.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {createTemporarySession} from './temporary-storage.js';
import {createNeuralTensor} from './neural-tensor-store.js';
import {catnetSourceTensors} from './catnet-source-tensors.js';
import {catnetSegmentedNetwork} from './catnet-segmented-network.js';
import {renderResearch} from './research-render.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
const readonly=t=>Object.freeze({width:t.width,height:t.height,length:t.length,byteLength:t.byteLength,storage:t.storage,readInto:t.readInto.bind(t),readBytes:t.readBytes.bind(t)});
export async function catnetOrientTensor(padded,metadata,{budget,getTemporarySession,signal,storage='auto'}={}){
 const [h,w]=metadata.source_shape,o=metadata.orientation,width=o>=5?h:w,height=o>=5?w:h,target=await createNeuralTensor(1,height,width,{budget,signal,storage:storage==='auto'?(width*height*4>budget.limit/12?'temporary':'memory'):storage,getTemporarySession}),step=256;
 function position(x,y){switch(o){case 2:return [w-1-x,y];case 3:return [w-1-x,h-1-y];case 4:return [x,h-1-y];case 5:return [y,x];case 6:return [h-1-y,x];case 7:return [h-1-y,w-1-x];case 8:return [y,w-1-x];default:return [x,y];}}
 try{for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
  checkAbort(signal);const tw=Math.min(step,w-x),th=Math.min(step,h-y),corners=[position(x,y),position(x+tw-1,y+th-1)],left=Math.min(...corners.map(p=>p[0])),top=Math.min(...corners.map(p=>p[1])),ow=o>=5?th:tw,oh=o>=5?tw:th,release=budget.reserve((tw*th+tw)*4);
  try{const out=new Float32Array(tw*th),row=new Float32Array(tw);for(let yy=0;yy<th;yy++){await padded.readInto(row,(y+yy)*padded.width+x,{signal});for(let xx=0;xx<tw;xx++){const [dx,dy]=position(x+xx,y+yy);out[(dy-top)*ow+dx-left]=row[xx];}}await target.writeWindow({x:left,y:top,width:ow,height:oh},out,{signal});}finally{release();}
 }return target;}catch(e){await target.dispose();throw e;}
}
export async function renderCatnetSegmented(image,result,mode,rect,{budget,signal,onProgress}={}){
 const d=result.data;rect??={x:0,y:0,width:d.width,height:d.height};const pixels=await image.surface.readWindow(rect,{signal});let mapRelease,rendered;
 try{mapRelease=budget.reserve(rect.width*rect.height*4);const map=new Float32Array(rect.width*rect.height);for(let y=0;y<rect.height;y++)await d.map.readInto(map.subarray(y*rect.width,(y+1)*rect.width),(rect.y+y)*d.width+rect.x,{signal});rendered=await renderResearch(pixels.pixels,{width:rect.width,height:rect.height,map,metadata:d.metadata},mode,{budget,signal,onProgress});return {...rendered,origin:[rect.x,rect.y]};}catch(e){rendered?.release();throw e;}finally{mapRelease?.();pixels.release();}
}
export function createCatnetSegmentedAnalyzer({manifest,runtimes,jpegFactory,budget,profile}){
 const pool=new NeuralGraphPool(budget,profile,{assets:manifest.assets,runtimes});let active,disposed=false,cached;
 async function unpin(item){if(--item.refs===0){try{await item.network.release();await item.map.dispose();}finally{await item.session?.dispose();}}}
 async function clearCache(){const old=cached;cached=null;if(old)await unpin(old);pool.clear();}
 function acquire(item,hit){item.refs++;let released=false;return {data:{...item.data,metadata:structuredClone(item.data.metadata)},provenance:structuredClone(item.provenance),metrics:{cache:{result:hit},execution:structuredClone(item.execution),memory:budget.snapshot(),preflightExecutions:0},async release(){if(!released){released=true;await unpin(item);}}};}
 return {
  async analyze(image,params={},options={}){
   if(disposed)throw new EngineError('DISPOSED','Segmented CAT-Net disposed.');if(active)throw new EngineError('BUSY','Segmented CAT-Net already running.');requireValue(Object.keys(params).length===0&&image.surface&&jpegFactory,'Original segmented CAT-Net JPEG and codec required.');
   const controller=new AbortController(),abort=()=>controller.abort();active=controller;options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const signal=controller.signal;
   const d=image.surface.descriptor,key=JSON.stringify([image.sha256,d.id,d.revision,options.backend??'auto']);let session,sessionPending,prepared,network,map,companion;
   const getTemporarySession=async()=>{if(session)return session;if(!sessionPending)sessionPending=createTemporarySession({budget,signal}).then(s=>session=s);return sessionPending;};
   try{
    checkAbort(signal);if(cached?.key===key)return acquire(cached,true);await clearCache();const hints={manifest,pool,budget,getTemporarySession,signal,onProgress:options.onProgress,backend:options.backend??'auto',storage:manifest.storage??'auto'};
    if(image.provenance?.format&&image.provenance.format!=='jpeg')companion=await catnetCompanionSource(image,hints);
    prepared=await catnetSourceTensors(companion??image,{...hints,jpegFactory});if(companion)Object.assign(prepared.metadata,{jpeg_source:'companion_q100_444',companion:companion.metrics});await companion?.releaseEncoded();network=await catnetSegmentedNetwork(prepared.rgb,prepared.codes,prepared.table,hints);const metadata=prepared.metadata;await prepared.release();prepared=null;await companion?.release();companion=null;pool.clear();
    map=await catnetOrientTensor(network.padded_map,metadata,hints);await network.releasePaddedMap();checkAbort(signal);
    const item={key,refs:1,network,map,session,data:{width:d.width,height:d.height,segmented:true,map:readonly(map),native_map:readonly(network.native_map),nativeShape:[network.native_map.height,network.native_map.width],metadata:{method:'catnet',...metadata,memory_bounded:true,compact_dct:true,segmented:true,coordinateSpace:'source-pixels',interbranchResize:'global half-pixel bilinear'}},provenance:{originalSourceSha256:image.sha256,sourceSurfaceIdentity:d.id+'/'+d.revision,checkpointSha256:manifest.checkpointSha256,provider:[...new Set(network.executions.map(e=>e.provider))].join('+'),qualification:'native segmented HRNet; see dimension-specific proof'},execution:{network:network.executions,storage:session?{backend:session.backend,...session.snapshot()}:null}};
    cached=item;network=null;map=null;session=null;return acquire(item,false);
   }finally{try{await prepared?.release();await companion?.release();await network?.release();await map?.dispose();await session?.dispose();}finally{active=null;options.signal?.removeEventListener('abort',abort);}}
  },clearCache,async dispose(){if(disposed)return;disposed=true;active?.abort();await clearCache();pool.dispose();}
 };
}
