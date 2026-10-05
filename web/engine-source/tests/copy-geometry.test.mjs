import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {biomeSides,createGeometryKernel,verifyCopyGeometry,rejectSelfCopies,filterSiftModels} from '../src/copy-geometry.js';
import {copyPalette,refineCopyBiomes} from '../src/copy-subbiomes.js';
const reference=JSON.parse(readFileSync(new URL('./m3-data/copy-geometry-reference.json',import.meta.url)));
const reserveMemory=()=>{};
for(const c of reference.cases)test(c.name,async()=>{
 const points=new Float32Array(c.points.flat()),pairs=new Float64Array(c.pairs.flat()),groups=c.groups.map(x=>new Uint32Array(x)),expected=c.expected;
 groups.forEach((g,i)=>{const {a,b}=biomeSides(points,pairs,g);assert.deepEqual(Array.from(a),c.sides[i][0].flat());assert.deepEqual(Array.from(b),c.sides[i][1].flat());});
 const kernel=await createGeometryKernel({reserveMemory});
 try{
  const result=await verifyCopyGeometry(points,pairs,groups,{...c,kernel,reserveMemory});
  assert.deepEqual(result.groups.map(x=>Array.from(x)),expected.groups);
  for(let i=0;i<result.models.length;i++)for(const key of ['source_point_indices','destination_point_indices','parent_biome','model','inliers','distinct_centres'])assert.deepEqual(result.models[i][key],expected.models[i][key]);
  if(c.model!=='Homography')assert.deepEqual(result.models,expected.models);
  const palette=copyPalette(result.groups,pairs,.7,{reserveMemory});
  assert.deepEqual(Array.from(palette.colors),expected.colors.flat());assert.deepEqual(palette.bases,expected.bases);
  const refined=await refineCopyBiomes(points,pairs,result.groups,result.models,palette.colors,palette.bases,c.tolerance,{reserveMemory});
  assert.deepEqual(refined.groups.map(x=>Array.from(x)),expected.refined);assert.deepEqual(Array.from(refined.colors),expected.shades.flat());assert.deepEqual(refined.bases,expected.refinedBases);assert.deepEqual(refined.provenance,expected.provenance);
  const filtered=await rejectSelfCopies(points,pairs,result.groups,result.models,c.minimumDistance,{reserveMemory,kernel});assert.deepEqual(filtered.groups.map(x=>Array.from(x)),expected.accepted);
  assert.deepEqual(filtered.rejected.map(({model_median_displacement_px,...v})=>v),expected.rejected.map(({model_median_displacement_px,...v})=>v));
 }finally{kernel.dispose();}
});
test('cancellation and mandatory memory admission',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(createGeometryKernel({reserveMemory,signal:c.signal}),{code:'CANCELLED'});
 await assert.rejects(createGeometryKernel(),{code:'INVALID_INPUT'});
 let called=0;await assert.rejects(createGeometryKernel({reserveMemory:()=>{called++;throw new Error('budget');}}),/budget/);assert.equal(called,1);
});
test('SIFT model scale/anisotropy filters',()=>{
 const models=[[[1,0,0],[0,1,0],[0,0,1]],[[.1,0,0],[0,.1,0],[0,0,1]],[[4,0,0],[0,1,0],[0,0,1]],[[0,1,0],[1,0,0],[0,0,1]]].map(matrix=>({matrix}));
 assert.deepEqual(filterSiftModels([0,1,2,3],models).groups,[0,3]);
});
test('unverified normal groups remain aligned with verified reflected groups',async()=>{
 const c=reference.cases.find(c=>c.expected.models.length),points=new Float32Array(c.points.flat()),pairs=new Float64Array(c.pairs.flat()),groups=c.expected.groups.map(g=>new Uint32Array(g));
 const models=c.expected.models.map((m,i)=>i?m:null),palette=copyPalette(groups,pairs,.7,{reserveMemory});
 const rejected=await rejectSelfCopies(points,pairs,groups,models,0,{reserveMemory});assert.equal(rejected.groups.length,rejected.models.length);
 const refined=await refineCopyBiomes(points,pairs,groups,models,palette.colors,palette.bases,c.tolerance,{reserveMemory});assert.equal(refined.groups.length,refined.models.length);assert.equal(refined.models[0],null);
});

test('Homography and global hull accept 100001 correspondences without a count cutoff',async()=>{
 const n=100001,a=new Float64Array(n*2),b=new Float64Array(n*2);for(let i=0;i<n;i++){a[i*2]=i%401;a[i*2+1]=Math.floor(i/401);b[i*2]=a[i*2]+1000;b[i*2+1]=a[i*2+1]+17;}
 const kernel=await createGeometryKernel({reserveMemory});try{const matrix=kernel.fit(a,b,'Homography',.1);assert.ok(matrix);const expected=[1,0,1000,0,1,17,0,0,1];for(let i=0;i<9;i++)assert.ok(Math.abs(matrix[i]-expected[i])<1e-7);assert.equal(kernel.overlap(a,b),0);}finally{kernel.dispose();}
});
test('geometric verification terminates by exhausted matches beyond 2000 models',async()=>{
 const count=2001,points=new Float64Array(count*8*7),pairs=new Float64Array(count*4*4),groups=[];
 for(let g=0;g<count;g++){const rows=new Uint32Array(4);for(let k=0;k<4;k++){const a=g*8+k,b=a+4,x=(k%2)*2+g*20,y=Math.floor(k/2)*2;points[a*7]=x;points[a*7+1]=y;points[b*7]=x+10;points[b*7+1]=y;pairs.set([a,b,0,10],(g*4+k)*4);rows[k]=g*4+k;}groups.push(rows);}
 const result=await verifyCopyGeometry(points,pairs,groups,{minimum:4,threshold:.1,reserveMemory,kernel:{fit:()=>[1,0,10,0,1,0,0,0,1]}});assert.equal(result.models.length,count);assert.equal(result.hypotheses,count);assert.deepEqual(result.groups,groups);
});
