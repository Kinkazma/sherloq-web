import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareCloneAnalysisWindows} from '../src/clone-analysis-windows.js';
import {createNeuralCloneWindowRun} from '../src/clone-neural-window-runner.js';
import {createSiftNativeWindowCallback} from '../src/sift-native-windows.js';
const algorithm='SIFT + LightGlue',box=([a,b,c,d])=>[[a,b],[c,b],[c,d],[a,d]],sha='a'.repeat(64);
async function setup({hole=false,engineFactory}={}){
 const budget=new Budget(128*1024**2),width=80,height=40,reads=[],stats={engines:0,extracts:0,analyzes:0,disposed:0,outputs:0,calls:[]},profile={id:'maximum',maxWorkers:10,memoryBudgetBytes:128*1024**2};
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});if(hole)await state.add('exclusion',{bounds:[10,10,14,14]});const domain=await compileOriginalSourceRegions(state.snapshot());
 const surface={descriptor:{format:'rgb8',width,height},sha256:sha,async readWindow(r){for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)assert(domain.containsOriginal(x,y),'Original ceiling was read');reads.push({...r});const release=budget.reserve(r.width*r.height*3);return{pixels:{format:'rgb8',width:r.width,height:r.height,data:new Uint8Array(r.width*r.height*3)},release};}};
 const makeBank=async(image,options)=>{stats.extracts++;const raw=await image.readRows(0,1,{signal:options.signal});await raw.release();return{points:new Float64Array([1,1,1,1,1,1,0]),descriptors:new Float32Array(128),members:new Uint8Array(Math.max(1,options.regions.length)).fill(1),descriptorSize:128,zoneCount:Math.max(1,options.regions.length),totalFeatures:1,metadata:{provider:options.backend},release(){}};};
 const ordinaryFactory=(image,b,p)=>{assert.strictEqual(b,budget);assert.strictEqual(p,profile);stats.engines++;const engine={features:{extract:makeBank,dispose(){}},ocr:{detect(){throw Error('Heavy OCR forbidden');},dispose(){}},image,async analyze(input,hooks){stats.analyzes++;stats.calls.push({input:structuredClone(input),backend:hooks.backend,identity:hooks.sourceContextFingerprint});let value;if(!this.cached){value=await this.features.extract(this.image,{family:'SIFT-LightGlue',limit:input.limit??6000,regions:input.regions,excluded:input.excluded,backend:hooks.backend,signal:hooks.signal});this.cached=Float64Array.from(value.points);await value.release();}stats.outputs++;return{status:'ok',params:input,points:Float64Array.from(this.cached),pairs:new Float64Array(0),groups:[],models:[],colors:new Uint8Array(0),bases:[],pair_search_regions:new Int32Array(0),metadata:{stageCache:{features:stats.analyzes>1}},backend:hooks.backend,release(){stats.outputs--;}};},async dispose(){await this.features.dispose();stats.disposed++;}};return engine;};
 const callback=createSiftNativeWindowCallback({original:{sha256:sha,surface},budget,profile,engineFactory:engineFactory?engineFactory({surface,budget,stats,ordinaryFactory}):ordinaryFactory,nativeFactory:()=>({extract:makeBank,dispose(){}})});
 const task=(windows=[{id:'a',bounds:[0,0,40,40]}],extra={})=>({operation:'tampering.copyMove.sparse',cloneWindowMode:'independent',backend:'webgpu',regions:windows,params:{algorithm,limit:6000,regions:[box([0,0,40,40]),box([40,0,80,40])],excluded:[],guides:[box([2,2,4,4])],compare:true,threshold:.7,model:'Affine'},...extra});
 async function run(input){const carrier=createNeuralCloneWindowRun({domain,task:input},{budget,runWindow:callback,runGlobal:callback.runGlobal,admitIndependent:()=>true,admitGlobal:()=>true,prepareWindows:async(...args)=>{const plan=await prepareCloneAnalysisWindows(...args);await callback.retainWindows(plan);return plan;}});return{carrier,answer:await carrier.execute()};}
 return{budget,domain,surface,stats,reads,callback,task,run};
}
test('native callbacks keep compare/ROI/options, overlaps and envelope as separate analyses',async()=>{
 const f=await setup(),windows=[{id:'a',bounds:[0,0,40,40]},{id:'b',bounds:[32,0,72,40]},{id:'e',kind:'envelope',bounds:[0,0,80,40]}];let r;
 try{r=await f.run(f.task(windows));assert.equal(r.answer.mode,'independent');assert.equal(r.answer.windowResults.length,3);assert.equal(f.stats.engines,3);for(const [index,call]of f.stats.calls.entries()){assert.equal(call.backend,'webgpu');assert.equal(call.input.compare,true);assert.equal(call.input.limit,6000);assert.equal(call.input.threshold,.7);assert.equal(call.input.model,'Affine');assert.deepEqual(call.input.regions[1],box([40-windows[index].bounds[0],0,80-windows[index].bounds[0],40]));assert.equal(r.answer.windowResults[index].output.cloneWindowMode,'independent');}assert.equal(new Set(f.stats.calls.map(x=>x.identity)).size,3);}
 finally{await r?.carrier.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
test('same native engine survives carrier retirement, fresh raw output comes from its warm cache',async()=>{
 const f=await setup();let a,b;
 try{a=await f.run(f.task());const points=a.answer.windowResults[0].output.points;await a.carrier.dispose();b=await f.run(f.task());assert.equal(f.stats.engines,1);assert.equal(f.stats.analyzes,2);assert.equal(f.stats.extracts,1);assert.notStrictEqual(points,b.answer.windowResults[0].output.points);assert.deepEqual(points,b.answer.windowResults[0].output.points);assert(f.reads.length>0);}
 finally{await b?.carrier.dispose();await a?.carrier.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
test('pruning is bounded; global retains one matcher owner and each declared feature owner',async()=>{
 const f=await setup();let current;
 try{for(const id of ['a','b','a']){current=await f.run(f.task([{id,bounds:id==='a'?[0,0,40,40]:[40,0,80,40]}]));assert.equal(f.callback.state().entries,1);await current.carrier.dispose();}assert.equal(f.stats.engines,3);current=await f.run(f.task(undefined,{cloneWindowMode:'global'}));assert.equal(current.answer.mode,'global');assert.equal(current.answer.globalResult.cloneWindowMode,'global');assert.equal(f.callback.state().entries,2);assert.equal(f.stats.engines,5);}
 finally{await current?.carrier.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
test('a live carrier prevents source retirement; clear retries after the loan ACK',async()=>{
 const f=await setup();let r;
 try{r=await f.run(f.task());await assert.rejects(f.callback.dispose(),/carrier still owns/);assert.equal(f.callback.state().entries,1);assert(f.budget.total()>0);await r.carrier.dispose();await f.callback.dispose();assert.equal(f.callback.state().entries,0);}
 finally{await r?.carrier.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
test('native disposal refusal keeps its source readable and the falsy failure retryable',async()=>{
 let attempts=0;const f=await setup({engineFactory:({surface,ordinaryFactory})=>(...args)=>{const e=ordinaryFactory(...args),dispose=e.dispose.bind(e);e.dispose=async()=>{const lease=await surface.readWindow({x:0,y:0,width:1,height:1});await lease.release();if(attempts++===0)throw 0;await dispose();};return e;}});let r;
 try{r=await f.run(f.task());await r.carrier.dispose();let failure=Symbol();try{await f.callback.dispose();}catch(error){failure=error;}assert.strictEqual(failure,0);assert.equal(f.callback.state().entries,1);assert(f.budget.total()>0);await f.callback.dispose();assert.equal(attempts,2);}
 finally{await r?.carrier.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
test('a primary false from the actual native callback is retained',async()=>{
 const f=await setup({engineFactory:({ordinaryFactory})=>(...args)=>{const e=ordinaryFactory(...args);e.analyze=async()=>{throw false;};return e;}});let carrier;
 try{carrier=createNeuralCloneWindowRun({domain:f.domain,task:f.task()},{budget:f.budget,runWindow:f.callback,admitIndependent:()=>true});let failure=Symbol();try{await carrier.execute();}catch(error){failure=error;}assert.strictEqual(failure,false);assert.equal(f.callback.state().loans,0);}
 finally{await carrier?.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
test('the real Panels upstream refuses unreviewed heavy OCR before any native call',async()=>{
 const f=await setup();let carrier;
 try{const input=f.task(undefined,{params:{algorithm:'SIFT + G2NN + RANSAC + Panels + Text',regions:[box([0,0,40,40]),box([40,0,80,40])],excluded:[],compare:true}});carrier=createNeuralCloneWindowRun({domain:f.domain,task:input},{budget:f.budget,runWindow:f.callback,admitIndependent:()=>true});await assert.rejects(carrier.execute(),error=>error.code==='REVIEW_REQUIRED'||/explicit verified English/.test(error.message));assert.equal(f.stats.analyzes,0);}
 finally{await carrier?.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
test('Panels consumes ready PP/graph scientific preparation without a second OCR or a substitute',async()=>{
 const f=await setup();let r;
 try{const scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',width:80,height:40,sourceSha256:sha,fingerprint:'ready-PP-graph',status:'ready',regions:[{id:'a',x0:0,y0:0,x1:40,y1:40},{id:'b',x0:40,y0:0,x1:80,y1:40},{id:'e',role:'envelope',x0:0,y0:0,x1:80,y1:40}],excluded:[box([8,8,12,12])],models:{text:{id:'native-PP',backend:'webgpu'}},text:{status:'complete',polygons:[box([8,8,12,12])],metadata:{model:{id:'native-PP'},backend:'webgpu'}}};scope.searchRegions=scope.regions;
  const input=f.task(undefined,{scientificScope:scope,params:{algorithm:'SIFT + G2NN + RANSAC + Panels + Text',regions:[box([0,0,40,40]),box([40,0,80,40])],excluded:[],compare:true}});r=await f.run(input);assert.equal(f.stats.analyzes,1);assert.equal(f.stats.calls[0].input.compare,true);assert.equal(f.stats.calls[0].input.regions.length,2);assert.equal(r.answer.windowResults[0].output.metadata.analysisWindow.scientificScopeFingerprint,'ready-PP-graph');
 }finally{await r?.carrier.dispose();await f.callback.dispose();assert.equal(f.budget.total(),0);}
});
