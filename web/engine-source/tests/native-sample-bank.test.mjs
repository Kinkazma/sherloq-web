import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Budget} from '../src/cache.js';
import {createNativeSampleBank} from '../src/native-sample-bank.js';


// Real local files exercise the shared byte store; no browser-backend claim.
async function createNodeCacheSession({root, asynchronous, maximumBytes}) {
  const directory = await fs.mkdtemp(path.join(root, 'sample-bank-')), files = new Set();
  let serial = 0, logicalBytes = 0;
  return {backend: asynchronous ? 'node-test-asynchronous' : 'node-test-synchronous',
    snapshot: () => ({files: files.size, logicalBytes}),
    async create(byteLength) {
      assert.ok(byteLength <= maximumBytes - logicalBytes);
      const filename = path.join(directory, String(++serial)), fd = nodeFs.openSync(filename, 'wx+');
      nodeFs.ftruncateSync(fd, byteLength); logicalBytes += byteLength;
      const run = action => asynchronous ? Promise.resolve().then(action) : action();
      let closed = false, removed = false;
      const file = {byteLength,
        readInto(target, offset) { return run(() => {
          let at = 0; while (at < target.length) {
            const count = nodeFs.readSync(fd, target, at, target.length - at, offset + at);
            assert.ok(count > 0); at += count;
          } return target;
        }); },
        write(source, offset) { return run(() => {
          let at = 0; while (at < source.length) {
            const count = nodeFs.writeSync(fd, source, at, source.length - at, offset + at);
            assert.ok(count > 0); at += count;
          }
        }); }, flush() {},
        async dispose() {
          if (!closed) { nodeFs.closeSync(fd); closed = true; }
          if (!removed) { await fs.unlink(filename); removed = true; logicalBytes -= byteLength; files.delete(file); }
        },
      }; files.add(file); return file;
    },
    async dispose() { for (const file of [...files]) await file.dispose(); await fs.rmdir(directory); },
  };
}

const bytesOf = data => new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
const originalBinding = (samples, imageId = 'component-fixture') => ({imageId, sourceSurfaceId: 'original-surface',
  sourceSha256: createHash('sha256').update(bytesOf(samples)).digest('hex'), sourceRevision: 1, kind: 'fixture'});
const options = (samples, extra = {}) => ({width: 1, height: 1,
  sampleType: 'uint8', channels: 1, channelMap: ['sample'], sourceDepth: null,
  domain: 'decoded', sampleModel: 'component-fixture', bindingOriginal: originalBinding(samples), budget: new Budget(1 << 20), ...extra});
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };

function fixture(Type, length) {
  const offset = 12, buffer = new ArrayBuffer(offset + length * Type.BYTES_PER_ELEMENT + 8), data = new Type(buffer, offset, length);
  if (Type === Float32Array) {
    const words = new Uint32Array(buffer, offset, length), patterns = [0, 0x80000000, 1, 0x007fffff, 0x00800000,
      0x7f7fffff, 0xff7fffff, 0x7fc00001, 0x7fa12345, 0xffc12345, 0xffa54321, 0x7f800000, 0xff800000];
    for (let i = 0; i < words.length; ++i) words[i] = patterns[i % patterns.length];
  } else for (let i = 0; i < length; ++i) data[i] = (i * 258 + (i % 7)) & (Type === Uint8Array ? 255 : 65535);
  return data;
}

function expectedWindow(data, sw, sh, channels, orientation, {x, y, width, height}) {
  const size = data.BYTES_PER_ELEMENT, pixel = channels * size, source = bytesOf(data), result = new Uint8Array(width * height * pixel);
  for (let dy = 0; dy < height; ++dy) for (let dx = 0; dx < width; ++dx) {
    const px = x + dx, py = y + dy; let sx = px, sy = py;
    switch (orientation) {
      case 2: sx = sw - 1 - px; break; case 3: sx = sw - 1 - px; sy = sh - 1 - py; break;
      case 4: sy = sh - 1 - py; break; case 5: sx = py; sy = px; break;
      case 6: sx = py; sy = sh - 1 - px; break; case 7: sx = sw - 1 - py; sy = sh - 1 - px; break;
      case 8: sx = sw - 1 - py; sy = px; break;
    }
    const from = (sy * sw + sx) * pixel, to = (dy * width + dx) * pixel;
    result.set(source.subarray(from, from + pixel), to);
  }
  return result;
}

