import "../../runtime-context.js?v=0.24.0";
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError,requireValue} from './errors.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {parseOcrTsv,OCR_PSM} from './ocr-structure.js';
let module,api,memory,admitted,language;
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
const protocol=installWorkerMessageProtocol(self,async data=>{
 if(data.kind==='admitted'){admitted?.resolve();admitted=null;return;}
 try{
  if(data.kind==='init'){
   requireValue(Array.isArray(data.languages)&&data.languages.length>0&&data.languages.every(item=>/^(eng|fra)$/.test(item.id)&&item.data instanceof Uint8Array),'Verified OCR languages are required.');
   const wasm=boundWasmMemory(data.wasm,data.maximumHeapBytes),compiled=await WebAssembly.compile(wasm),{default:create}=await import(data.moduleUrl);
   module=await create({instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(compiled,imports);memory=Object.values(instance.exports).find(x=>x instanceof WebAssembly.Memory);receive(instance,compiled);return instance.exports;},print(){},printErr(){},TesseractProgress(percent){protocol.post({progress:Math.max(0,Math.min(1,(percent-30)/70))});}});
   for(const item of data.languages)module.FS.writeFile('/'+item.id+'.traineddata',item.data);
   language=data.languages.map(item=>item.id).join('+');api=new module.TessBaseAPI();protocol.post({ready:true,version:api.Version(),heapBytes:memory.buffer.byteLength});return;
  }
  requireValue(api&&data.kind==='tile'&&OCR_PSM.includes(data.psm),'Invalid OCR recognition request.');
  if(api.Init(null,language,1)!==0)throw Error('Tesseract language initialization failed.');
  api.SetVariable('tessedit_pageseg_mode',String(data.psm));module.FS.writeFile('/input',data.pgm);
  try{
   if(api.SetImageFile(1,0)!==0)throw Error('Tesseract could not read the original grayscale tile.');
   if(api.Recognize(null)!==0)throw Error('Tesseract recognition failed.');
   const nativeText=api.GetUTF8Text(),tsv=header+api.GetTSVText();let lines=1;for(let i=0;i<tsv.length;i++)if(tsv.charCodeAt(i)===10)lines++;
   // The owner admits strings and word objects before parsing/cloning them.
   await new Promise((resolve,reject)=>{admitted={resolve,reject};protocol.post({admissionBytes:lines*1400+(tsv.length+nativeText.length)*6+8192});});
   const regions=parseOcrTsv(tsv,{origin:data.origin,width:data.width,height:data.height,tile:data.tile});
   protocol.post({regions,nativeText,heapBytes:memory.buffer.byteLength});
  }finally{module.FS.unlink('/input');api.End();}
 }catch(error){if(!protocol.failed)protocol.post({error:serializeEngineError(error,error instanceof WebAssembly.CompileError?'WASM_UNAVAILABLE':'OCR_FAILED')});}
},{label:'tesseract-transcription-worker',onFailure(error){admitted?.reject(error);admitted=null;self.postMessage({error:serializeEngineError(error,'OCR_FAILED')});}});
