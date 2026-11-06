import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {sourceRegionSynthesisEnergy} from '../src/ela-synthesis-energy-contexts.js';
const sha='b'.repeat(64),W=176,H=80;
const bytesStore=data=>({byteLength:data.byteLength,readInto(out,offset=0){out.set(data.subarray(offset,offset+out.length));},dispose(){}});
async function fixture(poison=false){
 const budget=new Budget(128*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:W,height:H});await state.add('acquisition',{x0:0,y0:0,x1:80,y1:80});await state.add('acquisition',{x0:96,y0:0,x1:176,y1:80});
 const domain=await compileOriginalSourceRegions(state.snapshot()),data=new Uint8Array(W*H*3).fill(90),residual=Uint8Array.from({length:W*H*3},(_,i)=>((i*7+Math.floor(i/3)*13)%223)+2);
 if(poison)for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!domain.containsOriginal(x,y))for(let c=0;c<3;c++){data[(y*W+x)*3+c]=255;residual[(y*W+x)*3+c]^=255;}
 const surface=createRgbSurface(bytesStore(data),{width:W,height:H,budget,ownsStore:false}),synth=createRgbSurface(bytesStore(residual),{width:W,height:H,budget,ownsStore:false}),original={surface,sha256:sha},view=await createSourceRegionView({...surface,sha256:sha},domain.descriptor,{budget}),derived={},records=[];
 const reader=view.readWindow.bind(view),synthReader=synth.readWindow.bind(synth),reads=[];view.readWindow=(r,h)=>{assert(view.includesRectangle(r));reads.push({kind:'Original',...r});return reader(r,h);};synth.readWindow=(r,h)=>{assert(view.includesRectangle(r));reads.push({kind:'Synthese',...r});return synthReader(r,h);};
 return{budget,domain,original,view,derived,synth,records,reads,publishResult(_,record){records.push(record);return{surface:record.surface.descriptor,planeSurfaces:Object.fromEntries(Object.entries(record.planeRecords).map(([key,value])=>[key,value.surface.descriptor])),maskSurfaces:Object.fromEntries(Object.entries(record.maskRecords).map(([key,value])=>[key,value.surface.descriptor]))};},async close(){for(const record of records)for(const s of [record.surface,...Object.values(record.planeRecords).map(v=>v.surface),...Object.values(record.maskRecords).map(v=>v.surface)])await s.dispose();await derived.synthesisEnergyCache?.dispose();await view.dispose();await surface.dispose();await synth.dispose();assert.equal(budget.total(),0);}};
}
async function run(h,key='shared-base-A',hooks={}){return sourceRegionSynthesisEnergy({task:{id:'synth-energy',imageId:'original',operation:'ela.energy',backend:'cpu',params:{block:16}},original:h.original,derived:h.derived,view:h.view,domain:h.domain,budget:h.budget,publishResult:h.publishResult,profile:{maxWorkers:1},synthesis:{surface:h.synth,key},...hooks});}
async function read(surface){const d=surface.descriptor,p=await surface.readWindow({x:0,y:0,width:d.width,height:d.height});try{return p.pixels.data.slice();}finally{await p.release();}}

test('separate admitted contexts retain one real synthesis plane, Original panels and independent profiles',async()=>{
 const h=await fixture();try{const first=await run(h),record=h.records.at(-1);assert.equal(first.metrics.nativeContexts,2);assert.equal(first.metrics.analysedPixels,80*80*2);assert.equal(first.metrics.energyRecompressions,0);assert.equal(first.data.energyPlaneCount,1);assert.equal(first.data.metadata.energy.planeCount,1);assert.equal(first.data.contexts.length,2);
  for(let i=0;i<2;i++){const context=first.data.contexts[i];assert.equal(context.nativeMetadata.energyPlaneCount,1);assert.equal(context.nativeMetadata.energy.planeCount,1);assert.equal(context.nativeMetadata.quality,null);assert.deepEqual(context.nativeMetadata.qualities,[]);assert.equal(context.nativeMetadata.synthesis.originalSha256,sha);assert(context.fieldKeys.energy_plane_0);assert.equal(context.fieldKeys.energy_plane_1,undefined);assert.equal(record.energyAnalysis.contexts[i].analysis.energy_planes.length,1);}
  const before=h.reads.length,again=await run(h);assert.equal(again.metrics.cachedContexts,2);assert.equal(h.reads.length,before);assert(h.derived.synthesisEnergyCache);assert.equal(h.derived.energyCache,undefined);
 }finally{await h.close();}
});

test('excluded Original and synthesis RGB cannot change any scientific context field',async()=>{
 const a=await fixture(),b=await fixture(true);try{await run(a);await run(b);const ar=a.records[0],br=b.records[0];assert.deepEqual(Object.keys(ar.planeRecords),Object.keys(br.planeRecords));for(const key of Object.keys(ar.planeRecords))assert.deepEqual(await read(ar.planeRecords[key].surface),await read(br.planeRecords[key].surface));assert.deepEqual(ar.data.contexts.map(c=>c.energy_summary),br.data.contexts.map(c=>c.energy_summary));}finally{await a.close();await b.close();}
});

test('cancelled context assembly does not publish a partial result and releases all owners',async()=>{
 const h=await fixture(),stop=new AbortController();try{await assert.rejects(run(h,'A',{signal:stop.signal,onProgress:event=>{if(event.phase==='source-region-energy-context')stop.abort();}}),{code:'CANCELLED'});assert.equal(h.records.length,0);await run(h,'A');assert.equal(h.records.length,1);}finally{await h.close();}
});

test('a fresh scoped Original alias supplies quantile misses after the previous borrowed aliases close',async()=>{
 const h=await fixture(),oldView=h.view,oldSynth=h.synth;let freshView,originalReads=0,synthesisReads=0;
 try{
  const first=await run(h),residualRead=oldSynth.readWindow.bind(oldSynth);
  assert(h.reads.length>0);await oldView.dispose();
  oldView.readWindow=()=>{throw Error('retired Original alias was read');};oldSynth.readWindow=()=>{throw Error('retired synthesis alias was read');};
  freshView=await createSourceRegionView({...h.original.surface,sha256:sha},h.domain.descriptor,{budget:h.budget});
  const freshRead=freshView.readWindow.bind(freshView);freshView.readWindow=(rectangle,hooks)=>{assert(freshView.includesRectangle(rectangle),'only the same admitted context may be read');originalReads++;return freshRead(rectangle,hooks);};
  h.view=freshView;h.synth={descriptor:oldSynth.descriptor,readWindow:(rectangle,hooks)=>{assert(freshView.includesRectangle(rectangle));synthesisReads++;return residualRead(rectangle,hooks);}};
  const changed=await run(h,'shared-base-A',{task:{id:'changed-quantiles',imageId:'original',operation:'ela.energy',backend:'cpu',params:{block:16,profile:'manual',histogramLow:200,histogramHigh:800}}});
  assert(originalReads>0,'new quantile preparation reads Original through the current alias');assert.equal(synthesisReads,0,'complete primitive survives the borrowed neutral reader');
  for(let i=0;i<2;i++){
   assert.equal(changed.data.contexts[i].nativeMetadata.energy.residualIdentity,first.data.contexts[i].nativeMetadata.energy.residualIdentity);
   assert.notEqual(changed.data.contexts[i].nativeMetadata.energy.preparedIdentity,first.data.contexts[i].nativeMetadata.energy.preparedIdentity);
  }
  assert.equal(changed.metrics.synthesisEnergyPlanesComputed??0,0);
 }finally{await freshView?.dispose();await h.close();}
});
