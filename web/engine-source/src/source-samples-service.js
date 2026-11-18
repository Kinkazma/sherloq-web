import {sourceRepresentation} from './hdr-representation-contract.js';
// Original owns source sample providers for decoded/sensor
// readers; this owner implements no codec, color transform or analysis kernel.
import {EngineError, requireValue, checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {displayGeometry} from './display-sampling.js';

const bindingKeys = ['imageId', 'sourceSurfaceId', 'sourceRevision', 'sourceSha256', 'kind'];
const sameBinding = (a, b) => !!a && !!b && bindingKeys.every(key => a[key] === b[key]);
const ack = async action => { const value = await action(); if (value === false || value === 0) throw value; return value; };
const failure = (code, message) => new EngineError(code, message);
const captureBinding = value => {
  requireValue(value && typeof value.imageId === 'string' && value.imageId.length
    && typeof value.sourceSurfaceId === 'string' && value.sourceSurfaceId.length
    && Number.isSafeInteger(value.sourceRevision) && value.sourceRevision > 0
    && /^[a-f0-9]{64}$/.test(value.sourceSha256 ?? '') && ['encoded', 'fixture'].includes(value.kind),
  'Source samples require an established Original content identity.');
  return Object.freeze(Object.fromEntries(bindingKeys.map(key => [key, value[key]])));
};

/** One Original owns this service. The provider registers source/auxiliary
 * owners before publication; codec phase funding survives close and terminate
 * NACKs. A window credit survives a transferred buffer until its explicit ACK. */
export function createSourceSamplesService({budget, bindingOriginal, currentBinding,
  prepareProvider, onOwner, representationExtension=false} = {}) {
  requireValue(budget?.reserve && typeof currentBinding === 'function'
    && typeof prepareProvider === 'function' && typeof onOwner === 'function', 'A real Original parent owner is required.');
  const original = captureBinding(bindingOriginal), entries = new Map(), sources = new Map(), windows = new Map(),
    retiredSources = new Map();
  let closing = false, closed = false, disposal;
  const receiptBytes = value => 512 + 2 * [value.sourceLeaseId, value.sourceId, value.domain,
    original.imageId, original.sourceSurfaceId, original.sourceSha256].reduce((sum, text) => sum + text.length, 0);
  const current = () => {
    if (!sameBinding(original, currentBinding())) throw failure('SOURCE_CHANGED', 'Original source samples identity changed.');
  };
  const requestBinding = request => {
    requireValue(sameBinding(original, request?.bindingOriginal), 'Source sample request belongs to another Original.');
    if (request.frame !== undefined && request.frame !== 0)
      throw failure('SOURCE_FRAME_UNSUPPORTED', 'This source samples service qualifies only explicit or default frame0.');
  };
  const startAllowed = request => {
    requireValue(!closing && !closed, 'The source sample service is closing.'); requestBinding(request); current();
    requireValue(['decoded', 'sensor'].includes(request.domain), 'Unknown source sample domain.');
    sourceRepresentation(request,{enabled:representationExtension});
  };
  const retireOwners = async owners => {
    let failed = false, primary;
    for (const owner of [...owners]) try { await ack(() => owner.dispose()); owners.delete(owner); }
    catch (error) { if (!failed) { failed = true; primary = error; } }
    if (failed) throw primary;
  };
  function validateReceipt(request, receipt) {
    requireValue(receipt && request.sourceLeaseId === receipt.sourceLeaseId && request.sourceId === receipt.sourceId
      && request.revision === receipt.revision && request.domain === receipt.domain && (request.frame ?? 0) === receipt.frame,
    'Source sample receipt binding or revision differs.'); return receipt;
  }
  function windowSequence(request, source) {
    const prefix = source.sourceLeaseId + '/w/', suffix = request.windowLeaseId?.slice(prefix.length), sequence = Number(suffix);
    requireValue(typeof request.windowLeaseId === 'string' && request.windowLeaseId.startsWith(prefix)
      && Number.isSafeInteger(sequence) && sequence > 0 && sequence <= source.issuedWindows && String(sequence) === suffix,
    'Source window sequence belongs to another source receipt.'); return sequence;
  }
  const wasAcknowledged = (source, sequence) => sequence <= source.acknowledgedThrough
    || source.ackRanges?.some(range => sequence >= range.start && sequence <= range.end);
  function recordWindowAck(source, sequence, rangeFee) {
    if (sequence <= source.acknowledgedThrough) { rangeFee(); return; }
    let start = sequence, end = sequence; const retained = [];
    for (const range of source.ackRanges) {
      if (range.end + 1 < start || range.start > end + 1) retained.push(range);
      else { start = Math.min(start, range.start); end = Math.max(end, range.end); range.fee(); }
    }
    retained.push({start, end, fee: rangeFee}); retained.sort((a, b) => a.start - b.start);
    while (retained.length && retained[0].start <= source.acknowledgedThrough + 1) {
      const range = retained.shift(); source.acknowledgedThrough = Math.max(source.acknowledgedThrough, range.end); range.fee();
    }
    source.ackRanges = retained;
  }
  function retireWindow(id, window) {
    if (window.retiring) return window.retiring;
    const task = (async () => {
      await ack(() => window.lease.release());
      recordWindowAck(window.source, window.sequence, window.rangeFee);
      window.rangeFee = null; window.fee(); window.fee = null; windows.delete(id);
    })(); window.retiring = task;
    task.then(() => { window.retiring = undefined; }, () => { window.retiring = undefined; }); return task;
  }
  function codecPhase(entry, {bytes, label = 'source-codec'} = {}) {
    requireValue(!entry.closing && Number.isSafeInteger(bytes) && bytes > 0, 'A positive codec phase admission is required.');
    let funding, capacity = 0, resource, nativeClosed = false, terminated = false, retired = false, flight;
    const extraFunding = [];
    const phase = {
      id: crypto.randomUUID(), label,
      get state() { return {capacity, nativeClosed, terminated, retired, resourceAdopted: !!resource}; },
      adopt(owner) {
        requireValue(!retired && !flight && !resource && owner && typeof owner.dispose === 'function'
          && typeof owner.terminate === 'function', 'A codec phase needs one close/termination owner.'); resource = owner;
      },
      admitCapacity(nextBytes) {
        requireValue(!retired && !nativeClosed && !flight && !entry.closing && Number.isSafeInteger(nextBytes) && nextBytes >= capacity,
          'Invalid codec capacity admission.');
        if (nextBytes > capacity) { const fee = budget.reserve(nextBytes - capacity); extraFunding.push(fee); capacity = nextBytes; }
        return {codecHeapBytes: capacity};
      },
      dispose() {
        if (retired) return Promise.resolve(); if (flight) return flight;
        const task = (async () => {
          if (resource && !nativeClosed) { await ack(() => resource.dispose()); nativeClosed = true; }
          if (resource && !terminated) {
            const certificate = await ack(() => resource.terminate());
            requireValue(certificate?.terminated === true && typeof certificate.kind === 'string',
              'Codec funding awaits a parent transport termination certificate.'); terminated = true;
          }
          // No adopted native peer means construction never started. Otherwise
          // its storage close and parent termination both precede this refund.
          funding?.(); funding = null; for (const fee of extraFunding) fee(); extraFunding.length = 0;
          retired = true; entry.codecs.delete(phase);
        })(); flight = task; task.then(() => { flight = undefined; }, () => { flight = undefined; }); return task;
      },
    };
    // Register before reserve: even a refused constructor leaves an owner that
    // can distinguish "never funded" from a live codec awaiting retirement.
    entry.codecs.add(phase);
    try { funding = budget.reserve(bytes); capacity = bytes; } catch (error) { entry.codecs.delete(phase); throw error; }
    return phase;
  }
  async function retireUnpublishedWindows(entry) {
    for (const [id, window] of [...windows]) if ((!entry || window.entry === entry)
      && window.state === 'unpublished-retirement-pending') {
      await retireWindow(id, window);
    }
  }
  async function retireEntry(entry) {
    entry.closing = true; entry.controller.abort();
    if (entry.retiring) return entry.retiring;
    const task = (async () => {
      // A borrowed representation owns no second store/profile. Drain its
      // windows and adapter before the actual source and private metadata.
      for (const dependent of [...entries.values()]) if (dependent.borrowedFrom === entry)
        await retireEntry(dependent);
      await Promise.allSettled([...entry.reads]);
      await retireUnpublishedWindows(entry);
      requireValue(![...windows.values()].some(window => window.entry === entry),
        'Source samples still have unacknowledged transferred windows.');
      await retireOwners(entry.codecs);
      await retireOwners(entry.sourceOwners);
      // Calibration/profile owners may still be needed by a refused reader
      // retirement; retire them only after the source owners acknowledged.
      await retireOwners(entry.auxiliaryOwners);
      entry.representationFee?.(); entry.representationFee=null;
      entry.closed = true; if (entries.get(entry.key) === entry) entries.delete(entry.key);
    })(); entry.retiring = task;
    task.then(() => { entry.retiring = undefined; }, () => { entry.retiring = undefined; }); return task;
  }
  async function drainRetirements(requestedKey) {
    for (const entry of [...entries.values()]) {
      if (entry.closing) await retireEntry(entry);
      else if (entry.key !== requestedKey && entry.scientificReady && !entry.ready) {
        await finishPreparation(entry);
        if (!entry.leases.size && !entry.claims.size) await retireEntry(entry);
      }
    }
  }
  function finishPreparation(entry) {
    if (entry.ready) return Promise.resolve(entry); if (entry.finishing) return entry.finishing;
    const task = (async () => {
      try {
        // A retirement failure does not invalidate successfully decoded pixels.
        // A retry resumes only this close/termination boundary, not the provider.
        await retireOwners(entry.codecs); checkAbort(entry.controller.signal); current();
        requireValue(!entry.closing, 'Source sample preparation was retired.'); entry.ready = true; return entry;
      } catch (primary) { throw withRetirementOwner(primary, service, primary); }
    })(); entry.finishing = task;
    task.then(() => { entry.finishing = undefined; }, () => { entry.finishing = undefined; }); return task;
  }
  function prepareEntry(domain,key,representation) {
    const controller = new AbortController(), entry = {domain, key, representation, controller, codecs: new Set(), sourceOwners: new Set(),
      auxiliaryOwners: new Set(), leases: new Set(), claims: new Set(), reads: new Set(), surface: null, ready: false, scientificReady: false,
      closing: false, closed: false, retiring: undefined, preparing: undefined, finishing: undefined};
    entry.representationFee=representation?budget.reserve(4096):null;
    entries.set(key, entry);
    const context = {budget, bindingOriginal: original, domain, frame: 0, representation,
      signal: controller.signal,
      borrowSource(surface) {
        requireValue(!entry.closing && !entry.scientificReady && !entry.borrowedFrom,
          'A source dependency must precede publication.');
        const parent = [...entries.values()].find(value => value !== entry && value.surface === surface);
        requireValue(parent?.ready && !parent.closing && !parent.closed,
          'A borrowed source must be an already ready owner in this Original service.');
        const seen = new Set([entry]);
        for (let value = parent; value; value = value.borrowedFrom) {
          requireValue(!seen.has(value), 'Cyclic source ownership is not allowed.'); seen.add(value);
        }
        entry.borrowedFrom = parent; return surface;
      },
      codecPhase: options => codecPhase(entry, options),
      adoptSourceOwner(owner) {
        requireValue(!entry.closing && owner && typeof owner.dispose === 'function', 'A source owner must precede publication.');
        entry.sourceOwners.add(owner); return owner;
      },
      adoptAuxiliaryOwner(owner) {
        requireValue(!entry.closing && owner && typeof owner.dispose === 'function', 'A private metadata owner is required.');
        entry.auxiliaryOwners.add(owner); return owner;
      },
      publishSource(surface) {
        const d = surface?.descriptor;
        requireValue(!entry.closing && !entry.surface && entry.sourceOwners.size && surface?.readWindow
          && d?.format === 'native-samples' && d.domain === domain && sameBinding(original, d.bindingOriginal)
          && (d.selectedFrame === undefined || d.selectedFrame === 0)
          && d.identityStatus === 'fixed' && [d.width, d.height, d.channels].every(value => Number.isSafeInteger(value) && value > 0),
        'Published samples differ from the adopted source/domain/identity.'); entry.surface = surface;
      },
    };
    entry.preparing = (async () => {
      try {
        await prepareProvider(context); checkAbort(context.signal); current();
        requireValue(entry.surface, 'The provider did not publish an owned typed source.');
        entry.scientificReady = true;
      } catch (primary) {
        // Constructors can fail after registering their own retry owner.
        try { if (primary?.cleanupOwner?.dispose) entry.sourceOwners.add(primary.cleanupOwner); } catch {}
        try { await retireEntry(entry); } catch (cleanup) { throw withRetirementOwner(primary, service, cleanup); }
        throw primary;
      }
      return finishPreparation(entry);
    })();
    return entry;
  }
  function getSource(request) {
    requestBinding(request); const source = sources.get(request.sourceLeaseId);
    return validateReceipt(request, source);
  }
  const service = {
    bindingOriginal: original,
    get state() { return {closing, closed, sourceLeases: sources.size, windowLeases: windows.size,
      retainedSourceReceipts: retiredSources.size,
      receiptBytes: [...sources.values(), ...retiredSources.values()].reduce((sum, source) => sum + source.receiptBytes, 0),
      acknowledgementRanges: [...sources.values()].reduce((sum, source) => sum + source.ackRanges.length, 0),
      windows: [...windows].map(([windowLeaseId, value]) => ({windowLeaseId, sourceLeaseId: value.source.sourceLeaseId, state: value.state})),
      domains: [...entries.values()].map(entry => ({domain: entry.domain, ready: entry.ready, scientificReady: entry.scientificReady, closing: entry.closing,
        sourceOwners: entry.sourceOwners.size, auxiliaryOwners: entry.auxiliaryOwners.size, preparingClaims: entry.claims.size,
        codecs: [...entry.codecs].map(phase => ({id: phase.id, ...phase.state}))}))}; },
    async prepareSourceSamples(request, hooks = {}) {
      startAllowed(request); checkAbort(hooks.signal); const identity=sourceRepresentation(request,{enabled:representationExtension}); await drainRetirements(identity.key); startAllowed(request);
      let entry = entries.get(identity.key);
      if (!entry) entry = prepareEntry(request.domain,identity.key,identity.representation);
      const claim = {aborted: false}; entry.claims.add(claim); let adopted = false, failed = false, primary;
      const abort = () => {
        claim.aborted = true;
        if (!entry.scientificReady && !entry.leases.size && ![...entry.claims].some(value => !value.aborted)) entry.controller.abort();
      };
      hooks.signal?.addEventListener('abort', abort, {once: true}); if (hooks.signal?.aborted) abort();
      try {
        if (entry.scientificReady) await finishPreparation(entry); else await entry.preparing;
        await hooks.beforePublication?.(); checkAbort(hooks.signal); startAllowed(request);
        requireValue(entry.ready && !entry.closing, 'The source samples are unavailable.');
        const selected=identity.representation?.kind==='raw-demosaic-rgb'?entry.surface.selectView?.(identity.representation.view):entry.surface;
        requireValue(selected?.readWindow&&selected.descriptor?.format==='native-samples'
          &&sameBinding(original,selected.descriptor.bindingOriginal)&&selected.descriptor.width===entry.surface.descriptor.width
          &&selected.descriptor.height===entry.surface.descriptor.height,'The selected source view differs from its owned pair.');
        const sourceLeaseId = crypto.randomUUID(), source = {sourceLeaseId, surface:selected, sourceId: selected.descriptor.id,
          revision: selected.descriptor.revision, domain: entry.domain, frame: 0, bindingOriginal: original, entry,
          closing: false, reads: new Set(), issuedWindows: 0, acknowledgedThrough: 0, ackRanges: []};
        source.receiptBytes = receiptBytes(source); source.receiptFee = budget.reserve(source.receiptBytes);
        sources.set(sourceLeaseId, source); entry.leases.add(sourceLeaseId); adopted = true;
        return {sourceLeaseId, sourceId: source.sourceId, revision: source.revision,
          domain: entry.domain, frame: 0, selectedFrame: 0, bindingOriginal: original, descriptor: selected.descriptor};
      } catch (error) { failed = true; primary = error; throw error; }
      finally {
        hooks.signal?.removeEventListener('abort', abort); entry.claims.delete(claim);
        if (!adopted && !entry.closed && !entry.leases.size && !entry.claims.size
          && (entry.ready || claim.aborted || hooks.signal?.aborted || primary?.code === 'SOURCE_CHANGED')) {
          try { await retireEntry(entry); }
          catch (cleanup) { if (failed) throw withRetirementOwner(primary, service, cleanup); throw cleanup; }
        }
      }
    },
    // Private registry hand-off: the actual display store never crosses the wire.
    displaySource(request) {
      startAllowed(request);const source=getSource(request);
      requireValue(!source.closing&&!source.entry.closing,'Source sample lease is retiring.');
      if(source.surface.descriptor.sampleSemantics?.view!=='sdr8')return null;
      return source.entry.surface.getDisplaySurface?.()??null;
    },
    readSourceSamples(request, hooks = {}) {
      let source;
      const task = (async () => {
        startAllowed(request); source = getSource(request);
        requireValue(!source.closing && !source.entry.closing, 'Source sample lease is retiring.');
        const sampled = request.tile !== undefined, geometry = sampled ? displayGeometry(source.surface.descriptor, request.tile) : null;
        if (sampled) requireValue(request.rect === undefined && typeof source.surface.readSampledWindow === 'function',
          'A sampled source request needs one tile and its captured sampled reader.');
        const entry = source.entry, fee = budget.reserve(256), rangeFee = fee.split(64); let lease;
        try { lease = sampled ? await source.surface.readSampledWindow(geometry, hooks) : await source.surface.readWindow(request.rect, hooks); }
        catch (error) { rangeFee(); fee(); throw error; }
        const sequence = ++source.issuedWindows,
          window = {lease, entry, source, state: 'unpublished', sequence, fee, rangeFee},
          windowLeaseId = source.sourceLeaseId + '/w/' + sequence;
        windows.set(windowLeaseId, window);
        try {
          checkAbort(hooks.signal); current();
          requireValue(!closing && !source.closing && !entry.closing && lease.samples,
            'Source samples were retired before publication.');
          const d = source.surface.descriptor, Type = {uint8: Uint8Array, uint16: Uint16Array, float32: Float32Array}[d.sampleType];
          requireValue(Type && lease.samples instanceof Type && lease.samples.length === lease.width * lease.height * d.channels
            && (sampled ? lease.width === geometry.width && lease.height === geometry.height
              && lease.origin?.[0] === geometry.x && lease.origin?.[1] === geometry.y && lease.samplingStep === geometry.step
              && lease.logicalRect?.x === geometry.x && lease.logicalRect?.y === geometry.y
              && lease.logicalRect?.width === geometry.w && lease.logicalRect?.height === geometry.h
              : lease.width === request.rect.width && lease.height === request.rect.height)
            && lease.surfaceId === d.id && lease.revision === d.revision && sameBinding(original, lease.bindingOriginal),
          'The source reader returned another typed window or content binding.');
          const wire = {sourceLeaseId: source.sourceLeaseId, windowLeaseId,
            sourceId: source.sourceId, revision: source.revision,
            domain: entry.domain, frame: 0, selectedFrame: 0, bindingOriginal: original, origin: lease.origin, width: lease.width, height: lease.height,
            sampleType: d.sampleType, channels: d.channels,
            channelMap: d.channelMap, sampleModel: d.sampleModel, sourceDepth: d.sourceDepth,
            containerBits: d.containerBits, valueEncoding: d.valueEncoding, samples: lease.samples,
            ...(sampled ? {samplingStep: lease.samplingStep, logicalRect: lease.logicalRect, ...(lease.metrics ? {metrics: lease.metrics} : {})} : {})};
          if (hooks.publish) {
            const buffer = lease.samples.buffer;
            try { await hooks.publish(wire, [buffer]); window.state = 'posted'; }
            catch (primary) {
              // A detached buffer may already belong to the receiver. Its
              // still-funded lease needs ACK/peer retirement, even on failure.
              if (buffer.byteLength === 0) window.state = 'transport-uncertain';
              throw primary;
            }
          } else window.state = 'delivered-local';
          return wire;
        } catch (primary) {
          if (window.state === 'unpublished') {
            window.state = 'unpublished-retirement-pending';
            try { await retireWindow(windowLeaseId, window); }
            catch (cleanup) { throw withRetirementOwner(primary, service, cleanup); }
          }
          throw primary;
        }
      })();
      // Async entry starts synchronously through the first read await.
      if (source) { source.reads.add(task); source.entry.reads.add(task); }
      task.then(() => { source?.reads.delete(task); source?.entry.reads.delete(task); },
        () => { source?.reads.delete(task); source?.entry.reads.delete(task); });
      return task;
    },
    async retireSourceSamples(request) {
      requestBinding(request);
      if (request.windowLeaseId) {
        const source = validateReceipt(request, sources.get(request.sourceLeaseId) ?? retiredSources.get(request.sourceLeaseId)),
          sequence = windowSequence(request, source);
        if (wasAcknowledged(source, sequence)) return {retired: true};
        const window = windows.get(request.windowLeaseId);
        requireValue(window?.source === source, 'Source window lease belongs to another source.');
        requireValue(!['unpublished', 'unpublished-retirement-pending'].includes(window.state), 'An unpublished window needs parent retirement.');
        await retireWindow(request.windowLeaseId, window);
        return {retired: true};
      }
      if (retiredSources.has(request.sourceLeaseId)) { validateReceipt(request, retiredSources.get(request.sourceLeaseId)); return {retired: true}; }
      const source = getSource(request); source.closing = true;
      await Promise.allSettled([...source.reads]);
      requireValue(![...windows.values()].some(window => window.source === source),
        'Source sample lease still has unacknowledged windows.');
      const entry = source.entry;
      if (entry.leases.size === 1) await retireEntry(entry);
      requireValue(source.acknowledgedThrough === source.issuedWindows && !source.ackRanges.length,
        'Source window ACK coverage is incomplete.');
      entry.leases.delete(source.sourceLeaseId); sources.delete(source.sourceLeaseId);
      retiredSources.set(source.sourceLeaseId, {sourceLeaseId: source.sourceLeaseId, sourceId: source.sourceId,
        revision: source.revision, domain: source.domain, frame: 0, bindingOriginal: original,
        issuedWindows: source.issuedWindows, acknowledgedThrough: source.acknowledgedThrough,
        receiptBytes: source.receiptBytes, receiptFee: source.receiptFee});
      return {retired: true};
    },
    dispose() {
      if (closed) return Promise.resolve(); if (disposal) return disposal; closing = true;
      for (const entry of entries.values()) { entry.closing = true; entry.controller.abort(); }
      for (const source of sources.values()) source.closing = true;
      const task = (async () => {
        await Promise.allSettled([...entries.values()].map(entry => entry.preparing));
        await Promise.allSettled([...entries.values()].flatMap(entry => [...entry.reads]));
        await retireUnpublishedWindows();
        requireValue(windows.size === 0, 'Source sample service awaits outstanding window ACKs.');
        for (const entry of [...entries.values()]) await retireEntry(entry);
        for (const source of [...sources.values(), ...retiredSources.values()]) {
          for (const range of source.ackRanges ?? []) range.fee(); source.receiptFee();
        }
        sources.clear(); retiredSources.clear(); closed = true;
      })(); disposal = task; task.then(() => { disposal = undefined; }, () => { disposal = undefined; }); return task;
    },
  };
  onOwner(service); return service;
}
