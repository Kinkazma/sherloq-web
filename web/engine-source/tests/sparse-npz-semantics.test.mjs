import test from 'node:test';
import assert from 'node:assert/strict';
import {m3Npz} from '../src/npz.js';
import {unpackScientificNpz} from './automatic-npz-fixture.js';

function result(algorithm) {
  return {operation:'tampering.copyMove.sparse',provenance:{engine:'local-qualification'},style:{areas:true},visible:[true],data:{
    params:{algorithm},points:Float64Array.of(0,0,1,0,0,0,0,2,1,1,0,0,0,0),
    pairs:Float64Array.of(0,1,.875,Math.sqrt(5)),colors:Uint8Array.of(25,50,100),pair_search_regions:Int32Array.of(-1),
    groups:[Uint32Array.of(0)],models:[],bases:[[25,50,100]],metadata:{scientificDefinition:'source-test'},regions:[],compare:false
  }};
}
test('actual EfficientLoFTR archive labels confidence, while classical archives retain descriptor distance',()=>{
  for(const algorithm of ['EfficientLoFTR','SIFT']){
    const arrays=unpackScientificNpz(m3Npz(result(algorithm),1024*1024).bytes),metadata=JSON.parse(arrays.metadata_json.text);
    assert.deepEqual(metadata.pair_columns,['point_a','point_b',algorithm==='EfficientLoFTR'?'confidence':'descriptor_distance','length_px']);
    assert.deepEqual(arrays.pairs.shape,[1,4]);assert.equal(new Float64Array(arrays.pairs.data.buffer)[2],.875);
  }
});
test('full SSG archive keeps the original-grid localization mask separately from biome hulls',()=>{
  const input=result('SSG'),mask=Uint8Array.of(0,255,255,0,255,0);
  Object.assign(input.data,{width:3,height:2,mask});
  const arrays=unpackScientificNpz(m3Npz(input,1024*1024).bytes),metadata=JSON.parse(arrays.metadata_json.text);
  assert.equal(arrays.mask.dtype,'|u1');assert.deepEqual(arrays.mask.shape,[2,3]);assert.deepEqual(arrays.mask.data,mask);
  assert.equal(metadata.mask_coordinates,'original-image-pixels');assert.deepEqual(metadata.mask_shape,[2,3]);
  assert.deepEqual(metadata.biomes,[[0]]);
  input.data.width=4;assert.throws(()=>m3Npz(input,1024*1024),/Invalid M3 NPZ shape/);
});
