import "../../runtime-context.js?v=0.30.0";
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {EngineError,serializeEngineError,deserializeEngineError,requireValue} from './errors.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {parseOcrTsv,OCR_PSM} from './ocr-structure.js';
let module,api,memory,admitted,language,activeJob,cancelled=false,closing=false,gpuEnabled=false;

let gpuEpoch=0,gpuSequence=0,gpuPending,gpuDisabled=false;const gpuKnownWeights=new Set(),gpuStats={calls:0,applied:0,fallbacks:0};
function nativeSpan(pointer,count,Type=Float32Array){if(!Number.isSafeInteger(pointer)||pointer<0||pointer%4||!Number.isSafeInteger(count)||count<0||pointer+count*4>memory.buffer.byteLength)throw Error('Native GPU descriptor exceeds current memory');return new Type(memory.buffer,pointer,count);}
async function nativeLstmGpu(pointer){
 if(cancelled)throw new EngineError('CANCELLED','OCR Native layer cancelled');if(!gpuEnabled)return 0;gpuStats.calls++;if(gpuDisabled){gpuStats.fallbacks++;return 0;}
 const a=nativeSpan(pointer,21,Uint32Array),[layer,,input,width,features,output,outWidth,outFeatures,ni,ns,na,ci,gi,gf,go,times,ends,steps,tanh,logistic,clipBits]=a;
 if(ni!==96||ns!==512||na!==608||features!==ni||outFeatures!==ns||width!==outWidth||!Number.isSafeInteger(steps)||steps<1||steps>4096||steps>width||clipBits!==1120403456){gpuStats.fallbacks++;return 0;}
 const indices=nativeSpan(times,steps,Int32Array).slice(),rowEnds=nativeSpan(ends,steps,Int32Array).slice();if(!indices.every(t=>t>=0&&t<width)||!rowEnds.every(t=>t===0||t===1))throw Error('Native GPU traversal differs');
 const packed=new Float32Array(steps*ni),raw=nativeSpan(input,width*ni);for(let t=0;t<steps;t++)packed.set(raw.subarray(indices[t]*ni,(indices[t]+1)*ni),t*ni);
 const key=gpuEpoch+':'+layer,id=++gpuSequence,request={id,key,ni,ns,na,steps,clip:100,input:packed,rowEnds},transfer=[packed.buffer,rowEnds.buffer];
 if(!gpuKnownWeights.has(key)){request.weights=[ci,gi,gf,go].map(p=>nativeSpan(p,ns*(na+1)).slice());request.tables=new Float32Array(8192);request.tables.set(nativeSpan(tanh,4096));request.tables.set(nativeSpan(logistic,4096),4096);transfer.push(...request.weights.map(v=>v.buffer),request.tables.buffer);}
 requireValue(!gpuPending,'Native LSTM request already pending');const response=await new Promise((resolve,reject)=>{gpuPending={id,resolve,reject};protocol.post({requestId:activeJob?.id,lstmRequest:request},transfer);});
 if(cancelled){if(response.data)protocol.post({lstmAck:id});throw new EngineError('CANCELLED','OCR Native layer cancelled');}
 if(response.fallback){gpuDisabled=response.disabled===true;gpuStats.fallbacks++;return 0;}
 try{const data=response.data;requireValue(data instanceof Float32Array&&data.length===steps*ns&&data.every(Number.isFinite),'GPU native LSTM response differs');const destination=nativeSpan(output,width*ns);for(let t=0;t<steps;t++)destination.set(data.subarray(t*ns,(t+1)*ns),indices[t]*ns);gpuKnownWeights.add(key);gpuStats.applied++;return 1;}finally{protocol.post({lstmAck:id});}
}

