import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {ELA_SYNTHESIS_MEDIAN_KERNEL as pin} from '../src/ela-synthesis-median-kernel-pin.js';
import {createElaSynthesisSimdWorkspace,readElaSynthesisMedianKernel} from '../src/ela-synthesis-median-kernel.js';
import {createElaSynthesisMedianWorkspace,reduceElaSynthesisBlock} from '../src/ela-synthesis-median.js';

const binary=await readFile(new URL(pin.url)),fetcher=async()=>new Response(binary);
const sortedMedian=values=>{const ordered=values.slice().sort((a,b)=>a-b),k=ordered.length>>1;return ordered.length&1?ordered[k]:(ordered[k-1]+ordered[k])>>1;};
function bytesFor(count,columns,kind){let state=0x217ad64;return Uint8Array.from({length:count*columns},(_,i)=>{const q=Math.floor(i/columns),x=i%columns;if(kind==='ties')return q<(count>>1)?(x*13)%256:(x*13+31)%256;if(kind==='extremes')return q<(count>>1)?0:255;state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24;});}

test('the physical SIMD module, generated pins and build receipt have one exact identity',async()=>{
 const receipt=JSON.parse(await readFile(new URL('../vendor/ela-synthesis-median/PINNED.json',import.meta.url),'utf8'));
 assert.equal(binary.length,pin.bytes);assert.equal(createHash('sha256').update(binary).digest('hex'),pin.sha256);assert.equal(receipt.sha256,pin.sha256);
 const source=await readFile(new URL('../native/ela-synthesis-median.c',import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),receipt.sourceSha256);
 assert.equal(WebAssembly.validate(binary),true);assert.deepEqual(await readElaSynthesisMedianKernel({fetcher}),new Uint8Array(binary));
});

test('SIMD odd, even, 255 and 256 axes match independent sorted bytes including every vector tail',async()=>{
 for(const count of [2,3,4,7,99,100,255,256]){
  const budget=new Budget(2**20),work=await createElaSynthesisSimdWorkspace({count,frameBytes:291,maximumWorkingBytes:2**20,budget,fetcher});
  try{
   assert.equal(work.backend,'wasm-simd16');assert.equal(budget.total(),work.workingBytes);assert(work.workingBytes<=2**20);
   for(const columns of [1,2,3,15,16,17,31,32,33,255,259,291])for(const kind of ['random','ties','extremes']){
    const source=bytesFor(count,columns,kind),block=work.matrix.subarray(0,source.length),out=work.output.subarray(0,columns);block.set(source);work.output.fill(123);
    await reduceElaSynthesisBlock(block,out,work.values,{workspace:work});
    assert.deepEqual(block,source,'the shared input matrix stays unchanged');
    for(let x=0;x<columns;x++)assert.equal(out[x],sortedMedian(Array.from({length:count},(_,q)=>source[q*columns+x])),`${count}/${columns}/${kind}/${x}`);
    assert(work.output.subarray(columns).every(value=>value===123),'tail writes stay inside the requested output window');
   }
  }finally{await work.dispose();await work.dispose();}assert.equal(budget.total(),0);assert.equal(work.matrix,null);
 }
});

test('low budgets and single-frame axes keep exact bounded JS without fetching a module',async()=>{
 for(const count of [1,99]){
  const budget=new Budget(1024),work=await createElaSynthesisMedianWorkspace({count,frameBytes:6,maximumWorkingBytes:1024,budget,fetcher:()=>{throw Error('not admitted');}});
  assert.equal(work.backend,'javascript-exact');assert(work.workingBytes<=1024);const source=bytesFor(count,6,'random');work.matrix.set(source);
  const out=work.output.subarray(0,6);await reduceElaSynthesisBlock(work.matrix.subarray(0,6*count),out,work.values,{workspace:work});
  for(let x=0;x<6;x++)assert.equal(out[x],sortedMedian(Array.from({length:count},(_,q)=>source[q*6+x])));
  await work.dispose();assert.equal(budget.total(),0);
 }
});

test('SIMD ownership rejects foreign windows, joins cancellation and retires once',async()=>{
 const budget=new Budget(2**20),work=await createElaSynthesisSimdWorkspace({count:99,frameBytes:291,maximumWorkingBytes:2**20,budget,fetcher}),stop=new AbortController();
 await assert.rejects(reduceElaSynthesisBlock(new Uint8Array(99*17),new Uint8Array(17),work.values,{workspace:work}),{code:'INVALID_INPUT'});
 work.matrix.fill(55);const pending=work.reduce(work.matrix,work.output,work.values,{signal:stop.signal});stop.abort();const held=budget.total(),retiring=work.dispose();
 assert(held>0);assert.equal(budget.total(),held);await assert.rejects(pending,{code:'CANCELLED'});await retiring;assert.equal(budget.total(),0);assert.equal(work.output,null);
 assert.throws(()=>work.reduce(new Uint8Array(99),new Uint8Array(1),new Uint8Array(99)),{code:'INVALID_INPUT'});
});

test('corrupt and oversized modules never initialize and return every workspace reservation',async()=>{
 for(const [body,code] of [[Uint8Array.from(binary,v=>v^1),'DEPENDENCY_INTEGRITY'],[new Uint8Array(binary.length+1),'DEPENDENCY_SIZE'],[new Uint8Array(binary.length-1),'DEPENDENCY_SIZE']]){
  const budget=new Budget(2**20);await assert.rejects(createElaSynthesisSimdWorkspace({count:99,frameBytes:291,maximumWorkingBytes:2**20,budget,fetcher:async()=>new Response(body)}),{code});assert.equal(budget.total(),0);assert.equal(budget.backingReleased.get('wasm')??0,0);
 }
});

test('cancelled initialization keeps its reservation until stream cancellation ACK',async()=>{
 let acknowledge,entered;const ack=new Promise(resolve=>acknowledge=resolve),reading=new Promise(resolve=>entered=resolve),stop=new AbortController(),budget=new Budget(2**20);
 const pending=createElaSynthesisSimdWorkspace({count:99,frameBytes:291,maximumWorkingBytes:2**20,budget,signal:stop.signal,fetcher:async()=>({ok:true,body:{getReader:()=>({async read(){entered();await ack;return{done:false,value:new Uint8Array(binary)};},async cancel(){await ack;},releaseLock(){}})}})});
 await reading;const held=budget.total();assert(held>0);stop.abort();await Promise.resolve();assert.equal(budget.total(),held);acknowledge();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(budget.total(),0);
});
