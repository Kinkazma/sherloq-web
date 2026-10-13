import test from 'node:test';
import assert from 'node:assert/strict';
import evaluatorFactory from '../vendor/d2prl/evaluator-tiled.js';
import {evaluateScopedNativeTile,scientificTargetAllowed} from '../experiments/d2prl/scientific-matching.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {Budget} from '../src/cache.js';
import {Worker} from 'node:worker_threads';

async function native(side,channels,candidates,work){const module=await evaluatorFactory(),n=side*side,pointers=[];const alloc=bytes=>{const p=module._malloc(bytes);assert.ok(p);pointers.push(p);return p;};try{const pointer=alloc(2*channels*n),xp=alloc(4*candidates*n),yp=alloc(4*candidates*n),out=alloc(8*n);module.HEAPU8.fill(0,pointer,pointer+2*channels*n);return await work(module,{pointer,xp,yp,out,side,channels,candidates,begin:0,end:n,referenceThreads:8});}finally{pointers.forEach(p=>module._free(p));}}
test('all-admitted scientific path is bit-identical to the unchanged native evaluator, including global thread tails',async()=>{
 for(const side of [8,17])for(const channels of [36,96])await native(side,channels,5,(module,args)=>{const n=side*side,x=Float32Array.from({length:n*5},(_,i)=>Math.fround(((i*13)%side)-i%n%side+.125)),y=Float32Array.from({length:n*5},(_,i)=>Math.fround(((i*7)%side)-Math.floor(i%n/side)+.25));module.HEAPF32.set(x,args.xp/4);module.HEAPF32.set(y,args.yp/4);assert.equal(module._d2prl_evaluate_tile(args.pointer,args.xp,args.yp,side,channels,5,0,n,args.out,args.out+4*n,8),1);const expected={x:module.HEAPF32.slice(args.out/4,args.out/4+n),y:module.HEAPF32.slice(args.out/4+n,args.out/4+2*n)};
 const actual=evaluateScopedNativeTile(module,{...args,offsetX:x,offsetY:y,mask:new Uint8Array(n).fill(1)});assert.deepEqual(actual.x,expected.x);assert.deepEqual(actual.y,expected.y);assert.equal(actual.stats.nativeCalls,1);});
});
test('excluded source centres never reach native scoring and invalid target supports are removed before the native kernel',async()=>{
 await native(8,36,2,(module,args)=>{const n=64,mask=new Uint8Array(n).fill(1);mask[3*8+3]=0;const x=new Float32Array(2*n),y=new Float32Array(2*n);for(let i=0;i<n;i++){x[i]=3-i%8;y[i]=3-Math.floor(i/8);x[n+i]=6-i%8;y[n+i]=6-Math.floor(i/8);}const before=[x.slice(),y.slice()],calls=[],old=module._d2prl_evaluate_tile;module._d2prl_evaluate_tile=(...v)=>{calls.push({begin:v[6],end:v[7],candidates:v[5]});return old(...v);};const result=evaluateScopedNativeTile(module,{...args,offsetX:x,offsetY:y,mask});
 assert.equal(result.stats.rejectedSources,1);assert.equal(result.stats.rejectedCandidates,63);assert.equal(result.stats.evaluatedSources,63);assert.ok(calls.every(c=>c.candidates===1&&!(c.begin<=27&&c.end>27)));for(let i=0;i<n;i++)if(mask[i]){assert.equal(result.x[i],6-i%8);assert.equal(result.y[i],6-Math.floor(i/8));assert.ok(scientificTargetAllowed(mask,8,i,result.x[i],result.y[i]));}assert.deepEqual(x,before[0]);assert.deepEqual(y,before[1]);
 });
});
test('native bilinear support rejects a target next to an exclusion, and weighted outputs cannot bridge an excluded gap',async()=>{
 await native(8,96,2,(module,args)=>{const mask=new Uint8Array(64).fill(1);mask[4*8+4]=0;assert.equal(scientificTargetAllowed(mask,8,0,3.5,4),false);const x=new Float32Array(128),y=new Float32Array(128);for(let i=0;i<64;i++){x[i]=2-i%8;y[i]=4-Math.floor(i/8);x[64+i]=6-i%8;y[64+i]=4-Math.floor(i/8);}const result=evaluateScopedNativeTile(module,{...args,offsetX:x,offsetY:y,mask});assert.ok(result.stats.projectedOutputs>0);for(let i=0;i<64;i++)if(mask[i])assert.ok(scientificTargetAllowed(mask,8,i,result.x[i],result.y[i]));});
});
test('actual worker transport applies a scientific mask once, resets it for ordinary computation, and releases all owners',async()=>{
 const side=17,n=side*side,mask=new Uint8Array(n).fill(1);mask[4*side+5]=0;const features=new Uint16Array(36*n),offsetX=new Float32Array(5*n),offsetY=new Float32Array(5*n);for(let k=0;k<5;k++)for(let i=0;i<n;i++){offsetX[k*n+i]=k+2-i%side;offsetY[k*n+i]=4-Math.floor(i/side);}
 const input={side,channels:36,candidates:5,features,offsetX,offsetY,scientificMask:mask},budget=new Budget(256*1024**2),closing=[],messages=[];
 const pool=await createEvaluatorPool(new URL('../vendor/d2prl/evaluator-tiled.js',import.meta.url).href,{budget,maxWorkers:2,tileSize:64,workerFactory(){const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:new URL('../experiments/d2prl/evaluator-worker.js',import.meta.url).href}}),adapter={postMessage(data,transfer){messages.push({type:data.type,masked:data.values!==null});worker.postMessage(data,transfer);},terminate(){closing.push(worker.terminate());}};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.({message:error.message}));return adapter;}});
 try{const result=await pool.evaluate(input);assert.ok(pool.stats.scientificMatching.rejectedSources>0);assert.ok(pool.stats.scientificMatching.rejectedCandidates>0);for(let i=0;i<n;i++)if(mask[i])assert.ok(scientificTargetAllowed(mask,side,i,result.x[i],result.y[i]));else assert.equal(result.x[i],0);
  const firstUploads=messages.filter(m=>m.type==='scientific-scope'&&m.masked).length;await pool.evaluate(input);assert.equal(messages.filter(m=>m.type==='scientific-scope'&&m.masked).length,firstUploads);
  const plain=await pool.evaluate({...input,scientificMask:null});assert.equal(messages.filter(m=>m.type==='scientific-scope'&&!m.masked).length,pool.stats.activeWorkers);assert.ok(plain.x.some((v,i)=>!mask[i]&&v!==0),'Ordinary computation no longer carries the prior scope.');
 }finally{pool.dispose();await Promise.all(closing);}assert.equal(budget.total(),0);
});
