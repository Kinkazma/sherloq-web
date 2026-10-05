import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {overlapFromAffine,writeDuplicateUnion} from '../src/forgeryscope-geometry.js';
import {forgeryscopeCliqueGroups} from '../src/forgeryscope-cliques.js';
const ref=JSON.parse(await readFile(new URL('data/forgeryscope/geometry.json',import.meta.url)));
test('Maximal cliques retain native shared-edge ownership and duplicate overwrite',async()=>{
  const cases=JSON.parse(await readFile(new URL('data/forgeryscope/cliques.json',import.meta.url)));
  for(const c of cases)assert.deepEqual(await forgeryscopeCliqueGroups(c.info),c.expected);
});
test('Native affine polygon areas, score statistics and exact rasterized masks',async()=>{
  for(const c of ref.cases){
    const native=c.expected;
    // Estimator inference is covered by the separate actual WASM study.
    const count=native.inliers,mask=Uint8Array.from(c.scores,(_,i)=>i<count?1:0);
    const result=overlapFromAffine(native.H_transformed.slice(0,2).flat(),mask,new Float32Array(c.scores),c.size0,c.size1,c.transform);
    assert.equal(result.mean_match_score,native.mean_match_score);
    assert.equal(result.median_match_score,native.median_match_score);
    for(const name of ['overlap_area_img0','overlap_area_img1'])assert.ok(Math.abs(result[name]-native[name])<1e-4,`${name}: ${result[name]} != ${native[name]}`);
    for(let i=0;i<2;i++)for(const bbox of [false,true]){
      const [w,h]=c['size'+i],poly=result['overlap_poly_img'+i],target=new Uint8Array(w*h);
      await writeDuplicateUnion(target,w,h,{poly_coords0:poly,poly_coords1:poly,to_bbox:bbox});
      assert.deepEqual([...target.keys()].filter(k=>target[k]),c.masks[i][bbox?'bbox':'polygon']);
    }
  }
});
test('Singular affine and cancellation have no successful result',async()=>{
  assert.ok(overlapFromAffine([0,0,0,0,0,0],new Uint8Array(4),new Float32Array(4),[8,8],[8,8]).error);
  const controller=new AbortController();controller.abort();
  await assert.rejects(writeDuplicateUnion(new Uint8Array(100),10,10,{poly_coords0:[[0,0],[9,0],[9,9]],poly_coords1:[],to_bbox:false},{signal:controller.signal}),e=>e.code==='CANCELLED');
});
