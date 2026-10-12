import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import createModule from '../vendor/ssg-vlfeat/vlfeat.mjs';
import {createSsgVlfeat, ssgVlfeatMemoryPlan, SSG_VLFEAT_REFERENCE} from '../src/ssg-vlfeat.js';
import {Budget} from '../src/cache.js';

const MiB = 1024 ** 2;
const digest = data => createHash('sha256').update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
const wasmBinary = await fs.readFile(new URL('../vendor/ssg-vlfeat/vlfeat.wasm', import.meta.url));
const realFactory = options => createModule({...options, wasmBinary});
function noise(width = 257, height = 193) {
  const gray = new Float32Array(width * height); let state = 10212;
  for (let i = 0; i < gray.length; i++) {state ^= state << 13; state ^= state >>> 17; state ^= state << 5; gray[i] = state & 255;}
  return {gray, width, height};
}
function fakeFactory({count = 2, failure, allocationBytes = 0, onDetect = () => {}} = {}) {
  return ({wasmMemory}) => {
    const module = {HEAPU8: new Uint8Array(wasmMemory.buffer), HEAPF32: new Float32Array(wasmMemory.buffer), HEAPF64: new Float64Array(wasmMemory.buffer),
      _malloc: () => 64, _free() {}, _ssg_vlfeat_release() {}, _ssg_vlfeat_output: () => count ? 4096 : 0,
      _ssg_vlfeat_allocation_bytes: () => allocationBytes,
      _ssg_vlfeat_detect() {onDetect(); if (failure) throw failure; module.HEAPF64.set([11.5,13.5,1.8,0,11.5,13.5,1.8,1.6],512); return count;}};
    return module;
  };
}

test('real VLFeat0.9.18 frames match the independent native ARM64 oracle; transposed input and warm reuse remain exact', async () => {
  const budget = new Budget(96 * MiB); let starts = 0;
  const detector = createSsgVlfeat({budget, moduleFactory: options => {starts++; return realFactory(options);}});
  const input = noise(), callerLease = budget.reserve(input.gray.byteLength), original = input.gray.slice();
  const first = await detector.run(input);
  // Official C0.9.18, scalar ARM64, MATLAB wrapper axes/orientation convention.
  assert.equal(first.count, 38);
  assert.equal(digest(first.frames), '657e38e304967c1820073d7b0a70f93590424629fae70548f4ef91d9ed26b25b');
  assert.equal(first.reference.completeDetector, false);
  assert.equal(first.metrics.runtimeReused, false);
  assert.deepEqual(input.gray, original);
  const columns = new Float32Array(input.gray.length);
  for (let x=0;x<input.width;x++) for (let y=0;y<input.height;y++) columns[x*input.height+y]=input.gray[y*input.width+x];
  const second = await detector.run({...input, gray: columns, layout: 'matlab-column-major'});
  assert.equal(digest(second.frames), digest(first.frames));
  assert.deepEqual(second.points, first.points); assert.equal(second.metrics.runtimeReused, true); assert.equal(starts, 1);
  assert.equal(budget.total(), input.gray.byteLength + detector.reservedBytes + (first.count + second.count) * 56);
  first.release(); second.release(); callerLease(); detector.dispose(); assert.equal(budget.total(), 0);
});

test('VLFeat preserves multiple orientations and converts one-based frames to zero-based x/y/sigma only', async () => {
  const budget = new Budget(64 * MiB), detector = createSsgVlfeat({budget, moduleFactory: fakeFactory()});
  const result = await detector.run(noise(2,2));
  assert.deepEqual(Array.from(result.points), [11,13,1.8,11,13,1.8]);
  assert.equal(result.count,2); assert.equal(result.frames[7],1.6);
  result.release(); result.release(); detector.dispose(); assert.equal(budget.total(),0);
});

test('VLFeat admission occurs before instantiation and returns partial result ownership when output admission fails', async () => {
  const budget = new Budget(1); let starts=0;
  const detector = createSsgVlfeat({budget, moduleFactory: options => {starts++; return fakeFactory()(options);}});
  await assert.rejects(detector.run(noise(2,2)), {code:'MEMORY_LIMIT'});
  assert.equal(starts,0); assert.equal(budget.total(),0);
  budget.limit=32*MiB+64;
  await assert.rejects(detector.run(noise(2,2)), {code:'MEMORY_LIMIT'});
  assert.equal(budget.total(),32*MiB); assert.equal(detector.reservedBytes,32*MiB);
  detector.dispose(); assert.equal(budget.total(),0);
});

test('a real native workspace refusal stays a WASM allocation error and retires the failed arena before a useful retry', async () => {
  const budget = new Budget(192*MiB), detector = createSsgVlfeat({budget,moduleFactory:realFactory});
  await assert.rejects(detector.run(noise(1024,1024),{heapBytes:32*MiB}), error => {
    assert.equal(error.code,'MEMORY_ALLOCATION'); assert.equal(error.details.allocationKind,'wasm');
    assert.equal(error.details.stage,'ssg-vlfeat-detect'); assert.equal(error.details.nativeStatus,-2);
    assert.equal(error.details.maximumBytes,32*MiB);
    assert.ok(error.details.requestedBytes>0); return true;
  });
  assert.equal(budget.total(),0); assert.equal(detector.residentBytes,0);
  const result=await detector.run(noise()); assert.equal(result.count,38);
  result.release();detector.dispose();assert.equal(budget.total(),0);
});

