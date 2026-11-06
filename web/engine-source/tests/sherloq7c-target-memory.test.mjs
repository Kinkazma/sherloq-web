import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTargetWasmModule,createTargetWasmSession,solveTarget7cWasm,TARGET_WASM_MAXIMUM_BYTES} from '../src/sherloq7c-target-wasm.js';

test('the real target binary admits the formerly oversized growth allowance with only its 16 MiB initial heap',async()=>{
  const binary=await WebAssembly.compile(await readFile(new URL('../src/target-kernel.wasm',import.meta.url)));
  const memory=new WebAssembly.Memory({initial:256,maximum:56458}),imports={};
  for(const entry of WebAssembly.Module.imports(binary)){
    imports[entry.module]??={};
    assert(['function','memory'].includes(entry.kind),'Unexpected target import kind');
    imports[entry.module][entry.name]=entry.kind==='memory'?memory:()=>0;
  }
  assert.equal(memory.buffer.byteLength,16*1024**2);
  await WebAssembly.instantiate(binary,imports);
});

test('large admission instantiates the unchanged target with its verified import maximum',async()=>{
  const module=await createTargetWasmModule({memoryBudgetBytes:56458*65536});
  assert.equal(TARGET_WASM_MAXIMUM_BYTES,2**32);
  assert.equal(module.HEAPU8.buffer.byteLength,16*1024**2);
  assert.equal(typeof module._target_create,'function');
  // Exercise real native growth well below 2 GiB, then retire the allocation.
  const at=module._malloc(24*1024**2);assert(at>0);
  assert(module.HEAPU8.buffer.byteLength>=24*1024**2);
  module._free(at);
});

test('real target heap exhaustion is structured and a subsequent small session still works',async()=>{
  const module=await createTargetWasmModule({memoryBudgetBytes:16*1024**2}),n=262144;
  const oversized={levels:new Float64Array(n),area:new Float64Array(n).fill(1/n),low:Uint32Array.of(0),high:Uint32Array.of(n-1),difference:Float64Array.of(.25),multiplicity:Float64Array.of(1)};
  await assert.rejects(createTargetWasmSession(oversized,{wasmModule:module}),error=>{
    assert.equal(error.code,'MEMORY_LIMIT');assert.equal(error.details.allocationKind,'wasm');
    assert.equal(error.details.maximumBytes,16*1024**2);assert.equal(error.details.boundary,'admitted-heap-maximum');return true;
  });
  const graph={levels:Float64Array.of(.25,.75),area:Float64Array.of(.5,.5),low:Uint32Array.of(0),high:Uint32Array.of(1),difference:Float64Array.of(.5),multiplicity:Float64Array.of(1),median:.5,weakScale:.5};
  const session=await createTargetWasmSession(graph,{wasmModule:module});
  try{
    const result=await solveTarget7cWasm(graph,.27,{wasmSession:session});
    assert.equal(result.z.length,2);assert(result.z.every(Number.isFinite));assert.equal(result.metrics.converged,true);
  }finally{session.dispose();}
});

test('an admission below the target initial heap fails before allocation',async()=>{
  await assert.rejects(createTargetWasmModule({memoryBudgetBytes:16*1024**2-1}),error=>error.code==='MEMORY_LIMIT'&&error.details.requestedBytes===16*1024**2);
});

test('native handles, seed writes and result reads remain correct above the signed i32 boundary',async()=>{
  const graph={levels:Float64Array.of(.25,.75),area:Float64Array.of(.5,.5),low:Uint32Array.of(0),high:Uint32Array.of(1),difference:Float64Array.of(.5),multiplicity:Float64Array.of(1),median:.5,weakScale:.5};
  const ordinary=await createTargetWasmModule(),reference=await solveTarget7cWasm(graph,.27177,{wasmModule:ordinary});
  const module=await createTargetWasmModule({memoryBudgetBytes:2**32});
  // Reserve virtual address space, without filling or copying the multi-GiB
  // block. The tiny graph below is the only payload written above its end.
  const blocker=module._malloc(2**31+1024**2)>>>0;assert(blocker>0);let session;
  try{
    session=await createTargetWasmSession(graph,{wasmModule:module});
    assert(session.handle>=2**31&&session.seed>=2**31);
    assert((module._target_info(session.handle)>>>0)>=2**31);
    assert((module._target_values(session.handle)>>>0)>=2**31);
    const actual=await solveTarget7cWasm(graph,.27177,{wasmSession:session});
    assert.deepEqual(actual.z,reference.z);assert.equal(actual.metrics.objective,reference.metrics.objective);
  }finally{session?.dispose();module._free(blocker);}
});
