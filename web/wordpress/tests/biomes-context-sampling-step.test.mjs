import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {ENERGY_CONTEXT_LAYOUT,energyContextFieldNames} from '../sherloq-browser/assets/energy-context-selection.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../../engine-source/src/source-region-geometry.js';

const sha='a'.repeat(64),params={quality:0,block:8,minimum:1,profile:'manual',histogramLow:20,histogramHigh:990,shadow:50,highlight:50},presentation={view:'overlay',opacity:70};
// The real child owns admission, field sampling, projection and rendering flow.
// Only the scientific kernels are controlled. Block 8 makes the 40x40 transport
// fixture cover 25 cells; it is not a new value exposed by energyParams().
async function fixture(layout=null){
 const width=40,height=40,n=width*height,live=new Map(),audit={sourceSteps:[],preparations:[],segments:[],rendered:[],planeReads:0};let serial=0;
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height}),domain=await compileOriginalSourceRegions(state.snapshot()),metadata={method:'ela_energy_synthesis',quality:null,qualities:[],block:8,energy:{profile:'manual',quantiles:[.01,.99],thresholds:[5,5],planeCount:1,quality_confirmation:'median-already-aggregated',preparedIdentity:'prepared'}},summary={id:1,bbox:[0,0,width,height]},context={id:'native-fragment-1',bounds:[0,0,width,height],originalBounds:[0,0,width,height],width,height,jpegPhase:[0,0],evaluable:true,status:'analysed',nativeMetadata:metadata,energy_summary:[summary],regions:[],regionColors:[]},analysis={id:'native',imageId:'source',operation:'ela.energy',status:'ok',synthesis:{key:'median'},provenance:{originalSha256:sha,params:{...params,histogramLow:10}},planeSurfaces:{},data:{width,height,energyPlaneCount:1,energy_summary:[{...summary,sourceFragment:1}],metadata:{...metadata}}};
 if(layout){analysis.sourceRegionDomain=domain.descriptor;analysis.data.metadata.sourceRegionFingerprint=domain.fingerprint;}
 if(layout==='legacy')analysis.data.metadata.fragments=[context];
 if(layout==='collection'){const plan='b'.repeat(64);analysis.provenance.contextPlanFingerprint=plan;analysis.data.contextLayout=ENERGY_CONTEXT_LAYOUT;analysis.data.contexts=[context];Object.assign(analysis.data.metadata,{contextLayout:ENERGY_CONTEXT_LAYOUT,contextPlanFingerprint:plan});context.fieldKeys={};}
 const values={energy_scope:new Int32Array(n).fill(1),energy_labels:new Int32Array(n),energy_low_score:new Float32Array(n),energy_high_score:new Float32Array(n),energy_plane_0:Float32Array.from({length:n},(_,i)=>i%width+Math.floor(i/width)/100)};
 for(const name of energyContextFieldNames(analysis)){analysis.planeSurfaces[name]={id:name,revision:1,width,height,format:['energy_scope','energy_labels'].includes(name)?'int32':'float32'};if(context.fieldKeys)context.fieldKeys[name]=name;}
 const engine={async reserveExternalMemory({bytes}){const lease={id:++serial,bytes};live.set(lease.id,lease);return lease;},async releaseExternalMemory(id){assert(live.delete(id));},async readPlane({surfaceId,rect}){audit.planeReads++;const source=values[surfaceId],data=new source.constructor(rect.width*rect.height);for(let y=0;y<rect.height;y++)data.set(source.subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);return{plane:{width:rect.width,height:rect.height,data}};}};
 const adaptive={plan({key,width,height}){return{step:9,token:{schema:'adaptive-preview-token/1',costModel:5,id:1,key,width,height,step:9,side:5,pixels:25,qualityPolicy:{side:5}}};}};
 const owner=createEnergyParameterPreview({engine,adaptive,readOriginal:async(_analysis,tile)=>{audit.sourceSteps.push(tile.step);const w=Math.ceil(tile.w/tile.step),h=Math.ceil(tile.h/tile.step),data=new Uint8Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){data[(y*w+x)*3]=x*tile.step;data[(y*w+x)*3+1]=y*tile.step;}return{width:w,height:h,format:'rgb8',data};},dependencies:{energyParams:p=>({...p}),energyLogData:()=>new Int32Array(1),referenceLogFunction:()=>Math.log,prepareEnergy:async(image,planes,_quantiles,_log,{draftSourceScope,planeCount})=>{audit.preparations.push({width:image.width,height:image.height,planeCount,planes:planes.slice()});return{energy_scope:draftSourceScope,energy_low_score:new Float32Array(image.width*image.height),energy_high_score:new Float32Array(image.width*image.height),energy_summary:[summary]};},segmentEnergy:async(base,_params,options)=>{audit.segments.push({width:base.width,height:base.height,draftSpatialScale:options.draftSpatialScale});return{labels:new Int32Array(base.width*base.height),regions:[]};},energyColor:()=>[0,0,0],renderEnergy:async(...args)=>{const frame=await renderEnergy(...args);audit.rendered.push({width:frame.width,height:frame.height});return frame;}}});
 return{owner,analysis,audit,values,live,render:(preview,view=presentation)=>owner.render(analysis,{params,presentation:view,backend:'cpu',preview:{adaptive:true,maxWidth:40,maxHeight:40,maxPixels:n,maxWorkingBytes:8*1024**2,...preview}})};
}

