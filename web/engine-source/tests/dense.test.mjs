import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DENSE_PROFILES,densePassPlan,denseScaleBins,denseSearchContexts} from '../src/dense-profiles.js';
import {createDenseMath,denseDescriptorShape,canonicalDenseSift,normalizeDense} from '../src/dense-math.js';

test('six native profiles preserve base duo and append scale/reflection hypotheses',()=>{
 const plans=DENSE_PROFILES.map(p=>densePassPlan(p,{width:200,height:180}));
 assert.deepEqual(plans.map(p=>p.passes.length),[1,1,2,6,4,11]);
 assert.deepEqual(plans[5].bins,[6,8,10,12]);
 assert.deepEqual(plans[5].passes.map(p=>[p.method,p.targetPatch,p.quarterTurn,p.reflection]),[
  [0,8,false,false],[1,8,false,false],[1,6,true,false],[1,8,true,false],[1,10,true,false],[1,12,true,false],
  [0,8,false,true],[1,8,true,true],[1,6,true,true],[1,10,true,true],[1,12,true,true],
 ]);
 assert.deepEqual(denseScaleBins(4,100,100),[4,6]); // ties -0.5/+0.5 round to even
 assert.deepEqual(denseScaleBins(8,30,30),[6,8]);
 assert.deepEqual(denseScaleBins(31,200,200),[23,31]);
});

test('ROI identity survives coincident and overlapping polygons, with owned coordinates',()=>{
 const p=[[0,0],[20,0],[20,20],[0,20]],contexts=denseSearchContexts([p,p]);
 assert.notEqual(contexts[0].id,contexts[1].id);assert.deepEqual(contexts.map(c=>c.pairSearchRegion),[0,1]);
 p[0][0]=99;assert.equal(contexts[0].regions[0][0][0],0);
 assert.equal(denseSearchContexts([p,p],true)[0].pairSearchRegion,-1);
 assert.equal(denseSearchContexts()[0].id,'global:0');
 assert.throws(()=>denseSearchContexts([p],true),/two zones/);
});

test('support and normalization preserve descriptor grids and zero vectors',()=>{
 assert.deepEqual(denseDescriptorShape(43,37,1,3),{width:34,height:28,dimensions:128,shift:4.5});
 assert.throws(()=>denseDescriptorShape(24,40,1,8),/Invalid/);
 assert.deepEqual(normalizeDense(new Float32Array(12),12),new Float32Array(12));
 const values=new Float32Array(128);values[2]=1;
 assert.equal(canonicalDenseSift(values)[0],0); // straight-edge ambiguity is excluded
 assert.equal(values.reduce((a,b)=>a+b),1);
});

test('real WASM respects masks, distances, deterministic candidate pools and empty outcome',async()=>{
 const kernel=await createDenseMath({print:()=>{}}),width=19,height=13,n=width*height;
 const values=new Float32Array(n*12),mask=new Uint8Array(n);
 for(let i=0;i<n;i++){mask[i]=i%width<9?1:2;for(let k=0;k<12;k++)values[i*12+k]=Math.fround(((i*31+k*17)%131)/131);}
 mask[30]=0;
 const options={compare:true,minimum:4,radius:11,iterations:3};
 const a=kernel.field(values,values,mask,width,height,options);
 assert.deepEqual(a,kernel.field(values,values,mask,width,height,{...options,bounded:false}));
 for(let i=0;i<n;i++){
  const j=a.targets[i];if(j<0){assert.equal(a.distancesSquared[i],Infinity);continue;}
  assert.ok(mask[i]&&mask[j]&&mask[i]!==mask[j]);
  const d=Math.hypot(i%width-j%width,Math.floor(i/width)-Math.floor(j/width));assert.ok(d>=4&&d<=11);
 }
 const empty=kernel.field(values,values,new Uint8Array(n),width,height,options);
 assert.ok(empty.targets.every(v=>v===-1));assert.equal(empty.comparisons,0n);
 assert.throws(()=>kernel.field(values,values,mask,width,height,{signal:{aborted:true}}),e=>e.code==='CANCELLED');
 assert.throws(()=>kernel.field(values,values,mask,width,height,{radius:2,minimum:4}),e=>e.code==='INVALID_INPUT');
});

