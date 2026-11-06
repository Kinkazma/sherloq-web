import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../../engine-source/src/cache.js';
import {numericPlaneSamplePlan} from '../../engine-source/src/numeric-plane-sampling.js';
import {admitEnergySurfacePreview,energySurfaceWorkingBytes,renderEnergySurface} from '../sherloq-browser/assets/energy-surface-render.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
const MiB=1024**2,view={view:'scores',field:'high',scoreView:'map',threshold:.2};
function analysis(width=10000,height=7000){return{id:'native',imageId:'same-source',provenance:{originalSha256:'a'.repeat(64),params:{quality:99,profile:'manual',histogramLow:30,histogramHigh:900,shadow:50,highlight:50}},data:{width,height,regionColors:[],metadata:{energy:{quantiles:[.03,.9],thresholds:[5,5]}}},planeSurfaces:Object.fromEntries(['energy_scope','energy_high_score','energy_low_score'].map(name=>[name,{id:name,revision:4,width,height,format:name==='energy_scope'?'int32':'float32'}]))};}
const plan=(a,side,availableBytes=Number.MAX_SAFE_INTEGER,extra={})=>admitEnergySurfacePreview(a,view,{preview:{maxWidth:side,maxHeight:side},memory:{policyAvailableBytes:availableBytes,knownHeapCapacityBytes:64*MiB},rgbBudgetReserved:true,...extra});
test('a one MiB deficit selects the largest admitted proportional side without changing scientific inputs',()=>{
 const a=analysis(),before=structuredClone(a),full=plan(a,4096),available=full.requiredBytes-MiB,actual=plan(a,4096,available);assert(actual.maxSide<4096);assert(actual.requiredBytes<=available);assert(plan(a,actual.maxSide+1).requiredBytes>available);assert.equal(actual.constrainedByMemory,true);assert.equal(actual.reason,'memory-capacity');assert.deepEqual(a,before);assert.equal(actual.requiredBytes,actual.frameLeaseBytes+actual.knownHeapBytes+actual.legacyWindowBytes);
});
test('the full requested side is unchanged when indispensable legacy workspace fits exactly',()=>{
 const a=analysis(8191,6023),full=plan(a,4011),actual=plan(a,4011,full.requiredBytes);assert.equal(actual.maxSide,4011);assert.equal(actual.constrainedByMemory,false);assert.equal(actual.batch,false);assert.equal(actual.requiredBytes,full.requiredBytes);
});
test('the optional direct sampler cannot force a lower grid when only its additional workspace is unavailable',()=>{
 const a=analysis(5000,6000),full=plan(a,2048),actual=plan(a,2048,full.requiredBytes+1);assert.equal(actual.maxSide,2048);assert.equal(actual.constrainedByMemory,false);assert(actual.samplerBytes>4*actual.numericPixels);assert(actual.directRequiredBytes>actual.availableBytes);assert.equal(actual.directSamplingAdmitted,false);
});
test('optional transport does not consume the already admitted direct sampler margin',()=>{
 const a=analysis(5000,6000),full=plan(a,2048),sampler=numericPlaneSamplePlan(a.planeSurfaces.energy_scope,{sourceWidth:5000,sourceHeight:6000,width:full.paneWidth,height:full.height,centers:true}),available=full.frameLeaseBytes+64*MiB+sampler.requiredBytes+1024,actual=plan(a,2048,available);assert.equal(actual.maxSide,2048);assert.equal(actual.directSamplingAdmitted,true);assert.equal(actual.batch,false);assert(actual.directRequiredBytes<=available);assert(actual.peakBytes<=available);
});
test('a legal sixteen Mi-point square stays legacy at the same resolution instead of inheriting the optional eight Mi-point cap',()=>{
 const a=analysis(8192,8192),full=plan(a,4096),actual=plan(a,4096,full.requiredBytes);assert.equal(actual.paneWidth,4096);assert.equal(actual.height,4096);assert.equal(actual.numericPixels,4096**2);assert.equal(actual.maxSide,4096);assert.equal(actual.directSamplingAdmitted,false);assert.equal(actual.directDecline,'output-bound');assert.equal(actual.samplerBytes,0);assert.equal(actual.constrainedByMemory,false);
});
test('a complete native band is a separate admitted point and final calls are never reduced',()=>{
 const a=analysis(1080,720),native=plan(a,1080),actual=plan(a,1080,native.requiredBytes);assert.equal(actual.maxSide,1080);assert.equal(actual.sampled,false);assert.equal(actual.directDecline,'native-bands');const final=admitEnergySurfacePreview(a,view,{memory:{policyAvailableBytes:0,knownHeapCapacityBytes:0}});assert.equal(final.reason,'native-final');assert.equal(final.maxSide,null);assert.equal(final.constrainedByMemory,false);
});
test('sampled admission below a failed native point is still evaluated against its own larger scratch',()=>{
 const a=analysis(1080,720),available=64*MiB+80*1024,actual=plan(a,1080,available);assert.equal(actual.sampled,true);assert(actual.maxSide<1080);assert(actual.requiredBytes<=available);assert(plan(a,actual.maxSide+1).requiredBytes>available);
});
test('Both has a legal minimum side and RGB consumer ownership is counted exactly once',()=>{
 const a=analysis(8000,6000),both={...view,field:'both'},options={preview:{maxWidth:2048,maxHeight:2048},memory:{policyAvailableBytes:1024*MiB,knownHeapCapacityBytes:32*MiB}},reserved=admitEnergySurfacePreview(a,both,{...options,rgbBudgetReserved:true}),owned=admitEnergySurfacePreview(a,both,{...options,rgbBudgetReserved:false});assert.equal(owned.frameLeaseBytes-reserved.frameLeaseBytes,reserved.frameBytes);assert.equal(owned.requiredBytes-reserved.requiredBytes,reserved.frameBytes);assert(reserved.width<=2048);assert.throws(()=>admitEnergySurfacePreview(a,both,{...options,preview:{maxWidth:1,maxHeight:1}}),{code:'INVALID_INPUT'});
});
test('impossible memory rejects before computation; unknown memory and excluded owners keep their prior path',()=>{
 const a=analysis(),before=structuredClone(a);assert.throws(()=>plan(a,4096,0),{code:'MEMORY_LIMIT'});assert.deepEqual(a,before);assert.equal(plan(a,4096,undefined,{memory:{}}).reason,'memory-unavailable');const contiguous={...a,planeSurfaces:null},context={...a,data:{...a.data,contexts:[]}};for(const owner of [contiguous,context]){const p=plan(owner,4096,0);assert.equal(p.applicable,false);assert.equal(p.maxSide,4096);}
});
test('score views, including Both, reserve no unused biome palette and preserve exact RGB',async()=>{
 const width=80,height=80,n=width*height,budget=new Budget(MiB),native={width,height,energy_scope:new Int32Array(n).fill(1),energy_high_score:new Float32Array(n).fill(.8),energy_low_score:new Float32Array(n).fill(.2),regionColors:new Array(1000000)},a=analysis(width,height);a.data.regionColors=native.regionColors;const reservations=[],leases=new Map(),engine={async reserveExternalMemory({bytes}){reservations.push(bytes);const id=crypto.randomUUID();leases.set(id,budget.reserve(bytes));return{id};},async releaseExternalMemory(id){leases.get(id)();leases.delete(id);},async readPlane({surfaceId,rect}){const input=native[surfaceId],data=new input.constructor(rect.width*rect.height);for(let y=0;y<rect.height;y++)data.set(input.subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);return{plane:{width:rect.width,height:rect.height,data}};}},source={width,height,readPixels(){throw Error('score maps do not read Original');}};
 for(const field of ['high','both']){const p={...view,field},preview={maxWidth:40,maxHeight:40},actual=await renderEnergySurface(a,source,p,{engine,preview,rgbBudgetReserved:true}),expected=await renderEnergy(native,{width,height},p,{preview});assert.deepEqual(actual.data,expected.data);assert(reservations.at(-1)<MiB);assert.equal(budget.total(),0);}
 const many=plan(a,40),none=plan({...a,data:{...a.data,regionColors:[]}},40);assert.equal(many.frameLeaseBytes,none.frameLeaseBytes);const retained=energySurfaceWorkingBytes({width,height,paneWidth:40,outputHeight:40,fieldCount:1,sampled:true,paletteEntries:100,needsSource:true}),empty=energySurfaceWorkingBytes({width,height,paneWidth:40,outputHeight:40,fieldCount:1,sampled:true,paletteEntries:0,needsSource:true});assert.equal(retained-empty,100*128,'biome labels/overlay palette allowance remains intact');
});
