import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createStrictSparseCopyEngine} from '../src/sparse-strict-copy.js';
async function outcome(promise){try{return{value:await promise,failed:false};}catch(error){return{failed:true,error};}}
for(const primary of [false,0,'',null,undefined,Object.freeze(new Error('frozen primary'))])test('public strict sparse parent keeps prepared source admission under refused native ACK: '+String(primary),async()=>{
 const sha='e'.repeat(64),budget=new Budget(128*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:16,height:16});await state.add('exclusion',{bounds:[4,4,8,8]});const domain=await compileOriginalSourceRegions(state.snapshot());
 const reservations=[],reserve=budget.reserve.bind(budget);budget.reserve=bytes=>{const record={bytes,active:true,releases:0},free=reserve(bytes);reservations.push(record);return()=>{record.active=false;record.releases++;free();};};
 const surface={descriptor:{format:'rgb8',width:16,height:16},readWindow(){throw Error('This failure reproduction must not read RGB');}},record={sha256:sha,surface,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[0,0],originalSource:{sha256:sha,surface}};
 const ack=Object.freeze(new Error('native ACK refused'));let allow=false,created=0;const engine=createStrictSparseCopyEngine(record,budget,{maxWorkers:2},{nativeFactory(){created++;return{async extract(){throw primary;},dispose(){if(!allow)throw ack;}};}});
 const answer=await outcome(engine.analyze({algorithm:'ORB',limit:100},{sourceSha256:sha,backend:'cpu'}));assert.ok(created>0);assert.equal(answer.failed,true);assert.equal(answer.error,primary);
 assert.equal(reservations[0].active,true,'prepared source metadata was freed before native ACK');assert.ok(budget.total()>0);
 const disposal=await outcome(engine.dispose());assert.equal(disposal.failed,true);assert.equal(reservations[0].active,true,'failed parent dispose dropped its source dependency');allow=true;await engine.dispose();assert.equal(reservations[0].releases,1);assert.equal(budget.total(),0);
});
