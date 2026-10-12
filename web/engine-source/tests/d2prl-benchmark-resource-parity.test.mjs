// Pure CLI/summary checks; no filesystem preparation, browser or inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {settings,summariesForMode} from '../scripts/benchmark-d2prl-optimization.mjs';
const base=['--idle-confirmed','--reference-repo=/existing/reference','--corpus-root=/existing/corpus','--model-root=/existing/model'];
test('one-repetition resource parity is explicit and includes cold plus retained warm',()=>{
 const config=settings([...base,'--resource-parity-only','--repetitions=1','--budgets-mib=2048']);assert.equal(config.resourceParityOnly,true);assert.equal(config.repetitions,1);assert.deepEqual(config.temperatures,['cold-context-new-model','warm-retained-model']);assert.equal(config.budgets[0],2*1024**3);
 assert.equal(settings([...base,'--resource-parity-only']).repetitions,1);
});
test('ordinary timing remains balanced and resource mode cannot hide partial or smoke work',()=>{
 for(const repetitions of [1,3])assert.throws(()=>settings([...base,'--repetitions='+repetitions]),/even number/);
 assert.equal(settings([...base,'--repetitions=2']).resourceParityOnly,false);
 for(const extra of [['--repetitions=2'],['--startup-only'],['--temperatures=cold-context-new-model'],['--resource-parity-only=false']])assert.throws(()=>settings([...base,'--resource-parity-only',...extra]));
});
test('resource-only summaries never qualify speed even with fabricated strong repeated gains',()=>{
 const rows=[];for(let repetition=0;repetition<2;repetition++)for(const variant of ['reference','candidate'])rows.push({variant,job:'synthetic',backend:'webgpu',profile:'maximum',budgetBytes:2*1024**3,temperature:'cold-context-new-model',repetition,status:'passed',runMs:variant==='reference'?100:50,sourceThroughRunMs:variant==='reference'?100:50,raw:[{plane:'union',sha256:'a'.repeat(64)}],decision:{positive_pixels:1},modelIdentity:{sha256:'b'.repeat(64)},sourceIdentity:{sha256:'c'.repeat(64)}});
 assert.equal(summariesForMode(rows).summary[0].globalGainQualified,true);
 const result=summariesForMode(rows,{resourceParityOnly:true});for(const summary of [...result.summary,...result.workloadSummary]){assert.equal(summary.exact,true);assert.equal(summary.globalGainQualified,false);assert.match(summary.qualification,/no speed qualification/);}
});
