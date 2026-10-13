import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import * as pdf from '../sherloq-browser/assets/batch-vendor/pdf-lib.js';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {scopeFingerprint} from '../sherloq-browser/assets/batch-scientific-preparation.js';
import {evidenceContext} from '../sherloq-browser/assets/batch-evidence.js';
import {saveBatchRunEvidence,batchResumeKey,pendingBatchResumeImage,currentBatchImages} from '../sherloq-browser/assets/batch-run-resume.js';
import {createBatchImporter} from '../sherloq-browser/assets/batch-import.js';
import {batchArchive,batchReport} from '../sherloq-browser/assets/batch-export.js';
import {writeBatchZip,readBatchZip} from '../sherloq-browser/assets/batch-zip.js';
import {localFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';
import {catalogRecipe} from '../sherloq-browser/assets/batch-catalog.js';
const featureCatalog=JSON.parse(readFileSync(new URL('../sherloq-browser/assets/feature-catalog.json',import.meta.url)));
const deployment={engineVersion:'test-resume',engineCommit:'fixed',runtimeSourceIncrementSha256:'fixed'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function sinkFactory(){const parts=[];return Promise.resolve({async write(bytes){parts.push(bytes.slice());},async finish(){return {blob:new Blob(parts),async cleanup(){}};},async abort(){parts.length=0;}});}
// Protocol oracle only: these fixtures do not run a scientific detector.
function composerFactory(){return {async stripes({entries,width,height,stripRows},consume){for(let y=0;y<height;y+=stripRows){const rows=Math.min(stripRows,height-y),values=new Uint32Array(width*rows);for(const entry of entries){const p=entry.pixel_mask;if(!p)continue;for(let yy=0;yy<p.height;yy++)for(let x=0;x<p.width;x++)if(yy+entry.origin[1]>=y&&yy+entry.origin[1]<y+rows)values[(yy+entry.origin[1]-y)*width+x+entry.origin[0]]+=p.data[yy*p.width+x];}await consume({width,height:rows,top:y,values});}},dispose(){}};}
function fixture({failInsteadOfStop=false,count=2}={}){
 const images=Array.from({length:count},(_,index)=>index+1).map(n=>{const blob=new Blob(['original source '+n],{type:'image/png'}),sourceSha256=digest('original source '+n),hash=String(n).repeat(64),id='image-'+hash.slice(0,24),region={x0:0,y0:0,x1:8,y1:8,type:'microscopy'};return {id,hash,sourceSha256,name:'source-'+n+'.png',blob,thumbnail:new Blob(),width:8,height:8,selected:true,family:'microscopy',state:'ready',runs:[],occurrences:[{studyId:'study-'+n}],preparation:{schema:'sherloq.scientific-scope/1',version:'test',coordinates:'original-pixels',sourceSha256,width:8,height:8,status:'ready',fingerprint:String(n+2).repeat(64),regions:[region],searchRegions:[region],excluded:[],text:{status:'complete',polygons:[]},models:{}}};}),artifacts=new Map(),model={images,studies:images.map((image,n)=>({id:'study-'+(n+1),name:image.name,blob:image.blob,kind:'image',errors:[]})),artifacts,errors:[]},calls=[],events=[];
 const recipes=[{id:'localized',fr:'Localized',operation:'tampering.copyMove.sparse',kind:'clones',params:{algorithm:'SSG'},signal:{},backend:'auto',view:{low:15,high:100000,minimum:4,circles:false,lines:false,points:false,areas:true,textExclusions:false}},{id:'next',fr:'Next',operation:'test.regions',kind:'regions',params:{threshold:.5},signal:{},backend:'auto'}];let source,stop=true,runner,disposed=0;
 const tool={get source(){return source;},async load(input){source={id:input.id,sha256:images.find(i=>i.id===input.id).sourceSha256};return source;},async run(task){calls.push([source.id,task.operation]);if(task.operation==='test.regions'&&source.id===images[1].id&&stop){stop=false;if(!failInsteadOfStop)runner.cancel();throw Object.assign(Error(failInsteadOfStop?'Native resource unavailable':'Interrupted native method'),{code:failInsteadOfStop?'ASSET_HTTP':'CANCELLED'});}const mask=new Uint8Array(64);for(let y=2;y<=4;y++)for(let x=2;x<=4;x++)if(x!==3||y!==3)mask[y*8+x]=1;return {operation:task.operation,data:task.operation==='test.regions'?{regions:[]}:{width:8,height:8,params:task.params,mask,metadata:{completeDetector:true,scientificDefinitions:{fixture:true}}},provenance:{originalSha256:source.sha256}};},async export(type){return new Blob([type==='json'?'{}':'raw scientific bytes']);},cancel(){},async dispose(){disposed++;source=null;}};
 runner=createBatchRunner({toolFactory:async options=>{assert.equal(options.computeProfile,'maximum');assert.equal(options.memoryBudgetBytes,4*1024**3);assert.equal(options.maxWorkers,undefined);return tool;},onProgress:e=>events.push(e),evidenceFactory:()=>evidenceContext({composerFactory}),evidenceSaver:(...args)=>saveBatchRunEvidence(...args.slice(0,5),{...args[5],sinkFactory})});
 return {model,images,recipes,runner,calls,events,get disposed(){return disposed;}};
}
async function local(fn){const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>deployment});try{return await fn();}finally{globalThis.fetch=previous;}}
test('stop then resume preserves completed images and native method outputs, retries only interrupted method and recomposes exact evidence',async()=>local(async()=>{
 const f=fixture();await f.runner.run(f.model,f.recipes);assert.equal(f.model.cancelled,true);assert.equal(f.runner.running,false);assert.equal(f.disposed,1);assert.equal(f.images[0].state,'done');assert.equal(f.images[1].state,'incomplete');assert.deepEqual(f.images[1].runs.map(r=>r.status),['done','cancelled']);
 const retained=f.images[1].runs[0],files=retained.files.map(path=>[path,f.model.artifacts.get(path)]);assert.equal(f.runner.canResume(f.model,f.recipes),true);assert.equal(f.runner.canResume(f.model,f.recipes,{threshold:2,basis:'total',thresholdMode:'auto'}),true);
 await f.runner.run(f.model,f.recipes,{resume:true});assert.equal(f.model.cancelled,false);assert.equal(f.images[0].reused,true);assert.equal(f.images[1].runs[0].reused,true);assert.equal(f.images[1].state,'done');assert.equal(f.images[1].score.incomplete,false);assert.equal(f.images[1].score.clones,1);
 assert.equal(f.calls.filter(([,op])=>op==='tampering.copyMove.sparse').length,2);assert.equal(f.calls.filter(([,op])=>op==='test.regions').length,3);for(const [path,blob]of files)assert.equal(f.model.artifacts.get(path),blob);assert.equal(f.images[1].history[0].runs[0].status,'cancelled');assert.equal(f.disposed,2);
}));
test('changed settings, source bytes, exclusion fingerprint or engine refuse resume before replacing completed outputs',async()=>local(async()=>{
 for(const change of ['params','source','scope','geometry','engine']){const f=fixture();await f.runner.run(f.model,f.recipes);const originalRuns=f.images[1].runs,originalFiles=[...f.model.artifacts.keys()],originalCalls=f.calls.length;
  if(change==='params')f.recipes[0].params.minimum=9;if(change==='source')f.images[1].blob=new Blob(['replaced']);if(change==='scope')f.images[1].preparation.fingerprint='f'.repeat(64);if(change==='geometry')f.images[1].preparation.excluded=[[[0,0],[1,0],[1,1],[0,1]]];if(change==='engine')f.images[1].restored.engine.commit='different';
  await assert.rejects(f.runner.run(f.model,f.recipes,{resume:true}),error=>['BATCH_RESUME_MISMATCH','BATCH_RESUME_SOURCE_CHANGED'].includes(error.code));assert.equal(f.images[1].runs,originalRuns);assert.deepEqual([...f.model.artifacts.keys()],originalFiles);assert.equal(f.calls.length,originalCalls);assert.equal(f.runner.running,false);
 }
}));
async function zipWriter(entries){let data=new Uint8Array(),position=0;const writer={async write(value){const bytes=value?.type==='write'?value.data:value,at=value?.type==='write'?value.position:position;if(at+bytes.length>data.length){const next=new Uint8Array(at+bytes.length);next.set(data);data=next;}data.set(bytes,at);position=at+bytes.length;},async seek(at){position=at;},async close(){},async abort(){}};await writeBatchZip(entries,writer,{compress:false});return {blob:new Blob([data]),async cleanup(){}};}
test('an interrupted default PNG archive retains contexts, remapped checkpoint files and resumes successes after import without repeating their detectors',async()=>local(async()=>{
 const f=fixture();await f.runner.run(f.model,f.recipes);
 const output=await batchArchive(f.model,{dependencies:{libraryLoader:async()=>({pdf:{}}),report:async()=>new Blob(['report']),zipWriter,imageExporterFactory:()=>({async convert(blob){return {blob,conversion:{scientificSourceCompatible:true,originalSha256:digest(new Uint8Array(await blob.arrayBuffer())),encodedSha256:digest(new Uint8Array(await blob.arrayBuffer()))}};},async dispose(){}})}});
 const zip=await readBatchZip(output.blob),manifest=JSON.parse(await zip.file('sherloq-batch.json').async('string'));for(const image of manifest.images)for(const run of image.runs)if(run.resumeEvidence)for(const path of Object.values(run.resumeEvidence.files))assert.ok(zip.file(path));
 const importer=await createBatchImporter({artifactStoreFactory:async()=>new Map(),libraryLoader:async()=>({}),identify:async blob=>{const text=await blob.text(),image=f.images.find(i=>text==='original source '+(f.images.indexOf(i)+1));return {hash:image.hash,width:8,height:8,thumbnail:new Blob()};}});const file=output.blob;Object.defineProperty(file,'name',{value:'interrupted.zip'});await importer.import([file]);assert.deepEqual(importer.errors,[]);
 const restored=importer.images.find(i=>i.hash===f.images[1].hash);assert.equal(restored.state,'incomplete');assert.deepEqual(restored.resumeState,f.images[1].resumeState);assert.deepEqual(restored.restored.engine,f.model.engine);const count=f.calls.length;
 assert.equal(f.runner.canResume(importer,f.recipes),true);await f.runner.run(importer,f.recipes,{resume:true});assert.equal(f.calls.length,count+1);assert.equal(restored.score.clones,1);assert.equal(restored.state,'done');assert.equal(restored.runs[0].reused,true);
}));

