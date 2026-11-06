import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptivePreview} from '../sherloq-browser/assets/adaptive-preview.js';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {createContextEnergyParameterPreview} from '../sherloq-browser/assets/energy-context-parameter-preview.js';
import {ENERGY_CONTEXT_LAYOUT,energyContextFieldNames} from '../sherloq-browser/assets/energy-context-selection.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../engine-source/src/source-region-geometry.js';

const params={quality:0,block:16,minimum:1,profile:'manual',histogramLow:20,histogramHigh:990,shadow:50,highlight:50},presentation={view:'overlay',opacity:70},sha='a'.repeat(64);
const policy=()=>createAdaptivePreview({calibrations:new Map(),persist:false});
const paint=(ui,answer,milliseconds=600,extra={})=>ui.observe(answer.metrics.adaptivePreview.token,{milliseconds,setupMilliseconds:answer.metrics.setupMilliseconds,cold:answer.metrics.cold,displayMilliseconds:8,pixels:answer.pixels.width*answer.pixels.height,...extra});
function budget(){let id=0;const live=new Map();return{live,engine:{async reserveExternalMemory({bytes}){const row={id:++id,bytes};live.set(row.id,row);return row;},async releaseExternalMemory(id){assert(live.delete(id));}}};}
function metadata(color){return{method:'ela_energy_synthesis',quality:null,qualities:[],block:16,color,energy:{profile:'manual',quantiles:[.01,.99],thresholds:[5,5],planeCount:1,quality_confirmation:'median-already-aggregated',preparedIdentity:'prepared-'+color}};}

function single(){
 const width=80,height=80,n=width*height,b=budget(),adaptive=policy(),ui=policy(),audit={gpu:0,segments:[]},meta=metadata(1),analysis={id:'native',imageId:'source',synthesis:{key:'median'},provenance:{originalSha256:sha,params:{...params,histogramLow:10}},data:{width,height,energyPlaneCount:1,energy_scope:new Int32Array(n).fill(1),energy_low_score:new Float32Array(n),energy_high_score:new Float32Array(n),energy_planes:[new Float32Array(n).fill(2)],energy_summary:[{id:1,bbox:[0,0,width,height]}],metadata:meta}};
 b.engine.energyPreviewScoreProvider=async()=>({});
 const owner=createEnergyParameterPreview({engine:b.engine,adaptive,readOriginal:async(_a,tile)=>({width:Math.ceil(tile.w/tile.step),height:Math.ceil(tile.h/tile.step),format:'rgb8',data:new Uint8Array(Math.ceil(tile.w/tile.step)*Math.ceil(tile.h/tile.step)*3).fill(100)}),dependencies:{energyParams:p=>({...p}),energyLogData:()=>new Int32Array(1),referenceLogFunction:()=>Math.log,prepareEnergy:async(image,_planes,_quantiles,_log,{draftSourceScope,scoreGpu,onGpuSubmitted})=>{assert(scoreGpu);audit.gpu++;onGpuSubmitted();return{energy_scope:draftSourceScope,energy_low_score:new Float32Array(image.width*image.height),energy_high_score:new Float32Array(image.width*image.height),energy_summary:[{id:1,bbox:[0,0,image.width,image.height]}]};},segmentEnergy:async(base,_p,{draftSpatialScale})=>{audit.segments.push(draftSpatialScale);return{labels:new Int32Array(base.width*base.height),regions:[]};},energyColor:()=>[0,0,0],renderEnergy:async(_data,original)=>({...original,format:'rgb8'})}});
 return{owner,adaptive,ui,analysis,audit,live:b.live,render:feedback=>owner.render(analysis,{params,presentation,backend:'webgpu',preview:{adaptive:true,maxWidth:80,maxHeight:80,maxPixels:n,maxWorkingBytes:8*1024**2,...(feedback?{adaptiveFeedback:feedback}:{})}})};
}

test('painted feedback remains importable after newer unpresented Biomes computations and selects the shared strong reduction',async()=>{
 const h=single();try{
  const first=await h.render(),cold=paint(h.ui,first);assert.equal(cold.qualityPolicy.completedEvidence,false);assert.equal(h.adaptive.state.calibrations,0,'a completed computation is not a painted calibration');
  const second=await h.render(),warm1=paint(h.ui,second);assert.equal(warm1.qualityPolicy.overloadCount,1);
  const third=await h.render(cold),warm2=paint(h.ui,third);assert.equal(third.metrics.adaptivePreview.token.priorCalibration.painted,true);assert.equal(warm2.qualityPolicy.resolutionReduced,true);
  await h.render(warm1);const reduced=await h.render(warm2);assert.equal(reduced.draft.samplingStep,2);assert.deepEqual([reduced.pixels.width,reduced.pixels.height],[40,40]);assert.deepEqual([h.analysis.data.width,h.analysis.data.height],[80,80]);assert.equal(reduced.metrics.preparationScoreGpuSubmissions,1);assert.equal(h.audit.segments.at(-1),2);assert.equal(reduced.draft.recompressedQualities.length,0);
 }finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});

