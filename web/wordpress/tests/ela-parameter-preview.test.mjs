import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {prepareEnergy} from '../../engine-source/src/energy-prepare.js';
import {segmentEnergy,energyColor} from '../../engine-source/src/energy-segment.js';
import {referenceLogFunction} from '../../engine-source/src/energy-log-reference.js';
import {energyLogData} from '../../engine-source/src/energy-log-data.js';
import {energyParams} from '../../engine-source/src/energy-pipeline.js';
import {energyProfile} from '../../engine-source/src/energy-auto.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {samplePixels} from '../../engine-source/src/display-sampling.js';

const log=referenceLogFunction({minimumBits:973078528,maximumBits:1157627904},new Uint8Array(energyLogData().buffer));
const params={quality:75,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};
async function fixture(width=160,height=160){
 const n=width*height,source={width,height,format:'rgb8',data:new Uint8Array(3*n).fill(100)},planes=new Float32Array(3*n);
 for(let q=0;q<3;q++)for(let y=0;y<height;y++)for(let x=0;x<width;x++)planes[q*n+y*width+x]=x<width/4?.25:x>3*width/4?20:6+(x%19)/10;
 const prepared=await prepareEnergy(source,planes,[.01,.99],log),segmented=await segmentEnergy({width,height,...prepared,metadata:{block:16}},{thresholds:[5,5],minimum:1});
 return{source,analysis:{id:'native',imageId:'source',provenance:{originalSha256:'a'.repeat(64),params:{...params}},data:{width,height,...prepared,energy_planes:planes,energy_labels:segmented.labels,regionColors:segmented.regions.map(r=>({id:r.id,rgb:energyColor(r)})),metadata:{block:16,energy:{quantiles:[.01,.99],thresholds:[5,5]}}}}};
}
function owner(source,dependencies={}){
 const live=new Map(),audit={reservations:[],releases:[],reads:0};let serial=0;
 const engine={async reserveExternalMemory({bytes}){const lease={id:++serial,bytes};live.set(lease.id,lease);audit.reservations.push(bytes);return lease;},async releaseExternalMemory(id){assert.ok(live.has(id));live.delete(id);audit.releases.push(id);}};
 const preview=createEnergyParameterPreview({engine,readOriginal:async(_a,tile,signal)=>{audit.reads++;const frame=await samplePixels(source,tile,{signal});try{return frame.pixels;}finally{frame.release();}},dependencies:{prepareEnergy,segmentEnergy,energyColor,energyParams,energyProfile,energyLogData,referenceLogFunction,...dependencies}});
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
test('quality mismatch, cancellation, denied admission and preparation failures cannot publish a fake draft or leak workspace',async()=>{
 const {source,analysis}=await fixture(),before=raw(analysis),h=owner(source);await assert.rejects(h.preview.render(analysis,{params:{...params,quality:81}}),{code:'DRAFT_BASE_MISMATCH'});assert.equal(h.audit.reads,0);assert.equal(h.live.size,0);
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
