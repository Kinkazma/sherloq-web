import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compositePolicyMetadata,COMPOSITE_STATISTICS_REVISION} from '../src/composite-policy.js';
import {compositeNpz} from '../src/npz.js';
import {createM2NpzStream} from '../src/m2-npz-stream.js';
import {Budget} from '../src/cache.js';
test('Composite policy and selected-model counters survive dense and windowed NPZ',async()=>{
 const fields={covariance_regularizations:Int32Array.of(3),pca_regularized_components:Int32Array.of(27),covariance_reference_scale:Float64Array.of(2)},metadata=compositePolicyMetadata(fields);
 assert.deepEqual(metadata,{statistics_policy:'covariance-floor-v1',covariance_regularizations:3,pca_regularized_components:27,covariance_reference_scale:2});assert.ok(COMPOSITE_STATISTICS_REVISION.startsWith(metadata.statistics_policy+'/'));
 const result={data:{width:1,height:1,model:101,...fields,statisticsShapes:Object.fromEntries(Object.keys(fields).map(k=>[k,[]])),metadata},provenance:{}},expected=compositeNpz(result,65536).bytes,budget=new Budget(4*1024**2),stream=await createM2NpzStream('composite',result,{budget}),bytes=new Uint8Array(stream.length);
 for(let at=0;at<bytes.length;at+=13)bytes.set(await stream.read(at,Math.min(13,bytes.length-at)),at);
 assert.deepEqual(bytes,expected);const text=new TextDecoder().decode(bytes);for(const key of Object.keys(fields))assert.ok(text.includes(key+'.npy'));stream.release();assert.equal(budget.total(),0);
});
