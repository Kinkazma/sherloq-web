import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {SiftPool} from '../src/sift-paged.js';
import {createSiftCheckpoint,runSiftCheckpointStage} from '../src/sift-checkpoint.js';
import {groupSiftContinuations,packSiftContinuationStates,createSiftContinuationRound,acceptSiftContinuationBatch} from '../src/sift-continuations.js';

test('canonical continuations group exact windows without dropping seed identity or layers',()=>{
 const pending=[[255,255,1,0],[256,256,3,2],[255,255,4,1],[5,5,1,0],[1020,600,2,4]].map(state=>({state})),groups=groupSiftContinuations(pending,1027,607,{canonical:true});
 assert.deepEqual(groups.flatMap(g=>g.indices).sort((a,b)=>a-b),[0,1,2,3,4]);assert.deepEqual(groups[0].indices,[0,2,3]);assert.deepEqual([...packSiftContinuationStates(groups[0])],groups[0].states.flat());assert.deepEqual(groups[0].states,pending.filter((_,i)=>[0,2,3].includes(i)).map(v=>v.state));assert.deepEqual([groups.at(-1).x1,groups.at(-1).y1],[1027,607]);
});
test('native batch publication retains unordered peers and resumes without recomputation or duplicate seeds',async()=>{
 const state=createSiftCheckpoint(),round=createSiftContinuationRound(4),budget=new Budget(10000),owner={profile:{maxWorkers:1},workers:new Set()},saved=globalThis.Worker,groups=[{index:0,indices:[0,2]},{index:1,indices:[1,3]}];let computes=0,failures=0,refuse=true,pool;const published=[];
 const pages={append(points){if(points[0]===2&&refuse){failures++;throw new EngineError('MEMORY_LIMIT','Useful batch publication has no room');}published.push(points[0]);}};
 globalThis.Worker=class{terminate(){}postMessage(job){queueMicrotask(()=>{if(job.kind==='init')this.onmessage({data:{ready:true}});else{computes++;const ids=job.group===0?[1,3]:[2,4];this.onmessage({data:{statuses:Uint8Array.of(2,2),states:new Int32Array(8),offsets:Uint32Array.of(0,7,14),points:Float32Array.from(ids.flatMap(id=>[id,0,0,0,0,0,0]))}});}});}};
 const makePool=async()=>{pool=new SiftPool(owner,{budget,heap:128,cost:()=>512,provider:'cpu',backend:'cpu',wasm:new Uint8Array(),layers:3,contrast:.001});await pool.open(1);};
 const run=()=>runSiftCheckpointStage(state,pool,'refine-batch:0:0',groups,async group=>({kind:'refine-batch',group:group.index,input:Float32Array.of(0)}),async(result,group)=>acceptSiftContinuationBatch(round,group.index,group,result,pages,state.frees));
 try{await makePool();await assert.rejects(run(),error=>error.details?.recovery?.consecutiveFailures===5);pool.close();assert.equal(failures,5);assert.equal(computes,2);assert.deepEqual(published,[1]);assert.equal(round.published,1);assert.ok(budget.total()>0,'Computed batches must remain owned');assert.equal(state.pending.size,1);
  refuse=false;await makePool();await run();pool.close();assert.equal(computes,2);assert.deepEqual(published,[1,2,3,4]);assert.equal(round.published,4);assert.equal(state.pending.size,0);assert.equal(budget.total(),0);for(const record of round.groups.values())assert.equal(record.result,null);
 }finally{pool?.close();await state.dispose();globalThis.Worker=saved;assert.equal(budget.total(),0);}
});
test('discarding a checkpoint releases completed batches waiting for an earlier seed',async()=>{
 const state=createSiftCheckpoint(),round=createSiftContinuationRound(2),budget=new Budget(64),owned=budget.reserve(28);state.values.set('round',round);
 const result={statuses:Uint8Array.of(2),states:new Int32Array(4),offsets:Uint32Array.of(0,7),points:Float32Array.of(2,0,0,0,0,0,0),retainOwnership:()=>owned};
 acceptSiftContinuationBatch(round,1,{indices:[1]},result,{append(){throw Error('Later seed published before its predecessor');}},state.frees);assert.equal(round.published,0);assert.equal(budget.total(),28);await state.dispose();assert.equal(budget.total(),0);assert.equal(round.groups.get(1).result,null);
});
