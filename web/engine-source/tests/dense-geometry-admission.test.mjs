import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {verifyDenseEvidence} from '../src/dense-postprocess.js';
import {packDenseCorrespondences} from '../src/dense-correspondences.js';
import {pairedBiomes} from '../src/copy-biomes.js';
import {verifyCopyGeometry,createGeometryKernel} from '../src/copy-geometry.js';
import {copyPalette} from '../src/copy-subbiomes.js';
const MiB=1024**2,turn=()=>new Promise(resolve=>setImmediate(resolve));
const geometry={pairedBiomes,verifyCopyGeometry,createGeometryKernel,copyPalette};
function fixture({mirror=false,surface=false}={}){
 const width=20,height=10,rows=Int32Array.of(21,22,23,41,42,43),targets=new Int32Array(width*height).fill(-1),distancesSquared=new Float32Array(width*height).fill(Infinity);
 for(const row of rows){targets[row]=mirror?Math.floor(row/width)*width+19-row%width:row+8;distancesSquared[row]=.04;}
 const pass={id:'base',method:0,patch:3,targetPatch:3,algorithm:'Zernike',stage:mirror?'mirror':'base',reflection:mirror,requireReflection:mirror,requireTransform:mirror,descriptorFrame:'original'},field={width,height,targets,distancesSquared,allowed:new Uint8Array(width*height).fill(1),displayRows:rows,shift:0,context:{origin:[0,0],pairSearchRegion:0},pass,uniqueLinks:6,comparisons:128n};
 const evidence={fields:[field],params:{coherence:true,compact:false,compare:false,regions:[],guides:mirror?[[[0,0],[5,0],[5,9],[0,9]],[[14,0],[19,0],[19,9],[14,9]]]:[],minimum:1,threshold:.3},profile:{passes:[pass],bins:[3],profile:'PatchMatch Zernike'+(mirror?' + Mirror':'')},distancePolicy:{gap:[0,0]}},image={width,height,...(surface?{surface:{descriptor:{id:'geometry-test',format:'rgb8',width,height}}}:{data:new Uint8Array(width*height*3)})};return {evidence,image};
}
async function directReference(evidence,image){
 const budget=new Budget(512*MiB),releases=[],reserveMemory=n=>{const release=budget.reserve(n);releases.push(release);return release;};let packed,kernel;
 try{packed=await packDenseCorrespondences(evidence,image,{budget});kernel=await createGeometryKernel({reserveMemory});const p=packed.passes[0],groups=await pairedBiomes(p.points,p.pairs,3,{reserveMemory,pairSearchRegions:p.pairSearchRegions}),fitted=await verifyCopyGeometry(p.points,p.pairs,groups,{model:'Similarity',threshold:1,minimum:4,kernel,reserveMemory});return {points:p.points,pairs:p.pairs,...fitted,...copyPalette(fitted.groups,p.pairs,.3,{reserveMemory})};}
 finally{kernel?.dispose();packed?.release();for(const release of releases)release();assert.equal(budget.total(),0);}
}

