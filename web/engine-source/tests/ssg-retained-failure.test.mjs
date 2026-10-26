import test from 'node:test';
import assert from 'node:assert/strict';
import {retireFailedRetainedAnswer} from '../src/retained-answer-release.js';
import {createResultSurfaces} from '../src/segmented-results.js';
import {createSourceRegionRuntime} from '../src/source-region-runtime.js';
import {Budget} from '../src/cache.js';
import {createEngine} from '../src/index.js';
import {SparseCopyEngine} from '../src/sparse-copy.js';
const desc=id=>({id,revision:1,width:2,height:2,format:'rgb8'});
function bundle(){
 const surfaces=new Map(),registry=createResultSurfaces(surfaces),calls=new Map(),owners=new Map();
 const row=(id,fail=false,table=false)=>{const surface={descriptor:table?{id,revision:1,rowCount:2,columns:[]}:desc(id),async dispose(){const n=(calls.get(id)??0)+1;calls.set(id,n);if(fail&&n===1)throw Object.freeze(new Error('ACK rejected'));}};owners.set(id,surface);return{surface};};
 const result=registry.publishBundle('source',{...row('main',true),rgbRecords:{other:row('rgb')},planeRecords:{scalar:row('scalar')},tableRecords:{summary:row('table',false,true)}});
 const source=desc('original');surfaces.set(source.id,{imageId:'source',record:{surface:{descriptor:source}}});
 return{surfaces,registry,calls,owners,answer:{...result,sourceRegionSourceSurface:source,layers:[{surfaceId:'main'}]}};
}
test('frozen primary and rejected ACK preserve the exact registry owner, retire every other output and permit retry',async()=>{
 const {surfaces,registry,calls,owners,answer}=bundle(),primary=Object.freeze(Object.assign(new Error('primary frozen'),{code:'CANCELLED'}));
 await assert.rejects(retireFailedRetainedAnswer(answer,{release:id=>registry.release(id),protectedIds:['original'],primary}),e=>e===primary);
 assert.deepEqual([...calls.entries()],[['main',1],['rgb',1],['scalar',1],['table',1]]);
 assert.deepEqual([...surfaces.keys()],['main','original']);assert.equal(surfaces.get('main').record.surface,owners.get('main'));
 await registry.release('main');assert.equal(calls.get('main'),2);assert.deepEqual([...surfaces.keys()],['original']);
});
test('primitive primaries survive retirement rejection without replacement',async()=>{
 for(const primary of[undefined,null,7,'frozen primitive']){let caught,called=false;try{await retireFailedRetainedAnswer({surface:desc('a')},{release(){called=true;throw new Error('ACK');},primary});}catch(error){caught=error;}assert(called);assert.equal(caught,primary);}
});
test('a late aborted response retires surfaces, tables and independent presentation together',async()=>{
 const {surfaces,registry,answer}=bundle();await registry.release('main').catch(()=>{});const primary=Object.freeze(new Error('late aborted response'));
 const presentation={descriptor:desc('presentation'),dispose(){}};registry.publish('source',{surface:presentation});answer.sourceRegionSourceSurface=presentation.descriptor;
 await assert.rejects(retireFailedRetainedAnswer(answer,{release:id=>registry.release(id),protectedIds:['original'],primary}),e=>e===primary);
 assert.deepEqual([...surfaces.keys()],['original']);
});
test('cyclic answer metadata and duplicate layers never duplicate a retirement',async()=>{
 const answer={surface:desc('a'),layers:[{surfaceId:'a'}],pixels:{data:new Uint8Array(100)}};answer.self=answer;let calls=0;const primary=new Error('failure');
 await assert.rejects(retireFailedRetainedAnswer(answer,{release(){calls++;},primary}),e=>e===primary);assert.equal(calls,1);
});
test('scoped retained presentation preserves a frozen primary when its registry ACK rejects, leaving the real owner retryable',async()=>{
 const surfaces=new Map(),registry=createResultSurfaces(surfaces),primary=Object.freeze(new Error('source result failed')),budget=new Budget(2**20);let published,fail=true;
 const resultSurfaces={publish(id,record){published=record.surface;return registry.publish(id,record);},release(id){if(fail){fail=false;return Promise.reject(new Error('presentation ACK'));}return registry.release(id);}};
 const runtime=createSourceRegionRuntime({budget,images:new Map(),surfaces,resultSurfaces});
 const store={byteLength:12,storage:'controlled-reader',dispose(){},readInto(){}};
 const domain={descriptor:{},origin:[0,0],width:2,height:2,sourceWidth:2,sourceHeight:2,countIncluded:4};
 const context={original:{get sha256(){throw primary;}},entry:{id:'derived',record:{store}},domain,task:{}};
 await assert.rejects(runtime.decorateRetained({}, {imageId:'source'},context),e=>e===primary);
 assert(published);assert.equal(surfaces.get(published.descriptor.id).record.surface,published);
 await registry.release(published.descriptor.id);assert.equal(surfaces.size,0);assert.equal(budget.snapshot().retainedBytes,0);
});
// The signal is aborted after the M3 owner publishes its response but before
// EngineAPI receives it. Detector/forest outputs are controlled, not weights.
test('real EngineAPI cleans an owned M3 response obtained immediately before the abort barrier',async()=>{
 const oldAnalyze=SparseCopyEngine.prototype.analyze,oldRetained=SparseCopyEngine.prototype.localizeRetained,controller=new AbortController();let armed=false;
 const make=(image,p)=>{const d=image.surface?.descriptor??image.pixels??image;return{width:d.width,height:d.height,points:new Float64Array(),pairs:new Float64Array(),groups:[],models:[],bases:[],colors:new Uint8Array(),mask:new Uint8Array(d.width*d.height),params:p,backend:'cpu',metadata:{algorithm:'SSG'},release(){}};};
 SparseCopyEngine.prototype.analyze=async function(p){this.controlledCheckpoint=true;return make(this.image,p);};
 SparseCopyEngine.prototype.localizeRetained=async function(p){let source=this.image;Object.defineProperty(this,'image',{configurable:true,get(){return source;},set(value){source=value;if(value===null&&armed)controller.abort();}});return make(source,p);};
 const engine=createEngine({memoryBudgetBytes:1024**3,computeProfile:'maximum'});let seed;
 try{await engine.loadBlob({id:'source',blob:new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAD0lEQVR4nGNIwQEYqCcBAFPNJYGvyYDZAAAAAElFTkSuQmCC'),c=>c.charCodeAt(0))]),layout:'segmented'});const task={id:'native',imageId:'source',operation:'tampering.copyMove.sparse',params:{algorithm:'SSG'},backend:'cpu'};await engine.loadM3Models({models:{}});seed=await engine.run(task);const before=engine.capabilities().memory.retainedBytes;armed=true;
 await assert.rejects(engine.localizeRetainedParameters(task,{signal:controller.signal}),{code:'CANCELLED'});armed=false;
 assert.equal(engine.capabilities().memory.retainedBytes,before);assert(seed.surface.id);
 }finally{armed=false;await engine.dispose();SparseCopyEngine.prototype.analyze=oldAnalyze;SparseCopyEngine.prototype.localizeRetained=oldRetained;}
 assert.equal(engine.capabilities().memory.retainedBytes,0);
});