function temporary(budget, {readGate, writeGate, flushOutcomes = [], closeOutcomes = [], onCreate} = {}) {
  const readStarted = deferred(), writeStarted = deferred(), state = {creates: 0, reads: 0, writes: 0,
    flushes: 0, closes: 0, live: new Set(), closed: 0};
  const outcome = (items, fallback) => {
    if (!items.length) return fallback;
    const [kind, value] = items.shift(); if (kind === 'throw') throw value; return value;
  };
  const session = {backend: 'opfs', async create(byteLength) {
    ++state.creates; const memory = budget.reserve(byteLength), token = {}; state.live.add(token);
    let data = new Uint8Array(byteLength), disposed = false;
    const file = {byteLength,
      async write(source, offset, hooks) { ++state.writes; writeStarted.resolve(); if (writeGate) await writeGate.promise;
        assert.equal(disposed, false); data.set(source, offset); return undefined; },
      async readInto(target, offset, hooks) { ++state.reads; readStarted.resolve(); if (readGate) await readGate.promise;
        assert.equal(disposed, false); target.set(data.subarray(offset, offset + target.length)); return target; },
      flush() { ++state.flushes; return outcome(flushOutcomes, undefined); },
      async dispose() { ++state.closes; if (disposed) return;
        const value = outcome(closeOutcomes, undefined); if (value === false || value === 0) return value;
        disposed = true; data = null; state.live.delete(token); ++state.closed; memory(); return value; },
    };
    onCreate?.(file); return file;
  }};
  return {session, state, readStarted, writeStarted};
}

for (const [sampleType, Type] of [['uint8', Uint8Array], ['uint16', Uint16Array], ['float32', Float32Array]]) {
  for (const channels of [1, 3, 4, 5]) test(`${sampleType}/${channels} channels: exact full/cropped samples through8 orientations`, async () => {
    const sw = 7, sh = 5, data = fixture(Type, sw * sh * channels), saved = Buffer.from(bytesOf(data));
    for (let orientation = 1; orientation <= 8; ++orientation) {
      const budget = new Budget(1 << 20), bank = await createNativeSampleBank(options(data, {width: sw, height: sh,
        sampleType, channels, channelMap: Array.from({length: channels}, (_, c) => 'source-' + c),
        domain: 'decoded', sampleModel: channels === 5 ? 'CMYK' : 'fixture-samples',
        sampleSemantics: channels === 5 ? {alpha: 'unassociated'} : null,
        sourceDepth: sampleType === 'uint8' ? 8 : sampleType === 'uint16' ? null : 16,
        orientation, chunkBytes: 19, budget}));
      await bank.writeBand({y: 0, rows: 2, samples: data.subarray(0, sw * 2 * channels)});
      await bank.writeBand({y: 2, rows: 3, samples: data.subarray(sw * 2 * channels)});
      const surface = await bank.seal(), d = surface.descriptor;
      assert.equal(d.format, 'native-samples'); assert.equal(d.sampleType, sampleType);
      assert.equal(d.containerBits, Type.BYTES_PER_ELEMENT * 8); assert.equal(d.channels, channels);
      assert.equal(d.bindingOriginal.sourceSha256, originalBinding(data).sourceSha256);
      for (const rect of [{x: 0, y: 0, width: d.width, height: d.height},
        {x: 1, y: 1, width: d.width - 2, height: d.height - 2}, {x: d.width - 1, y: d.height - 1, width: 1, height: 1}]) {
        const result = await surface.readWindow(rect);
        assert.equal(result.samples.constructor, Type);
        assert.deepEqual(bytesOf(result.samples), expectedWindow(data, sw, sh, channels, orientation, rect));
        assert.equal(result.surfaceId, d.id); assert.equal(result.revision, d.revision);
        assert.equal(result.bindingOriginal, d.bindingOriginal); assert.equal(typeof result.windowLeaseId, 'string');
        result.release(); result.release(); assert.equal(result.samples, null); assert.equal(budget.active, 0);
      }
      assert.deepEqual(Buffer.from(bytesOf(data)), saved); await surface.dispose(); await bank.dispose();
      assert.equal(budget.total(), 0); assert.equal(bank.state.closed, true);
    }
  });
}