const {sampleDenseLinks,alignDenseSupports}=await import('../src/dense-links.js');
test('reciprocal links deduplicate by distance and source tie, then sample native ranks',()=>{
 const targets=new Int32Array([1,0,3,2,5,4,7,6,9,8,-1]);
 const squared=new Float32Array([.1,.1,.3,.2,.1,.4,.2,.2,.4,.3,Infinity]);
 const selected=new Uint8Array(targets.length).fill(1);
 assert.deepEqual(sampleDenseLinks(targets,squared,selected,20),{rows:new Int32Array([0,3,4,6,9]),total:5});
 assert.deepEqual(sampleDenseLinks(targets,squared,selected,3).rows,new Int32Array([0,4,9]));
 assert.deepEqual(sampleDenseLinks(targets,squared,selected,1).rows,new Int32Array([0]));
});
test('paired SIFT supports use integer centers and preserve reflected target order',()=>{
 const first=new Float32Array(10*8*128);for(let i=0;i<first.length;i++)first[i]=i;
 const target=new Float32Array(4*2*128).fill(9);
 const actual=alignDenseSupports({width:10,height:8,dimensions:128,first},{width:4,height:2,dimensions:128,second:target},4,6);
 assert.equal(actual.shift,9);assert.equal(actual.width,4);assert.equal(actual.height,2);assert.equal(actual.second,target);
 assert.equal(actual.first[0],(3*10+3)*128);assert.equal(actual.first[4*128],(4*10+3)*128);
 assert.throws(()=>alignDenseSupports({}, {}, 3,4),/equal parity/);
});
test('coherence evaluates all pixels, rejects incomplete disks and removes small components',async()=>{
 const kernel=await createDenseMath({print:()=>{}}),w=31,h=21,n=w*h;
 const targets=Int32Array.from({length:n},(_,i)=>i%w<w-5?i+5:-1),squared=new Float32Array(n).fill(.01);
 const {selected,errors}=kernel.coherence(targets,squared,w,h,{radius:2,errorThreshold:0,minimum:6});
 assert.equal(selected[10*w+10],1);assert.equal(errors[10*w+10],0);assert.equal(selected[0],0);
 assert.equal(selected[10*w+w-3],0);
 const removed=kernel.coherence(targets,squared,w,h,{radius:2,errorThreshold:0,minimum:n});
 assert.ok(removed.selected.every(v=>v===0));
});

const {denseCrop,denseDistancePolicy,denseCompactAxes}=await import('../src/dense-regions.js');
const {denseImageParams,denseImageJobs}=await import('../src/dense-image.js');
test('image jobs retain overlapping contexts and native crop halo and distance compaction',()=>{
 const a=[[2,3],[12,3],[12,15],[2,15]],b=[[32,3],[42,3],[42,15],[32,15]];
 assert.deepEqual(denseCrop(90,80,[a],3),{x:0,y:0,width:22,height:25});
 const policy=denseDistancePolicy({auto:true,compact:true},[a,b],true);
 assert.deepEqual(policy.gap,[19,0]);assert.equal(policy.radius,Math.sqrt(21**2+12**2));
 const axes=denseCompactAxes(90,80,[a,b]);assert.equal(axes[0][12],10);assert.equal(axes[0][32],11);
 const p=denseImageParams({profile:DENSE_PROFILES[2],regions:[a,a],patch:3,texture:0});
 const result=denseImageJobs({width:90,height:80,data:new Uint8Array(90*80*3)},p);
 assert.equal(result.jobs.length,4);assert.deepEqual(result.jobs.map(j=>j.context.id),['roi:0','roi:1','roi:0','roi:1']);
 assert.throws(()=>denseImageParams({unknown:1}),/Unknown/);
});
