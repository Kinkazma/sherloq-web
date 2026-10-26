import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeComprintNativePopulation} from '../../extensions-source/comprint-native-population-statistics.js';
import {comprintContextFingerprintMoments} from '../../extensions-source/comprint-context-population.js';
import {Budget} from '../src/cache.js';
const tensor=(data,dims=[data.length])=>({data,dims});
const contexts=()=>[[160,144],[208,192]].map(([width,height],index)=>({width,height,luminance:new Float32Array(width*height).fill(index+1),fingerprint:Float32Array.from({length:width*height},(_,i)=>Math.sin(i*.1+index)*3)}));
function controlled({failSecond=false,cancelAfter,abort}={}){
 const calls=[],fitIds=[],featureContexts=[],normalizations=[];let training,featureRetire=0,fitRetire=0;
 async function call(slot,operation,a){calls.push(operation);if(operation===cancelAfter)abort.abort();
  if(operation==='feature_chunk'){
   const context=a.luminance.data[0];featureContexts.push(context);normalizations.push([...a.moments.data]);assert(a.luminance.data.every(v=>v===context));if(failSecond&&context===2)throw Object.assign(Error('second native context'),{code:'CONTROLLED_FEATURE_FAILURE'});
   const n=a.crop.data[2]*a.crop.data[3],values=Float32Array.from({length:n*512},(_,i)=>context+Math.floor(i/512)/1000+(i%512)/100000);return{outputs:{features:tensor(values,[n,512]),valid:tensor(new Uint8Array(n).fill(1))}};
  }
  if(operation==='covariance_chunk')return{outputs:{covariance:tensor(new Float64Array(512*512),[512,512])}};
  if(operation==='stream_basis'){assert.equal(a.count.data[0],216);return{outputs:{basis:tensor(new Float64Array(512*32),[512,32]),eigs:tensor(new Float64Array(512))}};}
  if(operation==='project_chunk'){const n=a.features.dims[0];return{outputs:{projected:tensor(Float64Array.from({length:n*32},(_,i)=>a.features.data[Math.floor(i/32)*512]+i%32/100),[n,32])}};}
  if(operation==='retain_training_chunked'){training=a.training.data.slice();assert.deepEqual(a.training.dims,[216,32]);return{outputs:{mu:tensor(new Float64Array(10*32),[10,1,32]),Sigma:tensor(new Float64Array(10*32*32),[10,32,32]),prior:tensor(new Float64Array(10),[10,1,1]),initial_indices:tensor(Int32Array.from({length:10},(_,i)=>i))}};}
  if(operation==='retain_training_only')return{outputs:{}};
  if(operation==='fit_retained_chunked'){fitIds.push(...a.indices.data);return{outputs:{indices:a.indices,mu:a.mu,Sigma:a.Sigma,prior:a.prior,outlier:tensor(new Float64Array(a.indices.data.length).fill(.01)),score:tensor(Float64Array.from(a.indices.data,i=>i)),iterations:tensor(new Int32Array(a.indices.data.length).fill(100))}};}
  if(operation==='finish_chunk')return{outputs:{map:tensor(Float64Array.from({length:a.projected.dims[0]},(_,i)=>a.projected.data[i*32]),[a.projected.dims[0]])}};
  throw Error(operation);
 }
 return{calls,fitIds,featureContexts,normalizations,get training(){return training;},call,main:{role:'main'},fitSlots:n=>Array.from({length:n},()=>({role:'fit'})),featureSlots:n=>Array.from({length:n},()=>({role:'feature'})),async retireFeatures(){featureRetire++;},async retireFits(){fitRetire++;},get retired(){return{featureRetire,fitRetire};}};
}
test('controlled native worker protocol keeps separate spatial grids but one global basis, training and ordered ten-restart winner',async()=>{
 const input=contexts(),ops=controlled(),budget=new Budget(256*1024**2),expected=await comprintContextFingerprintMoments(input);const result=await analyzeComprintNativePopulation({contexts:input,...ops,budget,storage:'memory',maxWorkers:1});
 assert.deepEqual(ops.featureContexts,[1,2,2]);assert(ops.normalizations.every(v=>v[0]===expected.mean&&v[1]===expected.variance));assert.equal(ops.calls.filter(v=>v==='stream_basis').length,1);assert.equal(ops.calls.filter(v=>v==='retain_training_chunked').length,1);assert.deepEqual(ops.fitIds,[0,1,2,3,4,5,6,7,8,9]);assert.equal(result.metadata.parallel.winning_replicate,9);assert.equal(result.metadata.valid_blocks,216);assert.deepEqual(result.metadata.native_context_grids.map(g=>[g.rows,g.columns,g.start]),[[6,8,0],[12,14,48]]);assert.equal(result.outputs.map.data.length,216);assert(ops.training.slice(0,48*32).every(v=>v<2));assert(ops.training.slice(48*32).every(v=>v>=2));assert.equal(budget.active,0);assert.equal(budget.retained,0);assert.deepEqual(ops.retired,{featureRetire:1,fitRetire:2});
});
test('failure in the second native feature grid retires earlier banks and never fits a partial scientific population',async()=>{
 const ops=controlled({failSecond:true}),budget=new Budget(256*1024**2);await assert.rejects(analyzeComprintNativePopulation({contexts:contexts(),...ops,budget,storage:'memory',maxWorkers:1}),{code:'CONTROLLED_FEATURE_FAILURE'});assert(!ops.calls.includes('stream_basis'));assert.equal(budget.active,0);assert.equal(budget.retained,0);
});
test('cancellation after an awaited native basis response prevents projection/publication and retires banks',async()=>{
 const abort=new AbortController(),ops=controlled({cancelAfter:'stream_basis',abort}),budget=new Budget(256*1024**2);await assert.rejects(analyzeComprintNativePopulation({contexts:contexts(),...ops,budget,storage:'memory',maxWorkers:1,signal:abort.signal}),{name:'AbortError'});assert(!ops.calls.includes('project_chunk'));assert.equal(budget.active,0);assert.equal(budget.retained,0);
});
test('native population admission refuses before any worker operation under insufficient shared memory',async()=>{
 const ops=controlled(),budget=new Budget(1024);await assert.rejects(analyzeComprintNativePopulation({contexts:contexts(),...ops,budget,storage:'memory',maxWorkers:1}),{code:'MEMORY_LIMIT'});assert.equal(ops.calls.length,0);assert.equal(budget.active,0);assert.equal(budget.retained,0);
});