test('temporary backing uses the same exact Float32 bytes and oriented grid', async () => {
  const data = fixture(Float32Array, 4 * 3 * 5), budget = new Budget(1 << 20), disk = temporary(budget);
  const bank = await createNativeSampleBank(options(data, {width: 4, height: 3, sampleType: 'float32',
    channels: 5, channelMap: ['C', 'M', 'Y', 'K', 'A'], domain: 'decoded', sampleModel: 'CMYK', sourceDepth: 32,
    orientation: 6, budget, storage: 'temporary', getTemporarySession: async () => disk.session}));
  await bank.writeBand({y: 0, rows: 3, samples: data}); const surface = await bank.seal();
  const rect = {x: 0, y: 0, width: 3, height: 4}, result = await surface.readWindow(rect);
  assert.deepEqual(bytesOf(result.samples), expectedWindow(data, 4, 3, 5, 6, rect));
  assert.equal(surface.descriptor.storage, 'temporary'); result.release();
  await bank.dispose(); assert.equal(disk.state.closed, 1); assert.equal(budget.total(), 0);
});

test('canonical little-endian bank keeps signaling/quiet NaNs, signed0 and subnormal words', async () => {
  const data = fixture(Float32Array, 26), budget = new Budget(1 << 20), bank = await createNativeSampleBank(options(data,
    {width: 26, height: 1, sampleType: 'float32', sourceDepth: 32, budget, chunkBytes: 11}));
  await bank.writeBand({y: 0, rows: 1, samples: data}); const surface = await bank.seal();
  const raw = new Uint8Array(data.byteLength); await bank.store.readInto(raw, 0);
  const expected = new Uint8Array(data.byteLength), view = new DataView(expected.buffer), words = new Uint32Array(data.buffer, data.byteOffset, data.length);
  for (let i = 0; i < words.length; ++i) view.setUint32(i * 4, words[i], true);
  assert.deepEqual(raw, expected); const result = await surface.readWindow();
  assert.deepEqual(new Uint32Array(result.samples.buffer), words); result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
});

test('pending content identity cannot publish and binding cannot replace its provenance', async () => {
  const data = new Uint8Array([7, 8]), fixed = originalBinding(data), pending = {...fixed, sourceSha256: null},
    budget = new Budget(1024), bank = await createNativeSampleBank(options(data, {width: 2, budget, bindingOriginal: pending}));
  await bank.writeBand({y: 0, rows: 1, samples: data});
  assert.equal(bank.descriptor.identityStatus, 'pending'); await assert.rejects(bank.seal(), /identity/);
  assert.throws(() => bank.bindOriginalIdentity({...fixed, imageId: 'another-source'}), /identity changed/);
  bank.bindOriginalIdentity(fixed); assert.equal(bank.descriptor.identityStatus, 'fixed');
  assert.throws(() => bank.bindOriginalIdentity({...fixed, sourceSha256: '00'.repeat(32)}), /identity changed/);
  const surface = await bank.seal(); assert.throws(() => bank.bindOriginalIdentity(fixed), /cannot be rebound/);
  const result = await surface.readWindow(); assert.equal(result.bindingOriginal.sourceSha256, fixed.sourceSha256);
  result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
});