// Every native pair (including a no-match answer) is a completed unit of work.
test('completed comparisons are reused without new native runs, including after a same-source archive import',async()=>local(async()=>{
 const f=fixture();await f.runner.run(f.model,f.recipes);await f.runner.run(f.model,f.recipes,{resume:true});const count=f.calls.length;
 const resumeKey=batchResumeKey({sources:f.images.map(image=>[image.hash,image.sourceSha256,image.width,image.height,image.preparation.fingerprint]),engine:f.model.engine,policy:'scientific-comparison/1'});
 f.model.comparisons=[{kind:'geometric-matches',images:f.images.map(i=>i.id),entries:[],files:[],status:'done',resumeKey}];
 await f.runner.run(f.model,f.recipes,{resume:true,compare:true});assert.equal(f.calls.length,count);assert.equal(f.model.comparisons[0].reused,true);
 const output=await batchArchive(f.model,{dependencies:{libraryLoader:async()=>({pdf:{}}),report:async()=>new Blob(['report']),zipWriter,imageExporterFactory:()=>({async convert(blob){return {blob,conversion:{scientificSourceCompatible:true}};},async dispose(){}})}});
 const importer=await createBatchImporter({artifactStoreFactory:async()=>new Map(),libraryLoader:async()=>({}),identify:async blob=>{const source=await blob.text(),image=f.images.find((i,index)=>source==='original source '+(index+1));return {hash:image.hash,width:8,height:8,thumbnail:new Blob()};}}),file=output.blob;Object.defineProperty(file,'name',{value:'completed-pairs.zip'});await importer.import([file]);assert.deepEqual(importer.errors,[]);assert.equal(importer.comparisons.length,1);
 await f.runner.run(importer,f.recipes,{resume:true,compare:true});assert.equal(f.calls.length,count);assert.equal(importer.comparisons[0].reused,true);assert.equal(importer.resumeEvents.length,f.model.resumeEvents.length+1);
}));