for(const layout of ['collection','legacy'])test(layout+' transmits common step 9 to the real 40x40 child, preserving local sample positions and area units',async()=>{
 const h=await fixture(layout);try{
  const answer=await h.render(),draft=layout==='legacy'?answer.draft.contexts[0].draft:answer.draft,p=h.audit.preparations[0];
  assert.equal(answer.draft.samplingStep,9);assert.equal(draft.samplingStep,9);assert.equal(draft.areaScale,81);assert.equal(draft.minimumSamples,64/81);assert.equal(draft.strongSamples,64/81);assert.deepEqual([p.width,p.height,p.planeCount],[5,5,1]);assert(h.audit.sourceSteps.every(step=>step===9));assert.equal(h.audit.segments[0].draftSpatialScale,9);
  for(let y=0;y<5;y++)for(let x=0;x<5;x++)assert.equal(p.planes[y*5+x],h.values.energy_plane_0[(y*9)*40+x*9]);
  assert.deepEqual(Array.from(answer.pixels.data.subarray(0,15)).filter((_,i)=>i%3===0),[0,9,18,27,36]);assert.deepEqual([answer.pixels.width,answer.pixels.height],[5,5]);assert.equal(answer.metrics.adaptivePreview.token.step,9);
 }finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});

test('legacy Both keeps its existing parent layout and per-pane child bounds with the exact common step 9',async()=>{
 const h=await fixture('legacy');try{const answer=await h.render(undefined,{view:'scores',field:'both',threshold:0,scoreView:'map'}),draft=answer.draft.contexts[0].draft;assert.equal(draft.samplingStep,9);assert.equal(draft.areaScale,81);assert.equal(h.audit.segments[0].draftSpatialScale,9);assert.deepEqual(h.audit.rendered,[{width:10,height:5}]);assert.deepEqual([answer.pixels.width,answer.pixels.height],[5,5],'the existing legacy RGB layout is unchanged');}finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});

for(const preview of [{contextSamplingStep:0},{contextSamplingStep:-1},{contextSamplingStep:1.5},{contextSamplingStep:Number.MAX_SAFE_INTEGER},{contextSamplingStep:9,maxWidth:4},{contextSamplingStep:9,maxHeight:4},{contextSamplingStep:9,maxPixels:24}])test('the child rejects an invalid common grid without choosing a different step: '+JSON.stringify(preview),async()=>{
 const h=await fixture();try{await assert.rejects(h.render({adaptive:false,maxWidth:5,maxHeight:5,maxPixels:25,...preview}),{code:'INVALID_INPUT'});assert.equal(h.audit.sourceSteps.length,0);assert.equal(h.audit.planeReads,0);assert.equal(h.audit.preparations.length,0);}finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});

test('the child refuses common step 9 when its 25 samples exceed memory admission rather than silently increasing the step',async()=>{
 const h=await fixture();try{await assert.rejects(h.render({adaptive:false,contextSamplingStep:9,maxWidth:5,maxHeight:5,maxPixels:25,maxWorkingBytes:2*1024**2+8192+160}),{code:'MEMORY_LIMIT'});assert.equal(h.audit.sourceSteps.length,0);assert.equal(h.audit.planeReads,0);assert.equal(h.audit.preparations.length,0);}finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});