test('metadata stays explicit/immutable and never implies RGB or serializes private profile bytes', async () => {
  const data = new Uint16Array([12, 13, 14, 15]), budget = new Budget(1024), semantics = {alpha: null, source: {name: 'CMYK'}},
    map = ['C', 'M', 'Y', 'K'], color = {icc: {sha256: 'ab'.repeat(32), bytes: 32}}, bank = await createNativeSampleBank(options(data,
      {sampleType: 'uint16', channels: 4, channelMap: map, domain: 'decoded', sampleModel: 'CMYK', sampleSemantics: semantics, color, budget}));
  semantics.source.name = 'RGB'; map[0] = 'R'; color.icc.bytes = 99;
  assert.equal(bank.descriptor.sampleModel, 'CMYK'); assert.equal(bank.descriptor.sampleSemantics.source.name, 'CMYK'); assert.deepEqual(bank.descriptor.channelMap, ['C', 'M', 'Y', 'K']);
  assert.equal(bank.descriptor.sourceDepth, null); assert.equal(bank.descriptor.color.icc.bytes, 32);
  assert.equal(Object.hasOwn(bank.descriptor, 'nativeDepth'), false); assert.equal(Object.hasOwn(bank.descriptor, 'rgb16'), false);
  assert.throws(() => { bank.descriptor.channelMap[0] = 'R'; }, TypeError);
  await bank.dispose(); assert.equal(budget.total(), 0);
  await assert.rejects(createNativeSampleBank(options(new Uint8Array(1), {color: {profileBytes: new Uint8Array(4)}})), /profile payloads/);
});

test('partial, concurrent and out-of-order bands never seal or advance coverage', async () => {
  const data = new Uint16Array([0, 1, 2, 3]), budget = new Budget(1024), gate = deferred(), disk = temporary(budget, {writeGate: gate}),
    bank = await createNativeSampleBank(options(data, {width: 2, height: 2, sampleType: 'uint16', budget,
      storage: 'temporary', temporarySession: disk.session}));
  const first = bank.writeBand({y: 0, rows: 1, samples: data.subarray(0, 2)}); await disk.writeStarted.promise;
  await assert.rejects(bank.writeBand({y: 0, rows: 1, samples: data.subarray(0, 2)}), /concurrent/);
  await assert.rejects(bank.seal(), /coverage/); gate.resolve(); await first;
  await assert.rejects(bank.writeBand({y: 0, rows: 1, samples: data.subarray(0, 2)}), /out-of-order/);
  await assert.rejects(bank.seal(), /coverage/); assert.equal(bank.rowsWritten, 1);
  await bank.writeBand({y: 1, rows: 1, samples: data.subarray(2)}); await bank.seal();
  await assert.rejects(bank.writeBand({y: 2, rows: 1, samples: data.subarray(0, 2)}));
  await bank.dispose(); assert.equal(budget.total(), 0);
});

test('cancellation after a pending write cannot commit coverage or publish partial samples', async () => {
  const data = new Float32Array([-1, 2]), budget = new Budget(1024), gate = deferred(), control = new AbortController(),
    disk = temporary(budget, {writeGate: gate}), bank = await createNativeSampleBank(options(data,
      {width: 2, sampleType: 'float32', budget, storage: 'temporary', temporarySession: disk.session}));
  const writing = bank.writeBand({y: 0, rows: 1, samples: data}, {signal: control.signal});
  await disk.writeStarted.promise; control.abort(); gate.resolve(); await assert.rejects(writing, error => error.code === 'CANCELLED');
  assert.equal(bank.rowsWritten, 0); await assert.rejects(bank.seal(), /coverage/);
  await bank.writeBand({y: 0, rows: 1, samples: data}); const surface = await bank.seal();
  const result = await surface.readWindow(); assert.deepEqual(bytesOf(result.samples), bytesOf(data));
  result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
});

test('cancelled read releases its buffers and leaves the sealed bank readable', async () => {
  const data = new Uint8Array([1, 2, 3, 4]), budget = new Budget(1024), gate = deferred(), control = new AbortController(),
    disk = temporary(budget, {readGate: gate}), bank = await createNativeSampleBank(options(data,
      {width: 4, budget, storage: 'temporary', temporarySession: disk.session}));
  await bank.writeBand({y: 0, rows: 1, samples: data}); const surface = await bank.seal(), retained = budget.total();
  const reading = surface.readWindow({}, {signal: control.signal}); await disk.readStarted.promise;
  control.abort(); gate.resolve(); await assert.rejects(reading, error => error.code === 'CANCELLED');
  assert.equal(bank.state.activeLeases, 0); assert.equal(budget.total(), retained);
  const result = await surface.readWindow(); assert.deepEqual(result.samples, data);
  result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
});

