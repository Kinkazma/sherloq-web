import "../../runtime-context.js?v=0.33.1";
import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {createTemporarySession} from './temporary-storage.js';
import {createNeuralTensor} from './neural-tensor-store.js';
import {truforRgbSource,truforNoiseSource} from './trufor-source-tensors.js';
import {truforMiniNoiseprint} from './trufor-mini-noiseprint.js';
import {truforMiniBackbone} from './trufor-mini-backbone.js';
import {truforMiniDecode} from './trufor-mini-decoder.js';
import {renderTruforMini} from './trufor-mini-render.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

const readonly=t=>Object.freeze({channels:t.channels,width:t.width,height:t.height,length:t.length,byteLength:t.byteLength,elementType:'Float32Array',storage:t.storage,readInto:t.readInto.bind(t),readBytes:t.readBytes.bind(t)});
const SCORE_KIND='mean_top_1_percent_localization';
const SCORE_INTERPRETATION='empirical map summary; not the official TruFor image-level detector';

/** Frozen study Mini through the same bounded neural worker pool and lossless
 * tensor stores as full TruFor. It has no official detector/confidence heads.
 */
export function createTruforMiniAnalyzer({manifest,segments,runtimes,budget,profile,computeProfile='aggressive',resourceHints,windowBytes,attentionBytes}={}){
 manifest=structuredClone(manifest??segments);runtimes=structuredClone(runtimes);
 profile??=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
 requireValue(manifest?.schema===1&&manifest.method==='trufor-mini'&&manifest.rgbDivisor===256&&manifest.assets?.[manifest.noiseprint]&&manifest.assets?.[manifest.decoder]&&manifest.assets?.[manifest.final],'Frozen TruFor Mini operator manifest required.');
 requireValue(/^[a-f0-9]{64}$/.test(manifest.stateSha256??'')&&manifest.score===SCORE_KIND,'Invalid TruFor Mini scientific identity.');
 const pool=new NeuralGraphPool(budget,profile,{assets:manifest.assets,runtimes,resourceOwner:'trufor-mini'}),retiring=new Set();
 let active=null,cached=null,disposed=false,disposal=null,poolClosed=false;
 async function retire(item){
  if(item.refs||item.retired)return;if(item.closing)return item.closing;retiring.add(item);
  item.closing=(async()=>{
   const cleanups=await Promise.allSettled([Promise.resolve().then(()=>item.decoded?.release()),Promise.resolve().then(()=>item.noise?.dispose())]),failure=cleanups.find(x=>x.status==='rejected');
   if(failure)throw failure.reason;await item.session?.dispose();item.retired=true;retiring.delete(item);
  })();
  try{await item.closing;}finally{item.closing=null;}
 }
 async function unpin(item){requireValue(item.refs>0,'TruFor Mini result reference underflow.');item.refs--;if(!item.refs)await retire(item);}
 async function evict(){
  const old=cached,previousRetirements=[...retiring];cached=null;let failed=false,primary;
  if(old)try{await unpin(old);}catch(error){failed=true;primary=error;}
  for(const item of previousRetirements)try{await retire(item);}catch(error){if(!failed){failed=true;primary=error;}}
  pool.clear();if(failed)throw primary;
 }
 function acquire(item,hit,image){
  item.refs++;let unpinned=false,closed=false,closing;
  return {data:{...item.data,metadata:structuredClone(item.data.metadata)},provenance:{...structuredClone(item.provenance),sourceSurfaceIdentity:image.surface.descriptor.id+'/'+image.surface.descriptor.revision},metrics:{cache:{result:hit},execution:structuredClone(item.execution),memory:budget.snapshot(),preflightExecutions:0},
   release(){
    if(closed)return;if(closing)return closing;
    closing=(async()=>{if(!unpinned){unpinned=true;await unpin(item);}else if(!item.refs)await retire(item);closed=true;})();
    void closing.catch(()=>{closing=null;});return closing;
   }};
 }
 return {
  async analyze(image,params={},options={}){
   if(disposed)throw new EngineError('DISPOSED','TruFor Mini analyzer disposed.');if(active)throw new EngineError('BUSY','TruFor Mini analysis already running.');
   requireValue(Object.keys(params).length===0&&image.surface?.descriptor.format==='rgb8','TruFor Mini requires a native RGB surface and has no scientific tuning parameters.');
   const {width,height,id,revision}=image.surface.descriptor;requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>=29&&height>=29&&Number.isSafeInteger(width*height*4),'TruFor Mini source must be at least 29 by 29.');
   const controller=new AbortController(),abort=()=>controller.abort();let finish;const done=new Promise(resolve=>finish=resolve);active={controller,done};
   options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const signal=controller.signal;
   const immutable=options.immutableSource===true&&image.segmented&&/^[a-f0-9]{64}$/.test(image.sha256)&&!image.provenance?.sourceRegionDomain;
   const identity=immutable?['original-blob',image.sha256,width,height,image.surface.descriptor.format]:[image.sha256??null,id,revision,width,height];
   const key=JSON.stringify([...identity,options.backend??'auto',manifest.stateSha256,manifest.assets[manifest.decoder].sha256,manifest.assets[manifest.final].sha256]);
   let session,sessionPending,noise,encoded,decoded,primary,failed=false;
   const getTemporarySession=async()=>{if(session)return session;if(!sessionPending)sessionPending=createTemporarySession({budget,signal}).then(value=>session=value);return sessionPending;};
   try{
    checkAbort(signal);if(cached?.key===key)return acquire(cached,true,image);await evict();
    // Local transport windows may use a larger share of the already admitted
    // engine budget. Operator-specific activation factors, halos, attention
    // limits and every pool allocation/admission remain unchanged.
    const localWindowBytes=windowBytes??Math.max(4096,Math.min(128*1024**2,Math.floor(budget.limit/12)));
    const hints={manifest,pool,budget,getTemporarySession,signal,onProgress:options.onProgress,backend:options.backend??'auto',storage:manifest.storage??'auto',windowBytes:localWindowBytes,...(attentionBytes===undefined?{}:{attentionBytes})};
    noise=await createNeuralTensor(1,height,width,{budget,signal,storage:manifest.storage??(width*height*4>budget.limit/12?'temporary':'memory'),cooperation:'bounded',getTemporarySession});
    // The pruned NPP graph and encoder share the normal neural pool. Keep
    // its idle runtime reusable; the existing budget reclaimers can retire
    // it when needed instead of forcing a new worker/device initialization.
    const residual=await truforMiniNoiseprint(image.surface,noise,hints);
    encoded=await truforMiniBackbone(truforRgbSource(image.surface,{budget}),truforNoiseSource(noise,{budget}),hints);
    decoded=await truforMiniDecode(encoded.features,width,height,hints);const encoderExecution=encoded.executions;await encoded.release();encoded=null;pool.clear();checkAbort(signal);
    const fields={width,height,segmented:true,map:readonly(decoded.map),noiseprint_pp:readonly(noise),score:decoded.score,metadata:{method:'trufor-mini',model:'flow-inactive',rgbDivisor:256,imgsize:[height,width],coordinateSpace:'source-pixels',attention:structuredClone(manifest.attentionPolicy),threshold:null,storage:'lossless segmented float32',scoreKind:SCORE_KIND,scoreInterpretation:SCORE_INTERPRETATION,noiseprintInterpretation:'folded and channel-pruned Mini noise residual',stateSha256:manifest.stateSha256}};
    const item={key,refs:1,decoded,noise,session,data:fields,provenance:{originalSourceSha256:image.sha256??null,sourceSurfaceIdentity:id+'/'+revision,checkpointSha256:manifest.checkpointSha256,stateSha256:manifest.stateSha256,provider:[...new Set([...residual.executions,...encoderExecution,...decoded.executions].map(e=>e.provider))].join('+'),qualification:'frozen Mini segmented operators; see dimension-specific parity proof'},execution:{noiseprint:residual.executions,encoder:encoderExecution,decoder:decoded.executions,storage:session?{backend:session.backend,...session.snapshot()}:null}};
    cached=item;decoded=null;noise=null;session=null;return acquire(item,false,image);
   }catch(error){failed=true;primary=error;throw error;}
   finally{
    try{
     const cleanups=await Promise.allSettled([Promise.resolve().then(()=>encoded?.release()),Promise.resolve().then(()=>decoded?.release()),Promise.resolve().then(()=>noise?.dispose())]);let cleanupFailure=cleanups.find(x=>x.status==='rejected');
     if(cleanupFailure){
      // Retain an owner for a retry; do not destroy storage still used by a
      // field whose native disposal failed.
      const residue={refs:0,decoded:{release:async()=>{const outcomes=await Promise.allSettled([Promise.resolve().then(()=>encoded?.release()),Promise.resolve().then(()=>decoded?.release())]),failure=outcomes.find(x=>x.status==='rejected');if(failure)throw failure.reason;}},noise,session};retiring.add(residue);
     }else try{await session?.dispose();}catch(error){cleanupFailure={reason:error};retiring.add({refs:0,session});}
     if(cleanupFailure){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.cleanupError=cleanupFailure.reason;}else throw cleanupFailure.reason;}
    }finally{if(failed)pool.clear();active=null;finish();options.signal?.removeEventListener('abort',abort);}
   }
  },
  render(result,view='map',options={}){return renderTruforMini(result,view,undefined,{...options,budget});},
  renderWindow(_image,result,view,rect,options={}){return renderTruforMini(result,view,rect,{...options,budget});},
  async clearCache(){const current=active;if(current){current.controller.abort();await current.done;}await evict();},
  dispose(){
   if(disposal)return disposal;disposed=true;
   disposal=(async()=>{const current=active;if(current){current.controller.abort();await current.done;}try{await evict();}finally{if(!poolClosed){poolClosed=true;pool.dispose();}}})();
   void disposal.catch(()=>{disposal=null;});return disposal;
  },
  memory(){return budget.snapshot();}
 };
}
