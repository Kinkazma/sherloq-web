import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {ocrParameters} from '../src/ocr-structure.js';
let oversized=false,created=0,cleared=0,disposed=0,responsesReleased=0,recognitions=0;
mock.module(import.meta.resolve('../src/ocr-analyzer.js'),{namedExports:{
 validateOcrParams:ocrParameters,
 ocrPayloadBytes:()=>oversized?1024**3:1024,
 createOcrAnalyzer:({budget})=>{created++;let cache;return{
  snapshot:()=>({cacheEntries:cache?1:0}),
  async analyze(image,p){recognitions++;cache??=budget.reserve(4096);return{data:{text:'Été',regions:[{id:'native',text:'Été',bounds:[0,0,2,2],score:.9,confidence:90}],lines:[],width:image.width,height:image.height},metadata:{engine:'mock-native',sourceSha256:image.sha256},metrics:{},release(){responsesReleased++;}};},
  clearCache(){cleared++;cache?.();cache=null;},
  dispose(){disposed++;cache?.();cache=null;}
 };}
}});
const {createEngine}=await import('../src/index.js');
const input={id:'source',bytes:Uint8Array.of(1,2,3),pixels:{width:2,height:2,format:'rgb8',data:new Uint8Array(12)}};
const task={id:'ocr',imageId:'source',operation:'various.ocr',params:{algorithm:'tesseract'},backend:'cpu'};

test('OCR engine integration admits copied response, releases the borrowed answer and clears native cache on source unload',async()=>{
 const api=createEngine({memoryBudgetBytes:64*1024**2});try{
  const loaded=await api.load(input);await api.loadOcrModels({languages:{eng:{id:'fixture'}}});await api.loadOcrModels({languages:{eng:{id:'fixture'}}});assert.equal(created,1);
  const result=await api.run(task);assert.equal(result.data.text,'Été');assert.equal(result.provenance.originalSha256,loaded.sha256);assert.equal(responsesReleased,1);assert.equal(recognitions,1);
  await api.unload('source');assert.equal(cleared,1);const memory=api.capabilities().memory;assert.equal(memory.retainedBytes,0);assert.equal(memory.activeReservationBytes,0);assert.equal(memory.cacheBytes,0);
  await api.unloadOcrModels();assert.equal(disposed,1);
 }finally{await api.dispose();}
});
test('OCR reply-copy admission refusal still releases the native answer and unlocks the engine',async()=>{
 const api=createEngine({memoryBudgetBytes:64*1024**2});try{
  await api.load({...input,id:'source'});await api.loadOcrModels({languages:{eng:{id:'fixture'}}});oversized=true;const before=responsesReleased;
  await assert.rejects(api.run(task),{code:'MEMORY_LIMIT'});assert.equal(responsesReleased,before+1);assert.equal(api.capabilities().ocr.cacheEntries,1);
  oversized=false;assert.equal((await api.run(task)).data.text,'Été');await api.unload('source');assert.equal(api.capabilities().memory.activeReservationBytes,0);
 }finally{oversized=false;await api.dispose();}
});
