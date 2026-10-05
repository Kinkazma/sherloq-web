import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker as NativeWorker} from 'node:worker_threads';
import create from '../vendor/sift-paged/sift-paged.js';
import {Budget} from '../src/cache.js';
import {SiftPool} from '../src/sift-paged.js';
import {continuationFixture,continuationRun} from './helpers/sift-continuation-oracle.js';
const wasm=new Uint8Array(await readFile(new URL('../vendor/sift-paged/sift-paged.wasm',import.meta.url))),MiB=1024**2;
function workerFactory(closing){return class{constructor(url){this.worker=new NativeWorker(new URL('./helpers/sift-native-worker.mjs',import.meta.url),{workerData:{module:url.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({error,message:error.message}));}postMessage(data,transfer){this.worker.postMessage(data,transfer);}terminate(){closing.push(this.worker.terminate());}};}
for(const [layers,w,h] of [[3,600,440],[4,600,440],[3,603,439],[4,517,515]])test('canonical SIFT continuation batches preserve native seeds and float bits, layers '+layers+' shape '+w+'x'+h,{timeout:60000},async()=>{
 const input=await continuationFixture(create,wasm,layers,w,h),saved=globalThis.Worker,closing=[];globalThis.Worker=workerFactory(closing);const records=[];
 try{for(const canonical of [false,true])records.push(await continuationRun(input,{layers,wasm,canonical}));
 assert.deepEqual(records[1].outputs,records[0].outputs);assert.deepEqual(records[1].ranking,records[0].ranking);assert.ok(records[1].rounds>1);assert.ok(records[1].escapes>0);assert.equal(Math.max(...records[1].outputs.map(o=>o.state[3])),5);assert.ok(records[1].builds<records[0].builds);assert.ok(records[0].outputs.some(result=>result.status===2&&result.bits.length),'Oracle must include converged orientations');console.log(JSON.stringify({layers,w,h,seeds:input.seeds.length,rounds:records[1].rounds,escapes:records[1].escapes,newtonSteps:Math.max(...records[1].outputs.map(o=>o.state[3])),legacyPyramids:records[0].builds,canonicalPyramids:records[1].builds,radius:input.radius,rankedPoints:records[1].ranking.points.length/7,g2nnPairs:records[1].ranking.pairs.length/4,exact:true}));
 }finally{globalThis.Worker=saved;await Promise.all(closing);}
});
