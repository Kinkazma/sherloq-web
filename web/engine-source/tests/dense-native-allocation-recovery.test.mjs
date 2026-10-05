import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import create from '../vendor/dense-paged/dense-paged.js';
import {Budget} from '../src/cache.js';
import {createDensePagedHeap} from '../src/dense-paged-heap.js';
const MiB=1024**2,wasmBinary=await fs.readFile(new URL('../vendor/dense-paged/dense-paged.wasm',import.meta.url));

test('native optional cache failure preserves the field and retries only on a memory recovery epoch',async()=>{
 async function run(inject){
  const width=128,height=128,n=width*height,dimensions=128,budget=new Budget(128*MiB),release=budget.reserve(128*MiB),heap=createDensePagedHeap(budget,128*MiB),grow=heap.memory.grow.bind(heap.memory);let refused=false,failures=0,growRefusals=0;
  heap.memory.grow=pages=>{if(refused){growRefusals++;throw new RangeError('Injected useful cache growth refusal');}return grow(pages);};
  const m=await create({wasmBinary,wasmMemory:heap.memory}),floats=factor=>Float32Array.from({length:n*dimensions},(_,i)=>((i*factor+(i/17|0)*13)%257-128)/128),array=v=>new Uint8Array(v.buffer);
  const stores=[array(floats(19)),array(floats(31)),new Uint8Array(n).fill(1),new Uint8Array(n*4),new Uint8Array(n*4),new Uint8Array(),new Uint8Array(),null,null,null,null,null,null,null,null,null,null,new Uint8Array(n*4),new Uint8Array(n*4)];
  m.pageIO=(id,offset,length,pointer,write)=>{const view=m.HEAPU8.subarray(pointer,pointer+length);if(write)stores[id].set(view,offset);else view.set(stores[id].subarray(offset,offset+length));};m.checkpoint=async()=>{};
  m.cacheAllocationFailure=()=>{failures++;heap.clearError();};
  const snapshots=[],commands=[[1,0,n,0,3,0,0],[2,0,n,0,4096,0,0],[4,0,n,0,4096,0,0],[3,0,n,0,4096,0,0],[2,0,n,1,4096,0,1],[4,0,n,1,4096,0,1],[3,0,n,1,4096,0,1],[0,0,0,0,0,0,1]];
  let current;m.nextFieldTask=async()=>{current=commands.shift();refused=inject&&current[3]===0&&current[0]!==1;return current;};m.fieldTaskDone=()=>snapshots.push({phase:current[0],iteration:current[3],failures,heapBytes:m.HEAPU8.byteLength});
  const count=m._malloc(8),error=m._malloc(1024),values=[width,height,dimensions,0,2,20,2,729,0,0,0,4096,3,count,error,0,0,1,0,3,1,n,0];
  try{const code=await m.ccall('dense_paged_field','number',values.map(()=> 'number'),values,{async:true});assert.equal(code,0,m.UTF8ToString(error));const comparisons=BigInt(m.HEAPU32[count/4])+(BigInt(m.HEAPU32[count/4+1])<<32n);return {targets:stores[3],distances:stores[4],comparisons,snapshots,failures,growRefusals};}finally{m._free(count);m._free(error);heap.dispose();release();assert.equal(budget.total(),0);}
 }
 const reference=await run(false),recovered=await run(true);assert.deepEqual(recovered.targets,reference.targets);assert.deepEqual(recovered.distances,reference.distances);assert.equal(recovered.comparisons,reference.comparisons);assert.equal(recovered.failures,1);assert.ok(recovered.growRefusals>0);assert.equal(recovered.snapshots[3].heapBytes,recovered.snapshots[1].heapBytes);assert.ok(recovered.snapshots[4].heapBytes>recovered.snapshots[3].heapBytes);
});