test('dispose waits for in-flight read, prevents late publication and releases existing leases', async () => {
  const data = new Uint8Array([1, 2, 3, 4]), budget = new Budget(1024), gate = deferred(),
    disk = temporary(budget, {readGate: gate}), bank = await createNativeSampleBank(options(data,
      {width: 4, budget, storage: 'temporary', temporarySession: disk.session}));
  await bank.writeBand({y: 0, rows: 1, samples: data}); const surface = await bank.seal();
  const reading = surface.readWindow(); await disk.readStarted.promise;
  const closing = bank.dispose(); assert.equal(bank.dispose(), closing); assert.equal(bank.state.closed, false);
  assert.equal(disk.state.closes, 0); await assert.rejects(surface.readWindow(), error => error.code === 'DISPOSED');
  gate.resolve(); await assert.rejects(reading, error => error.code === 'DISPOSED'); await closing;
  assert.equal(bank.state.activeLeases, 0); assert.equal(disk.state.closed, 1); assert.equal(budget.total(), 0);

  const memory = new Budget(1024), heldBank = await createNativeSampleBank(options(data, {width: 4, budget: memory}));
  await heldBank.writeBand({y: 0, rows: 1, samples: data}); const heldSurface = await heldBank.seal();
  const held = await heldSurface.readWindow(); assert.equal(heldBank.state.activeLeases, 1);
  await heldBank.dispose(); assert.equal(held.samples, null); held.release(); assert.equal(memory.total(), 0);
});

test('dispose waits for in-flight write and never publishes after close was requested', async () => {
  const data = new Uint8Array([1, 2]), budget = new Budget(1024), gate = deferred(), disk = temporary(budget, {writeGate: gate}),
    bank = await createNativeSampleBank(options(data, {width: 2, budget, storage: 'temporary', temporarySession: disk.session}));
  const writing = bank.writeBand({y: 0, rows: 1, samples: data}); await disk.writeStarted.promise;
  const closing = bank.dispose(); assert.equal(disk.state.closes, 0); gate.resolve();
  await assert.rejects(writing, error => error.code === 'DISPOSED'); await closing;
  assert.equal(bank.rowsWritten, 0); assert.equal(budget.total(), 0); await assert.rejects(bank.seal(), error => error.code === 'DISPOSED');
});

test('false/0/frozen/null retirement NACKs keep the same owner and credit until a successful retry', async () => {
  const frozen = Object.freeze({code: 'CLOSE_REFUSED', note: 'fixture'}), data = new Uint8Array([1, 2]), budget = new Budget(1024),
    declines = [['return', false], ['return', 0], ['throw', frozen], ['throw', null]],
    disk = temporary(budget, {closeOutcomes: declines}), bank = await createNativeSampleBank(options(data,
      {width: 2, budget, storage: 'temporary', getTemporarySession: async () => disk.session}));
  await bank.writeBand({y: 0, rows: 1, samples: data}); const surface = await bank.seal(), store = bank.store;
  for (const expected of [false, 0, frozen, null]) {
    await assert.rejects(bank.dispose(), error => error === expected);
    assert.equal(bank.store, store); assert.equal(disk.state.live.size, 1); assert.equal(budget.total(), data.byteLength);
    assert.equal(bank.state.retirementPending, true); assert.equal(bank.state.closed, false); assert.equal(bank.state.closeFailed, true);
    await assert.rejects(surface.readWindow(), error => error.code === 'DISPOSED');
    await assert.rejects(bank.writeBand({y: 0, rows: 1, samples: data}), error => error.code === 'DISPOSED');
  }
  await bank.dispose(); assert.equal(bank.state.closed, true); assert.equal(bank.state.closeAttempts, 5);
  assert.equal(disk.state.creates, 1); assert.equal(disk.state.closes, 5); assert.equal(disk.state.live.size, 0); assert.equal(budget.total(), 0);
});

