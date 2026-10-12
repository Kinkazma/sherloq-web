import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSelfDMPrepare} from '../src/selfdm-prepare.js';
import {Budget} from '../src/cache.js';

const geometry = {width: 97, height: 65, side: 512};
const pixels = () => Uint8Array.from({length: geometry.width * geometry.height * 3}, (_, i) => (i * 37 + (i >> 4) * 13) % 256);
const sha = tensor => createHash('sha256').update(new Uint8Array(tensor.buffer, tensor.byteOffset, tensor.byteLength)).digest('hex');
// Native oracle: cv2.resize(RGB[::-1].astype(float),(512,512)); subtract
// [104.008,116.669,122.675], transpose NCHW and cast Float32. OpenCV4.11.
const nativeHash = '4cf3a97f66f187c9f10f93301e5a85e608a42dd07659fe1600853fc4c800384e';

test('SelfDM preparation matches OpenCV float64 BGR native tensor exactly', async () => {
  const budget = new Budget(8 * 1024 ** 2), prepare = createSelfDMPrepare({budget});
  const data = pixels(), original = data.slice(), prepared = await prepare.run({...geometry, data});
  assert.equal(sha(prepared.tensor), nativeHash);
  assert.deepEqual(prepared.shape, [1, 3, 512, 512]);
  assert.deepEqual(data, original); assert.equal(budget.total(), 512 ** 2 * 15);
  prepared.release(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM constant input uses native channel order and means without /255', async () => {
  const budget = new Budget(8 * 1024 ** 2), prepare = createSelfDMPrepare({budget});
  const result = await prepare.run({width: 1, height: 1, side: 512, data: new Uint8Array([12, 126, 249])});
  assert.equal(result.tensor[0], Math.fround(249 - 104.008));
  assert.equal(result.tensor[512 ** 2], Math.fround(126 - 116.669));
  assert.equal(result.tensor[2 * 512 ** 2], Math.fround(12 - 122.675));
  assert.ok(result.tensor[0] > 1); result.release(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM streamed row preparation is exact and holds only one source window', async () => {
  const budget = new Budget(8 * 1024 ** 2), prepare = createSelfDMPrepare({budget});
  const data = pixels(); let reads = 0, active = 0, released = 0;
  const result = await prepare.run({...geometry, readRows: async (y, height) => {
    reads++; active++; assert.equal(active, 1);
    assert.ok(height <= 2);
    return {pixels: {width: geometry.width, height, format: 'rgb8', data: data.slice(y * geometry.width * 3, (y + height) * geometry.width * 3)}, release() {active--; released++;}};
  }}, {rowsPerRead: 2});
  assert.equal(sha(result.tensor), nativeHash); assert.equal(reads, released); assert.equal(active, 0);
  assert.equal(result.metrics.sourceReads, reads); assert.equal(result.metrics.rowsPerRead, 2);
  result.release(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM streamed preparation permits a large source without a whole-image tensor', async () => {
  const budget = new Budget(8 * 1024 ** 2), prepare = createSelfDMPrepare({budget}); let reads = 0, released = 0;
  const width = 16385;
  const result = await prepare.run({width, height: 1, side: 512, readRows: async (y, height) => {
    assert.equal(y, 0); assert.equal(height, 1); reads++;
    return {pixels: {width, height, format: 'rgb8', data: new Uint8Array(width * 3).fill(200)}, release() {released++;}};
  }});
  assert.equal(result.tensor[0], Math.fround(200 - 104.008)); assert.equal(reads, 1); assert.equal(released, 1);
  result.release(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM preparation retains caller and source-window ownership without counting bytes twice', async () => {
  const data = pixels(), budget = new Budget(8 * 1024 ** 2), sourceLease = budget.reserve(data.byteLength), prepare = createSelfDMPrepare({budget});
  const result = await prepare.run({...geometry, data});
  assert.equal(budget.total(), data.byteLength + 512 ** 2 * 15);
  result.release(); assert.equal(budget.total(), data.byteLength);
  const streamed = await prepare.run({...geometry, readRows: async (y, height) => {
    const rows = data.slice(y * geometry.width * 3, (y + height) * geometry.width * 3);
    const release = budget.reserve(rows.byteLength);
    assert.equal(budget.total(), data.byteLength + 512 ** 2 * 15 + 512 * 16 + 512 * 3 * 8 * 2 + rows.byteLength);
    return {pixels: {width: geometry.width, height, format: 'rgb8', data: rows}, release};
  }}, {rowsPerRead: 2});
  assert.equal(sha(streamed.tensor), nativeHash); assert.equal(budget.total(), data.byteLength + 512 ** 2 * 15);
  streamed.release(); sourceLease(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM admission failure returns every partial reservation', async () => {
  const budget = new Budget(1), prepare = createSelfDMPrepare({budget});
  const input = {...geometry, data: pixels()};
  await assert.rejects(prepare.run(input), {code: 'MEMORY_LIMIT'}); assert.equal(budget.total(), 0);
  budget.limit = 100000;
  await assert.rejects(prepare.run(input), {code: 'MEMORY_LIMIT'}); assert.equal(budget.total(), 0);
  budget.limit = 8 * 1024 ** 2;
  const result = await prepare.run(input); result.release(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM cancellation preserves source and releases all preparation ownership', async () => {
  const budget = new Budget(8 * 1024 ** 2), prepare = createSelfDMPrepare({budget}), controller = new AbortController();
  const data = pixels(), original = data.slice();
  const pending = prepare.run({...geometry, data}, {signal: controller.signal, onProgress() {controller.abort();}});
  await assert.rejects(prepare.run({...geometry, data}), {code: 'BUSY'});
  await assert.rejects(pending, {code: 'CANCELLED'}); assert.equal(budget.total(), 0); assert.deepEqual(data, original);
  const result = await prepare.run({...geometry, data}); result.release(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM preserves a row-provider failure cause and leaves preparation reusable', async () => {
  const budget = new Budget(8 * 1024 ** 2), prepare = createSelfDMPrepare({budget}), cause = new Error('source read failed');
  await assert.rejects(prepare.run({...geometry, readRows: async () => {throw cause;}}), error => error === cause);
  assert.equal(budget.total(), 0);
  const result = await prepare.run({...geometry, data: pixels()}); result.release(); prepare.dispose(); assert.equal(budget.total(), 0);
});

test('SelfDM cleanup cannot erase a malformed-row cause or strand its budget and busy state', async () => {
  const budget = new Budget(4 * 1024 ** 2), prepare = createSelfDMPrepare({budget}), cleanup = new Error('row cleanup failed');
  await assert.rejects(prepare.run({width:1,height:1,side:512,readRows:async()=>({pixels:{width:2,height:1,format:'rgb8',data:new Uint8Array(6)},release(){throw cleanup;}})}), error => {
    assert.equal(error.code, 'INVALID_INPUT'); assert.match(error.details.cleanupErrors[0].message, /row cleanup failed/); return true;
  });
  assert.equal(budget.total(),0);
  const result = await prepare.run({...geometry,data:pixels()}); assert.equal(sha(result.tensor),nativeHash);
  result.release(); prepare.dispose(); assert.equal(budget.total(),0);
});

test('SelfDM rejects an unpublished result when its final row cleanup fails, then remains reusable', async () => {
  const budget = new Budget(4 * 1024 ** 2), prepare = createSelfDMPrepare({budget}), cleanup = new Error('final row cleanup failed');
  await assert.rejects(prepare.run({width:1,height:1,side:512,readRows:async()=>({pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(12,126,249)},release(){throw cleanup;}})}), error => error === cleanup);
  assert.equal(budget.total(),0);
  const result = await prepare.run({width:1,height:1,side:512,data:Uint8Array.of(12,126,249)});
  assert.equal(result.tensor[0],Math.fround(249-104.008)); result.release(); prepare.dispose(); assert.equal(budget.total(),0);
});

test('SelfDM rejects an unqualified profile, mixed source and disposed preparation', async () => {
  const budget = new Budget(8 * 1024 ** 2), prepare = createSelfDMPrepare({budget});
  await assert.rejects(prepare.run({...geometry, data: pixels(), side: 256}), {code: 'INVALID_INPUT'});
  await assert.rejects(prepare.run({...geometry, data: pixels(), readRows() {}}), {code: 'INVALID_INPUT'});
  assert.equal(budget.total(), 0); prepare.dispose();
  await assert.rejects(prepare.run({...geometry, data: pixels()}), {code: 'INVALID_INPUT'});
});
