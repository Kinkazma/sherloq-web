import test from 'node:test';
import assert from 'node:assert/strict';
import {compileForgeryscopeScientificScope,filterForgeryscopeFeatures} from '../src/forgeryscope-scientific-scope.js';
import {ForgeryscopeNetworks} from '../src/forgeryscope-networks.js';
import {analyzeForgeryscope} from '../src/forgeryscope-pipeline.js';
import {Budget} from '../src/cache.js';

const sha='a'.repeat(64),polygon=([x,y,r,b])=>[[x,y],[r,y],[r,b],[x,b]];
const full={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',width:500,height:400,sourceSha256:sha,fingerprint:'fixture/1',regions:[{x0:10,y0:20,x1:110,y1:120,polygon:polygon([10,20,110,120]),type:'Microscopy',confidence:.9}],excluded:[polygon([10,20,35,45])]};
const compile=scope=>compileForgeryscopeScientificScope(scope,{width:500,height:400,sourceSha256:sha});
function features(points){const n=points.length;return {keypoints:{data:Float32Array.from(points.flat()),dims:[1,n,2]},descriptors:{data:Float32Array.from({length:n*128},(_,i)=>Math.floor(i/128)),dims:[1,n,128]},keypoint_scores:{data:Float32Array.from({length:n},(_,i)=>i),dims:[1,n]},scales:{data:Float32Array.from({length:n},(_,i)=>i+1),dims:[1,n]},oris:{data:Float32Array.from({length:n},(_,i)=>i+2),dims:[1,n]},size:{data:Float32Array.of(100,100),dims:[1,2]},release(){}};}

test('scientific scope checks source identity, coordinates, dimensions and keeps text boundaries excluded',()=>{
 const scope=compile(full);assert.equal(scope.admits(10,20),false);assert.equal(scope.admits(35,45),false);assert.equal(scope.admits(36,45),true);assert.equal(scope.admits(110,120),true);assert.equal(scope.admits(111,120),false);
 assert.equal(compile({...full,regions:[]}).admits(50,50),false);
 assert.throws(()=>compile({...full,sourceSha256:'b'.repeat(64)}),{code:'INVALID_INPUT'});
 assert.throws(()=>compile({...full,width:499}),{code:'INVALID_INPUT'});
 assert.throws(()=>compile({...full,coordinates:'page-points'}),{code:'INVALID_INPUT'});
 assert.throws(()=>compile({...full,excluded:[[[1,2],[3,4],[NaN,5]]]}),{code:'INVALID_INPUT'});
 assert.equal(compileForgeryscopeScientificScope(undefined),null);
});

test('SIFT and ALIKED rows compact before matching with exact crop offsets and all inverse pixel reflections',async()=>{
 const original=[[0,0],[25,25],[26,25],[50,50],[99,99]],image={width:100,height:100,scientificOrigin:[10,20]};
 for(const transform of ['original','fliplr','flipud','rot180']){
  const points=original.map(([x,y])=>[transform==='fliplr'||transform==='rot180'?99-x:x,transform==='flipud'||transform==='rot180'?99-y:y]),value=features(points),oldBuffers=Object.fromEntries(Object.entries(value).filter(([,v])=>v?.data).map(([k,v])=>[k,v.data.buffer]));
  await filterForgeryscopeFeatures(value,image,compile(full),{transform});
  assert.equal(value.keypoints.dims[1],3);assert.deepEqual(Array.from(value.keypoint_scores.data),[2,3,4]);assert.deepEqual(Array.from(value.scales.data),[3,4,5]);assert.deepEqual(Array.from(value.oris.data),[4,5,6]);
  assert.deepEqual(Array.from(value.descriptors.data.filter((_,i)=>i%128===0)),[2,3,4]);
  assert.deepEqual(Array.from(value.keypoints.data),points.slice(2).flat());
  for(const [name,buffer]of Object.entries(oldBuffers))assert.equal(value[name].data.buffer,buffer);
  assert.deepEqual(value.scopeFiltering.cropOrigin,[10,20]);assert.equal(value.scopeFiltering.excluded,2);
 }
 const unchanged=features(original);assert.equal(await filterForgeryscopeFeatures(unchanged,image,null),unchanged);assert.equal(unchanged.scopeFiltering,undefined);
});

test('scoped feature cancellation rejects and source RGB is never painted',async()=>{
 const value=features([[50,50]]),image={width:100,height:100,scientificOrigin:[10,20],data:Uint8Array.of(10,20,30)},before=image.data.slice();
 await assert.rejects(filterForgeryscopeFeatures(value,image,compile(full),{signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.deepEqual(image.data,before);
});

test('ALIKED descriptor rows reaching LightGlue and affine exclude text before numerical matching',async()=>{
 const points=[[5,5],[15,15],[30,30],[40,40],[50,50],[60,60]],budget=new Budget(16*1024**2),calls=[];
 const pool={async run(name,inputs){assert.equal(name,'lightglue-blot');calls.push(inputs);assert.equal(inputs.keypoints0.dims[1],4);assert.equal(inputs.keypoints1.dims[1],4);assert.deepEqual(Array.from(inputs.descriptors0.data.filter((_,i)=>i%128===0)),[2,3,4,5]);return {result:{matches0:{data:Int32Array.of(0,1,2,3)},scores0:{data:Float32Array.of(.9,.9,.9,.9)}},release(){}};}};
 const preparation={async affine(a,b){assert.deepEqual(Array.from(a),points.slice(2).flat());assert.deepEqual(a,b);return {matrix:Float64Array.of(1,0,0,0,1,0),inliers:Uint8Array.of(1,1,1,1)};}};
 const networks=new ForgeryscopeNetworks({pool,preparation,budget,assets:{}});networks.extractBlot=async()=>features(points);
 const image={width:100,height:100,scientificOrigin:[10,20],data:new Uint8Array(30000)},before=image.data.slice(),result=await networks.match(image,image,'Blots',{scientificScope:compile(full)});
 assert.equal(calls.length,1);assert.equal(result.scopeFiltering.stage,'keypoints-before-matching');assert.equal(result.scopeFiltering.points0.excluded,2);assert.deepEqual(image.data,before);assert.equal(budget.active,0);
});

test('microscopy SIFT keeps native extraction settings and all reflections while too few admitted points never reach matching',async()=>{
 const points=[[5,5],[15,15],[30,30],[40,40],[50,50]],calls=[],budget=new Budget(16*1024**2),sift={async extract(image,options){calls.push(options);const flipX=['fliplr','rot180'].includes(options.transform),flipY=['flipud','rot180'].includes(options.transform);return features(points.map(([x,y])=>[flipX?99-x:x,flipY?99-y:y]));}};
 const networks=new ForgeryscopeNetworks({sift,budget,assets:{},pool:{run(){throw Error('Excluded keypoints must not reach a matcher');}},preparation:{}}),image={width:100,height:100,scientificOrigin:[10,20],data:new Uint8Array(30000)};
 const result=await networks.match(image,image,'Microscopy',{scientificScope:compile(full),backend:'auto'});
 assert.deepEqual(calls.map(call=>call.transform),['original','original','fliplr','flipud','rot180']);assert.ok(calls.every(call=>call.resize===null&&call.max_num_keypoints===4096&&call.backend==='auto'));
 assert.equal(result.scopeFiltering.points0.retained,3);assert.equal(result.scopeFiltering.points0.excluded,2);assert.equal(result.scopeFiltering.geometricEvidence,false);assert.equal(budget.active,0);
});

test('Auto keeps every native branch output but distinguishes qualified geometry from raw similarity',async()=>{
 const budget=new Budget(16*1024**2),image={width:500,height:400,sha256:sha,data:new Uint8Array(500*400*3)},panels=[['Blots',.9,10,20,110,120],['Blots',.9,130,20,230,120]],calls=[];
 const scope={...full,regions:[...full.regions,{x0:130,y0:20,x1:230,y1:120,type:'Blots',confidence:.9}]};
 const networks={async detect(){return panels;},async embed(images,name){calls.push(name);return {vectors:new Float32Array(2048),release(){}};},async match(a,b,label,options){assert.deepEqual(a.scientificOrigin,[10,20]);assert.deepEqual(b.scientificOrigin,[130,20]);assert.equal(options.scientificScope.fingerprint,scope.fingerprint);return {error:'Native geometric match failed',scopeFiltering:{fingerprint:scope.fingerprint,stage:'keypoints-before-matching',points0:{retained:0}}};}};
 const pool={async run(name,inputs){return {result:{scores:{data:Float32Array.of(1,1)}},release(){}};}};
 const result=await analyzeForgeryscope(image,{networks,pool,budget,profile:'auto',scientificScope:scope});
 assert.ok(calls.includes('wblot_overlap_embedder'));assert.ok(calls.includes('wblot_duplicate_embedder'));assert.equal(result.metadata.comparisons[0].accepted,true);assert.equal(result.metadata.comparisons[0].supported,false);assert.equal(result.metadata.comparisons[0].scientificScope.qualified,false);
 assert.equal(result.branch_blots.some(Boolean),true);assert.equal(result.mask.some(Boolean),true);assert.equal(result.geometric.some(Boolean),false);assert.deepEqual(result.metadata.filtered_evidence.comparisons,[]);assert.equal(result.metadata.scientific_scope.embeddings.filtered,false);assert.equal(result.metadata.scientific_scope.lanes.filtered,false);result.release();assert.equal(budget.active,0);
});
