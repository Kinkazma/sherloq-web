import test from 'node:test';
import assert from 'node:assert/strict';
import {detectScientificAnnotationBars} from '../src/scientific-annotation-bars.js';

const sha = 'a'.repeat(64);
function fixture({width = 120, height = 70, channels = 4} = {}) {
  const data = new Uint8Array(width * height * channels).fill(255);
  const fill = (x0, y0, x1, y1, color = [0, 0, 0]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
      for (let c = 0; c < 3; c++) data[(y * width + x) * channels + c] = color[c];
  };
  return {width, height, channels, data, fill, sourceSha256: sha,
    regions: [{x0: 80, y0: 40, x1: 115, y1: 65, type: 'gel'}], yieldTask: async () => {}};
}
test('isolated flat horizontal bars are annotations outside acquisitions, with pixels unchanged', async () => {
  const f = fixture(); f.fill(10, 10, 70, 14); f.fill(20, 25, 60, 28, [15, 15, 15]);
  const original = new Uint8Array(f.data), regions = structuredClone(f.regions);
  const result = await detectScientificAnnotationBars(f);
  assert.deepEqual(result.detections.map(d => d.rectangle), [[10, 10, 70, 14], [20, 25, 60, 28]]);
  assert.equal(result.status, 'complete'); assert.equal(result.policy.changesAdmission, false);
  assert.equal(result.detections[0].alreadyExcluded, true);
  assert.deepEqual(f.data, original); assert.deepEqual(f.regions, regions);
});
test('an identical bar inside or touching any acquisition is never annotated', async () => {
  for (const regions of [
    [{x0: 5, y0: 5, x1: 75, y1: 20, type: 'gel'}],
    [{x0: 70, y0: 10, x1: 100, y1: 30, type: 'microscopy'}],
    [{x0: 60, y0: 0, x1: 90, y1: 12, type: 'photography'}],
    [{x0: 1, y0: 1, x1: 119, y1: 69, type: 'gel'}],
  ]) {
    const f = fixture(); f.fill(10, 10, 70, 14); f.regions = regions;
    assert.deepEqual((await detectScientificAnnotationBars(f)).polygons, []);
  }
});
test('polygon acquisition guard checks crossings, containment and boundary, beyond bounding boxes', async () => {
  const f = fixture(); f.fill(10, 10, 70, 14);
  f.regions = [{polygon: [[60, 0], [80, 30], [100, 0]], type: 'microscopy'}];
  assert.deepEqual((await detectScientificAnnotationBars(f)).polygons, []);
  f.regions = [{polygon: [[0, 0], [120, 0], [120, 4], [0, 4]], type: 'gel'}];
  assert.equal((await detectScientificAnnotationBars(f)).polygons.length, 1);
  f.regions = [{polygon: [[20, 11], [22, 13], [24, 11]], type: 'gel'}];
  assert.deepEqual((await detectScientificAnnotationBars(f)).polygons, []);
});
test('anti-aliasing halo is conservative and also cannot touch an acquisition', async () => {
  const f = fixture(); f.fill(9, 9, 71, 15, [128, 128, 128]); f.fill(10, 10, 70, 14);
  assert.deepEqual((await detectScientificAnnotationBars(f)).detections[0].rectangle, [9, 9, 71, 15]);
  f.regions = [{x0: 71, y0: 8, x1: 90, y1: 20, type: 'gel'}];
  assert.deepEqual((await detectScientificAnnotationBars(f)).polygons, []);
});
test('connected corners, curving runs, colorful strokes, thin rules and slabs are not flat bars', async () => {
  const fixtures = [
    f => {f.fill(10, 10, 70, 14); f.fill(10, 5, 12, 14);},
    f => {f.fill(10, 10, 70, 12); f.fill(12, 12, 68, 14);},
    f => f.fill(10, 10, 70, 14, [0, 30, 0]),
    f => f.fill(10, 10, 70, 11),
    f => f.fill(10, 10, 70, 30),
  ];
  for (const paint of fixtures) {const f = fixture(); paint(f); assert.deepEqual((await detectScientificAnnotationBars(f)).polygons, []);}
});
test('one raster-pixel edge drift keeps a common core, while accumulating staircase drift is rejected', async () => {
  const f = fixture(); f.fill(10, 10, 70, 12); f.fill(11, 12, 70, 14);
  assert.deepEqual((await detectScientificAnnotationBars(f)).detections[0].coreRectangle, [11, 10, 70, 14]);
  const staircase = fixture();
  for (let y = 10; y < 16; y++) staircase.fill(y, y, y + 60, y + 1);
  assert.deepEqual((await detectScientificAnnotationBars(staircase)).polygons, []);
});
test('no known acquisitions, invalid geometry or search envelope cannot qualify biological bands', async () => {
  const f = fixture(); f.fill(10, 10, 70, 14); f.regions = [];
  const result = await detectScientificAnnotationBars(f);
  assert.equal(result.status, 'needs-review'); assert.deepEqual(result.polygons, []);
  await assert.rejects(detectScientificAnnotationBars({...f, regions: undefined}), /acquisition regions/);
  await assert.rejects(detectScientificAnnotationBars({...f, regions: [{x0: 0, y0: 0, x1: 120, y1: 70, envelope: true}]}), /search envelopes/);
  await assert.rejects(detectScientificAnnotationBars({...f, regions: [{x0: -1, y0: 0, x1: 120, y1: 70}]}), /original image coordinates/);
});
test('RGB and opaque RGBA agree, transparent pixels cannot become dark ink', async () => {
  const rgb = fixture({channels: 3}), rgba = fixture();
  rgb.fill(10, 10, 70, 14); rgba.fill(10, 10, 70, 14);
  assert.deepEqual((await detectScientificAnnotationBars(rgb)).polygons, (await detectScientificAnnotationBars(rgba)).polygons);
  for (let y = 10; y < 14; y++) for (let x = 10; x < 70; x++) rgba.data[(y * rgba.width + x) * 4 + 3] = 0;
  assert.deepEqual((await detectScientificAnnotationBars(rgba)).polygons, []);
});
test('scan yields bounded rows and honors cancellation without mutation', async () => {
  const f = fixture({height: 200}), controller = new AbortController(); let yields = 0;
  const original = new Uint8Array(f.data);
  await assert.rejects(detectScientificAnnotationBars({...f, signal: controller.signal, yieldTask: async () => {
    yields++; controller.abort();
  }}), {name: 'AbortError'});
  assert.equal(yields, 1); assert.deepEqual(f.data, original);
  await assert.rejects(detectScientificAnnotationBars({...f, sourceSha256: 'wrong'}), /source SHA-256/);
});

