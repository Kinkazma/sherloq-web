import{test}from'node:test';import assert from'node:assert/strict';
import{comparisonFixture}from'./helpers/comparison-domain-fixture.mjs';
import{createComparisonDomainPair}from'../src/comparison-domain-pair.js';
import{comparisonDomainBasic}from'../src/comparison-domain-basic.js';
import{comparisonBasic}from'../src/comparison.js';
test('both actual source identities share the same Original membership and exact native observation order',async()=>{
 const f=await comparisonFixture({exclusions:[[11,13,15,17]]}),p=await createComparisonDomainPair(f.original,f.reference,f.domain.descriptor,{budget:f.budget});try{assert.equal(p.referenceDomain.sourceSha256,f.reference.sha256);assert.equal(p.domain.sourceSha256,f.original.sha256);assert.notEqual(p.domain.fingerprint,p.referenceDomain.fingerprint);for(let y=0;y<p.domain.height;y++)assert.deepEqual(p.domain.rowIntervals(y),p.referenceDomain.rowIntervals(y));for(let side=0;side<2;side++){const expected=f.selected(side?f.second:f.first),actual=new Uint8Array(expected.length);for(let at=0;at<p.certificate.observations;at+=37){const n=Math.min(37,p.certificate.observations-at),window=await p.images[side].surface.readWindow({x:0,y:at,width:1,height:n});try{actual.set(window.pixels.data,at*3);}finally{window.release();}}assert.deepEqual(actual,expected);}for(const span of p.spans)assert.equal(p.offsetOf(span.x,span.y),span.offset);assert.equal(f.budget.snapshot().activeReservationBytes,0);}finally{p.dispose();assert.equal(f.budget.total(),0);}
});
test('unequal Original grids are rejected even if a tempting derived crop has the same dimensions',async()=>{
 const f=await comparisonFixture(),wrong={...f.reference,surface:{...f.reference.surface,descriptor:{...f.reference.surface.descriptor,width:56,height:26}}};await assert.rejects(createComparisonDomainPair(f.original,wrong,f.domain.descriptor,{budget:f.budget}),{code:'INVALID_INPUT'});assert.equal(f.reads,0);assert.equal(f.budget.total(),0);
});
test('grayscale union measures exactly match the native basic formula on all admitted observations',async()=>{
 const f=await comparisonFixture({exclusions:[[11,13,15,17]]}),p=await createComparisonDomainPair(f.original,f.reference,f.domain.descriptor,{budget:f.budget});try{const actual=await comparisonDomainBasic(p,{blockPixels:31}),a=f.selected(f.first),b=f.selected(f.second),expected=await comparisonBasic({width:1,height:a.length/3,data:a},{width:1,height:b.length/3,data:b});assert.deepEqual(actual,expected);}finally{p.dispose();assert.equal(f.budget.total(),0);}
});
test('RMSE and PSNR use sufficient statistics, not an unweighted mean of rectangle scores',async()=>{
 const width=48,height=16,a=new Uint8Array(width*height*3).fill(100),b=a.slice();for(let y=0;y<height;y++)for(let x=0;x<32;x++)for(let c=0;c<3;c++)b[(y*width+x)*3+c]=120;
 const f=await comparisonFixture({width,height,rectangles:[[0,0,32,16],[40,0,44,16]],firstData:a,secondData:b}),p=await createComparisonDomainPair(f.original,f.reference,f.domain.descriptor,{budget:f.budget});try{const r=await comparisonDomainBasic(p);assert.equal(r.values.rmse,Math.sqrt(512*400/576));assert.notEqual(r.values.rmse,10);assert.equal(r.values.psnr,10*Math.log10(255**2/(512*400/576)));}finally{p.dispose();}
});
test('empty, tampered and insufficient-budget domains fail without RGB reads or owner leaks',async()=>{
 for(const change of['hash','budget']){const f=await comparisonFixture({budgetBytes:change==='budget'?1024:1024**2}),original=change==='hash'?{...f.original,sha256:'b'.repeat(64)}:f.original;await assert.rejects(createComparisonDomainPair(original,f.reference,f.domain.descriptor,{budget:f.budget}));assert.equal(f.reads,0);assert.equal(f.budget.total(),0);}
});
test('a successful old request signal cannot poison later observation reads, and disposal rejects new reads',async()=>{
 const f=await comparisonFixture(),old=new AbortController(),p=await createComparisonDomainPair(f.original,f.reference,f.domain.descriptor,{budget:f.budget,signal:old.signal});old.abort();const part=await p.images[0].surface.readWindow({x:0,y:0,width:1,height:7},{signal:new AbortController().signal});part.release();p.dispose();await assert.rejects(p.images[0].surface.readWindow({x:0,y:0,width:1,height:7}),{code:'CANCELLED'});assert.equal(f.budget.total(),0);
});
test('cache identity accepts stable imported reference owners but never an equal-looking replacement surface',async()=>{
 const f=await comparisonFixture(),pair=await createComparisonDomainPair(f.original,f.reference,f.domain.descriptor,{budget:f.budget});try{assert.equal(pair.matches(f.original,{id:'reference',...f.reference},f.domain),true);assert.equal(pair.matches(f.original,{...f.reference,surface:{...f.reference.surface}},f.domain),false);assert.equal(pair.matches(f.original,{...f.reference,sha256:'b'.repeat(64)},f.domain),false);}finally{pair.dispose();assert.equal(f.budget.total(),0);}
});
