import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {prepareEnergy} from '../../engine-source/src/energy-prepare.js';
import {segmentEnergy,energyColor} from '../../engine-source/src/energy-segment.js';
import {referenceLogFunction} from '../../engine-source/src/energy-log-reference.js';
import {energyLogData} from '../../engine-source/src/energy-log-data.js';
import {energyParams} from '../../engine-source/src/energy-pipeline.js';
import {energyProfile,estimateEnergy,energyDeviations} from '../../engine-source/src/energy-auto.js';
import {describeEnergy} from '../../engine-source/src/energy-primitives.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {samplePixels} from '../../engine-source/src/display-sampling.js';
import {createAdaptivePreview} from '../sherloq-browser/assets/adaptive-preview.js';

const log=referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));
const params={quality:75,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};
async function fixture(width=160,height=160){
 const n=width*height,source={width,height,format:'rgb8',data:new Uint8Array(3*n).fill(100)},planes=new Float32Array(3*n);
 for(let q=0;q<3;q++)for(let y=0;y<height;y++)for(let x=0;x<width;x++)planes[q*n+y*width+x]=x<width/4?.25:x>3*width/4?20:6+(x%19)/10;
 const prepared=await prepareEnergy(source,planes,[.01,.99],log),segmented=await segmentEnergy({width,height,...prepared,metadata:{block:16}},{thresholds:[5,5],minimum:1});
 return{source,analysis:{id:'native',imageId:'source',provenance:{originalSha256:'a'.repeat(64),params:{...params}},data:{width,height,...prepared,energy_planes:planes,energy_labels:segmented.labels,regionColors:segmented.regions.map(r=>({id:r.id,rgb:energyColor(r)})),metadata:{block:16,energy:{quantiles:[.01,.99],thresholds:[5,5]}}}}};
}
function owner(source,dependencies={},adaptive=false){
 const live=new Map(),audit={reservations:[],releases:[],reads:0};let serial=0;
 const engine={async reserveExternalMemory({bytes}){const lease={id:++serial,bytes};live.set(lease.id,lease);audit.reservations.push(bytes);return lease;},async releaseExternalMemory(id){assert.ok(live.has(id));live.delete(id);audit.releases.push(id);}};
 const preview=createEnergyParameterPreview({adaptive,engine,readOriginal:async(_a,tile,signal)=>{audit.reads++;const frame=await samplePixels(source,tile,{signal});try{return frame.pixels;}finally{frame.release();}},dependencies:{prepareEnergy,segmentEnergy,energyColor,energyParams,energyProfile,energyLogData,referenceLogFunction,...dependencies}});
 return{preview,live,audit,engine};
}
function raw(analysis){return Object.fromEntries(['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels'].map(key=>[key,analysis.data[key].slice()]));}
function unchanged(analysis,before){for(const key of Object.keys(before))assert.deepEqual(analysis.data[key],before[key],key);}

