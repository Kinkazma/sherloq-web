import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createNativeSampleBank} from '../src/native-sample-bank.js';
import {createSourceSamplesService} from '../src/source-samples-service.js';

const pending = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return {promise, resolve}; };
function fixture({phase = false, closeOutcomes = [], terminateOutcomes = [], auxiliaryOutcomes = [],
  readGate, releaseGate, readReleaseOutcomes = [], providerError, invalidateWindow = false, onCodecClose, publishedFrame} = {}) {
  const samples = Uint16Array.from([0, 1, 256, 257, 258, 1023, 4095, 65535, 19, 20, 21, 22]),
    bindingOriginal = Object.freeze({imageId: 'original-image', sourceSurfaceId: 'original-surface', sourceRevision: 1,
      sourceSha256: createHash('sha256').update(new Uint8Array(samples.buffer)).digest('hex'), kind: 'fixture'}),
    budget = new Budget(4096), events = [], readStarted = pending();
  let current = bindingOriginal, service, providerCalls = 0, releaseCalls = 0, bank, auxiliaryOpen = false;
  const result = items => { if (!items.length) return undefined; const [kind, value] = items.shift(); if (kind === 'throw') throw value; return value; };
  service = createSourceSamplesService({budget, bindingOriginal, currentBinding: () => current,
    onOwner(owner) { events.push(['registered', owner === service]); },
    async prepareProvider(context) {
      ++providerCalls; events.push(['prepare', context.domain, context.frame]);
      if (phase) {
        const ticket = context.codecPhase({bytes: 64}); ticket.admitCapacity(128);
        ticket.adopt({dispose() { events.push(['codec-close', budget.total()]); onCodecClose?.(); return result(closeOutcomes); },
          terminate() { events.push(['codec-terminate', budget.total()]); return terminateOutcomes.length
            ? result(terminateOutcomes) : {terminated: true, kind: 'component-transport-certificate'}; }});
      }
      const calibration = budget.reserve(20); auxiliaryOpen = true;
      context.adoptAuxiliaryOwner({dispose() {
        events.push(['auxiliary-close', bank?.state.closed]);
        const value = result(auxiliaryOutcomes); if (value === false || value === 0) return value;
        if (auxiliaryOpen) { calibration(); auxiliaryOpen = false; } return value;
      }});
      if (providerError !== undefined) throw providerError;
      bank = await createNativeSampleBank({width: 4, height: 1, sampleType: 'uint16', channels: 3,
        channelMap: ['R', 'G', 'B'], sourceDepth: 12, domain: context.domain,
        sampleModel: context.domain === 'sensor' ? 'raw-decoded-sensor' : 'RGB',
        bindingOriginal, budget, chunkBytes: 7});
      context.adoptSourceOwner(bank); await bank.writeBand({y: 0, rows: 1, samples});
      const originalSurface = await bank.seal();
      context.publishSource({...originalSurface,
        ...(publishedFrame === undefined ? {} : {descriptor: {...originalSurface.descriptor, selectedFrame: publishedFrame}}),
        async readWindow(rect, hooks) {
        const lease = await originalSurface.readWindow(rect, hooks); readStarted.resolve();
        if (readGate) await readGate.promise;
        const release = lease.release.bind(lease);
        lease.release = async () => { ++releaseCalls; if (releaseGate) await releaseGate.promise;
          const value = result(readReleaseOutcomes); if (value === false || value === 0) return value; return release(); };
        if (invalidateWindow) lease.revision += 1;
        return lease;
      }});
    }});
  return {service, samples, bindingOriginal, budget, events, readStarted,
    get bank() { return bank; }, get providerCalls() { return providerCalls; }, get releaseCalls() { return releaseCalls; },
    changeOriginal() { current = {...bindingOriginal, sourceSha256: '00'.repeat(32)}; },
    prepare(domain = 'decoded', hooks = {}) { return service.prepareSourceSamples({domain, bindingOriginal}, hooks); },
    request(source, extra = {}) { return {...source, bindingOriginal, rect: {x: 0, y: 0, width: 4, height: 1}, ...extra}; },
  };
}

