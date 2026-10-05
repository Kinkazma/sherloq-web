import "../../runtime-context.js?v=0.14.5";
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError} from './errors.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {parseTextBoxes} from './text-regions.js';
let module,api,memory,admitted;
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
const protocol=installWorkerMessageProtocol(self,async data=>{
  if(data.kind==='admitted'){admitted?.resolve();admitted=null;return;}
  try{
    if(data.kind==='init'){
      const wasm=boundWasmMemory(data.wasm,data.maximumHeapBytes),compiled=await WebAssembly.compile(wasm);
      const {default:create}=await import(data.moduleUrl);
      module=await create({instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(compiled,imports);memory=Object.values(instance.exports).find(x=>x instanceof WebAssembly.Memory);receive(instance,compiled);return instance.exports;},
        print(){},printErr(){},TesseractProgress(percent){protocol.post({progress:Math.max(0,Math.min(1,(percent-30)/70))});}});
      module.FS.writeFile('/eng.traineddata',data.language);
      api=new module.TessBaseAPI();protocol.post({ready:true,version:api.Version(),heapBytes:memory.buffer.byteLength});return;
    }
    if(api.Init(null,'eng',1)!==0)throw Error('Tesseract language initialization failed.');
    api.SetVariable('tessedit_pageseg_mode','11');
    module.FS.writeFile('/input',data.pgm);
    try{
      if(api.SetImageFile(1,0)!==0)throw Error('Tesseract could not read grayscale tile.');
      if(api.Recognize(null)!==0)throw Error('Tesseract recognition failed.');
      const tsv=header+api.GetTSVText();let lines=1;for(let i=0;i<tsv.length;i++)if(tsv.charCodeAt(i)===10)lines++;
      // Reserve the actual response before parsing or cloning its objects. The
      // parent owns this reservation until filtering and retained-result admission.
      await new Promise((resolve,reject)=>{admitted={resolve,reject};protocol.post({admissionBytes:lines*640+tsv.length*4+4096});});
      const boxes=parseTextBoxes(tsv,data.origin,data.width,data.height);
      protocol.post({boxes,heapBytes:memory.buffer.byteLength});
    }finally{module.FS.unlink('/input');api.End();}
  }catch(error){if(!protocol.failed)protocol.post({error:serializeEngineError(error,error instanceof WebAssembly.CompileError?'WASM_UNAVAILABLE':'OCR_FAILED')});}
},{label:'text-ocr-worker',onFailure(error){admitted?.reject(error);admitted=null;self.postMessage({error:serializeEngineError(error,'OCR_FAILED')});}});
