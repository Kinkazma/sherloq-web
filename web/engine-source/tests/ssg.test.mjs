import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ssgBesselJ,ssgMomentBasis,ssgDescribePatch,ssgSamplePatch,ssgWordDescriptors,ssgMatchWords,ssgMatchPhrases,ssgSalienceWeights,ssgFilterMatches,ssgParams,requireSsgDetectorDependencies,SSG_REFERENCE} from '../src/ssg.js';

const fixtures=JSON.parse(await readFile(new URL('./ssg-moments.json',import.meta.url),'utf8'));
const close=(actual,expected,relative=2e-9,absolute=2e-7)=>{assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=absolute+relative*Math.abs(expected[i]),`entry ${i}: ${actual[i]} versus ${expected[i]}`);};
const basis=ssgMomentBasis();
const features=(points,values)=>{const count=points.length/3;return {points:Float64Array.from(points),magnitudes:new Float64Array(count*4),invariants:Float64Array.from(Array.from({length:count*24},(_,i)=>values[Math.floor(i/24)]??0)),moments:Float64Array.from(Array.from({length:count*24},(_,i)=>i%2?0:1))};};

test('Bessel zeros and basis coefficients agree with independent SciPy reference',()=>{
 for(const root of fixtures.roots)assert.ok(Math.abs(ssgBesselJ(1,root))<2e-10);
 for(const entry of fixtures.basis){const start=(entry.position[0]*20+entry.position[1])*16;close(basis.real.subarray(start,start+16),entry.real,2e-10,1e-10);close(basis.imag.subarray(start,start+16),entry.imag,2e-10,1e-10);}
});
for(const fixture of fixtures.cases)test(`Bessel-Fourier ${fixture.name} descriptor agrees with independent complex SciPy formula`,()=>{
 const actual=ssgDescribePatch(Float64Array.from(fixture.patch),basis);for(const key of ['magnitudes','invariants','moments'])close(actual[key],fixture.expected[key]);
});

test('quarter-turn invariance and reflection conjugation hold for the actual moment descriptors',()=>{
 const patch=Float64Array.from(fixtures.cases.find(x=>x.name==='synthetic-texture').patch),rotated=new Float64Array(400),mirrored=new Float64Array(400);
 for(let y=0;y<20;y++)for(let x=0;x<20;x++){rotated[y*20+x]=patch[x*20+19-y];mirrored[y*20+x]=patch[y*20+19-x];}
 const original=ssgDescribePatch(patch,basis),turn=ssgDescribePatch(rotated,basis),reflection=ssgDescribePatch(mirrored,basis);close(turn.magnitudes,original.magnitudes);close(turn.invariants,original.invariants);close(reflection.magnitudes,original.magnitudes);close(reflection.invariants,Array.from(original.invariants,(v,i)=>i%2?-v:v));
});

test('patch extraction preserves constant levels, rejects boundary crops and never mutates the source',()=>{
 const image={width:55,height:51,gray:new Float64Array(55*51).fill(93)};const before=image.gray.slice();const patch=ssgSamplePatch(image,[26,25,1.7]);close(patch,new Float64Array(400).fill(93));assert.equal(ssgSamplePatch(image,[0,0,1]),null);assert.deepEqual(image.gray,before);
});

test('word extraction preserves source identity while rejecting unusable borders and duplicate frames',async()=>{
 const gray=Float64Array.from({length:80*70},(_,i)=>(i*7)%256),points=Float64Array.from([30,30,1,0,0,1,30,30,1,45,40,.7]);let reserved=0;
 const result=await ssgWordDescriptors({width:80,height:70,gray,points},{},{reserveMemory:n=>reserved+=n});assert.equal(result.count,2);assert.deepEqual(Array.from(result.sourceIndices),[0,3]);assert.ok(reserved>result.points.byteLength+result.invariants.byteLength);assert.equal(points[0],30);assert.equal(gray[40],24);
});

test('I2NN retains two equal true copies instead of treating their equal distance as a failed ratio',async()=>{
 const f=features([0,0,1,200,0,1,400,0,1,700,0,1],[0,0,0,4]);const result=await ssgMatchWords(f);assert.equal(result.pairs.length/2,6);assert.ok(result.tests.every(x=>x==='absolute'));assert.deepEqual(Array.from(result.pairs).sort(),[0,0,1,1,2,2,1,2,0,2,0,1].sort());
});

