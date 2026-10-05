import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {runWithWorkerTransportRecovery} from './worker-transport-recovery.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,requireValue,checkAbort,deserializeEngineError,isRecoverableTransportError} from './errors.js';
import {textTilePgm,validateTextImage} from './text-pixels.js';
import {textTiles,supportedTextBoxes,deduplicateTextBoxes,textPolygons} from './text-regions.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {TEXT_OCR_ASSETS} from './text-ocr-assets.js';
const MiB=1024**2;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function runtime(variant,signal){
  const name='tesseract-core-'+variant,identity=TEXT_OCR_ASSETS[name+'.wasm'];
  const response=await fetch(new URL('../vendor/text-ocr/'+name+'.wasm',import.meta.url),{signal});
  if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','Tesseract runtime could not load.');
  const reader=response.body.getReader(),parts=[];let total=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>identity.bytes)throw new EngineError('ASSET_INTEGRITY','Tesseract runtime size mismatch.');parts.push(value);}}finally{await reader.cancel();}
  const wasm=new Uint8Array(total);let offset=0;for(const part of parts){wasm.set(part,offset);offset+=part.length;}
  if(total!==identity.bytes||await digest(wasm)!==identity.sha256)throw new EngineError('ASSET_INTEGRITY','Tesseract runtime identity mismatch.');
  checkAbort(signal);return {wasm,moduleUrl:new URL('../vendor/text-ocr/'+name+'.mjs',import.meta.url).href};
}
// Internal engine: caller supplies the shared budget/profile and verified
// external English traineddata; no detached pools or default CDN requests.
export class TextRegionEngine{
  constructor(budget,profile){
    requireValue(budget&&typeof budget.reserve==='function'&&Number.isFinite(budget.limit)&&Number.isFinite(budget.retained)&&Number.isFinite(budget.active)&&profile&&Number.isSafeInteger(profile.maxWorkers)&&profile.maxWorkers>0,'OCR requires shared budget and worker profile.');
    this.budget=budget;this.profile=profile;this.resourceOwner='sift';this.adaptive=new AdaptiveConcurrency();this.workers=new Set();this.pending=new Map();this.running=false;
  }
  stop(){this.batchController?.abort();cancelScheduledWorkerCalls(this);for(const worker of this.workers){worker.terminate();this.pending.get(worker)?.reject(new EngineError('CANCELLED','OCR worker stopped.'));}this.workers.clear();this.pending.clear();}
  dispose(){this.stop();this.adaptive.clear();}
  rpc(worker,data,transfer=[],progress,admit,operation,signal){return scheduledWorkerCall(this,()=>new Promise((resolve,reject)=>{
    this.pending.set(worker,{reject});
    const protocol=installWorkerMessageProtocol(worker,message=>{
      if('progress' in message){if(typeof message.progress!=='number')throw workerMessageFailure('ocr-parent','message','invalid-progress-envelope');progress?.(message.progress);return;}
      if('admissionBytes' in message){if(!Number.isSafeInteger(message.admissionBytes)||message.admissionBytes<=0||typeof admit!=='function')throw workerMessageFailure('ocr-parent','message','invalid-admission-envelope');admit(message.admissionBytes);protocol.post({kind:'admitted'});return;}
      if(!message.error&&(!Number.isSafeInteger(message.heapBytes)||message.heapBytes<=0||(data.kind==='init'?message.ready!==true||typeof message.version!=='string':!Array.isArray(message.boxes))))throw workerMessageFailure('ocr-parent','message','invalid-result-envelope');
      this.pending.delete(worker);if(message.error)reject(typeof message.error==='object'?deserializeEngineError(message.error):new EngineError(message.error,message.message));else resolve(message);
    },{label:'ocr-parent',onFailure:error=>{worker.terminate();this.workers.delete(worker);this.pending.delete(worker);reject(error);}});
    worker.onerror=()=>protocol.fail(new EngineError('WORKER_FAILED','OCR worker failed.'));
    try{protocol.post(data,transfer);}catch(error){protocol.fail(error);}
  }),{label:'ocr',operation,signal});}
  async detect(image,{language,signal,onProgress,backend='auto'}={}){
    requireValue(!this.running,'OCR engine already running.');
    requireValue(['auto','scalar'].includes(backend),'Invalid OCR CPU backend.');
    requireValue(typeof Worker!=='undefined','OCR requires browser workers.');
    validateTextImage(image);
    requireValue(language?.data instanceof Uint8Array&&language.data.length>0&&language.data.length<=64*MiB&&/^[0-9a-f]{64}$/.test(language.sha256),'External English language data and SHA-256 required.');
    checkAbort(signal);this.running=true;let releaseAssets,releaseResults;const retainedResults=[],started=performance.now();
    const abort=()=>this.stop();signal?.addEventListener('abort',abort,{once:true});
    try{
      releaseAssets=this.budget.reserve(language.data.length+32*MiB);
      if(await digest(language.data)!==language.sha256)throw new EngineError('ASSET_INTEGRITY','English language identity mismatch.');
      const tiles=textTiles(image.width,image.height),results=new Map(),fractions=new Float64Array(tiles.length),key=tiles.length+'/'+language.sha256;
      releaseResults=this.budget.reserve(tiles.length*1024);
      let variant=backend==='scalar'?'lstm':'simd-lstm',assets=await runtime(variant,signal),heapBytes=128*MiB,done=0,taskExecutions=0,retries=0,maxWorkers=0,peakHeapBytes=0,progress=0,nativeVersion=null;
      const report=()=>{const fraction=fractions.reduce((a,b)=>a+b,0)/tiles.length;progress=Math.max(progress,fraction);onProgress?.({fraction:progress,completed:done,total:tiles.length,phase:done===tiles.length?'finalizing':'ocr'});};
      while(done<tiles.length){
        checkAbort(signal);
        const perWorker=heapBytes*3+language.data.length*2+48*MiB,remaining=tiles.map((_,i)=>i).filter(i=>!results.has(i)),maximum=Math.min(this.profile.maxWorkers,remaining.length);
        const plan=this.adaptive.select(key,maximum,this.budget,n=>n*perWorker),releaseWorkers=this.budget.reserve(plan.count*perWorker);maxWorkers=Math.max(maxWorkers,plan.count);
        const batchStart=performance.now(),batchController=new AbortController(),batchSignal=signal?AbortSignal.any([signal,batchController.signal]):batchController.signal;this.batchController=batchController;let next=0,stopped=false,lanes=[];
        try{
          lanes=Array.from({length:plan.count},async()=>{
            const operation=this.budget.beginOperation?.({owner:this.resourceOwner,id:'ocr-lane'});let worker;try{
            while(next<remaining.length&&!stopped){
              checkAbort(batchSignal);const index=remaining[next++],tile=tiles[index];
              await runWithWorkerTransportRecovery(async()=>{checkAbort(batchSignal);const tileReleases=[];try{operation?.setState('io');if(!worker){worker=new Worker(new URL('./text-ocr-worker.js',import.meta.url),{type:'module'});this.workers.add(worker);const initialized=await this.rpc(worker,{kind:'init',...assets,language:language.data,maximumHeapBytes:heapBytes},[],undefined,undefined,operation,batchSignal);nativeVersion=initialized.version;}
              const pgm=await textTilePgm(image,tile,{signal:batchSignal});checkAbort(batchSignal);taskExecutions++;
              const result=await this.rpc(worker,{kind:'tile',pgm,origin:tile.slice(0,2),width:image.width,height:image.height},[pgm.buffer],fraction=>{fractions[index]=Math.max(fractions[index],fraction*.95);report();},n=>tileReleases.push(this.budget.reserve(n)),operation,batchSignal);
              if(stopped)return;checkAbort(signal);
              peakHeapBytes=Math.max(peakHeapBytes,result.heapBytes);requireValue(result.heapBytes<=heapBytes,'OCR exceeded admitted WASM memory.');
              operation?.setState('io');const releases=[];let boxes;
              try{boxes=await supportedTextBoxes(image,result.boxes,{signal:batchSignal,reserveMemory:n=>{const release=this.budget.reserve(n);releases.push(release);}});}finally{for(const release of releases)release();}
              if(stopped)return;
              retainedResults.push(this.budget.reserve(boxes.length*320));
              results.set(index,boxes);done++;fractions[index]=1;operation?.commit();report();
              }catch(error){if(isRecoverableTransportError(error)){worker?.terminate();this.workers.delete(worker);this.pending.delete(worker);worker=null;}throw error;}finally{for(const release of tileReleases)release();}
              },{budget:this.budget,signal:batchSignal,owner:this.resourceOwner,resourceOperation:operation,operation:'ocr-tile/'+index,onRecovery:event=>{if(event.phase==='resource-recovery')retries++;onProgress?.(event);}});
            }
            }finally{operation?.release();}
          });
          await Promise.all(lanes);
          this.adaptive.observe(key,{count:plan.count,maximum,milliseconds:performance.now()-batchStart,units:remaining.length});
        }catch(error){
          stopped=true;this.stop();await Promise.allSettled(lanes);checkAbort(signal);
          if(error.code==='WASM_UNAVAILABLE'&&variant==='simd-lstm'){variant='lstm';assets=await runtime(variant,signal);retries++;continue;}
          if(isWorkerResourceFailure(error)&&retries<3){this.adaptive.reduce(key,plan.count,{error});retries++;if(error.code==='MEMORY_LIMIT')heapBytes=Math.min(512*MiB,heapBytes*2);continue;}
          throw error;
        }finally{stopped=true;this.stop();await Promise.allSettled(lanes);if(this.batchController===batchController)this.batchController=null;releaseWorkers();}
      }
      checkAbort(signal);const count=[...results.values()].reduce((n,boxes)=>n+boxes.length,0),freeOutput=this.budget.reserve(count*1280+4096);let boxes,polygons;
      try{boxes=deduplicateTextBoxes(tiles.flatMap((_,i)=>results.get(i)));polygons=textPolygons(boxes);}catch(error){freeOutput();throw error;}
      let outputReleased=false;
      return {boxes,polygons,release(){if(!outputReleased){outputReleased=true;freeOutput();}},metadata:{engine:'Tesseract',nativeVersion,runtime:'tesseract.js-core 7.0.0',language:'eng',languageSha256:language.sha256,psm:11,tileEdge:1536,overlap:128,backend:variant,workers:maxWorkers,peakWorkerHeapBytes:peakHeapBytes,preflightExecutions:0,taskExecutions,retries,totalMs:performance.now()-started}};
    }catch(error){checkAbort(signal);throw error;}finally{signal?.removeEventListener('abort',abort);this.stop();releaseAssets?.();releaseResults?.();for(const release of retainedResults)release();this.running=false;}
  }
}
