import test from 'node:test';
import assert from 'node:assert/strict';
import {detectionBiomes,detectionBiomeHull} from '../sherloq-browser/assets/detection-biomes.js';
function fixture({Type=Float64Array,line=false,operation='tampering.copyMove.sparse'}={}){
 const a=line?[[10,10],[11,10],[12,10],[13,10]]:[[10.5,10.5],[19.5,10.5],[19.5,19.5],[10.5,19.5]],b=a.map(([x,y])=>[x+40,y]),points=new Type(8*7),pairs=new Float64Array(4*4);for(let i=0;i<4;i++){points.set([...a[i],1,0,0,0,0],i*7);points.set([...b[i],1,0,0,0,0],(i+4)*7);pairs.set([i,i+4,.3,40],i*4);}return {id:'run-1',imageId:'source-1',status:'ok',operation,data:{params:{algorithm:operation.endsWith('dense')?'PatchMatch Zernike':'SIFT + G2NN + RANSAC'},points,pairs,groups:[Uint32Array.of(0,1,2,3)],bases:[Uint8Array.of(70,30,10)]},selectedGroups:[{index:0,rows:Uint32Array.of(0,1,2,3)}],visible:[[0,4]],style:{low:15,high:100,minimum:4,chosen:[],hidden:[]},surface:{id:'rendered',revision:1,width:100,height:40},provenance:{originalSha256:'a'.repeat(64),decode:{sourceSize:[100,40]}}};
}

for(const Type of [Float32Array,Float64Array])test('real paired native rows keep half-even pixel centres, original RGB group color and unmodified arrays: '+Type.name,()=>{
 const out=fixture({Type}),before=structuredClone(out),result=detectionBiomes(out);assert.equal(result.groups.length,1);assert.deepEqual(result.groups[0].polygons,[[[10,10],[20,10],[20,20],[10,20]],[[50,10],[60,10],[60,20],[50,20]]]);assert.deepEqual(result.groups[0].color,[10,30,70]);assert.deepEqual(result.groups[0].pairIndexIds,[0,1,2,3]);assert.equal(result.groups[0].nativeGroupIndex,0);assert.equal(result.groups[0].nativeGeometry,true);assert.deepEqual(out,before);assert.equal(detectionBiomes(out).identity,result.identity);assert.notEqual(detectionBiomes({...out,id:'run-2'}).identity,result.identity);
});
test('Dense collinear native paired contours keep exact endpoints, without replacing them with bounding-box areas',()=>{
 const out=fixture({Type:Float32Array,line:true,operation:'tampering.copyMove.dense'}),result=detectionBiomes(out);assert.deepEqual(result.groups[0].polygons,[[[10,10],[13,10]],[[50,10],[53,10]]]);assert.equal(result.groups[0].method,'PatchMatch Zernike');assert.deepEqual(detectionBiomeHull(Float64Array.of(2.5,3.5,2.5,3.5)),[[2,4]]);
});
test('actual selected/visible native groups and length/support/hidden filters prevent unqualified or stale matches from entering the panel',()=>{
 const out=fixture();assert.deepEqual(detectionBiomes({...out,selectedGroups:undefined,visible:[]}).groups,[]);assert.deepEqual(detectionBiomes({...out,selectedGroups:undefined,visible:undefined}),{identity:null,groups:[]});assert.deepEqual(detectionBiomes(out,{style:{...out.style,low:41}}).groups,[]);assert.deepEqual(detectionBiomes(out,{style:{...out.style,minimum:5}}).groups,[]);assert.deepEqual(detectionBiomes(out,{style:{...out.style,hidden:[0]}}).groups,[]);assert.deepEqual(detectionBiomes(out,{style:{...out.style,chosen:[1]}}).groups,[]);
 const partial={...out,selectedGroups:[{index:0,rows:Uint32Array.of(0,1,2)}]};assert.equal(detectionBiomes(partial,{style:{...out.style,minimum:3}}).groups[0].pairIndexIds.length,3);assert.equal(detectionBiomes({...out,selectedGroups:undefined}).groups.length,1);assert.throws(()=>detectionBiomes({...out,selectedGroups:[{index:0,rows:[0,0,1,2]}]}),{code:'DETECTION_BIOMES_INVALID'});
});
test('neural maps, SSG localization and unsuccessful outputs never become native paired Biomes',()=>{
 const out=fixture();for(const operation of ['ai.clones.d2prl','ai.clones.segmentation','m2.forgeryscope'])assert.deepEqual(detectionBiomes({...out,operation}),{identity:null,groups:[]});assert.deepEqual(detectionBiomes({...out,status:'error'}),{identity:null,groups:[]});out.data.params.algorithm='SSG';assert.deepEqual(detectionBiomes(out),{identity:null,groups:[]});
});