test('step1 Biome draft uses actual segmentation and matches the exact native render while preserving retained scientific arrays',async()=>{
 const {source,analysis}=await fixture(),before=raw(analysis),h=owner(source),draft=await h.preview.render(analysis,{params,presentation:{view:'labels'},preview:{maxWidth:320,maxHeight:320}}),exact=await renderEnergy(analysis.data,source,{view:'labels'});
 assert.deepEqual(draft.pixels.data,exact.data);assert.equal(draft.pixels.preview,true);assert.equal(draft.pixels.logicalWidth,160);assert.equal(draft.draft.samplingStep,1);assert.equal(draft.draft.exact,false);assert.equal(draft.draft.repreparedHistogram,false);assert.equal(draft.draft.regionCount,analysis.data.regionColors.length);assert.ok(draft.draft.regionCount>0);assert.equal(h.live.size,0);unchanged(analysis,before);await h.preview.dispose();
});
test('shadow/highlight edits resegment the sampled native scores rather than recoloring the previous labels',async()=>{
 const {source,analysis}=await fixture(321,193),before=raw(analysis),calls=[],h=owner(source,{segmentEnergy:async(base,p,hooks)=>{calls.push({p,hooks,base});return segmentEnergy(base,p,hooks);}});
 const shown=await h.preview.render(analysis,{params,presentation:{view:'labels'},preview:{maxWidth:160,maxHeight:160}}),hidden=await h.preview.render(analysis,{params:{...params,shadow:200,highlight:200},presentation:{view:'labels'},preview:{maxWidth:160,maxHeight:160}});
 assert.equal(shown.draft.samplingStep,4);assert.ok(shown.draft.regionCount>0);assert.equal(hidden.draft.regionCount,0);assert.ok(hidden.pixels.data.every(x=>x===0));assert.deepEqual(calls.map(x=>x.p.thresholds),[[5,5],[20,20]]);assert.equal(calls[0].hooks.draftSpatialScale,4);assert.equal(calls[0].base.metadata.block,16);assert.equal(shown.pixels.logicalWidth,321);assert.ok(shown.pixels.width<=160);assert.equal(h.live.size,0);unchanged(analysis,before);await h.preview.dispose();
});
test('histogram edits prepare fresh native-plane samples with original panel IDs and never admit excluded or foreign scope points',async()=>{
 const {source,analysis}=await fixture(320,160),n=320*160,d=analysis.data;d.energy_summary[0].id=17;for(let i=0;i<n;i++)d.energy_scope[i]=i%320<8?0:i%320>310?-1:17;
 const before=raw(analysis),calls=[],h=owner(source,{prepareEnergy:async(image,planes,q,l,hooks)=>{calls.push({image,planes,q,hooks});const p=await prepareEnergy(image,planes,q,l,hooks);for(let i=0;i<p.energy_scope.length;i++)assert.ok(p.energy_scope[i]===0||hooks.draftSourceScope[i]===p.energy_scope[i]);return p;}});
 const draft=await h.preview.render(analysis,{params:{...params,histogramLow:100,histogramHigh:900},presentation:{view:'labels'},preview:{maxWidth:160,maxHeight:160}});
 assert.equal(calls.length,1);assert.deepEqual(calls[0].q,[.1,.9]);assert.deepEqual(calls[0].hooks.panelIds,[17]);assert.equal(calls[0].hooks.minimumPanelSamples,1);assert.deepEqual(draft.draft.nativePanelIds,[17]);assert.equal(draft.draft.repreparedHistogram,true);assert.equal(draft.draft.reusedNativeJpeg,true);assert.equal(calls[0].planes.length,3*160*80);assert.equal(calls[0].planes[0],d.energy_planes[0]);assert.equal(h.live.size,1,'only the small qualified logarithm remains leased');unchanged(analysis,before);await h.preview.dispose();assert.equal(h.live.size,0);
});
test('missing resolved quality, cancellation, denied admission and preparation failures cannot publish a fake draft or leak workspace',async()=>{
 const {source,analysis}=await fixture(),before=raw(analysis),h=owner(source);analysis.provenance.params.quality=0;await assert.rejects(h.preview.render(analysis,{params:{...params,quality:0}}),{code:'DRAFT_BASE_UNAVAILABLE'});analysis.provenance.params.quality=75;assert.equal(h.audit.reads,0);assert.equal(h.live.size,0);
 const c=new AbortController();c.abort();await assert.rejects(h.preview.render(analysis,{params,signal:c.signal}),{code:'CANCELLED'});assert.equal(h.live.size,0);await h.preview.dispose();
 const bad=owner(source,{prepareEnergy:async()=>{throw Error('preparation refused');}});await assert.rejects(bad.preview.render(analysis,{params:{...params,histogramLow:100}}),/preparation refused/);assert.equal(bad.live.size,1);await bad.preview.dispose();assert.equal(bad.live.size,0);
 const c2=new AbortController(),cancelled=owner(source,{segmentEnergy:async(base,p,hooks)=>{c2.abort();return segmentEnergy(base,p,hooks);}});await assert.rejects(cancelled.preview.render(analysis,{params,signal:c2.signal}),{code:'CANCELLED'});assert.equal(cancelled.live.size,0);await cancelled.preview.dispose();
 const denied=owner(source);denied.engine.reserveExternalMemory=async()=>{throw Object.assign(Error('Budget denied'),{code:'MEMORY_LIMIT'});};await assert.rejects(denied.preview.render(analysis,{params}),{code:'MEMORY_LIMIT'});assert.equal(denied.audit.reads,0);assert.equal(denied.live.size,0);await denied.preview.dispose();unchanged(analysis,before);
});
test('Biome opacity and labels drafts borrow only native labels with logical geometry and bounded sampled-source transport',async()=>{
 const {source,analysis}=await fixture(321,193),before=raw(analysis),audit={rows:0,samples:0},readable={width:source.width,height:source.height,async readPixels(){audit.rows++;throw Error('No native RGB rows for this coarse draft');},async readSampled(tile){audit.samples++;const f=await samplePixels(source,tile);try{return f.pixels;}finally{f.release();}}};
 for(const view of ['overlay','labels']){const p=await renderEnergy(analysis.data,readable,{view,opacity:35},{preview:{maxWidth:160,maxHeight:160}});assert.equal(p.logicalWidth,321);assert.equal(p.logicalHeight,193);assert.equal(p.preview,true);assert.ok(p.data.length<=160*160*3);assert.equal(p.presentation.nativeResolution,false);}
 assert.equal(audit.rows,0);assert.equal(audit.samples,1);unchanged(analysis,before);
});