test('codec/native-close/termination precede phase refund; only bank+calibration survive prepare', async () => {
  const f = fixture({phase: true}), source = await f.prepare();
  assert.equal(f.events[0][0], 'registered'); assert.equal(f.providerCalls, 1);
  assert.equal(f.budget.total(), f.samples.byteLength + 20 + f.service.state.receiptBytes);
  assert.deepEqual(f.events.filter(event => /codec/.test(event[0])), [
    ['codec-close', 128 + f.samples.byteLength + 20], ['codec-terminate', 128 + f.samples.byteLength + 20]]);
  assert.equal(source.descriptor.format, 'native-samples');
  assert.equal(f.service.state.domains[0].codecs.length, 0);
  await f.service.retireSourceSamples(f.request(source));
  assert.deepEqual(f.events.at(-1), ['auxiliary-close', true]); assert.equal(f.budget.total(), f.service.state.receiptBytes);
  await f.service.dispose(); assert.equal(f.service.state.closed, true);
});

test('transferred samples stay funded through source retirement until their window ACK', async () => {
  const f = fixture(), source = await f.prepare(); let received;
  const wire = await f.service.readSourceSamples(f.request(source), {publish(value, transfer) { received = structuredClone(value, {transfer}); }});
  assert.deepEqual(received.samples, f.samples); assert.equal(wire.samples.byteLength, 0);
  assert.equal(Object.hasOwn(received, 'release'), false); assert.equal(f.budget.total(), f.samples.byteLength * 2 + 20 + f.service.state.receiptBytes + 256);
  await assert.rejects(f.service.retireSourceSamples(f.request(source)), /unacknowledged windows/);
  assert.equal(f.bank.state.closed, false); assert.equal(f.service.state.windowLeases, 1);
  await assert.rejects(f.service.readSourceSamples(f.request(source)), /retiring/);
  await f.service.retireSourceSamples(f.request(source, {windowLeaseId: received.windowLeaseId}));
  assert.equal(f.budget.total(), f.samples.byteLength + 20 + f.service.state.receiptBytes);
  await f.service.retireSourceSamples(f.request(source)); assert.equal(f.budget.total(), f.service.state.receiptBytes); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('two source leases reuse the reader; one lease cannot ACK another lease window', async () => {
  const f = fixture(), a = await f.prepare(), b = await f.prepare(); assert.equal(f.providerCalls, 1);
  assert.equal(a.sourceId, b.sourceId); assert.notEqual(a.sourceLeaseId, b.sourceLeaseId);
  const window = await f.service.readSourceSamples(f.request(a));
  await assert.rejects(f.service.retireSourceSamples(f.request(b, {windowLeaseId: window.windowLeaseId})), /another source/);
  assert.equal(f.service.state.windowLeases, 1);
  await f.service.retireSourceSamples(f.request(b)); assert.equal(f.bank.state.closed, false);
  await f.service.retireSourceSamples(f.request(a, {windowLeaseId: window.windowLeaseId}));
  await f.service.retireSourceSamples(f.request(a)); assert.equal(f.bank.state.closed, true); assert.equal(f.budget.total(), f.service.state.receiptBytes);
  await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('changed Original blocks science but its old leases remain retirable under captured identity', async () => {
  const f = fixture(), source = await f.prepare(), window = await f.service.readSourceSamples(f.request(source));
  f.changeOriginal(); await assert.rejects(f.service.readSourceSamples(f.request(source)), {code: 'SOURCE_CHANGED'});
  await assert.rejects(f.prepare(), {code: 'SOURCE_CHANGED'});
  await f.service.retireSourceSamples(f.request(source, {windowLeaseId: window.windowLeaseId}));
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('wrong bank revision/domain/binding fail without publishing a window or debiting the source', async () => {
  const f = fixture(), source = await f.prepare(), baseline = f.budget.total();
  for (const request of [f.request(source, {revision: source.revision + 1}), f.request(source, {domain: 'sensor'}),
    f.request(source, {bindingOriginal: {...f.bindingOriginal, sourceSha256: '01'.repeat(32)}})]) {
    await assert.rejects(f.service.readSourceSamples(request)); assert.equal(f.service.state.windowLeases, 0); assert.equal(f.budget.total(), baseline);
  }
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('publication failure before transfer releases an unpublished window and preserves a frozen primary', async () => {
  const f = fixture(), source = await f.prepare(), primary = Object.freeze(new Error('post refused')), baseline = f.budget.total();
  await assert.rejects(f.service.readSourceSamples(f.request(source), {publish() { throw primary; }}), value => value === primary);
  assert.equal(f.service.state.windowLeases, 0); assert.equal(f.budget.total(), baseline);
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('publication uncertainty after detachment keeps its window debt and exact falsy primary', async () => {
  const f = fixture(), source = await f.prepare(); let received;
  await assert.rejects(f.service.readSourceSamples(f.request(source), {publish(value, transfer) {
    received = structuredClone(value, {transfer}); throw 0;
  }}), value => value === 0);
  assert.deepEqual(received.samples, f.samples); assert.equal(f.service.state.windows[0].state, 'transport-uncertain');
  await assert.rejects(f.service.dispose(), /window ACK/); assert.equal(f.bank.state.closed, false);
  await f.service.retireSourceSamples(f.request(source, {windowLeaseId: received.windowLeaseId}));
  await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('closing waits for an in-flight read and prevents its late publication', async () => {
  const gate = pending(), f = fixture({readGate: gate}), source = await f.prepare(); let published = false;
  const read = f.service.readSourceSamples(f.request(source), {publish() { published = true; }}); await f.readStarted.promise;
  const closing = f.service.dispose(); assert.equal(f.bank.state.closed, false); gate.resolve();
  await assert.rejects(read, /retired before publication/); await closing;
  assert.equal(published, false); assert.equal(f.service.state.windowLeases, 0); assert.equal(f.budget.total(), 0);
});

test('unpublished window release NACKs retain a reachable owner until successful retry', async () => {
  const f = fixture({readReleaseOutcomes: [['return', false], ['return', 0]]}), source = await f.prepare(),
    primary = Object.freeze(new Error('post failure')); let rejected;
  try { await f.service.readSourceSamples(f.request(source), {publish() { throw primary; }}); } catch (error) { rejected = error; }
  assert.equal(rejected.cause, primary); assert.equal(rejected.cleanupOwner, f.service);
  assert.equal(f.service.state.windows[0].state, 'unpublished-retirement-pending');
  assert.equal(f.budget.total(), f.samples.byteLength * 2 + 20 + f.service.state.receiptBytes + 256);
  await assert.rejects(f.service.dispose(), value => value === 0); assert.equal(f.service.state.windowLeases, 1);
  await f.service.dispose(); assert.equal(f.service.state.closed, true); assert.equal(f.budget.total(), 0);
});

test('codec-close/termination NACK retries retain pixels and never rerun the provider', async () => {
  const frozen = Object.freeze({code: 'CLOSE_REFUSED'}), f = fixture({phase: true,
    closeOutcomes: [['return', false], ['return', 0], ['throw', frozen]],
    terminateOutcomes: [['return', false], ['return', {terminated: true, kind: 'component-transport-certificate'}]]});
  for (const primary of [false, 0, frozen, false]) {
    await assert.rejects(f.prepare(), error => error === primary || error.cause === primary);
    assert.equal(f.providerCalls, 1); assert.equal(f.bank.state.closed, false);
    assert.equal(f.service.state.domains[0].scientificReady, true);
    assert.equal(f.budget.total(), 128 + f.samples.byteLength + 20);
  }
  const bankId = f.bank.descriptor.id, source = await f.prepare();
  assert.equal(source.sourceId, bankId); assert.equal(f.providerCalls, 1);
  assert.equal(f.budget.total(), f.samples.byteLength + 20 + f.service.state.receiptBytes);
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
  assert.equal(f.events.filter(event => event[0] === 'codec-close').length, 4);
  assert.equal(f.events.filter(event => event[0] === 'codec-terminate').length, 2);
});

test('calibration retirement NACK is independent of the closed bank and retried without decoding', async () => {
  const f = fixture({auxiliaryOutcomes: [['return', false], ['return', 0]]}), source = await f.prepare();
  for (const expected of [false, 0]) {
    await assert.rejects(f.service.retireSourceSamples(f.request(source)), error => error === expected);
    assert.equal(f.bank.state.closed, true); assert.equal(f.budget.total(), 20 + f.service.state.receiptBytes); assert.equal(f.providerCalls, 1);
    assert.equal(f.service.state.sourceLeases, 1);
  }
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('a malformed typed read is retired before publication', async () => {
  const f = fixture({invalidateWindow: true}), source = await f.prepare(), baseline = f.budget.total();
  await assert.rejects(f.service.readSourceSamples(f.request(source)), /another typed window/);
  assert.equal(f.service.state.windowLeases, 0); assert.equal(f.budget.total(), baseline);
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('null canonical SHA refuses service construction before provider/funding', () => {
  const budget = new Budget(1024);
  assert.throws(() => createSourceSamplesService({budget,
    bindingOriginal: {imageId: 'i', sourceSurfaceId: 's', sourceRevision: 1, sourceSha256: null, kind: 'encoded'},
    currentBinding: () => null, prepareProvider() { assert.fail('Unexpected decoding'); }, onOwner() {}}), /established/);
  assert.equal(budget.total(), 0);
});

test('cancellation exactly between ready and publication retires an unclaimed bank', async () => {
  const f = fixture(), control = new AbortController();
  await assert.rejects(f.prepare('decoded', {signal: control.signal, beforePublication() {
    assert.equal(f.bank.state.sealed, true); control.abort();
  }}), {code: 'CANCELLED'});
  assert.equal(f.service.state.sourceLeases, 0); assert.equal(f.service.state.domains.length, 0);
  assert.equal(f.bank.state.closed, true); assert.equal(f.budget.total(), 0);
  const source = await f.prepare(); await f.service.retireSourceSamples(f.request(source));
  await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('one cancelled preparer does not retire the source adopted by a second preparer', async () => {
  const f = fixture(), control = new AbortController(), firstReady = pending(), gate = pending();
  const a = f.prepare('decoded', {signal: control.signal, async beforePublication() { firstReady.resolve(); await gate.promise; }});
  const b = f.prepare(); await firstReady.promise; const source = await b;
  control.abort(); gate.resolve(); await assert.rejects(a, {code: 'CANCELLED'});
  assert.equal(f.providerCalls, 1); assert.equal(f.bank.state.closed, false);
  assert.equal(f.service.state.sourceLeases, 1); assert.equal(f.service.state.domains[0].preparingClaims, 0);
  const window = await f.service.readSourceSamples(f.request(source));
  await f.service.retireSourceSamples(f.request(source, {windowLeaseId: window.windowLeaseId}));
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('ready-to-publication cancellation keeps its cleanup owner through metadata NACKs', async () => {
  const f = fixture({auxiliaryOutcomes: [['return', false], ['return', 0]]}), control = new AbortController(); let primary;
  try { await f.prepare('decoded', {signal: control.signal, beforePublication() { control.abort(); }}); }
  catch (error) { primary = error; }
  assert.equal(primary.code, 'CANCELLED'); assert.equal(primary.cleanupOwner, f.service);
  assert.equal(f.bank.state.closed, true); assert.equal(f.budget.total(), 20);
  await assert.rejects(f.service.dispose(), value => value === 0); assert.equal(f.budget.total(), 20);
  await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('retired window/source retries validate all captured bindings before idempotent ACK', async () => {
  const f = fixture(), source = await f.prepare(), window = await f.service.readSourceSamples(f.request(source)),
    receipt = f.request(source, {windowLeaseId: window.windowLeaseId});
  await f.service.retireSourceSamples(receipt);
  for (const change of [{sourceId: 'wrong'}, {revision: source.revision + 1}, {domain: 'sensor'}, {sourceLeaseId: 'wrong'}]) {
    await assert.rejects(f.service.retireSourceSamples({...receipt, ...change}));
  }
  await f.service.retireSourceSamples(receipt); await f.service.retireSourceSamples(f.request(source));
  for (const change of [{sourceId: 'wrong'}, {revision: source.revision + 1}, {domain: 'sensor'}]) {
    await assert.rejects(f.service.retireSourceSamples({...f.request(source), ...change}));
    await assert.rejects(f.service.retireSourceSamples({...receipt, ...change}));
  }
  await f.service.retireSourceSamples(receipt); await f.service.retireSourceSamples(f.request(source));
  assert.equal(f.budget.total(), f.service.state.receiptBytes); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('simultaneous window retirement calls share one asynchronous release flight', async () => {
  const gate = pending(), f = fixture({releaseGate: gate}), source = await f.prepare(), window = await f.service.readSourceSamples(f.request(source)),
    receipt = f.request(source, {windowLeaseId: window.windowLeaseId});
  const a = f.service.retireSourceSamples(receipt), b = f.service.retireSourceSamples(receipt);
  assert.equal(f.releaseCalls, 1); assert.equal(f.service.state.windowLeases, 1);
  gate.resolve(); await Promise.all([a, b]); assert.equal(f.releaseCalls, 1);
  await f.service.retireSourceSamples(receipt); assert.equal(f.releaseCalls, 1);
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('window ACK watermark/ranges stay bounded by live holes instead of growing at every sample', async () => {
  const f = fixture(), source = await f.prepare(), baseline = f.budget.total();
  const first = await f.service.readSourceSamples(f.request(source));
  for (let i = 0; i < 300; ++i) {
    const window = await f.service.readSourceSamples(f.request(source));
    await f.service.retireSourceSamples(f.request(source, {windowLeaseId: window.windowLeaseId}));
    assert.equal(f.service.state.acknowledgementRanges, 1); assert.equal(f.service.state.windowLeases, 1);
    assert.equal(f.budget.total(), baseline + f.samples.byteLength + 256 + 64);
  }
  await f.service.retireSourceSamples(f.request(source, {windowLeaseId: first.windowLeaseId}));
  assert.equal(f.service.state.acknowledgementRanges, 0); assert.equal(f.budget.total(), baseline);
  await f.service.retireSourceSamples(f.request(source)); await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('last preparer cancellation during a codec NACK retires the complete but unadopted source', async () => {
  const control = new AbortController(), primary = Object.freeze(new Error('codec close refused')); let closeCalls = 0;
  const f = fixture({phase: true, closeOutcomes: [['throw', primary]], onCodecClose() {
    if (++closeCalls === 1) control.abort();
  }});
  await assert.rejects(f.prepare('decoded', {signal: control.signal}), error => error.cause === primary);
  assert.equal(f.providerCalls, 1); assert.equal(f.bank.state.closed, true);
  assert.equal(f.service.state.domains.length, 0); assert.equal(f.service.state.sourceLeases, 0);
  assert.equal(f.budget.total(), 0); await f.service.dispose();
});

test('cancelled last preparer keeps the same retry owner when cleanup also NACKs', async () => {
  const control = new AbortController(), primary = Object.freeze(new Error('codec close refused')); let closeCalls = 0;
  const f = fixture({phase: true, closeOutcomes: [['throw', primary], ['return', 0], ['return', false]], onCodecClose() {
    if (++closeCalls === 1) control.abort();
  }}); let rejected;
  try { await f.prepare('decoded', {signal: control.signal}); } catch (error) { rejected = error; }
  assert.equal(rejected.cause, primary); assert.equal(rejected.cleanupOwner, f.service);
  assert.equal(f.service.state.domains[0].closing, true); assert.equal(f.service.state.sourceLeases, 0);
  assert.equal(f.bank.state.closed, false); assert.equal(f.budget.total(), 128 + f.samples.byteLength + 20);
  await assert.rejects(f.service.dispose(), error => error === false);
  assert.equal(f.providerCalls, 1); assert.equal(f.service.state.domains[0].closing, true);
  await f.service.dispose(); assert.equal(f.bank.state.closed, true); assert.equal(f.budget.total(), 0);
});

test('unsupported frame requests fail before a provider or bank is created; default/explicit0 share the qualified source', async () => {
  const f = fixture();
  for (const frame of [1, -1, null, '0', NaN, Infinity]) {
    await assert.rejects(f.service.prepareSourceSamples({bindingOriginal: f.bindingOriginal, domain: 'decoded', frame}),
      {code: 'SOURCE_FRAME_UNSUPPORTED'});
    assert.equal(f.providerCalls, 0); assert.equal(f.budget.total(), 0); assert.equal(f.service.state.domains.length, 0);
  }
  const a = await f.prepare(), b = await f.service.prepareSourceSamples({bindingOriginal: f.bindingOriginal, domain: 'decoded', frame: 0});
  assert.equal(f.providerCalls, 1); assert.equal(f.events.find(event => event[0] === 'prepare')[2], 0);
  assert.equal(a.selectedFrame, 0); assert.equal(b.selectedFrame, 0); assert.equal(a.sourceId, b.sourceId);
  await assert.rejects(f.service.readSourceSamples(f.request(a, {frame: 1})), {code: 'SOURCE_FRAME_UNSUPPORTED'});
  await f.service.retireSourceSamples(f.request(a)); await f.service.retireSourceSamples(f.request(b));
  await assert.rejects(f.service.retireSourceSamples(f.request(b, {frame: 1})), {code: 'SOURCE_FRAME_UNSUPPORTED'});
  await f.service.dispose(); assert.equal(f.budget.total(), 0);
});

test('a provider cannot publish another selected frame under the default frame0 contract', async () => {
  const f = fixture({publishedFrame: 1});
  await assert.rejects(f.prepare(), /Published samples differ/);
  assert.equal(f.providerCalls, 1); assert.equal(f.service.state.sourceLeases, 0);
  assert.equal(f.bank.state.closed, true); assert.equal(f.budget.total(), 0); await f.service.dispose();
});