test('the second absolute neighbor is retained even if the first also satisfies the ratio rule',async()=>{
 const f=features([0,0,1,200,0,1,400,0,1],[0,.0001,.001]);const result=await ssgMatchWords(f);const destinations=[];for(let i=0;i<result.pairs.length;i+=2)if(result.pairs[i]===0)destinations.push(result.pairs[i+1]);assert.deepEqual(destinations,[1,2]);
});

test('spatial exclusion also applies to the second I2NN neighbor; self points cannot be accepted',async()=>{
 const f=features([0,0,1,200,0,1,1,0,1,700,0,1],[0,0,0,4]),result=await ssgMatchWords(f);for(let i=0;i<result.pairs.length;i+=2){assert.notEqual(result.pairs[i],0);assert.notEqual(result.pairs[i],2);assert.notEqual(result.pairs[i],result.pairs[i+1]);assert.ok(Math.abs(f.points[result.pairs[i]*3]-f.points[result.pairs[i+1]*3])>=100);}
});

test('ratio matching and magnitude partition both influence word correspondences',async()=>{
 const f=features([0,0,1,200,0,1,400,0,1],[0,.001,1]);const matched=await ssgMatchWords(f);assert.equal(matched.pairs.length/2,2);f.magnitudes[4]=100;const partitioned=await ssgMatchWords(f);assert.equal(partitioned.pairs.length,0);
});

test('structured-edge salience normalizes into [1,2], handles flat images without NaN and checks coordinates',async()=>{
 const points=Float64Array.from([8,8,1,35,35,1]),edgeMap=new Float32Array(48*48);const flat=await ssgSalienceWeights({edgeMap,width:48,height:48,points});assert.deepEqual(Array.from(flat),[1,1]);edgeMap[8*48+8]=1;const weighted=await ssgSalienceWeights({edgeMap,width:48,height:48,points});close(weighted,[2,1]);await assert.rejects(()=>ssgSalienceWeights({edgeMap,width:48,height:48,points:Float64Array.of(-1,0,1)}),error=>error.code==='INVALID_INPUT');
});

test('phrase max pooling adds neighboring invariants before applying per-point salience',async()=>{
 const f=features([0,0,1,200,0,1,400,0,1,600,0,1],[1,2,4,8]),words={pairs:Uint32Array.from([0,1,2,3])};const result=await ssgMatchPhrases(f,words,{spatialK:1,edgeWeights:Float64Array.from([1,1.2,1.4,2])});close(result.descriptors.subarray(0,24),new Float64Array(24).fill(3));close(result.descriptors.subarray(72),new Float64Array(24).fill(24));assert.deepEqual(Array.from(result.pointIndices),[0,1,2,3]);await assert.rejects(()=>ssgMatchPhrases(f,words,{}),error=>error.code==='INVALID_INPUT');
});

test('displacement density and complex phase remove unsupported correspondences',async()=>{
 const points=[],values=[];for(let i=0;i<8;i++){points.push(i*9,20,1,i*9+200,20,1);values.push(i,i);}const f=features(points,values),pairs=Uint32Array.from(Array.from({length:8},(_,i)=>[i*2,i*2+1]).flat());const filtered=await ssgFilterMatches(f,{pairs},{width:800,height:600});assert.equal(filtered.pairs.length,pairs.length);assert.ok(filtered.clusters.every(x=>x===1));f.moments.fill(0);const undefinedPhase=await ssgFilterMatches(f,{pairs},{width:800,height:600});assert.equal(undefinedPhase.pairs.length,0);
});

test('empty cores and cancelled extraction settle without creating scientific success',async()=>{
 const f=features([],[]);assert.equal((await ssgMatchWords(f)).pairs.length,0);assert.equal((await ssgMatchPhrases(f,{pairs:new Uint32Array()},{edgeWeights:new Float64Array()})).pairs.length,0);assert.equal((await ssgFilterMatches(f,{pairs:new Uint32Array()},{width:1,height:1})).pairs.length,0);const abort=new AbortController();abort.abort();await assert.rejects(()=>ssgWordDescriptors({width:1,height:1,gray:Float64Array.of(0),points:new Float64Array()},{},{signal:abort.signal}),error=>error.code==='CANCELLED');
});

test('a complete SSG label requires all four actual detector components',()=>{
 assert.equal(SSG_REFERENCE.completeDetector,false);assert.throws(()=>requireSsgDetectorDependencies({vlfeatSift(){}}),error=>error.code==='UNSUPPORTED_OPERATION'&&error.details.missing.includes('structuredEdges'));assert.throws(()=>ssgParams({salienceSigma:0}),error=>error.code==='INVALID_INPUT');
});