function mockCodec(calls){return{async recompress(image,quality,{signal}={}){assert.equal(signal?.aborted??false,false);calls.push(quality);const data=image.data.slice();for(let i=0;i<data.length;i++)data[i]=Math.max(4,Math.min(251,data[i]+(i%17)-8+(quality%11)));return{...image,data};}};}
test('changed quality recompresses the bounded original at three actual levels, preserves native scope and scientific planes, and leases cache until dispose',async()=>{
 const {source,analysis}=await fixture(320,160),d=analysis.data,n=source.width*source.height;d.metadata.quality=75;for(let i=0;i<n;i++)d.energy_scope[i]=i%320<16?0:1;
 const before=raw(analysis),calls=[],prepared=[],h=owner(source,{jpegCodec:mockCodec(calls),describeEnergy,prepareEnergy:async(image,planes,q,l,hooks)=>{prepared.push({image,planes:planes.slice(),hooks});return prepareEnergy(image,planes,q,l,hooks);}});
 const result=await h.preview.render(analysis,{params:{...params,quality:80},preview:{maxWidth:160,maxHeight:160},presentation:{view:'labels'}});
 assert.deepEqual(calls,[75,80,85]);assert.equal(result.draft.reusedNativeJpeg,false);assert.equal(result.draft.jpegQuality,80);assert.equal(result.presentation.method,'sampled-original-jpeg-energy');assert.deepEqual(result.draft.recompressedQualities,[75,80,85]);assert.equal(prepared.length,1);assert.equal(prepared[0].image.width,160);assert.equal(prepared[0].image.height,80);assert.deepEqual(prepared[0].hooks.panelIds,[1]);assert.equal(prepared[0].hooks.draftSourceScope[0],0);assert.equal(prepared[0].hooks.minimumPanelSamples,1);assert.notDeepEqual(prepared[0].planes,d.energy_planes.subarray(0,prepared[0].planes.length));assert.ok(h.audit.reservations.includes(32*1024**2));assert.equal(h.live.size,5);unchanged(analysis,before);
 const again=await h.preview.render(analysis,{params:{...params,quality:80,shadow:60},preview:{maxWidth:160,maxHeight:160}});assert.deepEqual(calls,[75,80,85]);assert.deepEqual(again.draft.recompressedQualities,[]);
 await h.preview.render(analysis,{params:{...params,quality:85},preview:{maxWidth:160,maxHeight:160}});assert.deepEqual(calls,[75,80,85,90]);assert.equal(h.live.size,6);await h.preview.dispose();assert.equal(h.live.size,0);unchanged(analysis,before);
});
test('automatic zero quality reuses the native resolved reference rather than estimating from a proxy PNG',async()=>{
 const {source,analysis}=await fixture(),calls=[];analysis.data.metadata.quality=82;analysis.provenance.params.quality=0;const h=owner(source,{jpegCodec:mockCodec(calls),describeEnergy});
 const result=await h.preview.render(analysis,{params:{...params,quality:0}});assert.equal(result.draft.jpegQuality,82);assert.equal(result.draft.reusedNativeJpeg,true);assert.equal(calls.length,0);await h.preview.dispose();assert.equal(h.live.size,0);
});
test('new automatic profiles estimate and reprepare sampled planes with fixed native panel identity and exclusions',async()=>{
 const {source,analysis}=await fixture(320,160),calls=[],preparations=[],estimates=[],before=raw(analysis);analysis.data.metadata.quality=75;const h=owner(source,{jpegCodec:mockCodec(calls),describeEnergy,estimateEnergy:async(base,l,hooks)=>{estimates.push(base);return estimateEnergy(base,l,hooks);},energyDeviations,prepareEnergy:async(image,planes,q,l,hooks)=>{preparations.push(q);assert.deepEqual(hooks.panelIds,[1]);assert.equal(hooks.minimumPanelSamples,1);return prepareEnergy(image,planes,q,l,hooks);}});
 const result=await h.preview.render(analysis,{params:{quality:80,block:16,minimum:1,profile:'sensitive'},preview:{maxWidth:160,maxHeight:160}});assert.deepEqual(calls,[75,80,85]);assert.equal(estimates.length,1);assert.equal(result.draft.estimatedDraftProfile,true);assert.ok(preparations.length>=1);assert.deepEqual(preparations[0],[.1,.9]);assert.equal(estimates[0].energy_scope.length,160*80);await h.preview.dispose();assert.equal(h.live.size,0);unchanged(analysis,before);
});
test('JPEG failure, cancellation between levels and codec admission failure publish no draft and release every cached plan on dispose',async()=>{
 const {source,analysis}=await fixture();analysis.data.metadata.quality=75;
 const h=owner(source,{jpegCodec:{async recompress(){throw Error('codec refused');}},describeEnergy});await assert.rejects(h.preview.render(analysis,{params:{...params,quality:80}}),/codec refused/);assert.equal(h.live.size,1);await h.preview.dispose();assert.equal(h.live.size,0);
 const abort=new AbortController(),calls=[],cancelled=owner(source,{jpegCodec:{async recompress(image,q){calls.push(q);abort.abort();return{...image,data:image.data.slice()};}},describeEnergy});await assert.rejects(cancelled.preview.render(analysis,{params:{...params,quality:80},signal:abort.signal}),{code:'CANCELLED'});assert.equal(calls.length,1);await cancelled.preview.dispose();assert.equal(cancelled.live.size,0);
 const denied=owner(source,{jpegCodec:mockCodec([]),describeEnergy}),reserve=denied.engine.reserveExternalMemory;denied.engine.reserveExternalMemory=async args=>{if(args.bytes===32*1024**2)throw Object.assign(Error('Codec budget denied'),{code:'MEMORY_LIMIT'});return reserve(args);};await assert.rejects(denied.preview.render(analysis,{params:{...params,quality:80}}),{code:'MEMORY_LIMIT'});assert.equal(denied.live.size,0);await denied.preview.dispose();
});
test('bounded JPEG plan cache never retains more than five planes and every quality boundary is legal',async()=>{
 const {source,analysis}=await fixture(),calls=[],h=owner(source,{jpegCodec:mockCodec(calls),describeEnergy});analysis.data.metadata.quality=75;
 for(const quality of [1,100,40,45]){const result=await h.preview.render(analysis,{params:{...params,quality},preview:{maxWidth:80,maxHeight:80}});assert.ok(result.draft.jpegQualities.every(q=>q>=1&&q<=100));assert.ok(h.live.size<=7);}
 assert.deepEqual(calls.slice(0,6),[1,6,11,90,95,100]);await h.preview.dispose();assert.equal(h.live.size,0);
});
test('adaptive Biome drafts grow past the former grid and preserve every native scientific plane',async()=>{
 const{source,analysis}=await fixture(640,320),before=raw(analysis),calibrations=new Map(),adaptive=createAdaptivePreview({initialSide:32,calibrations,persist:false}),h=owner(source,{},adaptive),sizes=[];
 for(let i=0;i<10;i++){const result=await h.preview.render(analysis,{params,presentation:{view:'labels'}});sizes.push(result.pixels.width);assert.ok(result.metrics.adaptivePreview);assert.equal(result.metrics.adaptivePreview.token.key,'ela/biomes/native-planes/manual/labels');assert.ok(result.pixels.width*result.pixels.height<=result.metrics.admittedPixels);assert.equal(result.draft.exact,false);}
 assert.ok(Math.max(...sizes)>32);assert.ok(calibrations.size>0);unchanged(analysis,before);await h.preview.dispose();assert.equal(h.live.size,0);
});
test('energy draft admission honors the supplied available-byte envelope and never evicts native data',async()=>{
 const{source,analysis}=await fixture(320,160),before=raw(analysis),adaptive=createAdaptivePreview({calibrations:new Map(),persist:false}),h=owner(source,{},adaptive);
 await assert.rejects(h.preview.render(analysis,{params,preview:{maxWorkingBytes:0}}),{code:'MEMORY_LIMIT'});assert.equal(h.audit.reads,0);assert.equal(h.live.size,0);
 const answer=await h.preview.render(analysis,{params,preview:{maxWorkingBytes:3*1024**2,maxPixels:1000}});assert.ok(answer.pixels.width*answer.pixels.height<=1000);assert.ok(Math.max(...h.audit.reservations)<=3*1024**2);unchanged(analysis,before);await h.preview.dispose();assert.equal(h.live.size,0);
});
test('JPEG proxy planes of abandoned sampling grids are released before retaining a new grid',async()=>{
 const{source,analysis}=await fixture(320,160),calls=[],h=owner(source,{jpegCodec:mockCodec(calls),describeEnergy});analysis.data.metadata.quality=75;
 await h.preview.render(analysis,{params:{...params,quality:80},preview:{maxWidth:80,maxHeight:80}});const oldPlanes=h.audit.reservations.filter(n=>n===80*40*4).length;assert.equal(oldPlanes,3);
 await h.preview.render(analysis,{params:{...params,quality:80},preview:{maxWidth:160,maxHeight:160}});assert.equal(h.live.size,5,'only codec, logarithm and three current-grid planes remain');assert.ok(h.audit.releases.length>=4);await h.preview.dispose();assert.equal(h.live.size,0);
});