test('real native growth stays inside the geometry-admitted arena and returning its idle cache preserves held results', async () => {
  const budget=new Budget(192*MiB),detector=createSsgVlfeat({budget,moduleFactory:realFactory});
  const input=noise(1024,1024),plan=ssgVlfeatMemoryPlan(input),result=await detector.run(input);
  assert.ok(result.count>0);assert.ok(result.heapBytes>32*MiB);
  assert.ok(result.heapBytes<=plan.maximumHeapBytes);assert.equal(detector.reservedBytes,plan.maximumHeapBytes);
  const before=digest(result.frames);assert.ok(detector.releaseIdle()>0);
  assert.equal(detector.residentBytes,0);assert.equal(budget.total(),result.count*56);
  assert.equal(digest(result.frames),before);result.release();detector.dispose();assert.equal(budget.total(),0);
});

test('bounded Emscripten overgrowth uses available admitted memory instead of reporting a false native allocation refusal', async () => {
  for (const fixed of [false,true]) {
    const memory=new WebAssembly.Memory({initial:32*MiB/65536,maximum:33*MiB/65536});
    // The prior generated helper used its compiled2GiB cap although the memory
    // import had a smaller maximum. Even its final speculative growth exceeded
    //33MiB and falsely rejected a requested32.5MiB footprint that fits.
    const module=await realFactory({wasmMemory:memory,maximumHeapBytes:fixed?33*MiB:2*1024**3});
    const first=module._malloc(30*MiB);assert.ok(first);
    const second=module._malloc(1.5*MiB);
    assert.equal(!!second,fixed);
    assert.equal(memory.buffer.byteLength,(fixed?33:32)*MiB);
    if(second)module._free(second);module._free(first);
  }
});

test('fatal native traps preserve their cause and malformed runtime loading returns its full reservation', async () => {
  const budget=new Budget(64*MiB), cause=new WebAssembly.RuntimeError('unreachable');
  const detector=createSsgVlfeat({budget,moduleFactory:fakeFactory({failure:cause})});
  await assert.rejects(detector.run(noise(2,2)), error => error.code==='FEATURE_EXTRACTION_FAILED' && error.cause===cause);
  assert.equal(budget.total(),0);detector.dispose();
  const loadingFailure=new Error('network loader cause'), broken=createSsgVlfeat({budget,moduleFactory:()=>{throw loadingFailure;}});
  await assert.rejects(broken.run(noise(2,2)), error => error===loadingFailure);
  assert.equal(budget.total(),0);broken.dispose();
});

test('busy arenas survive idle eviction, cancellation during load releases them, and disposal cannot discard active work', async () => {
  const budget=new Budget(64*MiB), controller=new AbortController();let resolve;
  const detector=createSsgVlfeat({budget,moduleFactory:options=>new Promise(done=>{resolve=()=>done(fakeFactory()(options));})});
  const pending=detector.run(noise(2,2),{signal:controller.signal});
  assert.equal(detector.releaseIdle(),0); assert.equal(budget.total(),32*MiB);
  await assert.rejects(detector.run(noise(2,2)),{code:'BUSY'}); assert.throws(()=>detector.dispose(),{code:'BUSY'});
  controller.abort();resolve();await assert.rejects(pending,{code:'CANCELLED'});
  assert.equal(budget.total(),0);detector.dispose();
});

test('cancellation at the detect boundary avoids calling the native algorithm and leaves an admitted arena reusable', async () => {
  const budget=new Budget(64*MiB), controller=new AbortController();let calls=0;
  const detector=createSsgVlfeat({budget,moduleFactory:fakeFactory({onDetect(){calls++;}})});
  await assert.rejects(detector.run(noise(2,2),{signal:controller.signal,onProgress(){controller.abort();}}),{code:'CANCELLED'});
  assert.equal(calls,0);assert.equal(budget.total(),32*MiB);
  const result=await detector.run(noise(2,2));assert.equal(result.metrics.runtimeReused,true);
  result.release();detector.dispose();assert.equal(budget.total(),0);
});

test('zero features are a valid empty result; source geometry, layouts and disposed use remain explicit', async () => {
  const budget=new Budget(64*MiB),detector=createSsgVlfeat({budget,moduleFactory:fakeFactory({count:0})});
  const result=await detector.run(noise(2,2));assert.equal(result.count,0);assert.equal(result.frames.length,0);assert.equal(result.points.length,0);result.release();
  await assert.rejects(detector.run({...noise(2,2),layout:'bgr'}),{code:'INVALID_INPUT'});
  await assert.rejects(detector.run({...noise(2,2),gray:new Float32Array([NaN,0,0,0])}),{code:'INVALID_INPUT'});
  detector.dispose();await assert.rejects(detector.run(noise(2,2)),{code:'DISPOSED'});assert.equal(budget.total(),0);
  assert.equal(SSG_VLFEAT_REFERENCE.completeDetector,false);
  assert.ok(ssgVlfeatMemoryPlan({width:3000,height:2000}).fixedBytes===3000*2000*92);
  assert.throws(()=>ssgVlfeatMemoryPlan({width:0,height:2}),{code:'INVALID_INPUT'});
});
