import "../../runtime-context.js?v=0.24.0";
import {EngineError,requireValue,checkAbort,deserializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {TEXT_OCR_ASSETS} from './text-ocr-assets.js';
import {textTiles} from './text-regions.js';
import {textTilePgm,validateTextImage} from './text-pixels.js';
import {deduplicateOcrWords,immutableOcr} from './ocr-structure.js';
const MiB=1024**2;
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');

/** A transcription owner separate from the scientific text-exclusion engine.
 * All image sampling stays at native resolution and uses bounded source leases. */
export function createTesseractOcr({budget,profile,configuration={},workerFactory=()=>new Worker(new URL('./tesseract-ocr-worker.js',import.meta.url),{type:'module'}),assetLoader}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isSafeInteger(profile.maxWorkers)&&profile.maxWorkers>0,'OCR requires the shared memory budget and CPU profile.');
 const workers=new Map(),assets=new Map(),resourceOwner='ocr-tesseract';let running=false,closed=false,controller,activeFinished;
 const owner={resourceOwner,budget,profile};
 async function load(key,identity,signal){
  if(assets.has(key))return assets.get(key).data;
  requireValue(Number.isSafeInteger(identity?.bytes)&&identity.bytes>0&&identity.bytes<=64*MiB&&/^[0-9a-f]{64}$/.test(identity.sha256),'OCR asset needs a verified size and SHA-256.');
  const release=budget.reserve(identity.bytes*3);let bytes,keep=false;
  try{
   if(assetLoader)bytes=await assetLoader(key,identity,{signal});
   else if(identity.data instanceof Uint8Array)bytes=identity.data.slice();
   else{
    requireValue(typeof identity.url==='string','OCR asset URL is not configured.');
    const response=await fetch(identity.url,{signal});if(!response.ok)throw new EngineError('ASSET_HTTP','OCR resource could not load.',{details:{asset:key,status:response.status}});
    const reader=response.body.getReader(),parts=[];let length=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>identity.bytes)throw new EngineError('ASSET_INTEGRITY','OCR resource exceeds its pinned size.');parts.push(value);}}finally{await reader.cancel();}
    bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}
   }
   checkAbort(signal);requireValue(bytes instanceof Uint8Array,'OCR asset loader did not return bytes.');
   if(bytes.byteLength!==identity.bytes||await digest(bytes)!==identity.sha256)throw new EngineError('ASSET_INTEGRITY','OCR resource differs from its pinned identity.',{details:{asset:key}});
   const retained=release.split(identity.bytes);assets.set(key,{data:bytes,release:retained});keep=true;return bytes;
  }finally{release();if(!keep)bytes=null;}
 }
 const retireWorkers=()=>{cancelScheduledWorkerCalls(owner);for(const [worker,slot]of workers){slot.protocol?.dispose();worker.terminate();slot.reject?.(new EngineError('CANCELLED','OCR recognition stopped.'));slot.reject=null;const retired=slot.backing?.();if(retired)budget.notifyBackingRelease?.('wasm',retired);}workers.clear();};
 const stop=()=>{controller?.abort();retireWorkers();};
 function createWorker(){
  const worker=workerFactory(),slot={pending:null,reject:null,backing:budget.registerBacking?.('wasm',128*MiB,{owner:resourceOwner,label:'ocr-transcription-worker',state:'reserved'})};
  slot.protocol=installWorkerMessageProtocol(worker,message=>{
   const pending=slot.pending;if(!pending)throw workerMessageFailure('ocr-transcription-parent','message','unexpected-response');
   if('progress'in message){requireValue(typeof message.progress==='number'&&Number.isFinite(message.progress),'Invalid OCR progress.');pending.progress?.(message.progress);return;}
   if('admissionBytes'in message){requireValue(Number.isSafeInteger(message.admissionBytes)&&message.admissionBytes>0&&typeof pending.admit==='function','Invalid OCR response admission.');pending.admit(message.admissionBytes);slot.protocol.post({kind:'admitted'});return;}
   if(!message.error)requireValue(Number.isSafeInteger(message.heapBytes)&&message.heapBytes>0&&(pending.kind==='init'?message.ready===true&&typeof message.version==='string':Array.isArray(message.regions)&&typeof message.nativeText==='string'),'Invalid OCR response.');
   slot.pending=null;slot.reject=null;if(message.error)pending.reject(deserializeEngineError(message.error));else{slot.backing?.resize(message.heapBytes);pending.resolve(message);}
  },{label:'ocr-transcription-parent',onFailure:error=>{slot.error=error;slot.pending?.reject(error);slot.pending=null;slot.reject=null;}});
  worker.onerror=event=>slot.protocol.fail(new EngineError('WORKER_FAILED','OCR transcription worker failed.',{cause:event?.error}));workers.set(worker,slot);return worker;
 }
 function rpc(worker,data,{signal,operation,transfer=[],progress,admit}={}){
  return scheduledWorkerCall(owner,()=>new Promise((resolve,reject)=>{
   const slot=workers.get(worker);if(!slot||slot.error){reject(slot?.error??new EngineError('CANCELLED','OCR worker retired.'));return;}
   requireValue(!slot.pending,'OCR worker already has a request.');slot.reject=reject;slot.pending={resolve,reject,kind:data.kind,progress,admit};
   try{slot.protocol.post(data,transfer);}catch(error){slot.pending=null;slot.reject=null;reject(error);}
  }),{signal,operation,label:'ocr-transcription'});
 }
 async function analyze(image,params,{signal,onProgress,backend='auto'}={}){
  if(backend==='webgpu')throw new EngineError('UNSUPPORTED_BACKEND','Tesseract transcription uses its native CPU LSTM runtime.');
  requireValue(!closed&&!running,'OCR analyzer is closed or already running.');validateTextImage(image);running=true;let finish;activeFinished=new Promise(resolve=>finish=resolve);controller=new AbortController();const joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const abort=()=>stop();joined.addEventListener('abort',abort,{once:true});const started=performance.now(),tileResults=new Map(),releases=[];let success=false,heapBytes=128*MiB,variant='simd-lstm',executions=0,workerPeak=0,nativeVersion=null;
  try{
   const ids=params.language.split('+'),languages=[];for(const id of ids){const identity=configuration.languages?.[id];if(!identity)throw new EngineError('MODEL_UNAVAILABLE','The requested OCR language is not installed.',{details:{language:id}});languages.push({id,data:await load('language/'+id,identity,joined)});}
   const languageBytes=languages.reduce((n,l)=>n+l.data.byteLength,0),tiles=textTiles(image.width,image.height);releases.push(budget.reserve(tiles.length*1024));
   for(let attempt=0;;attempt++){
    checkAbort(joined);const name='tesseract-core-'+variant,wasm=await load('runtime/'+variant,{...TEXT_OCR_ASSETS[name+'.wasm'],url:new URL('../vendor/text-ocr/'+name+'.wasm',import.meta.url).href},joined),remaining=tiles.map((tile,index)=>({tile,index})).filter(item=>!tileResults.has(item.index));
    const perWorker=heapBytes*3+languageBytes*2+48*MiB;let count=Math.min(profile.maxWorkers,remaining.length,Math.max(0,Math.floor((budget.limit-budget.total())/perWorker)));
    if(!count){const initial=budget.reserve(perWorker);initial();count=1;}
    const releaseWorkers=budget.reserve(count*perWorker);workerPeak=Math.max(workerPeak,count);let next=0,failed;const lanes=[];
    try{
     for(let lane=0;lane<count;lane++)lanes.push((async()=>{
      const operation=budget.beginOperation?.({owner:resourceOwner,id:'ocr-lane/'+lane});let worker;
      try{
       worker=createWorker();const initialized=await rpc(worker,{kind:'init',wasm,moduleUrl:new URL('../vendor/text-ocr/'+name+'.mjs',import.meta.url).href,languages,maximumHeapBytes:heapBytes},{signal:joined,operation});nativeVersion=initialized.version;
       while(next<remaining.length&&!failed){
        checkAbort(joined);const {tile,index}=remaining[next++],pgm=await textTilePgm(image,tile,{signal:joined});executions++;let payloadRelease;
        try{const value=await rpc(worker,{kind:'tile',pgm,psm:params.psm,origin:tile.slice(0,2),tile:index,width:image.width,height:image.height},{signal:joined,operation,transfer:[pgm.buffer],progress:fraction=>onProgress?.({phase:'ocr-recognition',completed:tileResults.size,total:tiles.length,tile:index,fraction:(tileResults.size+fraction)/tiles.length}),admit:bytes=>{payloadRelease=budget.reserve(bytes);}});
         checkAbort(joined);requireValue(value.heapBytes<=heapBytes,'OCR exceeded its admitted WASM memory.');tileResults.set(index,value);releases.push(payloadRelease);payloadRelease=null;operation?.commit();onProgress?.({phase:'ocr-recognition',completed:tileResults.size,total:tiles.length,fraction:tileResults.size/tiles.length});
        }finally{payloadRelease?.();}
       }
      }catch(error){failed??=error;throw error;}finally{operation?.release();}
     })());
     await Promise.all(lanes);
    }catch(error){failed??=error;retireWorkers();await Promise.allSettled(lanes);checkAbort(joined);if(error.code==='WASM_UNAVAILABLE'&&variant==='simd-lstm'&&attempt===0){variant='lstm';continue;}throw error;}
    finally{for(const [worker,slot]of workers){slot.protocol.dispose();worker.terminate();const retired=slot.backing?.();if(retired)budget.notifyBackingRelease?.('wasm',retired);}workers.clear();releaseWorkers();}
    break;
   }
   checkAbort(joined);const raw=[...tileResults].sort((a,b)=>a[0]-b[0]).flatMap(([,r])=>r.regions),nativeText=tiles.length===1?tileResults.get(0).nativeText:null;
   releases.push(budget.reserve(raw.length*512+(nativeText?.length??0)*4+8192));const regions=immutableOcr(deduplicateOcrWords(raw));success=true;let released=false;
   return {regions,nativeText,metadata:{engine:'Tesseract',nativeVersion,runtime:'tesseract.js-core 7.0.0',language:params.language,languageModels:params.language.split('+').map(id=>({id,bytes:configuration.languages[id].bytes,sha256:configuration.languages[id].sha256})),psm:params.psm,tileEdge:1536,overlap:128,recognition:true,coordinateSpace:'original-image-pixels',bounds:'exclusive-right-bottom',sourceSha256:image.sha256??null,originalPixelsModified:false,overlapDeduplication:'same-NFC-text and greater-than80-percent smaller-box overlap across tiles; higher native confidence wins',readingOrder:tiles.length===1?'native TSV hierarchy':'native TSV line hierarchy and source-coordinate line ordering; cross-tile layout may require review'},metrics:{workers:workerPeak,taskExecutions:executions,tiles:tiles.length,backend:variant,totalMs:performance.now()-started},release(){if(released)return;released=true;for(const release of releases)release?.();}};
  }catch(error){checkAbort(signal);throw error;}finally{joined.removeEventListener('abort',abort);stop();if(!success)for(const release of releases)release?.();running=false;controller=null;finish();activeFinished=null;}
 }
 return {analyze,clearCache(){requireValue(!running,'OCR recognition is active.');for(const asset of assets.values())asset.release();assets.clear();},async dispose(){closed=true;stop();await activeFinished;for(const asset of assets.values())asset.release();assets.clear();},snapshot(){return {running,workers:workers.size,assetBytes:[...assets.values()].reduce((n,a)=>n+a.data.byteLength,0),closed};}};
}
