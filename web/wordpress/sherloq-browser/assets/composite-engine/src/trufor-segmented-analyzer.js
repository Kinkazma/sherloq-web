import "../../runtime-context.js?v=0.14.5";
import {NeuralGraphPool} from './neural-graph-pool.js';import {createTemporarySession} from './temporary-storage.js';import {createNeuralTensor} from './neural-tensor-store.js';
import {noiseprintPlusSurface} from './noiseprint-plus-surface.js';import {truforRgbSource,truforNoiseSource} from './trufor-source-tensors.js';
import {truforSegmentedBackbone} from './trufor-segmented-backbone.js';import {truforSegmentedDecode} from './trufor-segmented-decoder.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
const readonly=t=>Object.freeze({channels:t.channels,width:t.width,height:t.height,length:t.length,byteLength:t.byteLength,storage:t.storage,readInto:t.readInto.bind(t),readBytes:t.readBytes.bind(t)});
export function createTruforSegmentedAnalyzer({manifest,runtimes,nppPool,budget,profile}){
 const pool=new NeuralGraphPool(budget,profile,{assets:manifest.assets,runtimes});let active,disposed=false,cached;
 async function unpin(item){if(--item.refs===0){try{await item.decoded.release();}finally{try{await item.noise.dispose();}finally{await item.session?.dispose();}}}}
 async function clearCache(){const old=cached;cached=null;if(old)await unpin(old);pool.clear();}
 function acquire(item,hit){item.refs++;let released=false;return {data:{...item.data,metadata:structuredClone(item.data.metadata)},provenance:structuredClone(item.provenance),metrics:{cache:{result:hit},execution:structuredClone(item.execution),memory:budget.snapshot(),preflightExecutions:0},release:async()=>{if(!released){released=true;await unpin(item);}}};}
 return {
  async analyze(image,params={},options={}){
   if(disposed)throw new EngineError('DISPOSED','Segmented TruFor disposed.');if(active)throw new EngineError('BUSY','Segmented TruFor already running.');
   requireValue(Object.keys(params).length===0&&image.surface?.descriptor.format==='rgb8'&&nppPool,'Full-resolution RGB surface and native Noiseprint++ are required.');
   const {width,height,id,revision}=image.surface.descriptor;requireValue(width>=29&&height>=29,'TruFor source is too small.');
   const controller=new AbortController(),abort=()=>controller.abort();active=controller;options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const signal=controller.signal;
   const key=JSON.stringify([image.sha256??null,id,revision,width,height,options.backend??'auto']);let session,sessionPending,noise,encoded,decoded;
   const getTemporarySession=async()=>{if(session)return session;if(!sessionPending)sessionPending=createTemporarySession({budget,signal}).then(s=>session=s);return sessionPending;};
   try{
    checkAbort(signal);if(cached?.key===key)return acquire(cached,true);await clearCache();
    const hints={manifest,pool,budget,getTemporarySession,signal,onProgress:options.onProgress,backend:options.backend??'auto',storage:manifest.storage??'auto'};
    noise=await createNeuralTensor(1,height,width,{budget,signal,storage:manifest.storage??(width*height*4>budget.limit/12?'temporary':'memory'),getTemporarySession});
    const residual=await noiseprintPlusSurface(image.surface,noise,{...hints,pool:nppPool});nppPool.clear();
    encoded=await truforSegmentedBackbone(truforRgbSource(image.surface,{budget}),truforNoiseSource(noise,{budget}),hints);
    decoded=await truforSegmentedDecode(encoded.features,width,height,hints);const encoderExecution=encoded.executions;await encoded.release();encoded=null;pool.clear();checkAbort(signal);
    const fields={width,height,segmented:true,map:readonly(decoded.map),confidence:readonly(decoded.confidence),noiseprint_pp:readonly(noise),score:decoded.score,metadata:{method:'trufor',rgbDivisor:256,imgsize:[height,width],coordinateSpace:'source-pixels',attention:'global',threshold:null,storage:'lossless segmented float32',statisticsPooling:'complete image; float64 reduction accumulator'}};
    const item={key,refs:1,decoded,noise,session,data:fields,provenance:{originalSourceSha256:image.sha256??null,sourceSurfaceIdentity:id+'/'+revision,checkpointSha256:manifest.checkpointSha256,provider:[...new Set([...residual.executions,...encoderExecution,...decoded.executions].map(e=>e.provider))].join('+'),qualification:'segmented native graph; see dimension-specific proof'},execution:{noiseprint:residual.executions,encoder:encoderExecution,decoder:decoded.executions,storage:session?{backend:session.backend,...session.snapshot()}:null}};
    cached=item;decoded=null;noise=null;session=null;return acquire(item,false);
   }finally{
    try{await encoded?.release();await decoded?.release();await noise?.dispose();await session?.dispose();}finally{active=null;options.signal?.removeEventListener('abort',abort);}
   }
  },
  clearCache,
  async dispose(){if(disposed)return;disposed=true;active?.abort();await clearCache();pool.dispose();}
 };
}
