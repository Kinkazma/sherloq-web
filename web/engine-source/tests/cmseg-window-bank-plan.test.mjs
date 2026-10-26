import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {planCmsegWindowBank,packCmsegWindowFeatures,cmsegWindowCoordinate} from '../src/cmseg-window-bank-plan.js';
import {prepareSegmentationScientificMask} from '../src/segmentation-scientific-scope.js';
const sha='c'.repeat(64),MiB=1024**2;
async function domain(width,height,zones){
 const s=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 if(zones)await s.replaceZones(zones,{positiveMode:'selected',enabled:true});
 return compileOriginalSourceRegions(s.snapshot());
}
const zone=(id,bounds,kind='acquisition')=>({id,kind,enabled:true,x0:bounds[0],y0:bounds[1],x1:bounds[2],y1:bounds[3],polygon:[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]]});
const window=(contextDomain,candidateDomain=contextDomain)=>({id:'human-arbitrary-name',fingerprint:contextDomain.fingerprint+'/'+candidateDomain.fingerprint,contextDomain,candidateDomain});
for(const side of [128,64,32])test('CMSeg '+side+' one complete context retains exact native coordinates, cells, channels and TopK',async()=>{
 const d=await domain(96,72),b=new Budget(32*MiB),p=await planCmsegWindowBank({window:window(d),contexts:[{id:'actual-context',bounds:[0,0,96,72]}],side},{budget:b});
 try{
  assert.equal(p.admitted,side*side);assert.equal(p.mask.every(v=>v===1),true);
  assert.equal(p.channels,side===128?24:side===64?32:96);assert.equal(p.k,p.channels);
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){assert.equal(p.positions[y*side+x],x);assert.equal(p.positions[p.count+y*side+x],y);}
 }finally{p.release();p.release();assert.equal(b.total(),0);}
});
test('A true candidate hole inside one coarse cell is rejected even when its four corners remain admitted',async()=>{
 const c=await domain(512,512),a=await domain(512,512,[zone('selected',[0,0,512,512]),zone('one-pixel-hole',[5,5,6,6],'exclusion')]),b=new Budget(32*MiB);
 assert.equal(a.containsOriginal(5,5),false);for(const [x,y]of [[2,2],[6,2],[2,6],[6,6]])assert.equal(a.containsOriginal(x,y),true);
 const p=await planCmsegWindowBank({window:window(c,a),contexts:[{bounds:[0,0,512,512]}],side:128},{budget:b});
 try{assert.equal(p.mask[1*128+1],0);assert.equal(p.mask[100*128+100],1);assert.ok(p.admitted>0&&p.admitted<p.count);assert.equal(p.contextFingerprint,c.fingerprint);assert.equal(p.candidateFingerprint,a.fingerprint);}
 finally{p.release();assert.equal(b.total(),0);}
});
test('Disjoint literal contexts cover only their canonical union; positions keep Original spacing and translation invariance',async()=>{
 const b=new Budget(64*MiB),bounds=[[4,3,20,19],[28,7,44,23]],offset=[9,11];
 const d=await domain(60,50,bounds.map((r,i)=>zone(String(i),r))),shifted=bounds.map(r=>r.map((v,i)=>v+offset[i%2])),t=await domain(80,70,shifted.map((r,i)=>zone(String(i),r)));
 const p=await planCmsegWindowBank({window:window(d),contexts:bounds.map(bounds=>({bounds})),side:32},{budget:b});
 const q=await planCmsegWindowBank({window:window(t),contexts:shifted.map(bounds=>({bounds})),side:32},{budget:b});
 try{assert.deepEqual(q.positions,p.positions);assert.deepEqual(q.mask,p.mask);assert.equal(p.count,2*32**2);assert.equal(p.admitted,p.count);assert.notEqual(p.positions[32**2],0,'Second context is spatially distinct, not another zero-origin image');assert.ok(p.positions[32**2]>p.positions[31]);}
 finally{p.release();q.release();assert.equal(b.total(),0);}
});
test('Overlapping input contexts and an invented RGB gap are refused before any feature tensor exists',async()=>{
 const d=await domain(60,40,[zone('left',[4,3,20,19]),zone('right',[28,7,44,23])]),b=new Budget(32*MiB);
 for(const contexts of [[{bounds:[4,3,44,23]}],[{bounds:[4,3,20,19]},{bounds:[4,3,20,19]},{bounds:[28,7,44,23]}]])await assert.rejects(planCmsegWindowBank({window:window(d),contexts,side:32},{budget:b}));
 assert.equal(b.total(),0);
});
test('Native FP32 feature bits are packed channel-major once per context and originals stay immutable',async()=>{
 const d=await domain(32,16),b=new Budget(32*MiB),p=await planCmsegWindowBank({window:window(d),contexts:[{bounds:[0,0,16,16]},{bounds:[16,0,32,16]}],side:32},{budget:b}),features=p.contexts.map((c,i)=>({shape:[1,96,32,32],data:Float32Array.from({length:96*32**2},(_,j)=>j===0?-0:Math.fround(Math.sin(j*.1+i)))})),original=features.map(f=>new Uint32Array(f.data.buffer).slice());
 const packed=packCmsegWindowFeatures(p,features,{budget:b});
 try{
  const bits=new Uint32Array(packed.input.buffer);
  for(const c of p.contexts)for(let channel=0;channel<p.channels;channel++)assert.deepEqual(bits.subarray(channel*p.count+c.offset,channel*p.count+c.offset+c.count),original[c.index].subarray(channel*c.count,(channel+1)*c.count));
  for(let i=0;i<features.length;i++)assert.deepEqual(new Uint32Array(features[i].data.buffer),original[i]);
 }finally{packed.release();packed.release();p.release();assert.equal(b.total(),0);}
});
test('Malformed grids, insufficient bytes, abort and retired plans never publish a substitute bank',async()=>{
 const d=await domain(16,16),b=new Budget(32*MiB),args={window:window(d),contexts:[{bounds:[0,0,16,16]}],side:32},p=await planCmsegWindowBank(args,{budget:b});
 assert.throws(()=>packCmsegWindowFeatures(p,[{data:new Float32Array(96*32**2),shape:[1,96,31,32]}],{budget:b}));
 const held=b.total();assert.equal(held>0,true);const f={data:new Float32Array(96*32**2),shape:[1,96,32,32]},small=new Budget(f.data.byteLength-1);assert.throws(()=>packCmsegWindowFeatures(p,[f],{budget:small}));assert.equal(small.total(),0);
 p.release();assert.throws(()=>packCmsegWindowFeatures(p,[f],{budget:b}));assert.equal(b.total(),0);
 await assert.rejects(planCmsegWindowBank(args,{budget:new Budget(1)}));const controller=new AbortController();controller.abort();await assert.rejects(planCmsegWindowBank(args,{budget:b,signal:controller.signal}));assert.equal(b.total(),0);
 for(const side of [16,48,256])await assert.rejects(planCmsegWindowBank({...args,side},{budget:b}));assert.equal(b.total(),0);
});
test('Coordinates derive from native input centres rather than concatenation indices or context names',()=>{
 assert.equal(cmsegWindowCoordinate(0,32,16,16,0,32),Math.fround(((16*512+.5*16)/32-.5)/16));
 assert.equal(cmsegWindowCoordinate(31,32,7,29,7,29),31);
 assert.throws(()=>cmsegWindowCoordinate(32,32,0,32,0,32));
});
