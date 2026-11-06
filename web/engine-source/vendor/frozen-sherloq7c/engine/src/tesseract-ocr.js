import{TesseractWorkerOwner,retireTesseractOwners,isTesseractWasmUnavailable}from'./tesseract-worker-owner.js';
import{createTesseractLstmGpu}from'./tesseract-lstm-gpu.js';
import{attachGpuCleanup}from'./gpu-ack-retirement.js';
import {EngineError,requireValue,checkAbort,deserializeEngineError,serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {TEXT_OCR_ASSETS} from './text-ocr-assets.js';
import {TESSERACT_PGM_ASSETS} from './tesseract-pgm-assets.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createUsefulOperationEvidence} from './useful-operation-evidence.js';
import {tesseractUsefulFacts} from './tesseract-useful-contract.js';
import {USEFUL_WORK_CODE_IDENTITY} from './useful-work-code-identity.js';
import {textTiles} from './text-regions.js';
import {textTilePgm,validateTextImage} from './text-pixels.js';
import {deduplicateOcrWords,immutableOcr} from './ocr-structure.js';
const MiB=1024**2;
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');

/** A transcription owner separate from the scientific text-exclusion engine.
 * All image sampling stays at native resolution and uses bounded source leases. */
export function createTesseractOcr({budget,profile,configuration={},workerFactory=()=>new Worker(new URL('./tesseract-ocr-worker.js',import.meta.url),{type:'module'}),assetLoader,gpuFactory=createTesseractLstmGpu}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isSafeInteger(profile.maxWorkers)&&profile.maxWorkers>0,'OCR requires the shared memory budget and CPU profile.');
 requireValue(configuration.completeCpuOnly===undefined||typeof configuration.completeCpuOnly==='boolean','Complete CPU resource selection must be a boolean.');
 // The CPU profile remains caller-owned; one GPU lane is admitted only for the optional PGM runtime.
 let gpuService,gpuStageFree,gpuWorkerSerial=0,gpuRequested=false,nativeVersionObserved=null;const workerFees=new Set(),releaseDebts=new Set(),workers=new Map(),assets=new Map(),resourceOwner='ocr-tesseract';let running=false,closed=false,controller,activeFinished;
 let cpuVariant=configuration.completeCpuOnly===true?'simd-lstm':'pgm-lstm-cpu';
 const cpuResource=()=>cpuVariant==='pgm-lstm-cpu'?'pgm-lstm-cpu/1':'official-complete/'+cpuVariant;
 const owner={resourceOwner,budget,profile};
 async function load(key,identity,signal){
  if(assets.has(key)){const cached=assets.get(key);requireValue(cached.identity.bytes===identity.bytes&&cached.identity.sha256===identity.sha256,'OCR cached resource identity changed.');return cached.data;}
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
   const retained=release.split(identity.bytes);assets.set(key,{data:bytes,release:retained,identity:Object.freeze({bytes:identity.bytes,sha256:identity.sha256})});keep=true;return bytes;
  }finally{release();if(!keep)bytes=null;}
 }
 const retireWorkers=async()=>{let has=false,primary;for(const[worker,slot]of [...workers])try{await slot.close();workers.delete(worker);}catch(error){if(!has){has=true;primary=error;}}if(!workers.size)try{await retireTesseractOwners(workerFees);}catch(error){if(!has){has=true;primary=error;}}if(has)throw primary;};
 const stop=()=>{controller?.abort();for(const slot of workers.values())slot.cancel();};
 async function retireRuntime(){await retireWorkers();await retireTesseractOwners(releaseDebts);await gpuService?.dispose();gpuService=null;await gpuStageFree?.();gpuStageFree=null;}
 function createWorker(){const worker=workerFactory();let rawRetired=false;const raw={cancel(){},async close(){if(rawRetired)return;await worker.terminate();rawRetired=true;}};workers.set(worker,raw);const token=++gpuWorkerSerial,slot=new TesseractWorkerOwner(owner,worker,{gpu:async request=>{if(!gpuRequested)return null;gpuService??=gpuFactory({budget,signal:controller.signal,onSubmitted:()=>{try{activeProgress?.({phase:'ocr-lstm-gpu',gpuSubmitted:true});}catch(error){if(slot.active)slot.active.primary??={error};slot.cancel();throw new EngineError('CANCELLED','OCR progress callback failed');}}});return gpuService.run({...request,key:token+':'+request.key});}});workers.set(worker,slot);return worker;}
 function rpc(worker,data,{operation,transfer=[],progress,admit}={}){const slot=workers.get(worker);requireValue(slot,'OCR Native owner is absent');return slot.call(data,{operation,transfer,progress,admit});}
 let activeProgress;
 async function analyze(image,params,{signal,onProgress,backend='auto'}={}){
  params={...params};requireValue(['cpu','auto','webgpu'].includes(backend),'Invalid OCR backend.');const useGpu=backend==='webgpu';
  if(useGpu&&(typeof WebAssembly.Suspending!=='function'||typeof WebAssembly.promising!=='function'))throw new EngineError('GPU_UNAVAILABLE','The optional PGM LSTM runtime requires WebAssembly JSPI. The complete CPU runtime remains available.');
  requireValue(!closed&&!running,'OCR analyzer is closed or already running.');validateTextImage(image);running=true;let finish;activeFinished=new Promise(resolve=>finish=resolve);controller=new AbortController();const joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const assetReady=[cpuVariant==='pgm-lstm-cpu'?'runtime/tesseract-pgm-lstm-cpu':'runtime/tesseract-core-'+cpuVariant,'runtime/tesseract-pgm-lstm-gpu',...params.language.split('+').map(id=>'language/'+id)].every(key=>assets.has(key));activeProgress=onProgress;gpuRequested=useGpu;const abort=()=>stop();joined.addEventListener('abort',abort,{once:true});const started=performance.now(),tileResults=new Map(),releases=[];const nativeProfiles=[],assetProfiles=[];let success=false,hasPrimary=false,primary,heapBytes=128*MiB,variant=useGpu?'pgm-lstm-gpu':cpuVariant,executions=0,workerPeak=0,nativeVersion=null;
  try{
   await retireRuntime();checkAbort(joined);if(useGpu)gpuStageFree=budget.reserve(128*MiB);const ids=params.language.split('+'),languages=[];for(const id of ids){const configuredIdentity=configuration.languages?.[id];if(!configuredIdentity)throw new EngineError('MODEL_UNAVAILABLE','The requested OCR language is not installed.',{details:{language:id}});const identity=Object.freeze({...configuredIdentity});languages.push({id,data:await load('language/'+id,identity,joined),identity});}
   const languageBytes=languages.reduce((n,l)=>n+l.data.byteLength,0),tiles=textTiles(image.width,image.height);releases.push(budget.reserve(tiles.length*1024));
   for(let attempt=0;;attempt++){
    checkAbort(joined);const name=useGpu?'tesseract-pgm-lstm-gpu':variant==='pgm-lstm-cpu'?'tesseract-pgm-lstm-cpu':'tesseract-core-'+variant,identities=useGpu||variant==='pgm-lstm-cpu'?TESSERACT_PGM_ASSETS:TEXT_OCR_ASSETS,wasm=await load('runtime/'+name,{...identities[name+'.wasm'],url:new URL('../vendor/text-ocr/'+name+'.wasm',import.meta.url).href},joined),remaining=tiles.map((tile,index)=>({tile,index})).filter(item=>!tileResults.has(item.index));
    const perWorker=heapBytes*3+languageBytes*2+48*MiB;let count=Math.min(useGpu?1:profile.maxWorkers,remaining.length,Math.max(0,Math.floor((budget.limit-budget.total())/perWorker)));
    if(!count){const initial=budget.reserve(perWorker);initial();count=1;}
    const releaseWorkers=budget.reserve(count*perWorker);workerFees.add(releaseWorkers);workerPeak=Math.max(workerPeak,count);let next=0,failed,hasLaneFailure=false,lanePrimary;const lanes=[];
    try{
     for(let lane=0;lane<count;lane++)lanes.push((async()=>{
      const operation=budget.beginOperation?.({owner:resourceOwner,id:'ocr-lane/'+lane});let worker;
      try{
       worker=createWorker();const initialized=await rpc(worker,{kind:'init',wasm,moduleUrl:new URL('../vendor/text-ocr/'+name+'.mjs',import.meta.url).href,languages,maximumHeapBytes:heapBytes,gpuEnabled:useGpu},{signal:joined,operation});nativeVersion=initialized.version;nativeVersionObserved=nativeVersion;nativeProfiles.push({phase:'worker-init',...initialized.nativeProfile});
       while(next<remaining.length&&!hasLaneFailure){
        checkAbort(joined);const {tile,index}=remaining[next++],pgm=await textTilePgm(image,tile,{signal:joined});executions++;let payloadRelease;
        try{const value=await rpc(worker,{kind:'tile',pgm,psm:params.psm,origin:tile.slice(0,2),tile:index,width:image.width,height:image.height},{signal:joined,operation,transfer:[pgm.buffer],progress:fraction=>onProgress?.({phase:'ocr-recognition',completed:tileResults.size,total:tiles.length,tile:index,fraction:(tileResults.size+fraction)/tiles.length}),admit:bytes=>{payloadRelease=budget.reserve(bytes);}});
         checkAbort(joined);requireValue(value.heapBytes<=heapBytes,'OCR exceeded its admitted WASM memory.');nativeProfiles.push({phase:'tile',tile:index,...value.nativeProfile});tileResults.set(index,value);releases.push(payloadRelease);payloadRelease=null;operation?.commit();onProgress?.({phase:'ocr-recognition',completed:tileResults.size,total:tiles.length,fraction:tileResults.size/tiles.length});
        }finally{if(payloadRelease){releaseDebts.add(payloadRelease);await payloadRelease();releaseDebts.delete(payloadRelease);}}
       }
      }catch(error){hasLaneFailure=true;lanePrimary=error;throw error;}finally{await retireCompositeOwners([()=>operation?.release()],hasLaneFailure?{primary:lanePrimary}:{});}
     })());
     await Promise.all(lanes);
    }catch(error){hasLaneFailure=true;lanePrimary=error;failed??=error;for(const slot of workers.values())slot.cancel();await Promise.allSettled(lanes);let retired=true;try{await retireWorkers();}catch(cleanup){retired=false;attachGpuCleanup(error,cleanup);}if(retired&&!useGpu&&isTesseractWasmUnavailable(error)){if(variant==='pgm-lstm-cpu'){cpuVariant=variant='simd-lstm';continue;}if(variant==='simd-lstm'){cpuVariant=variant='lstm';continue;}}throw error;}
    finally{try{await retireWorkers();}catch(cleanup){if(hasLaneFailure)attachGpuCleanup(lanePrimary,cleanup);else throw cleanup;}}
    break;
   }
   checkAbort(joined);const raw=[...tileResults].sort((a,b)=>a[0]-b[0]).flatMap(([,r])=>r.regions),nativeText=tiles.length===1?tileResults.get(0).nativeText:null;
   releases.push(budget.reserve(raw.length*512+(nativeText?.length??0)*4+8192));const regions=immutableOcr(deduplicateOcrWords(raw)),gpuStats=gpuService?.stats()??null;await retireRuntime();checkAbort(joined);const applied=nativeProfiles.filter(p=>p.phase==='tile').reduce((n,p)=>n+(p.gpuLstm?.applied??0),0),actualGpuWork=applied>0&&gpuStats?.gpuCalls===applied,usefulWork=createUsefulOperationEvidence({...tesseractUsefulFacts({parameters:params,cpuResource:cpuResource(),profile,budgetBytes:budget.limit,nativeVersion,modelShas:languages.map(item=>item.identity.sha256),assetReady}),actualBackend:actualGpuWork?'hybrid':'cpu',actualGpuWork,actualCpuWork:true,completedAfterAck:true,numericAdmissible:true});success=true;let released=false,releasing;
   return {regions,nativeText,metadata:{engine:'Tesseract',nativeVersion,resource:useGpu?'pgm-lstm-gpu/1':variant==='pgm-lstm-cpu'?'pgm-lstm-cpu/1':'official-complete',requestedBackend:backend,effectiveBackend:gpuStats?.gpuCalls>0?'webgpu-hybrid':'cpu',pgmRuntime:useGpu||variant==='pgm-lstm-cpu'?{...TESSERACT_PGM_ASSETS}:undefined,runtime:'tesseract.js-core 7.0.0',language:params.language,languageModels:languages.map(({id,identity})=>({id,bytes:identity.bytes,sha256:identity.sha256})),psm:params.psm,tileEdge:1536,overlap:128,recognition:true,coordinateSpace:'original-image-pixels',bounds:'exclusive-right-bottom',sourceSha256:image.sha256??null,originalPixelsModified:false,overlapDeduplication:'same-NFC-text and greater-than80-percent smaller-box overlap across tiles; higher native confidence wins',readingOrder:tiles.length===1?'native TSV hierarchy':'native TSV line hierarchy and source-coordinate line ordering; cross-tile layout may require review'},metrics:{usefulWork,gpuLstm:gpuStats,nativeProfiles,workers:workerPeak,taskExecutions:executions,tiles:tiles.length,backend:gpuStats?.gpuCalls>0?'webgpu-hybrid':'cpu',runtimeVariant:variant,gpuRequested:useGpu,totalMs:performance.now()-started},release(){if(released)return Promise.resolve();if(releasing)return releasing;releasing=(async()=>{while(releases.length){await releases[0]?.();releases.shift();}released=true;})();void releasing.catch(()=>{if(!released)releasing=null;});return releasing;}};
  }catch(error){hasPrimary=true;primary=error;throw error;}finally{joined.removeEventListener('abort',abort);let hasRetirement=false,retirement;try{stop();await retireRuntime();}catch(error){hasRetirement=true;retirement=error;}finally{if(!success)for(const release of releases)try{if(release)releaseDebts.add(release);await release?.();releaseDebts.delete(release);}catch(error){if(!hasRetirement){hasRetirement=true;retirement=error;}}running=false;controller=null;activeProgress=null;gpuRequested=false;finish();activeFinished=null;}if(hasRetirement){if(hasPrimary)attachGpuCleanup(primary,retirement);else throw retirement;}}
 }
 return {analyze,describeUsefulWork(parameters){
  if(closed||running||!parameters||!['eng','fra','eng+fra'].includes(parameters.language))return null;
  const ids=parameters.language.split('+'),models=ids.map(id=>assets.get('language/'+id));if(models.some(x=>!x))return null;
  const assetReady=[cpuVariant==='pgm-lstm-cpu'?'runtime/tesseract-pgm-lstm-cpu':'runtime/tesseract-core-'+cpuVariant,'runtime/tesseract-pgm-lstm-gpu',...ids.map(id=>'language/'+id)].every(key=>assets.has(key)),facts=tesseractUsefulFacts({parameters,cpuResource:cpuResource(),profile,budgetBytes:budget.limit,nativeVersion:nativeVersionObserved,modelShas:models.map(x=>x.identity.sha256),assetReady});
  if(!facts)return null;const gpu=!!globalThis.navigator?.gpu&&typeof WebAssembly.Suspending==='function'&&typeof WebAssembly.promising==='function';return{schema:'sherloq.useful-operation-owner/1',...facts,codeSha256:USEFUL_WORK_CODE_IDENTITY.sha256,admission:{cpu:true,webgpu:gpu},numericAdmissible:{cpu:true,webgpu:true}};
 },async clearCache(){requireValue(!running,'OCR recognition is active.');await retireRuntime();for(const[key,asset]of [...assets]){await asset.release();assets.delete(key);}},async dispose(){closed=true;stop();await activeFinished;await retireRuntime();for(const[key,asset]of [...assets]){await asset.release();assets.delete(key);}},snapshot(){return {cpuRuntimeVariant:cpuVariant,running,workers:workers.size,assetKeys:[...assets.keys()].sort(),profile:profile.id,maxWorkers:profile.maxWorkers,budgetBytes:budget.limit,nativeWorkerHeapBytes:128*MiB,runtime:nativeVersionObserved?'tesseract.js-core7.0.0/native-'+nativeVersionObserved:null,assetBytes:[...assets.values()].reduce((n,a)=>n+a.data.byteLength,0),closed};}};
}
