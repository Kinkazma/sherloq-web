import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareCloneAnalysisWindows} from '../src/clone-analysis-windows.js';
import {createSegmentationWindowSource} from '../src/segmentation-window-source.js';
import {families,controlledNative,zone,polygon,digest,W} from './tnt-vig-global-fixtures.mjs';

const input=JSON.parse(await readFile(W+'/reviews/mgcfdn-tnt-vig-global-routing01/REUSED-NATIVE-INPUT-PINS01.json'));
for(const family of families)test(family.name+': exact prior F2 probabilities retain full raw/publication/coordinates across modes; zero new RGB/model execution, no positive requalification',async()=>{
 const source=input.families.find(v=>v.name===family.name);for(const p of source.pins){const b=await readFile(p.path);assert.equal(b.length,p.bytes);assert.equal(await digest(b),p.sha256);}
 const old=JSON.parse(await readFile(source.reportPath)),seal=JSON.parse(await readFile(source.sealPath)),png=await readFile(seal.fixture.path),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 assert.equal(old.mode,'native');assert.equal(source.nativeSourceStatus,family.name==='vig'?'FAILED_POSITIVE_CRITERION':'PASSED');
 if(family.name==='vig')assert.equal(old.passed,false,'Parity cannot erase the original positive failure');
 const frame=old.prepared.windowBounds,negative=old.prepared.negative,priorBounds=old.prepared.literalContexts,contexts=[];
 for(let index=0;index<2;index++){
  const e=old.witness.find(v=>v.caseIndex===1&&v.context===index&&v.field==='raw-model-probability');assert.ok(e);assert.deepEqual(e.bounds,priorBounds[index]);
  const raw=await readFile(dirname(source.reportPath)+'/'+e.file);assert.equal(raw.length,262144);assert.equal(await digest(raw),e.sha256);const view=new DataView(raw.buffer,raw.byteOffset,raw.length),probability=Float32Array.from({length:65536},(_,i)=>view.getFloat32(i*4,true));
  assert.ok(probability.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  contexts.push({context:{id:family.name+'-context-'+index,index,bounds:e.bounds},probability,rawSha256:e.sha256,logits:new Float32Array(65536)});
 }
 // No logit witness exists. This unused input is explicitly controlled; only
 // the real stored probabilities/projected map/raw cache are qualified here.
 const budget=new Budget(12*1024**3),state=await createOriginalSourceRegionsState({sourceSha256:seal.fixture.sha256,width,height});
 await state.replaceZones([zone('selected-entire-prior-window',frame),zone('redundant-overlap',[32,48,144,96]),zone('actual-negative',negative,'exclusion')],{enabled:true,positiveMode:'selected'});
 const domain=await compileOriginalSourceRegions(state.snapshot()),task={id:'prior-fields:arbitrary',imageId:'Original',operation:'ai.clones.segmentation',cloneWindowMode:'global',backend:'webgpu',params:{variant:family.variant}},plan=await prepareCloneAnalysisWindows({domain,task},{budget}),u=plan.global,r=u.contextDomain.rect,window={...u,id:'global-analysis',kind:'region',bounds:[r.x0,r.y0,r.x1,r.y1],polygon:polygon(frame),status:'ready'};
 assert.deepEqual(window.bounds,frame);assert.equal(u.contextDomain.countIncluded,73728);assert.equal(u.candidateDomain.countIncluded,73728);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)assert.equal(u.contextDomain.containsOriginal(x,y),priorBounds.some(b=>x>=b[0]&&x<b[2]&&y>=b[1]&&y<b[3]),'Exact same Original RGB domain');
 let calls=0;const original={segmented:true,sha256:seal.fixture.sha256,surface:{descriptor:{id:'Original',width,height,format:'rgb8'},readWindow(){throw Error('Durable probability reuse must not reacquire RGB');}}};
 const h={family,budget,task},c=controlledNative(h),product=family.product({...c.productOptions,runFactory:({window,cloneWindowMode},{onOwner})=>{
  calls++;const owner={async release(){}};onOwner(owner);return {...owner,async run(){return{contexts,cloneWindowMode,analysisWindow:{id:window.id,kind:window.kind,bounds:window.bounds,fingerprint:window.fingerprint},provenance:{cloneWindowMode,backend:family.gpu,nativeWindowIdentity:'retained-prior-F2-not-new-inference'},receipt:{newLearnedCalls:0,priorNativeProbabilitySource:source.reportPath,priorNativeSourceStatus:source.nativeSourceStatus,logitsControlled:true,positiveRequalification:false},observations:{rgbObservedPixels:0,rgbForbiddenPixels:0},execution:{requestedMaximumCores:10,headProviders:['wasm']}};}};
 }}),windowSource=createSegmentationWindowSource({original,window},{budget});
 const maps=[];
 try{
  for(const mode of ['independent','global']){
   const result=await product.run({task:{...task,cloneWindowMode:mode},original,window,backend:'webgpu',config:c.config,plan:await windowSource.ready});result.transferOutputs();assert.equal(result.cloneWindowMode,mode);assert.equal(result.provenance.cloneWindowMode,mode);assert.equal(result.provenance.windowContextBank.receipt.positiveRequalification,false);
   const raw=product.readRaw({imageId:task.imageId,resultId:result.data.metadata.resultId});assert.equal(raw.cloneWindowMode,mode);assert.equal(raw.metrics.inferences,0);
   for(let j=0;j<2;j++){assert.deepEqual(raw.data.rawGrids[j].bounds,priorBounds[j]);assert.equal(await digest(new Uint8Array(raw.data.rawGrids[j].raw.buffer)),contexts[j].rawSha256);}
   const read=await c.outputs.get(result.surface.id).surface.readWindow({x:0,y:0,width:frame[2]-frame[0],height:frame[3]-frame[1]});maps.push(await digest(new Uint8Array(read.pixels.data.buffer,read.pixels.data.byteOffset,read.pixels.data.byteLength)));await read.release();
  }
  assert.equal(calls,2,'Two controlled adapters, zero learned forwards');assert.equal(c.backbones,0);assert.equal(c.resourcesMade,1);assert.equal(maps[0],maps[1]);
 }finally{await product.dispose();await c.releaseAll();await windowSource.dispose();await plan.release();assert.equal(budget.total(),0);}
});