test('flush NACK cannot seal and can be retried without a second source/store', async () => {
  const data = new Uint8Array([1]), budget = new Budget(1024), disk = temporary(budget,
    {flushOutcomes: [['return', false], ['return', 0]]}), bank = await createNativeSampleBank(options(data,
      {budget, storage: 'temporary', temporarySession: disk.session}));
  await bank.writeBand({y: 0, rows: 1, samples: data});
  for (const expected of [false, 0]) { await assert.rejects(bank.seal(), error => error === expected); assert.equal(bank.state.sealed, false); }
  const surface = await bank.seal(), result = await surface.readWindow(); assert.deepEqual(result.samples, data);
  assert.equal(disk.state.creates, 1); result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
});

test('constructor cancellation plus refused cleanup preserves its retry owner', async () => {
  const data = new Uint8Array([1]), budget = new Budget(1024), control = new AbortController(),
    disk = temporary(budget, {onCreate: () => control.abort(), closeOutcomes: [['return', false], ['return', 0]]});
  let failure;
  try { await createNativeSampleBank(options(data, {budget, signal: control.signal,
    storage: 'temporary', temporarySession: disk.session})); } catch (error) { failure = error; }
  assert.equal(failure.code, 'CANCELLED'); assert.equal(typeof failure.cleanupOwner.dispose, 'function');
  assert.equal(failure.cleanupOwner.state.retirementPending, true); assert.equal(budget.total(), 1);
  await assert.rejects(failure.cleanupOwner.dispose(), value => value === 0);
  assert.equal(disk.state.live.size, 1); await failure.cleanupOwner.dispose(); assert.equal(budget.total(), 0);
});

test('an admission refusal keeps the source; smaller later windows still work', async () => {
  const data = new Uint8Array(64).map((_, i) => i), budget = new Budget(80), bank = await createNativeSampleBank(options(data,
    {width: 8, height: 8, budget, storage: 'memory', chunkBytes: 7}));
  await bank.writeBand({y: 0, rows: 8, samples: data}); const surface = await bank.seal();
  await assert.rejects(surface.readWindow(), error => error.code === 'MEMORY_LIMIT');
  assert.equal(budget.total(), 64); const result = await surface.readWindow({x: 3, y: 3, width: 1, height: 1});
  assert.equal(result.samples[0], 27); result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
});

test('window transfer separates data from its local lease; no function is serialized', async () => {
  const data = new Uint16Array([0, 1, 32768, 65535]), budget = new Budget(1024), bank = await createNativeSampleBank(options(data,
    {width: 4, sampleType: 'uint16', budget}));
  await bank.writeBand({y: 0, rows: 1, samples: data}); const surface = await bank.seal(), result = await surface.readWindow();
  const wire = {windowLeaseId: result.windowLeaseId, surfaceId: result.surfaceId, revision: result.revision,
    bindingOriginal: result.bindingOriginal, origin: result.origin, width: result.width, height: result.height,
    descriptor: result.descriptor, samples: result.samples};
  const received = structuredClone(wire, {transfer: [wire.samples.buffer]});
  assert.deepEqual(received.samples, data); assert.equal(result.samples.byteLength, 0); assert.equal(Object.hasOwn(received, 'release'), false);
  assert.equal(bank.state.activeLeases, 1); result.release(); assert.equal(bank.state.activeLeases, 0);
  await bank.dispose(); assert.equal(budget.total(), 0);
});

test('checked retirement supports frozen session/file owners without mutating them', async () => {
  const data = new Uint8Array([1]), budget = new Budget(1024), disk = temporary(budget,
    {onCreate: file => Object.freeze(file), closeOutcomes: [['return', false]]});
  Object.freeze(disk.session);
  const bank = await createNativeSampleBank(options(data, {budget, storage: 'temporary', temporarySession: disk.session}));
  await bank.writeBand({y: 0, rows: 1, samples: data}); await bank.seal();
  await assert.rejects(bank.dispose(), error => error === false); assert.equal(disk.state.live.size, 1);
  await bank.dispose(); assert.equal(disk.state.live.size, 0); assert.equal(budget.total(), 0);
});

