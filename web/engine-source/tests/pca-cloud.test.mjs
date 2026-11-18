import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createPcaCloudSample,attachPcaCloudOwner,detachPcaCloudOwner,PCA_CLOUD_MAX_POINTS} from '../src/pca-cloud.js';
import {pcaCloudScene} from '../../wordpress/sherloq-browser/assets/pca-cloud-scene.js';
import {segmentedPca} from '../src/segmented-pca.js';
import {contiguousSurface} from '../src/image-sources.js';
import {cvPcaModel} from '../src/opencv.js';

test('bounded original RGB sample is independent of block boundaries and never averages pixels',()=>{
 const n=400003,rgb=Uint8Array.from({length:n*3},(_,i)=>(i*73+Math.floor(i/7)*19)%256),a=createPcaCloudSample(n),b=createPcaCloudSample(n);
 a.add(rgb,0);for(let i=0;i<n;i+=997)b.add(rgb.subarray(i*3,Math.min(n,i+997)*3),i);
 assert.deepEqual(a.data,b.data);assert(a.data.count<=PCA_CLOUD_MAX_POINTS);
 for(let i=0;i<a.data.count;i++)assert.deepEqual(a.data.rgb.subarray(i*3,i*3+3),rgb.subarray(i*a.data.stride*3,i*a.data.stride*3+3));
});

test('scene projects signed centered BGR scores with one metric scale and correct RGB colors',()=>{
 const t=Math.SQRT1_2,data={channelOrder:'BGR',mean:Float64Array.of(120,80,40),eigenvectors:Float64Array.of(t,0,t,0,1,0,-t,0,t),eigenvalues:Float64Array.of(100,25,1),cloud:{rgb:Uint8Array.of(40,80,120,60,80,140,20,80,100),count:3,total:3,stride:1}};
 const scene=pcaCloudScene(data);
 assert.deepEqual(scene.scores([40,80,120]),[0,0,0]);assert.deepEqual(scene.scores([60,80,140]),[40*t,0,0]);
 assert.deepEqual(Array.from(scene.points.values.slice(3,6)),[.5,.5,.5]);assert.equal(scene.explainedVariance[0],100/126);
 assert.equal(scene.points.values[6],Math.fround(60/255));assert.equal(scene.points.values[9],Math.fround(.5+40*t/scene.coordinateScale));
 for(let bits=0;bits<8;bits++)for(const x of scene.scores([0,1,2].map(c=>bits&(1<<c)?255:0)))assert(Math.abs(x)<=scene.radius+1e-12);
 for(const line of scene.guideSegments)for(const value of [...line.from,...line.to])assert(value>=-1e-12&&value<=1+1e-12);
 assert.deepEqual(data.mean,Float64Array.of(120,80,40));
});

test('zero variance keeps a finite centered cloud and does not invent meaningful axes',()=>{
 const scene=pcaCloudScene({channelOrder:'BGR',mean:[7,7,7],eigenvectors:[1,0,0,0,1,0,0,0,1],eigenvalues:[0,0,0],cloud:{rgb:Uint8Array.of(7,7,7),count:1,total:1,stride:1}});
 assert.deepEqual(scene.guideSegments,[]);assert.deepEqual(scene.explainedVariance,[0,0,0]);assert(scene.points.values.every(Number.isFinite));
});

test('cloud owner survives a failed surface ACK, transfers without accounting gap and retires once',async()=>{
 const budget=new Budget(1024),sample=createPcaCloudSample(17,{budget});let fail=true;
 const a={async dispose(){if(fail)throw Error('NACK');}},b={async dispose(){}};
 attachPcaCloudOwner(a,sample);await assert.rejects(a.dispose(),/NACK/);assert.equal(budget.retained,51);assert.equal(budget.active,0);
 const moved=detachPcaCloudOwner(a);attachPcaCloudOwner(b,moved);fail=false;await a.dispose();assert.equal(budget.retained,51);await b.dispose();await b.dispose();assert.equal(budget.total(),0);
});

test('streaming cloud follows oriented input once per projection, preserving full native basis',async()=>{
 const budget=new Budget(64*1024**2),width=41,height=29,image={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>i*37%256)},surface=contiguousSurface(image,budget),basis=await cvPcaModel(image);let reads=0;
 const original=surface.readWindow.bind(surface);surface.readWindow=async(...args)=>{reads++;return original(...args);};
 const result=await segmentedPca({surface},{},{budget,basis,blockPixels:7});
 assert.deepEqual(result.data.cloud.rgb,image.data);assert.deepEqual(result.basis,basis);assert.equal(reads,height*Math.ceil(width/7));assert.equal(budget.active,0);assert(result.metrics.cloudSampleBytes===width*height*3);
 await result.surface.dispose();await surface.dispose();assert.equal(budget.total(),0);
});
