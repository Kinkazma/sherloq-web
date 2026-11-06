import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {ELA_SYNTHESIS_MEDIAN_KERNEL as pin} from '../src/ela-synthesis-median-kernel-pin.js';
import {createElaSynthesisSimdWorkspace} from '../src/ela-synthesis-median-kernel.js';

const binary=await readFile(new URL(pin.url)),fetcher=async()=>new Response(binary);
test('a held or refused backing ACK keeps the SIMD views and reservation until a successful retry',async()=>{
 const budget=new Budget(2**20),register=budget.registerBacking.bind(budget);let enter,ack,refuse=true,attempts=0;
 const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>ack=resolve),failure=Object.freeze(Object.assign(Error('Backing ACK refused'),{code:'ACK_REFUSED'}));
 budget.registerBacking=(...args)=>{const release=register(...args);return async()=>{attempts++;enter();await gate;if(refuse)throw failure;return release();};};
 const work=await createElaSynthesisSimdWorkspace({count:99,frameBytes:291,maximumWorkingBytes:2**20,budget,fetcher}),matrix=work.matrix,held=budget.total(),retiring=work.dispose();
 const rejected=assert.rejects(retiring,error=>error===failure);await entered;assert.equal(work.dispose(),retiring);assert.equal(work.matrix,matrix);assert.equal(budget.total(),held);assert.equal(budget.backingReleased.get('wasm')??0,0);
 ack();await rejected;assert.equal(work.matrix,matrix);assert.equal(budget.total(),held);assert.equal(budget.asyncReclaimers.size,1);
 refuse=false;await work.dispose();assert.equal(attempts,2);assert.equal(work.matrix,null);assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);assert((budget.backingReleased.get('wasm')??0)>0);
});

test('initialization preserves a frozen primary error and retains failed cleanup for budget retry',async()=>{
 const budget=new Budget(2**20),register=budget.registerBacking.bind(budget),compile=WebAssembly.compile,primary=Object.freeze(Object.assign(Error('Compile refused'),{code:'PRIMARY_REFUSED'})),cleanup=Object.freeze(Object.assign(Error('Backing ACK refused'),{code:'ACK_REFUSED'}));let refuse=true;
 budget.registerBacking=(...args)=>{const release=register(...args);return()=>{if(refuse)throw cleanup;return release();};};
 WebAssembly.compile=async()=>{throw primary;};
 try{await assert.rejects(createElaSynthesisSimdWorkspace({count:99,frameBytes:291,maximumWorkingBytes:2**20,budget,fetcher}),error=>error===primary);}finally{WebAssembly.compile=compile;}
 assert(budget.total()>0);assert.equal(budget.asyncReclaimers.size,1);assert.equal(budget.backingReleased.get('wasm')??0,0);
 refuse=false;await budget.reclaim(budget.limit);assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);
});

test('accumulator never publishes a surface before workspace ACK and keeps refusal retryable',async()=>{
 // Replace just the workspace factory in a private ESM harness. All accumulator
 // functions, store sequencing, reducer, error and publication code are real.
 const canonical=new URL('../src/ela-synthesis-accumulator.js',import.meta.url),median=new URL('../src/ela-synthesis-median.js',import.meta.url),budget=new Budget(2**20),failure=Object.freeze(Object.assign(Error('Workspace ACK refused'),{code:'ACK_REFUSED'}));
 let enter,ack,allow=false,attempts=0,factoryCalls=0;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>ack=resolve);
 globalThis.__testSynthesisMedianWorkspace=async()=>{factoryCalls++;const release=budget.reserve(27);let matrix=new Uint8Array(18),output=new Uint8Array(6),values=new Uint8Array(3),retired=false;return{blockBytes:6,workingBytes:27,backend:'javascript-exact',get matrix(){return matrix;},get output(){return output;},get values(){return values;},async dispose(){attempts++;if(attempts===1){enter();await gate;}if(!allow)throw failure;if(!retired){release();matrix=output=values=null;retired=true;}}};};
 const shim='data:text/javascript;base64,'+Buffer.from(`export const createElaSynthesisMedianWorkspace=globalThis.__testSynthesisMedianWorkspace;export {reduceElaSynthesisBlock} from ${JSON.stringify(median.href)};`).toString('base64');
 const source=(await readFile(canonical,'utf8')).replace("from './ela-synthesis-median.js'",`from ${JSON.stringify(shim)}`).replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from ${JSON.stringify(new URL(relative,canonical).href)}`);
 let createElaSynthesisAccumulator;try{({createElaSynthesisAccumulator}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));}finally{delete globalThis.__testSynthesisMedianWorkspace;}
 const stores=[],createStore=async bytes=>{const data=new Uint8Array(bytes),store={disposed:false,storage:'memory',async write(part,offset){data.set(part,offset);},async readInto(target,offset){target.set(data.subarray(offset,offset+target.length));},async flush(){},async dispose(){store.disposed=true;}};stores.push(store);return store;};
 const acc=await createElaSynthesisAccumulator({width:2,height:1,count:3,budget,nativeHeadroomBytes:0,createStore});
 for(const value of [4,20,9])await acc.append({descriptor:{width:2,height:1,format:'rgb8'},async readWindow(){return{pixels:{format:'rgb8',width:2,height:1,data:new Uint8Array(6).fill(value)},release(){}};}});
 const finishing=acc.finish(),rejected=assert.rejects(finishing,error=>error===failure);await entered;assert.equal(budget.total(),27);assert.equal(stores[1].disposed,false);ack();await rejected;
 assert.equal(stores[1].disposed,true);assert.equal(budget.total(),27);assert.equal(attempts,2);await assert.rejects(acc.finish(),{code:'INVALID_INPUT'});assert.equal(factoryCalls,1);
 await assert.rejects(acc.dispose(),error=>error===failure);assert.equal(budget.total(),27);allow=true;await acc.dispose();assert.equal(budget.total(),0);assert(stores.every(store=>store.disposed));
});
