import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOcrAnalyzer} from '../src/ocr-analyzer.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {checkAbort} from '../src/errors.js';

async function fixture({shape='hole',failAt=0,mutateNative,factoryGate}={}){
 const budget=new Budget(8*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width:12,height:10});
 await state.add('acquisition',{x0:2,y0:1,x1:10,y1:9});
 if(shape==='hole')await state.add('exclusion',{x0:5,y0:3,x1:8,y1:7});
 if(['disjoint','thin'].includes(shape)){await state.clear();await state.add('acquisition',shape==='thin'?{x0:2,y0:1,x1:3,y1:9}:{x0:2,y0:1,x1:5,y1:4});await state.add('acquisition',shape==='thin'?{x0:8,y0:1,x1:9,y1:9}:{x0:8,y0:6,x1:10,y1:9});}
 if(shape==='polygon'){await state.clear();await state.add('acquisition',{x0:2,y0:1,x1:10,y1:9,polygon:[[2,1],[10,1],[2,9]]});}
 let ceiling=null;if(shape==='ceiling'){const parent=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width:12,height:10});await parent.add('acquisition',{x0:3,y0:2,x1:9,y1:8});await parent.add('exclusion',{x0:5,y0:4,x1:7,y1:6});ceiling=(await compileOriginalSourceRegions(parent.snapshot())).descriptor;}
 const domain=await compileOriginalSourceRegions(state.snapshot(),{ceiling}),seen=new Set(),reads=[],calls=[],released=[];let active=0,gate=null,entered;
 const enteredTask=new Promise(resolve=>entered=resolve);
 const original={sha256:'a'.repeat(64),surface:{descriptor:{width:12,height:10,format:'rgb8'},async readWindow(rect){
  reads.push({...rect});const free=budget.reserve(rect.width*rect.height*3);active++;
  const data=new Uint8Array(rect.width*rect.height*3);
  for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){const ox=x+rect.x,oy=y+rect.y;assert(domain.containsOriginal(ox,oy),'an excluded original pixel reached OCR');seen.add(`${ox}:${oy}`);data.set([ox,oy,ox+oy],(y*rect.width+x)*3);}
  let done=false;return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data},release(){if(done)return;done=true;active--;free();}};
 }}};
 const image={sha256:original.sha256,width:domain.width,height:domain.height,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:domain.origin,originalSource:original,
  // Deliberately unsafe envelope: the strict path must never use it.
  readWindow:rect=>original.surface.readWindow({...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]})};
 const factory=async()=>{if(factoryGate)await factoryGate;return{async analyze(input,params,{signal}={}){
  calls.push({width:input.width,height:input.height,params});entered();if(gate)await gate;checkAbort(signal);
  if(calls.length===failAt)throw Error('native recognition failed');
  const part=await input.readWindow({x:0,y:0,width:input.width,height:input.height},{signal});try{assert.equal(part.pixels.data.length,input.width*input.height*3);}finally{part.release();}
  const free=budget.reserve(512),index=calls.length;
  const answer={regions:[{id:'word',text:'é'+index,bounds:[0,0,input.width,input.height],polygon:[[0,0],[input.width,0],[input.width,input.height],[0,input.height]],confidence:94,score:.94,lineKey:'line/1',tile:0}],nativeText:'é'+index+'\n',metadata:{engine:'controlled-native',sourceSha256:input.sha256,method:'same-parameters'},metrics:{taskExecutions:1},release(){released.push(index);free();}};mutateNative?.(answer,input);return answer;
 },clearCache(){},dispose(){}};};
 const api=createOcrAnalyzer({budget,profile:{maxWorkers:2},tesseractFactory:factory,ppocrFactory:factory});
 return{api,budget,image,domain,seen,reads,calls,released,enteredTask,setGate(value){gate=value;},get active(){return active;}};
}