test('corrupt durable evidence keeps the completed run visible and never silently reruns it',async()=>local(async()=>{
 const f=fixture();await f.runner.run(f.model,f.recipes);const run=f.images[1].runs[0],path=run.resumeEvidence.files.metadata,metadata=JSON.parse(await f.model.artifacts.get(path).text());metadata.sourceSha256='f'.repeat(64);f.model.artifacts.set(path,new Blob([JSON.stringify(metadata)]));const count=f.calls.length;
 await assert.rejects(f.runner.run(f.model,f.recipes,{resume:true}),{code:'BATCH_RESUME_INVALID'});assert.equal(f.calls.length,count);assert.equal(f.images[1].runs[0].toolId,run.toolId);assert.equal(f.images[1].runs[0].status,'done');assert.ok(f.model.artifacts.has(path));assert.equal(f.images[1].state,'incomplete');
}));

test('failed methods are retried independently and their original diagnostics remain in history',async()=>local(async()=>{
 const f=fixture({failInsteadOfStop:true});await f.runner.run(f.model,f.recipes);assert.equal(f.model.cancelled,false);assert.equal(f.images[1].score.incomplete,true);assert.equal(f.images[1].runs[1].error.code,'ASSET_HTTP');const raw=f.images[1].runs[0].files.map(path=>[path,f.model.artifacts.get(path)]);
 await f.runner.run(f.model,f.recipes,{resume:true});assert.equal(f.images[1].score.incomplete,false);assert.equal(f.images[1].history[0].runs[0].error.code,'ASSET_HTTP');for(const [path,blob]of raw)assert.equal(f.model.artifacts.get(path),blob);assert.equal(f.calls.filter(([,op])=>op==='tampering.copyMove.sparse').length,2);assert.equal(f.calls.filter(([,op])=>op==='test.regions').length,3);
}));
test('automatic analysis receives the scientific acquisitions and exclusions without inventing a neural envelope',async()=>local(async()=>{
 const f=fixture(),image=f.images[0],previous=globalThis.OffscreenCanvas,tasks=[];f.model.images=[image];let source;
 globalThis.OffscreenCanvas=class{constructor(width,height){this.width=width;this.height=height;}getContext(){return {createImageData:(width,height)=>({data:new Uint8Array(width*height*4)}),putImageData(){}};}async convertToBlob(){return new Blob(['display transport fixture']);}};
 const automatic={get source(){return source;},async load(input){source={id:input.id,sha256:image.sourceSha256};},async run(task){tasks.push(task);return {provenance:{originalSha256:image.sourceSha256},data:{entries:[],state:{states:{}}}};},async exportTo(sink){await sink.write(new TextEncoder().encode('native fixture output'));},async display(){return {width:8,height:8};},async readWindow(_,rect){return {...rect,data:new Uint8Array(rect.width*rect.height*3)};},async dispose(){}};
 const runner=createBatchRunner({automaticFactory:async()=>automatic,evidenceFactory:()=>evidenceContext({composerFactory})}),recipe={id:'automatic',fr:'Auto clones',kind:'automatic',operation:'clones.automatic',params:{cpu:true},signal:{},backend:'auto'};
 try{await runner.run(f.model,[recipe]);assert.equal(tasks.length,1);assert.deepEqual(tasks[0].params.scientificScope,image.preparation);assert.deepEqual(tasks[0].params.selection,{regions:[[[0,0],[8,0],[8,8],[0,8]]],envelope:null,disabled:[]});assert.equal(tasks[0].params.cpu,true);assert.equal(image.runs[0].status,'done');assert.deepEqual(recipe.params,{cpu:true});assert.deepEqual(image.runs[0].effectiveParams,tasks[0].params);}finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
}));

