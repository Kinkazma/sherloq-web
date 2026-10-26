// Pure policy and actual app-callback tests with inert dependencies; no Worker/ORT.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parameterPreviewPolicy,retainedNativeBasisStatus} from '../sherloq-browser/assets/parameter-preview-policy.js';
const source={sha256:'a'.repeat(64),surface:{}},domain={fingerprint:'domain-a'},p=(id,field,params={})=>parameterPreviewPolicy(id,field,params);
test('required native bases cover model-backed retained controls and preserve classical/OCR/statistical policies',()=>{
 for(const id of ['ai.sources.safire','ai.localization.focal','ai.localization.adaifl','various.median'])assert.equal(p(id,id==='various.median'?'threshold':'view.mode').nativeBasis,'required');
 assert.equal(p('ai.sources.safire','groups').nativeBasis,'required');
 for(const algorithm of ['XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue','EfficientLoFTR','SSG'])assert.equal(p('tampering.copyMove.sparse','view.lines',{algorithm}).nativeBasis,'required');
 for(const algorithm of ['SIFT','RootSIFT','AKAZE','BRISK','ORB','SIFT + G2NN + RANSAC'])for(const key of ['limit','radius','minimum','threshold','tolerance','model','geometricThreshold','geometricMinimum','compare','reflections','autoRadius','compact','independent']){const policy=p('tampering.copyMove.sparse',key,{algorithm});assert.equal(policy.kind,'explicit');assert.equal(policy.final,'native');assert.equal(policy.nativeBasis,undefined);}
 assert.equal(p('various.ocr','algorithm').nativeBasis,undefined);assert.equal(p('various.ocr','algorithm').final,'native');
 for(const[id,key]of [['colors.stats','mode'],['inspection.adjust','gamma'],['noise.planes','mode']])assert.equal(p(id,key).nativeBasis,undefined);
});
test('native basis identity rejects missing owners, stale operations/domains and uncalculated scientific settings',()=>{
 const policy=p('tampering.copyMove.sparse','view.lines',{algorithm:'XFeat'}),task={operation:'tampering.copyMove.sparse',sourceRegionDomain:domain,params:{algorithm:'XFeat',limit:6000}},result={operation:task.operation,cloneWindowMode:'independent',sourceRegionDomain:domain,provenance:{originalSha256:source.sha256,params:{...task.params}}};
 assert(retainedNativeBasisStatus(policy,{source,result},task).available);
 for(const client of [{source:null,result},{source,result:null}])assert(!retainedNativeBasisStatus(policy,client,task).available);
 for(const change of [{operation:'various.median'},{sourceRegionDomain:{fingerprint:'other'}},{params:{...task.params,algorithm:'ORB'}},{params:{...task.params,limit:2000}}])assert(!retainedNativeBasisStatus(policy,{source,result},{...task,...change}).available);
 assert(!retainedNativeBasisStatus(policy,{source:{...source,sha256:'b'.repeat(64)},result},task).available);
 const safire={operation:'ai.sources.safire',params:{side:16,groups:3,kind:'kmeans',eps:.2,minimum:1,binary:false},sourceRegionDomain:domain},prior={operation:safire.operation,sourceRegionDomain:domain,provenance:{params:safire.params,originalSha256:source.sha256}},groupPolicy=p(safire.operation,'groups',safire.params);
 assert(retainedNativeBasisStatus(groupPolicy,{source,result:prior},{...safire,params:{...safire.params,groups:4}}).available);
 assert(!retainedNativeBasisStatus(groupPolicy,{source,result:prior},{...safire,params:{...safire.params,side:32}}).available);
});
// These callbacks are extracted verbatim from the reviewed app source, rather
// than a reproduction of its dispatch logic. The DOM/bootstrap is not executed.
const app=readFileSync(new URL('../../../../peer-native-basis60/web/wordpress/sherloq-browser/assets/app.js',import.meta.url),'utf8');
const helper=app.slice(app.indexOf('function ensureRetainedParameterBasis('),app.indexOf('\nparameterSession=createParameterPreviewSession({'));
const commit=app.slice(app.indexOf('commit:async(event,{isCurrent'),app.indexOf('\n restore:()=>{individualUI')).replace(/^commit:/,'').replace(/,\s*$/,'');
const preview=app.slice(app.indexOf('preview:async(event,{signal})=>{'),app.indexOf('\n show:(answer,event)=>{')).replace(/^preview:/,'').replace(/,\s*$/,'');
function harness(event,{sourceOwner=source,resultOwner,retained=null}={}){
 const counts={nativeRuns:0,loads:0,previews:0,retained:0,renders:0,unavailable:0},nodes=new Map(),client={source:sourceOwner,result:resultOwner,async load(){counts.loads++;throw Error('No implicit source load expected');},async previewParameters(){counts.previews++;return{};},async updateRetainedParameters(){counts.retained++;return retained;}};
 const context={fileInput:{},busy:false,activeAnalysis:event.toolId,destroyed:false,sourceRegionsStale:false,individualClient:client,retainedNativeBasisStatus,parameterCommitting:false,resultMeta:null,individualUI:{render:async()=>{counts.renders++;}},regionController:null,persistSettings(){},translateTaskActions(){},diagnostic(){},status(){},autoText:f=>f,controls(){},discardIndividualPresentation(){counts.unavailable++;},sourceRegionTaskIdentity:()=>({}),prepareParameterScientificTask:async task=>({task,isCurrent:()=>true}),bindSourceRegionTask:async t=>t,sourceRegionTaskIsCurrent:()=>true,adoptSourceRegionPresentation(){},acknowledgeSourceRegionTask:async()=>true,t:x=>x,$:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},run:async()=>{counts.nativeRuns++;},ensureIndividualClient:async()=>client};
 const build=code=>new Function('context','with(context){'+helper+';return '+code+';}')(context);
 return{counts,context,commit:build(commit),preview:build(preview)};
}
for(const id of ['ai.sources.safire','ai.localization.focal','ai.localization.adaifl','various.median','tampering.copyMove.sparse'])test(id+' missing native owner blocks actual app preview and final fallback',async()=>{
 const params=id==='tampering.copyMove.sparse'?{algorithm:'XFeat'}:{},field=id==='various.median'?'threshold':id==='tampering.copyMove.sparse'?'view.lines':'view.mode',event={toolId:id,operation:id,params,view:{mode:'map'},field,policy:p(id,field,params)};
 for(const missing of ['source','result']){const result={operation:id,provenance:{params}},h=harness(event,{sourceOwner:missing==='source'?null:source,resultOwner:missing==='result'?null:result});await h.preview(event,{signal:new AbortController().signal});await h.commit(event);assert.equal(h.counts.nativeRuns,0);assert.equal(h.counts.loads,0);assert.equal(h.counts.previews,0);assert.equal(h.counts.retained,0);assert(h.counts.unavailable>=2);}
});
test('live exact retained result follows normal presentation; cache-only refusal never falls into run',async()=>{
 const id='ai.localization.focal',event={toolId:id,operation:id,params:{},view:{mode:'map'},field:'view.mode',policy:p(id,'view.mode')},result={id:'old',operation:id,provenance:{params:{}}},next={...result,id:'new'};
 const hit=harness(event,{resultOwner:result,retained:next});await hit.commit(event);assert.equal(hit.counts.retained,1);assert.equal(hit.counts.renders,1);assert.equal(hit.counts.nativeRuns,0);assert.equal(hit.counts.unavailable,0);
 const miss=harness(event,{resultOwner:result});await miss.commit(event);assert.equal(miss.counts.retained,1);assert.equal(miss.counts.nativeRuns,0);assert.equal(miss.counts.unavailable,1);
});
test('actual app still dispatches classical exact native and OCR method commits',async()=>{
 for(const[id,field,params]of [['tampering.copyMove.sparse','threshold',{algorithm:'ORB'}],['various.ocr','algorithm',{algorithm:'tesseract'}]]){const event={toolId:id,operation:id,params,field,policy:p(id,field,params)},h=harness(event);await h.commit(event);assert.equal(h.counts.nativeRuns,1);assert.equal(h.counts.unavailable,0);}
});