test('strict OCR partitions a hole before native recognition and restores every fragment coordinate',async()=>{
 const h=await fixture(),answer=await h.api.analyze(h.image,{language:'fra',psm:6});
 assert.equal(h.calls.length,4);assert.equal(h.seen.size,h.domain.countIncluded);assert.equal(h.active,0);assert.equal(h.released.length,4);
 assert.equal(answer.data.regions.length,4);assert.equal(new Set(answer.data.regions.map(r=>r.id)).size,4);assert.equal(answer.data.lines.length,4);
 for(const region of answer.data.regions){for(let y=region.bounds[1];y<region.bounds[3];y++)for(let x=region.bounds[0];x<region.bounds[2];x++)assert(h.domain.contains(x,y));}
 assert(h.calls.every(c=>c.params.language==='fra'&&c.params.psm===6));
 assert.equal(answer.metadata.sourceRegionRecognition.strictOriginalSamples,true);assert.equal(answer.metadata.sourceRegionRecognition.includedPixels,h.domain.countIncluded);
 answer.release();await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('disjoint and single-pixel-wide acquisitions stay native without admission of their envelope',async()=>{
 for(const shape of ['disjoint','thin']){const h=await fixture({shape}),answer=await h.api.analyze(h.image);
  assert.equal(h.calls.length,2);assert.equal(h.seen.size,h.domain.countIncluded);if(shape==='thin')assert(h.calls.every(c=>c.width===1));
  answer.release();await h.api.dispose();assert.equal(h.budget.total(),0);
 }
});
test('presentation changes reuse the complete strict transcription without native re-execution',async()=>{
 const h=await fixture(),a=await h.api.analyze(h.image),calls=h.calls.length,b=await h.api.analyze(h.image,{threshold:.99,view:'text'});
 assert.equal(h.calls.length,calls);assert.equal(a.data,b.data);assert.equal(b.metrics.inferenceExecuted,false);
 a.release();b.release();await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('a native fragment failure releases prior geometry, source windows and partial native answers',async()=>{
 const h=await fixture({failAt:3});await assert.rejects(h.api.analyze(h.image),/native recognition failed/);assert.equal(h.active,0);assert.equal(h.api.snapshot().cacheEntries,0);
 await h.api.dispose();assert.equal(h.budget.total(),0);assert.equal(h.released.length,2);
});
test('cancellation during native recognition never publishes a partial strict transcription',async()=>{
 const h=await fixture(),abort=new AbortController();let resume;h.setGate(new Promise(resolve=>resume=resolve));
 const task=h.api.analyze(h.image,{},{signal:abort.signal});await h.enteredTask;abort.abort();resume();await assert.rejects(task,{code:'CANCELLED'});
 assert.equal(h.reads.length,0);assert.equal(h.api.snapshot().cacheEntries,0);await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('another original source is rejected before a native OCR model or pixel window is used',async()=>{
 const h=await fixture();h.image.originalSource={...h.image.originalSource,sha256:'b'.repeat(64)};
 await assert.rejects(h.api.analyze(h.image),/original source identity/);assert.equal(h.calls.length,0);assert.equal(h.reads.length,0);await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('polygon boundaries and an inherited Original ceiling are removed before every OCR read',async()=>{
 for(const shape of ['polygon','ceiling']){const h=await fixture({shape}),answer=await h.api.analyze(h.image);assert.equal(h.seen.size,h.domain.countIncluded);assert(h.calls.length>1);assert.equal(answer.metadata.sourceRegionRecognition.includedPixels,h.domain.countIncluded);answer.release();await h.api.dispose();assert.equal(h.budget.total(),0);}
});
test('fragment geometry outside its local input is rejected even if it would fit the total envelope',async()=>{
 for(const polygon of [false,true]){const h=await fixture({mutateNative(answer,input){if(polygon)answer.regions[0].polygon[0]=[input.width+1,0];else answer.regions[0].bounds[2]=input.width+1;}});await assert.rejects(h.api.analyze(h.image),/outside its admitted native fragment/);assert.equal(h.released.length,1);await h.api.dispose();assert.equal(h.budget.total(),0);}
});
test('domain validation still precedes a warm cache hit, including changed origin or source owner',async()=>{
 const h=await fixture(),answer=await h.api.analyze(h.image);answer.release();const calls=h.calls.length;
 for(const sourceRegionOrigin of [[0,0],[],[2],[2,1,undefined]])await assert.rejects(h.api.analyze({...h.image,sourceRegionOrigin}),/grid or origin differs/);
 await assert.rejects(h.api.analyze({...h.image,originalSource:{...h.image.originalSource,sha256:'b'.repeat(64)}}),/original source identity/);
 const corrupted=structuredClone(h.image.sourceRegionDomain);corrupted.snapshot.zones[0].x0++;
 await assert.rejects(h.api.analyze({...h.image,sourceRegionDomain:corrupted}),{code:'SOURCE_REGIONS_INVALID'});assert.equal(h.calls.length,calls);
 const cached=await h.api.analyze(h.image);assert.equal(cached.metrics.inferenceExecuted,false);cached.release();await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('source metadata is captured before asynchronous OCR engine initialization',async()=>{
 let resume;const h=await fixture({factoryGate:new Promise(resolve=>resume=resolve)}),input={...h.image,sourceRegionDomain:structuredClone(h.image.sourceRegionDomain),sourceRegionOrigin:[...h.image.sourceRegionOrigin]},task=h.api.analyze(input);
 await new Promise(resolve=>setTimeout(resolve,0));input.sourceRegionDomain.snapshot.zones=[];input.sourceRegionOrigin[0]=999;input.sha256='b'.repeat(64);resume();const answer=await task;
 assert.equal(answer.metadata.sourceRegionFingerprint,h.domain.fingerprint);assert.equal(h.seen.size,h.domain.countIncluded);answer.release();await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('metadata admission fails before copying the source descriptor or creating a native OCR call',async()=>{
 const h=await fixture();h.budget.setLimit(1024);await assert.rejects(h.api.analyze(h.image),{code:'MEMORY_LIMIT'});assert.equal(h.calls.length,0);assert.equal(h.reads.length,0);await h.api.dispose();assert.equal(h.budget.total(),0);
});