function pendingLegacyDiagnostics(f){
 const image=f.images[2],path='resultats/'+image.id+'/old-d2-error.json';f.model.artifacts.set(path,new Blob([JSON.stringify({error:{code:'CANCELLED',message:'Older D2 calculation'}})]));image.state='incomplete';image.runs=[{toolId:'old-d2',title:'Older D2 calculation',operation:'ai.clones.d2prl',kind:'clones',params:{minimum:500},signal:{},status:'cancelled',files:[path],error:{code:'CANCELLED',message:'Older D2 calculation'}}];image.restored={engine:{version:'old'},configuration:{recipes:[]}};return path;
}
async function interruptedFour({withoutPlan=false}={}){
 const f=fixture({count:4});for(const image of f.images)image.preparation.fingerprint=await scopeFingerprint(image.preparation);pendingLegacyDiagnostics(f);await f.runner.run(f.model,f.recipes);
 if(withoutPlan){delete f.model.resumePlan;for(const image of f.images)if(image.resumeState)delete image.resumeState.planId;}return f;
}
async function archiveAndImport(f){
 const output=await batchArchive(f.model,{dependencies:{libraryLoader:async()=>({pdf:{}}),report:async()=>new Blob(['report']),zipWriter,imageExporterFactory:()=>({async convert(blob){return {blob,conversion:{scientificSourceCompatible:true}};},async dispose(){}})}}),importer=await createBatchImporter({artifactStoreFactory:async()=>new Map(),libraryLoader:async()=>({}),identify:async blob=>{const value=await blob.text(),image=f.images.find((_,index)=>value==='original source '+(index+1));return {hash:image.hash,width:8,height:8,thumbnail:new Blob()};}});const file=output.blob;Object.defineProperty(file,'name',{value:'four-interrupted.zip'});await importer.import([file]);assert.deepEqual(importer.errors,[]);return importer;
}
test('local feature policy and explicit non-execution survive scientific ZIP resume; changed policy cannot replace prior native successes',async()=>local(async()=>{
 localFeaturePolicy.configure({catalog:featureCatalog,local:true,state:{disabledFeatures:['ai.clones.d2prl']}});
 try{for(const roundtrip of [false,true]){
  const f=fixture();f.recipes.push(catalogRecipe('ai.clones.d2prl'));await f.runner.run(f.model,f.recipes);const model=roundtrip?await archiveAndImport(f):f.model,expected=localFeaturePolicy.snapshot();
  assert.equal(model.cancelled,true);assert.deepEqual(model.configuration.featurePolicy,expected);assert.deepEqual(model.configuration.resumePolicy.featurePolicy,expected);assert.equal(model.excludedFeatures.length,1);assert.equal(model.excludedFeatures[0].scientificResult,false);assert.equal(model.excludedFeatures[0].state,'feature-uninstalled');assert.equal(model.images.every(image=>!image.runs.some(run=>run.operation==='ai.clones.d2prl')),true);assert.equal(f.runner.canResume(model,f.recipes),true);
  const priorRuns=model.images[1].runs,priorAbsences=model.excludedFeatures,priorFiles=[...model.artifacts.keys()],count=f.calls.length;
  localFeaturePolicy.configure({state:{disabledFeatures:['segmentation.mgcfdn','ai.clones.d2prl','ai.clones.d2prl']}});assert.equal(f.runner.canResume(model,f.recipes),false);await assert.rejects(f.runner.run(model,f.recipes,{resume:true}),{code:'BATCH_RESUME_MISMATCH'});
  assert.equal(model.images[1].runs,priorRuns);assert.equal(model.excludedFeatures,priorAbsences);assert.deepEqual([...model.artifacts.keys()],priorFiles);assert.equal(f.calls.length,count);
  localFeaturePolicy.configure({state:expected});assert.equal(f.runner.canResume(model,f.recipes),true);await f.runner.run(model,f.recipes,{resume:true});assert.equal(f.calls.length,count+1);assert.equal(model.images[0].reused,true);assert.equal(model.images[1].runs[0].reused,true);assert.equal(model.images[1].state,'done');assert.equal(model.images[1].score.clones,1);assert.equal(model.excludedFeatures[0].scientificResult,false);
 }}finally{localFeaturePolicy.configure({local:false,state:{}});}
}));
test('four-image plan separates pending old diagnostics from current successes in the session and ZIP',async()=>local(async()=>{
 for(const roundtrip of [false,true]){const f=await interruptedFour(),model=roundtrip?await archiveAndImport(f):f.model;assert.deepEqual(f.model.resumePlan.units.map(unit=>unit.started),[true,true,false,false]);
  const pending=model.images[2],old=pending.runs[0],oldBlob=await model.artifacts.get(old.files[0]);assert.equal(pendingBatchResumeImage(model,pending),true);assert.equal(pendingBatchResumeImage(model,model.images[3]),true);assert.equal(pendingBatchResumeImage(model,model.images[1]),false);assert.equal(f.runner.canResume(model,f.recipes),true);const count=f.calls.length;
  await f.runner.run(model,f.recipes,{resume:true});assert.equal(f.calls.length,count+5);assert.equal(f.calls.filter(([id,op])=>id===f.images[0].id&&op==='tampering.copyMove.sparse').length,1);assert.equal(f.calls.filter(([id,op])=>id===f.images[1].id&&op==='tampering.copyMove.sparse').length,1);assert.equal(model.images.every(image=>image.state==='done'&&!image.score.incomplete),true);assert.equal(pending.runs.some(run=>run.toolId==='old-d2'),false);assert.equal(pending.history.at(-1).runs[0].toolId,'old-d2');assert.equal(await (await model.artifacts.get(pending.history.at(-1).runs[0].files[0])).text(),await oldBlob.text());assert.equal(pendingBatchResumeImage(model,pending),false);
 }
}));
test('a stopped pre-plan archive migrates pending units only from its frozen preparation context, then checks exact source and scope',async()=>local(async()=>{
 const f=await interruptedFour({withoutPlan:true}),model=await archiveAndImport(f);assert.equal(model.resumePlan,undefined);assert.equal(model.images[2].resumeState,undefined);assert.equal(f.runner.canResume(model,f.recipes),true);assert.equal(pendingBatchResumeImage(model,model.images[2]),true);const count=f.calls.length;
 await f.runner.run(model,f.recipes,{resume:true});assert.equal(f.calls.length,count+5);assert.equal(model.resumePlan.migratedFromFrozenContext,true);assert.equal(model.images[2].history.at(-1).runs[0].toolId,'old-d2');assert.equal(model.images.every(image=>image.state==='done'),true);
}));
test('pending units never relax source, engine, recipe, selection or scope guards, including a forged unchanged scope fingerprint',async()=>local(async()=>{
 for(const change of ['source','engine','recipe','selection','geometry']){const f=await interruptedFour({withoutPlan:true}),calls=f.calls.length,files=[...f.model.artifacts.keys()],oldRuns=f.images[2].runs;
  if(change==='source')f.images[2].blob=new Blob(['different original']);if(change==='engine')f.model.engine.commit='other';if(change==='recipe')f.recipes[0].params.minimum=42;if(change==='selection')f.images.push({...f.images[3],id:'unexpected',hash:'a'.repeat(64)});if(change==='geometry')f.images[2].preparation.excluded=[[[0,0],[1,0],[1,1],[0,1]]];
  await assert.rejects(f.runner.run(f.model,f.recipes,{resume:true}),error=>['BATCH_RESUME_MISMATCH','BATCH_RESUME_SOURCE_CHANGED'].includes(error.code));assert.equal(f.calls.length,calls);assert.deepEqual([...f.model.artifacts.keys()],files);assert.equal(f.images[2].runs,oldRuns);assert.equal(f.runner.running,false);
 }
}));