async function contexts(collection=false){
 const width=160,height=80,b=budget(),adaptive=policy(),ui=policy(),audit={children:[],sourceSteps:[]},state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height}),domain=await compileOriginalSourceRegions(state.snapshot()),plan='b'.repeat(64),list=[0,1].map(i=>({id:'native-fragment-'+(i+1),bounds:[i*80,0,(i+1)*80,80],originalBounds:[i*80,0,(i+1)*80,80],width:80,height:80,jpegPhase:[0,0],evaluable:true,status:'analysed',nativeMetadata:metadata(i+1),energy_summary:[{id:i+1,bbox:[0,0,80,80]}],regions:[],regionColors:[]}));
 const analysis={id:'contexts',imageId:'source',operation:'ela.energy',status:'ok',synthesis:{key:'median'},provenance:{originalSha256:sha,params:{...params,histogramLow:10},contextPlanFingerprint:plan},sourceRegionDomain:domain.descriptor,planeSurfaces:{},data:{width,height,energyPlaneCount:1,energy_summary:list.map((c,i)=>({id:i+1,sourceFragment:i+1,bbox:c.bounds})),metadata:{...metadata(0),contextPlanFingerprint:plan,sourceRegionFingerprint:domain.fingerprint,...(collection?{contextLayout:ENERGY_CONTEXT_LAYOUT}:{fragments:list})},...(collection?{contextLayout:ENERGY_CONTEXT_LAYOUT,contexts:list}:{})}};
 if(collection)for(const c of list){c.fieldKeys={};for(const name of energyContextFieldNames(analysis)){const key=c.id+'/'+name;c.fieldKeys[name]=key;analysis.planeSurfaces[key]={id:key,revision:1,width:80,height:80,format:['energy_scope','energy_labels'].includes(name)?'int32':'float32'};}}
 else for(const name of energyContextFieldNames(analysis))analysis.planeSurfaces[name]={id:name,revision:1,width,height,format:['energy_scope','energy_labels'].includes(name)?'int32':'float32'};
 const owner=createContextEnergyParameterPreview({engine:b.engine,adaptive,fallback:{render(){throw Error('Parent composition is required');},dispose(){}},readOriginal:async(_a,tile)=>{audit.sourceSteps.push(tile.step);const w=Math.ceil(tile.w/tile.step),h=Math.ceil(tile.h/tile.step);return{width:w,height:h,format:'rgb8',data:new Uint8Array(w*h*3).fill(100)};},createSingle:()=>{let calls=0;return{async render(native,options){calls++;audit.children.push({width:native.data.width,height:native.data.height,preview:options.preview,backend:options.backend});assert.equal(options.preview.adaptive,false);assert.equal(options.backend,'webgpu');const step=Math.max(1,Math.ceil(native.data.width/options.preview.maxWidth),Math.ceil(native.data.height/options.preview.maxHeight)),w=Math.ceil(native.data.width/step),h=Math.ceil(native.data.height/step),data=new Uint8Array(w*h*3).fill(native.data.metadata.color),setupMilliseconds=calls===1?1:0;return{pixels:{width:w,height:h,logicalWidth:native.data.width,logicalHeight:native.data.height,format:'rgb8',data,preview:true},metrics:{setupMilliseconds,cold:calls===1,preparationScoreGpuSubmissions:1,preparationScoreRuntimes:[{backend:'webgpu-native-energy-scores'}]},draft:{samplingStep:step,params:options.params,recompressedQualities:[],nativeSampleCache:{sourceReads:0}}};},dispose(){}};}});
 return{owner,adaptive,ui,analysis,audit,live:b.live,render:(feedback,selection={})=>owner.render(analysis,{params,presentation,backend:'webgpu',...selection,preview:{adaptive:true,maxWidth:160,maxHeight:160,maxPixels:width*height,maxWorkingBytes:8*1024**2,...(feedback?{adaptiveFeedback:feedback}:{})}})};
}

