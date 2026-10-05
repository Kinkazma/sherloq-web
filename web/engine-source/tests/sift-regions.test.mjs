import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {siftRegionPlan,selectUniqueSift,projectSiftRegion} from '../src/sift-regions.js';
test('SIFT independent ROIs keep crop, scale, exclusion and budget semantics',()=>{
 const child=[[10.2,20.5],[39.1,20.5],[39.1,45.2],[10.2,45.2]],envelope=[[0,0],[2047,0],[2047,2047],[0,2047]],excluded=[[[12,22],[15,22],[15,25],[12,25]]];
 const alone=siftRegionPlan(2048,2048,[child],excluded,{reserveMemory:()=>{}}),together=siftRegionPlan(2048,2048,[child,envelope],excluded,{reserveMemory:()=>{}});
 assert.deepEqual(alone.jobs[0],together.jobs[0]);assert.equal(together.zoneCount,2);assert.equal(together.jobs[0].scale,4);assert.equal(together.jobs[1].scale,1);
 assert.deepEqual(alone.jobs[0].rectangle,{x:10,y:20,width:31,height:27});assert.deepEqual(alone.jobs[0].excluded[0][0],[2,2]);
 assert.equal(siftRegionPlan(100,100,[[[200,200],[210,200],[210,210]]],[],{reserveMemory:()=>{}}).jobs.length,0);
});
test('SIFT reflected frame crops pixels and maps feature provenance back',()=>{
 const poly=[[10,20],[39,20],[39,45],[10,45]],plan=siftRegionPlan(100,100,[poly],[],{reflected:true,reserveMemory:()=>{}}),job=plan.jobs[0];
 assert.deepEqual(job.rectangle,{x:60,y:20,width:30,height:26});
 const p=Float32Array.of(0,2,3,20,.5,0,-1),projected=projectSiftRegion(p,job,100,1,{reserveMemory:()=>{}});
 assert.equal(projected.points[0],39);assert.equal(projected.points[1],22);assert.equal(projected.points[3],160);assert.deepEqual([...projected.members],[1]);assert.equal(p[0],0);
});
test('SIFT centre uniqueness and response priority match NumPy float32 rounding',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./m3-data/sift-selection-reference.json',import.meta.url))),points=Float32Array.from(fixture.points.flat()),desc=new Float32Array(fixture.points.length*128);
 for(let i=0;i<fixture.points.length;i++)desc.fill(i,i*128,(i+1)*128);
 const result=await selectUniqueSift(points,desc,100,{reserveMemory:()=>{}});
 assert.deepEqual(Array.from({length:100},(_,i)=>result.descriptors[i*128]),fixture.indices);assert.equal(result.totalFeatures,300);
});

test('native packed float64 centres and ROI additions retain double precision',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./m3-data/sift-selection-double-reference.json',import.meta.url))),points=Float64Array.from(fixture.points.flat()),desc=new Float32Array(points.length/7*128);
 for(let i=0;i<points.length/7;i++)desc.fill(i,i*128,(i+1)*128);
 const result=await selectUniqueSift(points,desc,100,{reserveMemory:()=>{}});assert.ok(result.points instanceof Float64Array);assert.deepEqual(Array.from({length:100},(_,i)=>result.descriptors[i*128]),fixture.indices);
 const job={zone:0,rectangle:{x:125,y:85},reflected:true},p=Float64Array.of(Math.fround(1.123456),Math.fround(2.23456),3,Math.fround(13.65432),.1,0,-1),r=projectSiftRegion(p,job,224,1,{reserveMemory:()=>{}});
 assert.equal(r.points[0],223-(p[0]+125));assert.equal(r.points[1],p[1]+85);assert.equal(r.points[3],180-p[3]);
});
