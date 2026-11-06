import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {ELA_SYNTHESIS_MEDIAN_KERNEL as pin} from '../src/ela-synthesis-median-kernel-pin.js';
import {createElaSynthesisSimdWorkspace} from '../src/ela-synthesis-median-kernel.js';

test('sub-deadline RAM blocks share one cumulative deadline and abort before computing after a held yield',async()=>{
 const binary=await readFile(new URL(pin.url)),budget=new Budget(2**20),originalNow=Object.getOwnPropertyDescriptor(performance,'now'),originalTimer=globalThis.setTimeout,callbacks=[];let now=0,work;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 try{
  work=await createElaSynthesisSimdWorkspace({count:99,frameBytes:291,maximumWorkingBytes:2**20,budget,fetcher:async()=>new Response(binary)});work.matrix.fill(55);
  globalThis.setTimeout=(callback,delay,...args)=>{if(delay===0){callbacks.push(()=>callback(...args));return 0;}return originalTimer(callback,delay,...args);};
  const run=signal=>work.reduce(work.matrix,work.output,work.values,{signal});
  now=3;await run();now=6;await run();assert.equal(callbacks.length,0,'no timer is introduced for each fast block');
  now=9;let finished=false;const held=run().then(()=>finished=true);await Promise.resolve();assert.equal(callbacks.length,1,'the first two blocks retain their elapsed deadline');assert.equal(finished,false);
  now=10;callbacks.shift()();await held;assert.equal(finished,true);
  now=16;await run();assert.equal(callbacks.length,0,'the acknowledged yield starts one new deadline');
  work.output.fill(201);const stop=new AbortController();now=19;const cancelled=assert.rejects(run(stop.signal),{code:'CANCELLED'});assert.equal(callbacks.length,1);
  stop.abort();callbacks.shift()();await cancelled;assert(work.output.every(value=>value===201),'the active per-block signal is checked after the shared yield before entering Wasm');
  assert.equal(callbacks.length,0);
 }finally{
  globalThis.setTimeout=originalTimer;for(const resume of callbacks.splice(0))resume();
  if(originalNow)Object.defineProperty(performance,'now',originalNow);else delete performance.now;
  await work?.dispose();
 }
 assert.equal(budget.total(),0);
});