test('10/12 coded integer bits remain distinct from their16-bit storage container', async () => {
  for (const bits of [10, 12]) {
    const data = Uint16Array.from([0, 1, 2, 3, 256, 257, 258, 2 ** bits - 2, 2 ** bits - 1]), budget = new Budget(1024),
      bank = await createNativeSampleBank(options(data, {width: data.length, sampleType: 'uint16', sourceDepth: bits,
        valueEncoding: {kind: 'source-integer-code', range: [0, 2 ** bits - 1]}, budget}));
    await bank.writeBand({y: 0, rows: 1, samples: data}); const surface = await bank.seal(), result = await surface.readWindow();
    assert.equal(surface.descriptor.sourceDepth, bits); assert.equal(surface.descriptor.containerBits, 16);
    assert.deepEqual(result.samples, data); result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
  }
});

test('the sensor domain preserves its physical grid; orientation is metadata of later views', async () => {
  const data = Uint16Array.from([0, 1, 2, 3]), budget = new Budget(1024), settings = options(data,
    {width: 2, height: 2, sampleType: 'uint16', domain: 'sensor', sampleModel: 'raw-decoded-sensor',
      sourceDepth: null, budget, provenance: {sourceDisplayOrientation: 6}});
  await assert.rejects(createNativeSampleBank({...settings, orientation: 6}), /unrotated physical grid/);
  const bank = await createNativeSampleBank(settings); await bank.writeBand({y: 0, rows: 2, samples: data});
  const surface = await bank.seal(), result = await surface.readWindow();
  assert.equal(surface.descriptor.domain, 'sensor'); assert.equal(surface.descriptor.orientation, 1);
  assert.equal(surface.descriptor.sourceDepth, null); assert.equal(surface.descriptor.provenance.sourceDisplayOrientation, 6);
  assert.deepEqual(result.samples, data); result.release(); await bank.dispose(); assert.equal(budget.total(), 0);
});

test('undeclared channel holes and unsupported sample types fail before allocating a backing', async () => {
  const data = new Uint8Array([0, 0, 0]), budget = new Budget(1024);
  await assert.rejects(createNativeSampleBank(options(data, {channels: 3, channelMap: new Array(3), budget})), /layout/);
  await assert.rejects(createNativeSampleBank(options(data, {sampleType: 'float64', budget})), /layout/);
  assert.equal(budget.total(), 0);
});

for (const asynchronous of [false, true]) test(`real Node test-file backing (${asynchronous ? 'async' : 'sync'}): Float32 words and closure`, async () => {
  const root = process.env.SHERLOQ_TEST_ARTIFACT_DIR ?? os.tmpdir(); await fs.mkdir(root, {recursive: true});
  const session = await createNodeCacheSession({root, asynchronous, maximumBytes: 1024}),
    data = fixture(Float32Array, 3 * 4 * 5), budget = new Budget(1 << 20);
  let bank;
  try {
    bank = await createNativeSampleBank(options(data, {width: 3, height: 4, sampleType: 'float32',
      channels: 5, channelMap: ['C', 'M', 'Y', 'K', 'A'], sampleModel: 'CMYK', orientation: 8,
      budget, storage: 'temporary', temporarySession: session}));
    await bank.writeBand({y: 0, rows: 2, samples: data.subarray(0, 30)});
    await bank.writeBand({y: 2, rows: 2, samples: data.subarray(30)});
    const surface = await bank.seal(), rect = {x: 1, y: 0, width: 3, height: 3}, result = await surface.readWindow(rect);
    assert.deepEqual(bytesOf(result.samples), expectedWindow(data, 3, 4, 5, 8, rect)); result.release();
    assert.equal(session.snapshot().files, 1); assert.equal(session.snapshot().logicalBytes, data.byteLength);
    await bank.dispose(); assert.equal(session.snapshot().files, 0); assert.equal(budget.total(), 0);
  } finally { await bank?.dispose(); await session.dispose(); }
});
