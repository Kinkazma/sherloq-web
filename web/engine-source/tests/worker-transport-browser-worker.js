import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createRgbRecompression} from '../src/jpeg-rgb-stream.js';
import {parallelEnergyPlanes} from '../src/energy-stream-pool.js';
import {parallelGhostPlanes} from '../src/ghost-stream-pool.js';
import {parallelStoredGrayLosses} from '../src/jpeg-gray-stream-pool.js';
import {TextRegionEngine} from '../src/text-ocr.js';
const assert=(value,message)=>{if(!value)throw Error(message);},MiB=1024**2,NativeWorker=globalThis.Worker;

function faults(target,mode){
 const proof={created:0,terminated:0,injected:0,commands:{}};
 globalThis.Worker=class extends NativeWorker{
  constructor(url,options){super(url,options);this.target=String(url).includes(target);if(this.target)proof.created++;this.finished=false;this.quality=null;
   this.addEventListener('message',event=>{const chosen=target==='text-ocr-worker'?this.quality===0&&event.data?.boxes:this.quality===30&&event.data?.result;if(this.target&&['parent-messageerror','malformed-result'].includes(mode)&&chosen&&!proof.injected){proof.injected++;event.stopImmediatePropagation();if(mode==='malformed-result')this.onmessage?.(new MessageEvent('message',{data:{unexpected:true}}));else this.onmessageerror?.(new MessageEvent('messageerror'));}});
  }
  postMessage(data,transfer){
   if(this.target&&data?.action==='open'){this.quality=data.quality;proof.commands[data.quality]=(proof.commands[data.quality]??0)+1;}
   if(this.target&&data?.kind==='tile'){this.quality=data.origin[0];proof.commands[this.quality]=(proof.commands[this.quality]??0)+1;}
   const chosen=this.target&&(target==='text-ocr-worker'?this.quality===0:this.quality===30),repeat=mode==='always-null';
   if(chosen&&(repeat||!proof.injected)&&((['null-command','always-null'].includes(mode)&&(data?.action==='write'||data?.kind==='tile'))||mode==='null-io-reply'&&data?.ioReply)){
    proof.injected++;return super.postMessage(null,transfer);
   }
   return super.postMessage(data,transfer);
  }
  terminate(){if(this.target&&!this.finished){this.finished=true;proof.terminated++;}return super.terminate();}
 };
 return proof;
}

async function quality(kind,mode){
 const budget=new Budget(192*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),width=96,height=80,store=await createSegmentedBytes(width*height*3,{budget,storage:'memory'});await store.write(Uint8Array.from({length:store.byteLength},(_,i)=>(i*17+(i>>9)*31)%256));
 const surface=createRgbSurface(store,{width,height,budget}),image={surface},values=new Map(),proof=faults(kind==='gray'?'jpeg-gray-stream-worker':kind+'-stream-worker',mode);image.rgbRecompression=createRgbRecompression(image,budget);
 const publish=(q,value)=>{assert(!values.has(q),'Repeated published quality '+q);values.set(q,value);},options={budget,maxWorkers:2,onQuality:publish,onPlane:async(q,value)=>{if(kind==='energy'){const bytes=new Uint8Array(value.store.byteLength);await value.store.readInto(bytes);await value.dispose();publish(q,bytes);}else publish(q,new Uint8Array(value.buffer.slice(0)));}};let metrics,error;
 try{if(kind==='energy')metrics=await parallelEnergyPlanes(image,[10,30,50],2,options);else if(kind==='ghost')metrics=await parallelGhostPlanes(image,[10,30,50],2,{...options,phaseX:3,phaseY:5});else metrics=await parallelStoredGrayLosses(image,[10,30,50],2,options);}catch(caught){error=caught;}finally{globalThis.Worker=NativeWorker;await image.rgbRecompression.dispose();await surface.dispose();}
 assert(budget.total()===0,kind+' budget leak');assert(scheduler.used.cpu===0&&scheduler.queue.length===0,kind+' execution leak');assert(proof.created===proof.terminated,kind+' live worker leak');
 return {values,metrics,error,proof};
}