const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
const protocol=installWorkerMessageProtocol(self,async data=>{
 if(data.kind==='lstm-result'){const pending=gpuPending;requireValue(pending&&pending.id===data.id,'Unexpected native LSTM result');gpuPending=null;if(data.error)pending.reject(deserializeEngineError(data.error));else pending.resolve(data);return;}
 if(data.kind==='admitted'){const pending=admitted;requireValue(pending,'Unexpected OCR admission');admitted=null;if(Object.hasOwn(data,'error'))pending.reject(deserializeEngineError(data.error));else pending.resolve();return;}
 if(data.kind==='cancel'){if(activeJob&&activeJob.id===data.requestId)cancelled=true;return;}
 if(data.kind==='shutdown'){closing=true;cancelled=true;await activeJob?.done;try{if(api){api.End();module.destroy(api);api=null;}module=null;memory=null;gpuKnownWeights.clear();protocol.post({shutdownAck:data.token,retired:true});}catch(error){protocol.post({shutdownAck:data.token,error:serializeEngineError(error)});}return;}
 requireValue(!closing&&!activeJob&&Number.isSafeInteger(data.requestId)&&data.requestId>0,'Concurrent/closed OCR command');cancelled=false;let finish;const job={id:data.requestId,done:new Promise(r=>finish=r)};activeJob=job;try{await execute(data);}finally{activeJob=null;finish();}
},{label:'private-tesseract-native',onFailure(error){gpuPending?.reject(error);gpuPending=null;admitted?.reject(error);admitted=null;}});
async function execute(data){
 try{
  if(data.kind==='init'){
   gpuEnabled=data.gpuEnabled===true;requireValue(Array.isArray(data.languages)&&data.languages.length>0&&data.languages.every(item=>/^(eng|fra)$/.test(item.id)&&item.data instanceof Uint8Array),'Verified OCR languages are required.');
   const nativeProfile={},start=performance.now(),wasm=boundWasmMemory(data.wasm,data.maximumHeapBytes),compiled=await WebAssembly.compile(wasm);nativeProfile.wasmCompileMs=performance.now()-start;const factoryStart=performance.now(),{default:create}=await import(data.moduleUrl);
   module=await create({SherloqLstmGpu:nativeLstmGpu,instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(compiled,imports);memory=Object.values(instance.exports).find(x=>x instanceof WebAssembly.Memory);receive(instance,compiled);return instance.exports;},print(){},printErr(){},TesseractProgress(percent){protocol.post({requestId:activeJob?.id,progress:Math.max(0,Math.min(1,(percent-30)/70))});}});
   nativeProfile.instantiateMs=performance.now()-factoryStart;const fsStart=performance.now();for(const item of data.languages)module.FS.writeFile('/'+item.id+'.traineddata',item.data);
   nativeProfile.languageFsMs=performance.now()-fsStart;language=data.languages.map(item=>item.id).join('+');api=new module.TessBaseAPI();protocol.post({requestId:data.requestId,retired:true,ready:true,version:api.Version(),nativeProfile,heapBytes:memory.buffer.byteLength});return;
  }
  requireValue(api&&data.kind==='tile'&&OCR_PSM.includes(data.psm),'Invalid OCR recognition request.');
  const nativeProfile={},pgmDigest=await crypto.subtle.digest('SHA-256',data.pgm);nativeProfile.pgmSha256=Array.from(new Uint8Array(pgmDigest),v=>v.toString(16).padStart(2,'0')).join('');const initStart=performance.now();if(api.Init(null,language,1)!==0)throw Error('Tesseract language initialization failed.');
  if(cancelled)throw new EngineError('CANCELLED','OCR command cancelled');gpuEpoch++;gpuKnownWeights.clear();gpuDisabled=false;nativeProfile.languageInitMs=performance.now()-initStart;nativeProfile.dotProduct=api.GetStringVariable('dotproduct');const inputStart=performance.now();api.SetVariable('tessedit_pageseg_mode',String(data.psm));module.FS.writeFile('/input',data.pgm);
  let cleaned=false;try{
   if(api.SetImageFile(1,0)!==0)throw Error('Tesseract could not read the original grayscale tile.');
   nativeProfile.inputPgmMs=performance.now()-inputStart;const recognizeStart=performance.now(),gpuBefore={...gpuStats};const recognition=api.Recognize(null);nativeProfile.jspiRecognizePromise=recognition instanceof Promise;if(await recognition!==0)throw Error('Tesseract recognition failed.');
   if(cancelled)throw new EngineError('CANCELLED','OCR command cancelled');nativeProfile.recognizeMs=performance.now()-recognizeStart;nativeProfile.gpuLstm={calls:gpuStats.calls-gpuBefore.calls,applied:gpuStats.applied-gpuBefore.applied,fallbacks:gpuStats.fallbacks-gpuBefore.fallbacks};const exportStart=performance.now(),nativeText=api.GetUTF8Text(),tsv=header+api.GetTSVText();let lines=1;for(let i=0;i<tsv.length;i++)if(tsv.charCodeAt(i)===10)lines++;
   nativeProfile.exportMs=performance.now()-exportStart;const admissionStart=performance.now();
   // The owner admits strings and word objects before parsing/cloning them.
   await new Promise((resolve,reject)=>{admitted={resolve,reject};protocol.post({requestId:data.requestId,admissionBytes:lines*1400+(tsv.length+nativeText.length)*6+8192});});
   nativeProfile.admissionWaitMs=performance.now()-admissionStart;const parseStart=performance.now(),regions=parseOcrTsv(tsv,{origin:data.origin,width:data.width,height:data.height,tile:data.tile});
   nativeProfile.parseMs=performance.now()-parseStart;const cleanupStart=performance.now();module.FS.unlink('/input');api.End();cleaned=true;nativeProfile.cleanupMs=performance.now()-cleanupStart;protocol.post({requestId:data.requestId,retired:true,regions,nativeText,nativeProfile,heapBytes:memory.buffer.byteLength});
  }finally{if(!cleaned){module.FS.unlink('/input');api.End();}}
 }catch(error){if(!protocol.failed)protocol.post({requestId:data.requestId,retired:false,error:serializeEngineError(error,error instanceof WebAssembly.CompileError?'WASM_UNAVAILABLE':'OCR_FAILED')});}

}