test('pending historical failures are archived but never counted or drawn as results of the current attempt',async()=>local(async()=>{
 const f=await interruptedFour(),before=structuredClone(f.images[2].runs),projection=currentBatchImages(f.model),pending=projection[2];assert.equal(pending.pendingCurrentAttempt,true);assert.deepEqual(pending.runs,[]);assert.equal(pending.score,undefined);assert.equal(pending.state,'ready');assert.deepEqual(f.images[2].runs,before);
 const document=await pdf.PDFDocument.load(await(await batchReport(f.model,{pdfLibrary:pdf})).arrayBuffer()),texts=[];for(const [,object]of document.context.enumerateIndirectObjects()){if(!(object instanceof pdf.PDFRawStream)||object.dict.get(pdf.PDFName.of('Subtype'))?.toString()==='/Image')continue;const bytes=object.dict.get(pdf.PDFName.of('Filter'))?.toString()==='/FlateDecode'?inflateSync(object.getContents()):object.getContents();for(const match of Buffer.from(bytes).toString().matchAll(/<([0-9a-f]+)>\s*Tj/ig))texts.push(Buffer.from(match[1],'hex').toString('latin1'));}const text=texts.join(' ');assert.match(text,/1 analyse\(s\) incomplète\(s\) sur 4/);assert.equal(text.includes('Older D2 calculation'),false);assert.match(text,/En attente dans cette tentative/);assert.deepEqual(f.images[2].runs,before);
 const output=await batchArchive(f.model,{dependencies:{libraryLoader:async()=>({pdf:{}}),report:async()=>new Blob(['report']),zipWriter,imageExporterFactory:()=>({async convert(blob){return {blob,conversion:{scientificSourceCompatible:true}};},async dispose(){}})}}),zip=await readBatchZip(output.blob),manifest=JSON.parse(await zip.file('sherloq-batch.json').async('string'));assert.equal(manifest.images[2].pendingCurrentAttempt,true);assert.equal(manifest.images[2].runs[0].toolId,'old-d2');assert.ok(zip.file(manifest.images[2].runs[0].files[0]));
}));


test('a changed scientific runtime increment refuses reuse before mutating completed evidence or launching a native method',async()=>local(async()=>{
 const f=fixture();await f.runner.run(f.model,f.recipes);const before=f.calls.length,engine=structuredClone(f.model.engine),runs=f.images.map(image=>image.runs.map(run=>({...run}))),files=[...f.model.artifacts];
 deployment.scientificRegionsRuntimeIncrementSha256='a'.repeat(64);
 try{await assert.rejects(f.runner.run(f.model,f.recipes,{resume:true}),{code:'BATCH_RESUME_MISMATCH'});assert.equal(f.calls.length,before);assert.deepEqual(f.model.engine,engine);assert.deepEqual(f.images.map(image=>image.runs),runs);assert.deepEqual([...f.model.artifacts],files);
 deployment.scientificRegionsRuntimeIncrementSha256='invalid';await assert.rejects(f.runner.run(f.model,f.recipes,{resume:true}),{code:'BATCH_ENGINE_IDENTITY_INVALID'});assert.equal(f.calls.length,before);
 }finally{delete deployment.scientificRegionsRuntimeIncrementSha256;}
 await f.runner.run(f.model,f.recipes,{resume:true});assert.equal(f.calls.length,before+1);
}));