async function ocr(mode,language){
 const budget=new Budget(1200*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),engine=new TextRegionEngine(budget,{maxWorkers:2}),canvas=new OffscreenCanvas(1600,96),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1600,96);context.fillStyle='black';context.font='28px sans-serif';context.fillText('TRANSPORT EXACT OUTPUT',20,55);context.fillText('SECOND TILE',1450,55);const rgba=context.getImageData(0,0,1600,96).data,data=new Uint8Array(1600*96*3);for(let i=0,j=0;i<data.length;i+=3,j+=4){data[i]=rgba[j];data[i+1]=rgba[j+1];data[i+2]=rgba[j+2];}
 const proof=faults('text-ocr-worker',mode);let value,error;
 try{const result=await engine.detect({width:1600,height:96,data,format:'rgb8'},{language});try{value={boxes:result.boxes,polygons:result.polygons,metadata:result.metadata};}finally{result.release();}}catch(caught){error=caught;}finally{engine.dispose();globalThis.Worker=NativeWorker;}
 assert(budget.total()===0,'OCR budget leak');assert(scheduler.used.cpu===0&&scheduler.queue.length===0,'OCR execution leak');assert(proof.created===proof.terminated,'OCR worker leak');return {value,error,proof};
}

self.onmessage=async()=>{try{
 const reports=[];
 for(const kind of ['energy','ghost','gray']){
  const baseline=await quality(kind,'none');if(baseline.error)throw baseline.error;
  for(const mode of ['null-command','null-io-reply','parent-messageerror','malformed-result']){
   const actual=await quality(kind,mode);if(actual.error)throw actual.error;assert(actual.proof.injected===1,kind+'/'+mode+' did not inject');assert(actual.values.size===3,'Lost qualities');for(const q of [10,30,50]){const a=baseline.values.get(q),b=actual.values.get(q);assert(typeof a==='number'?a===b:a.length===b.length&&a.every((v,i)=>v===b[i]),kind+'/'+mode+' changed result '+q);assert(actual.proof.commands[q]===(q===30?2:1),kind+'/'+mode+' replayed wrong quality');}reports.push({kind,mode,exactQualities:3,proof:actual.proof,transportRecoveries:actual.metrics.transportRecoveries});
  }
  const repeated=await quality(kind,'always-null');assert(repeated.error?.code==='WORKER_MESSAGE_FAILED'&&repeated.error.details.recovery.consecutiveFailures===5,kind+' unbounded retry');assert(repeated.proof.commands[30]===5,kind+' transport retries were reset by unrelated RAM changes');assert(repeated.proof.commands[10]===1&&repeated.proof.commands[50]===1,kind+' replayed completed companion');reports.push({kind,mode:'always-null',terminalFailures:5,proof:repeated.proof});
 }
 const bytes=new Uint8Array(await(await fetch('/english-ocr')).arrayBuffer()),sha=await crypto.subtle.digest('SHA-256',bytes),language={data:bytes,sha256:Array.from(new Uint8Array(sha),v=>v.toString(16).padStart(2,'0')).join('')};
 const baseline=await ocr('none',language);if(baseline.error)throw baseline.error;
 const resumed=await ocr('null-command',language);if(resumed.error)throw resumed.error;assert(JSON.stringify(resumed.value.boxes)===JSON.stringify(baseline.value.boxes)&&JSON.stringify(resumed.value.polygons)===JSON.stringify(baseline.value.polygons),'OCR changed exact boxes');assert(resumed.proof.injected===1&&resumed.proof.commands[0]===2,'OCR did not retry failed tile');assert(Object.entries(resumed.proof.commands).filter(([x])=>x!=='0').every(([,count])=>count===1),'OCR repeated completed peer tile');reports.push({kind:'ocr',mode:'null-command',exact:true,proof:resumed.proof,metadata:resumed.value.metadata});
 const malformed=await ocr('malformed-result',language);if(malformed.error)throw malformed.error;assert(JSON.stringify(malformed.value.boxes)===JSON.stringify(baseline.value.boxes)&&JSON.stringify(malformed.value.polygons)===JSON.stringify(baseline.value.polygons),'Malformed OCR result changed boxes');assert(malformed.proof.commands[0]===2,'Malformed OCR result was not retried locally');reports.push({kind:'ocr',mode:'malformed-result',exact:true,proof:malformed.proof});
 const repeated=await ocr('always-null',language);assert(repeated.error?.code==='WORKER_MESSAGE_FAILED'&&repeated.error.details.recovery.consecutiveFailures===5,'OCR retry guard');assert(repeated.proof.commands[0]===5,'OCR transport retry reduced or expanded its guard');reports.push({kind:'ocr',mode:'always-null',terminalFailures:5,proof:repeated.proof});
 self.postMessage({result:reports});
 }catch(error){globalThis.Worker=NativeWorker;self.postMessage({error:{message:error.message,stack:error.stack,code:error.code,details:error.details}});}};