function streamed(fixture, {beforeRead, afterRead, badShape = false} = {}) {
  const calls = [], leases = new Set(); let liveBytes = 0, peakBytes = 0, releases = 0;
  const readRows = async (y, rows, {signal} = {}) => {
    await beforeRead?.({y, rows, signal});
    assert.ok(rows <= 32);
    const data = fixture.data.slice(y * fixture.width * fixture.channels, (y + rows) * fixture.width * fixture.channels);
    const pixels = {width: fixture.width, height: badShape ? rows + 1 : rows, data};
    const lease = {pixels, release() {
      assert.equal(leases.delete(lease), true, 'each native pixel lease released once');
      liveBytes -= data.byteLength; releases++;
    }};
    leases.add(lease); liveBytes += data.byteLength; peakBytes = Math.max(peakBytes, liveBytes);
    assert.ok(leases.size <= 2, 'two row windows maximum, including look-behind');
    calls.push({y, rows, bytes: data.byteLength});
    await afterRead?.({y, rows, signal});
    return lease;
  };
  return {readRows, calls, get liveBytes() {return liveBytes;}, get peakBytes() {return peakBytes;}, get releases() {return releases;}};
}
test('leased row blocks exactly match supplied pixels across block boundaries, including halo and look-behind', async () => {
  const f = fixture({height: 140});
  for (const y of [27, 59, 91, 132]) {f.fill(9, y - 1, 71, y + 5, [128, 128, 128]); f.fill(10, y, 70, y + 4);}
  const original = new Uint8Array(f.data), native = await detectScientificAnnotationBars(f), rows = streamed(f);
  const windowed = await detectScientificAnnotationBars({...f, data: undefined, readRows: rows.readRows});
  assert.deepEqual(windowed.polygons, native.polygons); assert.deepEqual(windowed.detections, native.detections);
  assert.equal(windowed.detections.length, 4); assert.equal(rows.liveBytes, 0); assert.equal(rows.releases, rows.calls.length);
  assert.ok(rows.peakBytes <= f.width * f.channels * 64);
  assert.equal(windowed.memory.peakWindowBytes, rows.peakBytes);
  assert.equal(windowed.memory.temporaryAllocatedBytes, 0);
  assert.equal(windowed.memory.fullImageAllocation, false);
  assert.deepEqual(f.data, original);
});
test('allocation or native read failure releases every retained window', async () => {
  const f = fixture({height: 200}), rows = streamed(f, {beforeRead({y}) {if (y === 64) throw Error('native budget allocation refused');}});
  await assert.rejects(detectScientificAnnotationBars({...f, data: undefined, readRows: rows.readRows}), /native budget allocation refused/);
  assert.equal(rows.liveBytes, 0); assert.equal(rows.releases, 2);
  const invalid = streamed(f, {badShape: true});
  await assert.rejects(detectScientificAnnotationBars({...f, data: undefined, readRows: invalid.readRows}), /bounded native pixel lease/);
  assert.equal(invalid.liveBytes, 0); assert.equal(invalid.releases, 1);
});
test('cancellation after a native read or during cooperative yield releases all row leases', async () => {
  for (const stage of ['read', 'yield']) {
    const f = fixture({height: 200}), controller = new AbortController();
    const rows = streamed(f, {afterRead({y, signal}) {
      assert.equal(signal, controller.signal); if (stage === 'read' && y === 32) controller.abort();
    }});
    await assert.rejects(detectScientificAnnotationBars({...f, data: undefined, readRows: rows.readRows, signal: controller.signal,
      yieldTask: async () => {if (stage === 'yield') controller.abort();}}), {name: 'AbortError'});
    assert.equal(rows.liveBytes, 0); assert.equal(rows.releases, 2);
  }
});
test('very long dark components skip expired look-behind and never request full-image RGB', async () => {
  const f = fixture({height: 200}); f.fill(10, 1, 70, 195);
  const rows = streamed(f), result = await detectScientificAnnotationBars({...f, data: undefined, readRows: rows.readRows});
  assert.deepEqual(result.polygons, []); assert.equal(rows.liveBytes, 0);
  assert.ok(rows.calls.every(call => call.bytes <= f.width * f.channels * 32));
  assert.ok(rows.peakBytes < f.data.byteLength / 2);
});
