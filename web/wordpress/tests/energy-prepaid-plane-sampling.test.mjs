import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleEnergyField} from '../sherloq-browser/assets/energy-native-fields.js';
import {admitEnergySurfacePreview,renderEnergySurface} from '../sherloq-browser/assets/energy-surface-render.js';
import {createEngine} from '../sherloq-browser/assets/unified-engine/src/index.js';
import {EngineError} from '../sherloq-browser/assets/unified-engine/src/errors.js';

function fixture({advertised=true}={}){
 const surface={id:'scores',revision:1,width:8,height:8,format:'float32'},analysis={data:{width:8,height:8},planeSurfaces:{energy_high_score:surface}},calls=[];
 const engine={capabilities:()=>({sourceAccess:{numericSamplingExternalWorkspace:advertised},memory:{policyAvailableBytes:32*1024**2,knownHeapCapacityBytes:32*1024**2}}),samplePlane:async request=>{calls.push(request);return{surfaceId:'scores',revision:1,plane:{width:request.width,height:request.height,format:'float32',data:Float32Array.from({length:request.width*request.height},()=>7)}};},readPlane:async({rect})=>({plane:{width:rect.width,height:rect.height,data:Float32Array.from({length:rect.width*rect.height},()=>7)}})};
 return{analysis,engine,calls};
}
test('a real external workspace id is passed only to an advertised direct sampler without funding its destination twice',async()=>{
 const f=fixture(),data=await sampleEnergyField(f.analysis,'energy_high_score',{width:4,height:4,centers:true},{engine:f.engine,workspaceReservationId:'frame-owner'});
 assert.equal(data.length,16);assert.equal(f.calls.length,1);assert.equal(f.calls[0].workspaceReservationId,'frame-owner');assert.equal(f.calls[0].sourceWidth,8);
});
test('missing capability or missing owner keeps the historical admission and same legacy samples',async()=>{
 for(const options of[{advertised:false},{advertised:true,noOwner:true}]){const f=fixture(options),data=await sampleEnergyField(f.analysis,'energy_high_score',{width:4,height:4,centers:true},{engine:f.engine,...(!options.noOwner?{workspaceReservationId:'frame-owner'}:{})});assert.equal(f.calls.length,0);assert.deepEqual([...data],Array(16).fill(7));}
});
test('a declined credit before reading can fall back, but an invalid owner remains an error',async()=>{
 const f=fixture();f.engine.samplePlane=async()=>{throw new EngineError('MEMORY_LIMIT','Prepaid capacity',{details:{samplePlane:{phase:'admission',fallbackSafe:true}}});};
 assert.equal((await sampleEnergyField(f.analysis,'energy_high_score',{width:4,height:4,centers:true},{engine:f.engine,workspaceReservationId:'frame-owner'})).length,16);
 const primary=new EngineError('INVALID_INPUT','Invalid live owner');f.engine.samplePlane=async()=>{throw primary;};
 await assert.rejects(sampleEnergyField(f.analysis,'energy_high_score',{width:4,height:4,centers:true},{engine:f.engine,workspaceReservationId:'expired'}),e=>e===primary);
});
test('prepaid workspace preserves the largest legacy-admitted grid and admits its exact direct reader at Firefox headroom',()=>{
 const width=3822,height=7716,plane=name=>({id:name,revision:1,width,height,format:name==='energy_scope'?'int32':'float32'}),analysis={data:{width,height,regionColors:Array(4)},planeSurfaces:Object.fromEntries(['energy_scope','energy_high_score','energy_low_score'].map(n=>[n,plane(n)]))},presentation={view:'scores',field:'high'},options={preview:{maxWidth:4096,maxHeight:4096},memory:{policyAvailableBytes:258689506,knownHeapCapacityBytes:183435264}};
 const legacy=admitEnergySurfacePreview(analysis,presentation,options),funded=admitEnergySurfacePreview(analysis,presentation,{...options,prepaidNumericWorkspace:true});
 assert.equal(funded.maxSide,legacy.maxSide);assert.equal(legacy.directSamplingAdmitted,false);assert.equal(funded.directSamplingAdmitted,true);assert.equal(funded.requiredBytes,legacy.requiredBytes);assert(funded.samplerOutputBytes+funded.samplerScratchBytes<=funded.frameLeaseBytes);assert(funded.peakBytes<=funded.availableBytes);
});
test('the real surface renderer uses its live frame reservation for all three fields and preserves every displayed RGB byte',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});let analysis;
 try{
  await engine.load({id:'original',bytes:Uint8Array.of(1),pixels:{width:96,height:96,format:'rgb8',data:Uint8Array.from({length:96*96*3},(_,i)=>i*71%256)}});
  analysis=await engine.run({id:'energy',imageId:'original',operation:'ela.energy',params:{quality:75,block:16},resultLayout:'surface',backend:'cpu'});
  assert.equal(engine.capabilities().sourceAccess.numericSamplingExternalWorkspace,true);
  const calls=[],before=engine.capabilities().memory.activeReservationBytes,adapter={...engine,samplePlane:async(request,hooks)=>{calls.push(request);return engine.samplePlane(request,hooks);}},source={width:96,height:96},presentation={view:'scores',field:'high',threshold:1},options={preview:{maxWidth:13,maxHeight:13},rgbBudgetReserved:true};
  const actual=await renderEnergySurface(analysis,source,presentation,{...options,engine:adapter});
  assert.equal(calls.length,3);assert(calls.every(c=>typeof c.workspaceReservationId==='string'&&c.workspaceReservationId===calls[0].workspaceReservationId));
  assert.equal(engine.capabilities().memory.activeReservationBytes,before);
  const expected=await renderEnergySurface(analysis,source,presentation,{...options,engine:{...engine,samplePlane:undefined}});
  assert.deepEqual(actual.data,expected.data);assert.equal(actual.width,13);assert.equal(actual.height,13);assert.equal(engine.capabilities().memory.activeReservationBytes,before);
 }finally{
  if(analysis)for(const id of new Set(Object.values(analysis.planeSurfaces).map(s=>s.id)))await engine.releaseSurface(id);
  await engine.unload('original');assert.equal(engine.capabilities().memory.activeReservationBytes,0);await engine.dispose();
 }
});