for(const collection of [false,true])test((collection?'selected':'composed')+' native contexts share one adaptive parent grid, painted evidence and isolated scientific children',async()=>{
 const h=await contexts(collection);try{
  const first=await h.render(),feedback0=paint(h.ui,first);assert(first.metrics.adaptivePreview);assert.equal(first.metrics.setupMilliseconds,collection?1:2);assert.equal(first.metrics.cold,true);assert.equal(first.metrics.childMetrics.length,collection?1:2);assert.equal(h.adaptive.state.calibrations,0);
  const one=await h.render(feedback0),feedback1=paint(h.ui,one),two=await h.render(feedback1),feedback2=paint(h.ui,two),small=await h.render(feedback2);
  assert.equal(small.draft.samplingStep,2);assert.deepEqual([small.pixels.width,small.pixels.height],[80,40]);assert.equal(small.metrics.adaptivePreview.token.sampling,'integer');assert.equal(small.metrics.preparationScoreGpuSubmissions,collection?1:2);assert(h.audit.children.every(c=>c.preview.adaptive===false&&c.backend==='webgpu'));
  const at=x=>small.pixels.data[x*3];assert.equal(at(0),1);assert.equal(at(39),1);assert.equal(at(40),collection?100:2);assert.equal(at(79),collection?100:2,'the parent grid preserves the context boundary and Original outside selection');
  const reset=collection?await h.render(feedback2,{sourceFragment:'native-fragment-2'}):await(async()=>{const sourceSha256='c'.repeat(64),state=await createOriginalSourceRegionsState({sourceSha256,width:160,height:80}),domain=await compileOriginalSourceRegions(state.snapshot());h.analysis.provenance.originalSha256=sourceSha256;h.analysis.sourceRegionDomain=domain.descriptor;h.analysis.data.metadata.sourceRegionFingerprint=domain.fingerprint;return h.render(feedback2);})();
  assert.equal(reset.draft.samplingStep,1,'another source or selected context starts at its finest admitted grid');assert.deepEqual([h.analysis.data.width,h.analysis.data.height],[160,80]);
 }finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});

test('shared gentle integer limits, rejected evidence and fast recovery remain unchanged',async()=>{
 const h=await contexts();try{
  let answer=await h.render(),feedback=paint(h.ui,answer);for(let i=0;i<2;i++){answer=await h.render(feedback);feedback=paint(h.ui,answer,410);}assert.equal(feedback.qualityPolicy.resolutionReduced,false);assert.equal(feedback.qualityPolicy.gentleGridDeferred,true);assert.equal((await h.render(feedback)).draft.samplingStep,1);
  assert.equal(paint(h.ui,answer,900,{cancelled:true}),null);assert.equal(paint(h.ui,answer,900,{stale:true}),null);
  for(let i=0;i<2;i++){answer=await h.render(feedback);feedback=paint(h.ui,answer,600);}assert.equal((await h.render(feedback)).draft.samplingStep,2);
  for(let i=0;i<2;i++){answer=await h.render(feedback);feedback=paint(h.ui,answer,20);}const recovered=await h.render(feedback);assert.equal(recovered.draft.samplingStep,1);
 }finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});

test('legacy context layout changes invalidate sizing evidence without a plan fingerprint or a rectangle list in the token',async()=>{
 const h=await contexts();delete h.analysis.provenance.contextPlanFingerprint;delete h.analysis.data.metadata.contextPlanFingerprint;
 try{
  let answer=await h.render(),feedback=paint(h.ui,answer);for(let i=0;i<2;i++){answer=await h.render(feedback);feedback=paint(h.ui,answer);}const small=await h.render(feedback),scope=small.metrics.adaptivePreview.token.qualityPolicy.sourceIdentity;assert.equal(small.draft.samplingStep,2);
  const fragments=h.analysis.data.metadata.fragments;fragments[0].bounds=[0,0,64,80];fragments[1].bounds=[64,0,160,80];h.analysis.data.energy_summary[0].bbox=[0,0,64,80];h.analysis.data.energy_summary[1].bbox=[64,0,160,80];
  const reset=await h.render(feedback),next=reset.metrics.adaptivePreview.token.qualityPolicy.sourceIdentity;assert.equal(reset.draft.samplingStep,1);assert.notEqual(next,scope);assert(next.length<4096);assert.equal(JSON.parse(next).at(-1),JSON.parse(scope).at(-1)+1);
 }finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});

test('Both with an odd native width legalizes one parent plan against the actual composed bounds and keeps its token truthful',async()=>{
 const h=await contexts(true),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:65,height:33}),domain=await compileOriginalSourceRegions(state.snapshot());h.analysis.data.width=65;h.analysis.data.height=33;h.analysis.data.contexts=[];h.analysis.sourceRegionDomain=domain.descriptor;h.analysis.data.metadata.sourceRegionFingerprint=domain.fingerprint;
 try{
  const answer=await h.owner.render(h.analysis,{params,presentation:{view:'scores',field:'both'},preview:{maxWidth:65,maxHeight:65,maxPixels:65*65,maxWorkingBytes:8*1024**2}}),token=answer.metrics.adaptivePreview.token;
  assert.equal(answer.draft.samplingStep,3);assert.deepEqual([answer.pixels.width,answer.pixels.height],[44,11]);assert(answer.pixels.width<=65);assert.equal(token.step,3);assert.equal(token.side,44);assert.equal(token.qualityPolicy.side,44);assert.equal(token.pixels,44*11);assert.equal(answer.metrics.adaptivePreview.pixels,44*11);assert.equal(h.audit.children.length,0);
 }finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});
