import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchPreparationHost} from '../src/batch-preparation-host.js';

const sha='a'.repeat(64);
function fixture({configuredText=true}={}){
 const posts=[],calls={decode:0,sourceRelease:0,panels:0,panelRelease:0,panelDispose:0,pool:0,poolDispose:0,detector:0,text:0,annotations:0};let request=0,budget;
 const host=createBatchPreparationHost({post:value=>posts.push(value),codec:{memoryBytes:()=>0},
  sourceLoader:async(blob,options)=>{calls.decode++;budget=options.budget;const release=budget.reserve(64);return {sha256:sha,surface:{descriptor:{width:8,height:6},readWindow(){throw Error('No fixture pixels should be needed');}},release,provenance:{fixture:true},metrics:{decodedOnce:true}};},
  sourceDisposer:image=>{calls.sourceRelease++;image.release();},
  analyzerFactory:()=>({async analyze(image,params,options){calls.panels++;assert.deepEqual(params,{prepareOnly:true});assert.equal(options.backend,'cpu');const release=budget.reserve(128);return {metadata:{preparation:{fullAnalysisExecuted:false,panels:[{label:'Microscopy',rectangle:[0,0,8,6]}],detector:{id:'classifier'}}},provenance:{classificationOnly:true},release:()=>{calls.panelRelease++;release();}};},dispose(){calls.panelDispose++;}}),
  poolFactory:()=>{calls.pool++;return {dispose(){calls.poolDispose++;}};},
  detectorFactory:()=>{calls.detector++;return {async detect(source,options){calls.text++;assert.equal(source.sha256,sha);assert.equal(options.backend,'cpu');return {status:'complete',polygons:[[[1,1],[2,1],[2,2],[1,2]]],detections:[{text:'fixture'}],warnings:[],metadata:{inferenceExecuted:true}};}};},
  annotationDetector:async options=>{calls.annotations++;assert.equal(options.regions.length,1);return {status:'complete',polygons:[]};}
 });
 async function invoke(operation,args={}){const id=++request;await host.handle({id,operation,args});const reply=posts.find(p=>p.id===id&&('value'in p||'error'in p));assert.ok(reply,'worker replies to every request');return reply;}
 async function start(){const config={computeProfile:'maximum',memoryBudgetBytes:1024**2,resourceHints:{hardwareConcurrency:12},methods:{forgeryscope:{}}};if(configuredText)config.text={asset:{id:'fixture'},runtimes:{}};const reply=await invoke('initialize',config);assert.equal(reply.error,undefined);assert.equal(reply.value.profile.maxWorkers,12);}
 async function prepare(params){const reply=await invoke('analyzeBlob',{method:'scientific-preparation',blob:new Blob(['image']),backend:'cpu',params});if(reply.error)return {error:reply.error};const descriptor=reply.value,metadata=await invoke('readMetadata',{resultId:descriptor.id,offset:0,count:descriptor.metadataBytes});const value=JSON.parse(new TextDecoder().decode(metadata.value));await invoke('releaseResult',{resultId:descriptor.id});return value;}
 return {calls,start,prepare,invoke,get budget(){return budget;}};
}

test('detectText false retains classifier and annotations without an OCR model, pool or inference',async()=>{
 const f=fixture({configuredText:false});await f.start();
 try{const result=await f.prepare({detectText:false});assert.equal(result.panels.detector.id,'classifier');assert.equal(result.text.status,'complete');assert.equal(result.text.disabled,true);assert.equal(result.text.rawDetection,null);assert.deepEqual(result.text.polygons,[]);assert.deepEqual(result.text.detections,[]);assert.equal(result.text.metadata.inferenceExecuted,false);assert.equal(result.text.metadata.sourceSha256,sha);assert.equal(result.text.metadata.originalPixelsModified,false);assert.equal(result.sourceSha256,sha);assert.equal(f.calls.panels,1);assert.equal(f.calls.annotations,1);assert.equal(f.calls.pool,0);assert.equal(f.calls.detector,0);assert.equal(f.calls.text,0);assert.equal(f.calls.decode,1);assert.equal(f.calls.sourceRelease,1);assert.equal(f.calls.panelRelease,1);assert.equal(f.budget.total(),0);}
 finally{await f.invoke('dispose');}assert.equal(f.calls.panelDispose,1);assert.equal(f.calls.poolDispose,0);
});
test('default OCR remains enabled and a later disabled image reuses classification without running OCR again',async()=>{
 const f=fixture();await f.start();
 try{const first=await f.prepare({});assert.equal(first.text.disabled,undefined);assert.equal(first.text.metadata.inferenceExecuted,true);await f.prepare({detectText:false});assert.equal(f.calls.text,1);assert.equal(f.calls.pool,1);assert.equal(f.calls.detector,1);assert.equal(f.calls.panels,2);assert.equal(f.calls.decode,2);assert.equal(f.budget.total(),0);}
 finally{await f.invoke('dispose');}assert.equal(f.calls.poolDispose,1);
});
test('textOnly is an explicit OCR operation even when ordinary preparation has detectText false',async()=>{
 const f=fixture();await f.start();
 try{const result=await f.prepare({textOnly:true,detectText:false});assert.equal(result.panels,null);assert.equal(result.annotations,null);assert.equal(result.text.metadata.inferenceExecuted,true);assert.equal(f.calls.text,1);assert.equal(f.calls.panels,0);assert.equal(f.calls.annotations,0);assert.equal(f.budget.total(),0);}
 finally{await f.invoke('dispose');}
});
test('malformed OCR switches fail before decoding rather than silently enabling an expensive stage',async()=>{
 const f=fixture();await f.start();try{const result=await f.prepare({detectText:'false'});assert.equal(result.error.code,'INVALID_INPUT');assert.equal(f.calls.decode,0);assert.equal(f.calls.pool,0);}finally{await f.invoke('dispose');}
});
