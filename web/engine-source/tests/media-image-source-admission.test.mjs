import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {loadExtendedImage} from '../src/media-image-source.js';
import {Budget} from '../src/cache.js';
import {EngineError,serializeEngineError} from '../src/errors.js';
const MiB=1024**2;
// Exercise the actual parent and codec-client handshake without allocating the
// deliberately large encoded buffer or Wasm heap used by this admission test.
async function admission(header,{size=800_000_000,limit=4*1024**3,repeat=false}={}){
 const previous=globalThis.Worker,budget=new Budget(limit),replies=[];
 const priorCrypto=globalThis.crypto;if(!priorCrypto)globalThis.crypto=webcrypto;
 class VirtualBlob extends Blob { get size(){return size;} }
 class HeaderWorker {
  postMessage(value){queueMicrotask(()=>{if(value.action){this.onmessage({data:{request:'decode-header',sequence:1,value:structuredClone(header)}});return;}
   replies.push({value:value.value,error:value.error,accounted:budget.total()});
   if(repeat&&replies.length===1&&!value.error)this.onmessage({data:{request:'decode-header',sequence:2,value:structuredClone(header)}});
   else this.onmessage({data:{error:value.error??serializeEngineError(new EngineError('TEST_COMPLETE','Admission observed.'))}});
  });}
  terminate(){}
 }
 globalThis.Worker=HeaderWorker;let error;
 try{await loadExtendedImage(new VirtualBlob(),{name:'admission.tif',budget});}catch(cause){error=cause;}
 finally{globalThis.Worker=previous;if(!priorCrypto)delete globalThis.crypto;}
 assert.equal(budget.total(),0,'All input, bank and workspace leases must retire on failure.');
 return{error,replies,peak:budget.peak};
}
const native={format:'tiff',width:1,height:1,nativeDepth:16,sourceDepth:16,codecMemoryBytes:2_500_000_000};
test('native PNG/TIFF16 returns unused encoded copies before admitting its codec',async()=>{
 const before=await admission(native);assert.equal(before.error.code,'MEMORY_LIMIT');
 for(const format of ['png','tiff']){
  const after=await admission({...native,format,encodedInputCopies:1});assert.equal(after.error.code,'TEST_COMPLETE');
  assert.equal(after.replies[0].value.nativeBytes,native.codecMemoryBytes);
  assert.ok(after.replies[0].accounted<3_500_000_000);assert.ok(after.peak<=4*1024**3);
 }
});
test('unqualified and legacy routes cannot claim native raster encoded credit',async()=>{
 for(const header of [{...native,format:'avif',encodedInputCopies:1},{...native,nativeDepth:8,encodedInputCopies:1},{...native,encodedInputCopies:0},{...native,encodedInputCopies:2}]){
  const r=await admission(header);assert.equal(r.error.code,'INVALID_INPUT');assert.equal(r.replies[0].value,undefined);
 }
 const legacy=await admission({...native,nativeDepth:8});assert.equal(legacy.error.code,'MEMORY_LIMIT');
});
test('a repeated header cannot return the same encoded credit twice',async()=>{
 const r=await admission({...native,encodedInputCopies:1},{repeat:true});assert.equal(r.replies.length,2);assert.equal(r.error.code,'INVALID_INPUT');
});