test('dense geometry waits behind all D2 CPUs, declares phases and retains exact native results',{timeout:5000},async()=>{
 const budget=new Budget(512*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),holder=await scheduler.acquire({cpu:2,resourceOwner:'d2prl',label:'d2prl/tiles'}),{evidence,image}=fixture(),parent=budget.beginOperation({owner:'patchmatch',id:'public-patchmatch'});let calls=0,result;
 const adapter={...geometry,pairedBiomes(...args){calls++;assert.equal(scheduler.snapshot().labels['dense-geometry/biomes'].activeCpu,1);return pairedBiomes(...args);},verifyCopyGeometry(...args){assert.equal(scheduler.snapshot().labels['dense-geometry/fit'].activeCpu,1);return verifyCopyGeometry(...args);},copyPalette(...args){assert.equal(scheduler.snapshot().labels['dense-geometry/assembly'].activeCpu,1);return copyPalette(...args);}};
 const run=verifyDenseEvidence(evidence,image,{budget,geometry:adapter,tolerance:3,geometricThreshold:1,geometricMinimum:4,resourceOperation:parent});
 try{
  await turn();assert.equal(calls,0);assert.equal(budget.total(),0,'Packing must not allocate before CPU admission');const ops=budget.resourceSnapshot().operations,queued=ops.find(op=>op.id==='dense-geometry/correspondences');assert.equal(queued.state,'queued');assert.deepEqual(queued.dependencies,['owner:d2prl']);assert.equal(ops.find(op=>op.id==='dense-geometry').state,'waiting-child');
  holder.release();result=await run;const expected=await directReference(evidence,image);for(const key of ['points','pairs','groups','models','colors','bases'])assert.deepEqual(result[key],expected[key],key);assert.equal(result.models.length,1);assert.equal(result.dense_consistent_count,6);assert.equal(result.candidate_comparisons,128n);assert.equal(calls,1);
  assert.equal(scheduler.snapshot().active.cpu,0);assert.equal(budget.resourceSnapshot().operations.length,1);assert.ok(budget.total()>0,'Delivered output keeps its own memory');
 }finally{holder.release();result?.release();await run.catch(()=>{});parent.release();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('cancelling geometry queued behind D2 does no native work and returns its tickets',{timeout:3000},async()=>{
 const budget=new Budget(512*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),holder=await scheduler.acquire({cpu:1,resourceOwner:'d2prl'}),controller=new AbortController(),{evidence,image}=fixture();let created=0;
 const run=verifyDenseEvidence(evidence,image,{budget,geometry:{...geometry,createGeometryKernel(){created++;throw Error('Cancelled native startup');}},signal:controller.signal}),rejected=assert.rejects(run,{code:'CANCELLED'});
 await turn();controller.abort();await rejected;assert.equal(created,0);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(scheduler.snapshot().queued,0);assert.equal(scheduler.snapshot().active.cpu,1);holder.release();
});

test('one-core mirror geometry admits its paged guide child and coalesces inline without nested CPU admission',{timeout:3000},async()=>{
 const budget=new Budget(128*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),{evidence,image}=fixture({mirror:true,surface:true});let fits=0,result;
 const adapter={
  createGeometryKernel:async()=>({dispose(){}}),
  pairedBiomes:async()=>[Uint32Array.of(0,1,2),Uint32Array.of(3,4,5)],
  verifyCopyGeometry:async(points,pairs,groups)=>{fits++;assert.equal(scheduler.snapshot().active.cpu,1);return {groups,models:groups.map(group=>({matrix:[[-1,0,19],[0,1,0],[0,0,1]],source_point_indices:Array.from(group,row=>pairs[row*4]),destination_point_indices:Array.from(group,row=>pairs[row*4+1]),inliers:group.length}))};},copyPalette
 };
 try{result=await verifyDenseEvidence(evidence,image,{budget,geometry:adapter,geometricMinimum:4});assert.equal(fits,2);assert.equal(result.groups.length,1);assert.equal(result.groups[0].length,6);assert.deepEqual(result.models[0].source_panels,[1,2]);assert.equal(result.models[0].merged_fragments,2);assert.equal(scheduler.snapshot().labels['dense-guide-labels'].completed,1);assert.equal(scheduler.snapshot().peakCpu,1);assert.equal(budget.resourceSnapshot().operations.length,0);}finally{result?.release();}
 assert.equal(budget.total(),0);
});

test('geometry phase failure preserves borrowed evidence and retires scratch, native owners and CPU',{timeout:3000},async()=>{
 const budget=new Budget(512*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),{evidence,image}=fixture(),before=evidence.fields[0].targets.slice();let disposed=0;
 const adapter={...geometry,createGeometryKernel:async({reserveMemory})=>{reserveMemory(1024);return {dispose(){disposed++;}};},verifyCopyGeometry:async(points,pairs,groups,{reserveMemory})=>{reserveMemory(256);throw Error('fit failed');}};
 await assert.rejects(verifyDenseEvidence(evidence,image,{budget,geometry:adapter}),/fit failed/);assert.equal(disposed,1);assert.deepEqual(evidence.fields[0].targets,before);assert.equal(budget.total(),0);assert.equal(scheduler.snapshot().active.cpu,0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('a small geometry budget fails admission without losing borrowed fields or leaving a live producer',async()=>{
 const budget=new Budget(16*MiB),{evidence,image}=fixture(),before=evidence.fields[0].distancesSquared.slice();
 await assert.rejects(verifyDenseEvidence(evidence,image,{budget,geometry,resourceOperation:null}),error=>error.code==='MEMORY_LIMIT'&&error.details.requestedBytes===264*MiB);
 assert.deepEqual(evidence.fields[0].distancesSquared,before);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
});

test('cancel after a validated geometry pass prevents assembly and releases its owned work',async()=>{
 const budget=new Budget(512*MiB),{evidence,image}=fixture(),controller=new AbortController();let palettes=0;
 const adapter={...geometry,copyPalette(...args){palettes++;return copyPalette(...args);}};
 await assert.rejects(verifyDenseEvidence(evidence,image,{budget,geometry:adapter,tolerance:3,geometricThreshold:1,geometricMinimum:4,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});
 assert.equal(palettes,0);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
});
