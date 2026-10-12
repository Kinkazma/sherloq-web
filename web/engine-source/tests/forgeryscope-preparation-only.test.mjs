import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ForgeryscopeNetworks} from '../src/forgeryscope-networks.js';
import {ForgeryscopePreparation} from '../src/forgeryscope-preparation.js';
import {NeuralGraphPool} from '../src/neural-graph-pool.js';
import {createForgeryscopeAnalyzer} from '../src/forgeryscope-analyzer.js';

const hash='a'.repeat(64),modelHash='b'.repeat(64);
const assets={yolo_panel_extractor:{sha256:modelHash,bytes:123,classes:{0:'Blots',1:'Graphs',2:'Microscopy',3:'Body Imaging',4:'Flow Cytometry'}}};
const image={width:640,height:640,data:new Uint8Array(640*640*3),sha256:hash};
function predictions(labels=[1]){
 const anchors=labels.length,data=new Float32Array(9*anchors);
 for(let i=0;i<anchors;i++){data[i]=50+100*i;data[anchors+i]=100;data[2*anchors+i]=40;data[3*anchors+i]=60;data[(4+labels[i])*anchors+i]=.95;}
 return {predictions:{data,dims:[1,9,anchors]}};
}

test('decoded detector cache is source/model/dimension/backend bound, clone-safe and cleared',async()=>{
 const budget=new Budget(16*1024**2),calls=[];
 const pool={async run(name,feeds,options){calls.push({name,options});return {result:predictions([1,2,3,4]),release(){}};}};
 const preparation={async yolo(){return {tensor:{data:new Float32Array(1),dims:[1,3,640,640]},release(){}};}};
 const networks=new ForgeryscopeNetworks({pool,preparation,budget,assets,sift:{extract(){throw Error('SIFT is forbidden in preparation');}}});
 const classified=await networks.classifyPanels(image,{backend:'auto'});
 assert.equal(classified.cacheHit,false);assert.deepEqual(classified.panels.map(panel=>panel.label),['Graphs','Microscopy','Body Imaging','Flow Cytometry']);
 classified.panels[1].rectangle[0]=999;
 const native=await networks.detect(image,'panels',{backend:'auto'});
 assert.deepEqual(native.map(panel=>panel[0]),['Microscopy']);assert.equal(calls.length,1);
 const reused=await networks.classifyPanels(image,{backend:'auto'});assert.equal(reused.cacheHit,true);assert.notEqual(reused.panels[1].rectangle[0],999);
 await networks.classifyPanels(image,{backend:'cpu'});assert.equal(calls.length,2);
 await networks.classifyPanels({...image,sha256:'c'.repeat(64)},{backend:'auto'});assert.equal(calls.length,3);
 await networks.classifyPanels({...image,width:639},{backend:'auto'});assert.equal(calls.length,4);
 assets.yolo_panel_extractor.sha256='d'.repeat(64);await networks.classifyPanels(image,{backend:'auto'});assert.equal(calls.length,5);assets.yolo_panel_extractor.sha256=modelHash;
 assert.ok(calls.every(call=>call.name==='yolo_panel_extractor'&&call.options.cpuRequired===true));
 networks.clearDetectionCache();assert.equal(budget.cacheBytes,0);
 await networks.classifyPanels(image,{backend:'auto'});assert.equal(calls.length,6);networks.clearDetectionCache();
});

test('prepareOnly on pixels/surface returns metadata only and Auto reuses detector without changing its class policy',async()=>{
 const oldYolo=ForgeryscopePreparation.prototype.yolo,oldRun=NeuralGraphPool.prototype.run,calls=[],budget=new Budget(64*1024**2);
 ForgeryscopePreparation.prototype.yolo=async function(){const release=this.budget.reserve(4);return {tensor:{data:new Float32Array(1),dims:[1,3,640,640]},release};};
 NeuralGraphPool.prototype.run=async function(name,feeds,options){assert.equal(name,'yolo_panel_extractor');calls.push(name);const release=this.budget.reserve(36);return {result:predictions([1]),release};};
 let api;
 try{
  api=createForgeryscopeAnalyzer({assets,runtimes:{},budget,sift:{identity:'never-called',extract(){throw Error('SIFT must not run');}},preparationFactory(){throw Error('Preparation WASM is mocked only for contract testing');}});
  const prepared=await api.analyze(image,{prepareOnly:true},{backend:'auto'});
  assert.deepEqual(Object.keys(prepared).sort(),['height','metadata','metrics','provenance','release','width']);
  const scope=prepared.metadata.preparation;assert.equal(scope.coordinates,'original-pixels');assert.equal(scope.fullAnalysisExecuted,false);assert.equal(scope.panels[0].label,'Graphs');assert.equal(scope.detector.sha256,modelHash);assert.equal(scope.unknown.exhaustive,false);
  prepared.release();prepared.release();
  const normal=await api.analyze(image,{profile:'auto'},{backend:'auto'});
  assert.equal(normal.metadata.status,'no_panels');assert.deepEqual(normal.metadata.panels,[]);assert.equal(normal.mask.length,640*640);assert.equal(calls.length,1);normal.release();
  let reads=0,releases=0;
  const surface={descriptor:{width:640,height:640,id:'first',revision:1},async readWindow(){reads++;return {pixels:image,release(){releases++;}};}};
  const segmented=await api.analyze({surface,sha256:hash},{prepareOnly:true},{backend:'auto'});assert.equal(segmented.provenance.originalSourceSha256,hash);assert.equal(segmented.metadata.preparation.panels[0].label,'Graphs');segmented.release();
  const native=await api.analyze({surface,sha256:hash},{profile:'auto'},{backend:'auto'});assert.equal(native.metadata.status,'no_panels');assert.equal(calls.length,2);native.release();
  assert.equal(reads,2);assert.equal(releases,2);
  api.clearCache();assert.equal(budget.active,0);assert.equal(budget.cacheBytes,0);
 }finally{api?.dispose();ForgeryscopePreparation.prototype.yolo=oldYolo;NeuralGraphPool.prototype.run=oldRun;}
});

test('prepareOnly records missing trained detections as uncertain rather than a whole-image acquisition',async()=>{
 const oldYolo=ForgeryscopePreparation.prototype.yolo,oldRun=NeuralGraphPool.prototype.run;let api;
 ForgeryscopePreparation.prototype.yolo=async()=>({tensor:{data:new Float32Array(1),dims:[1,3,640,640]},release(){}});
 NeuralGraphPool.prototype.run=async()=>({result:{predictions:{data:new Float32Array(9),dims:[1,9,1]}},release(){}});
 try{api=createForgeryscopeAnalyzer({assets,runtimes:{},budget:new Budget(32*1024**2),preparationFactory(){}});const result=await api.analyze(image,{prepareOnly:true});assert.equal(result.metadata.preparation.status,'needs-review');assert.equal(result.metadata.preparation.uncertain,true);assert.deepEqual(result.metadata.preparation.panels,[]);result.release();}
 finally{api?.dispose();ForgeryscopePreparation.prototype.yolo=oldYolo;NeuralGraphPool.prototype.run=oldRun;}
});
