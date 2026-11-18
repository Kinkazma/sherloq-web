import "../../runtime-context.js?v=0.33.2";
import {EngineError, requireValue, checkAbort} from './errors.js';
import {createColorTransformCache} from './color-managed-runtime.js';
import {createNativeColorDisplay, FIRST_USEFUL_CPU_PIXELS} from './native-color-display.js';
import {createHdrColorPresentation} from './hdr-color-presentation.js';
import {COLOR_NATIVE_RESOURCE} from './color-managed-resource.js';
import {roundEven} from './pixel-utils.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {allocateTypedArray} from './allocation.js';

// Private composition authority. It names the captured Original/working ICC,
// never a completed intermediate that will be retired after post-processing.
const composedColorContexts=new WeakMap();
export function native16DisplayCompositionContext(surface){return composedColorContexts.get(surface)??null;}
const MiB = 1024 ** 2, PROFILE_OUTPUT_BYTES = MiB, HDR_ENTRIES = 65536;
const primaries = {srgb: 1, bt709: 1, rec2020: 9, bt2020: 9, 'display-p3': 12, p3: 12, 'dci-p3': 11, xyz: 10};
const transfers = {srgb: 13, 'iec61966-2-1': 13, linear: 8, pq: 16, hlg: 18, bt709: 1, 'gamma2.2': 4, 'gamma2.8': 5};
const knownPrimaries = new Set([1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 22]);
const knownTransfers = new Set([1, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18]);
const ack = async action => { const answer = await action(); if (answer === false || answer === 0) throw answer; return answer; };
const limited = (code, message) => ({known: false, completeResidentAlternative: false, limitation: {code, message}});
const code = (value, names) => Number.isInteger(value) ? value : typeof value === 'string' && /^cicp-\d+$/.test(value) ? Number(value.slice(5)) : names[String(value).toLowerCase()];
function cicpRecord(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') {
    const fields = value.trim().split(/[\/,\s]+/);
    if (fields.length < 3 || fields.length > 4 || fields.some(field => !/^\d+$/.test(field))) return {invalid: true};
    value = fields.map(Number);
  }
  if (Array.isArray(value)) {
    if (value.length < 3 || value.length > 4 || value.some(field => !Number.isInteger(field) || field < 0 || field > 255)) return {invalid: true};
    return {primary: value[0], transfer: value[1]};
  }
  if (typeof value !== 'object') return {invalid: true};
  return {primary: code(value.colorPrimaries ?? value.primaries, primaries), transfer: code(value.transferCharacteristics ?? value.transfer, transfers)};
}
function originalDisplayAssumption(value) {
  if (value === undefined || value === null) return undefined;
  requireValue(typeof value === 'object' && !Array.isArray(value), 'The captured Original display policy must be metadata.');
  const nominal = value.kind === 'nominal-code-view' && value.policy === 'nominal-interval-clipped' && value.origin === 'original-display-policy',
    existingHp = value.approximateCodeView === true && value.profileApplied === false && value.codeViewPolicy === 'nominal-interval-clipped' &&
      value.outputColorSpace === null && value.outputFormat === 'rgb8' && value.sourceSamplesPreserved === true;
  // Other Source projection metadata (ICC/HDR) cannot grant an unprofiled
  // assumption, and does not override a fully characterized working profile.
  return nominal || existingHp ? Object.freeze({kind: 'nominal-code-view', policy: 'nominal-interval-clipped', origin: 'original-display-policy'}) : undefined;
}
function colorPolicy(d, displayAssumption) {
  const color = d.color ?? {}, profile = color.iccProfile ?? color.profile, c = cicpRecord(color.cicp ?? color.nominalColorimetry),
    fallback = cicpRecord(color.cicpFallback);
  if (c.invalid || fallback.invalid) return limited('NATIVE16_COLOR_DECLARATION_INVALID', 'The captured working CICP declaration is malformed.');
  const cp = c.primary, ct = c.transfer;
  const p = code(color.primaries ?? color.colorPrimaries, primaries), t = code(color.transfer ?? color.transferCharacteristics, transfers);
  if (!profile && p !== undefined && cp !== undefined && p !== cp || t !== undefined && ct !== undefined && t !== ct)
    return limited('NATIVE16_COLOR_DECLARATION_CONFLICT', 'The working RGB primaries or transfer declarations disagree.');
  // The AVIF owner preserves the same working CICP in cicpFallback when an
  // ICC describes the colorants/TRCs. Explicit current fields stay prior to it.
  const primary = p ?? cp ?? fallback.primary, transfer = t ?? ct ?? fallback.transfer, hdr = transfer === 16 || transfer === 18;
  if (profile) {
    if (!/^[a-f0-9]{64}$/.test(profile.sha256 ?? '') || !Number.isSafeInteger(profile.bytes) || profile.bytes < 128)
      return limited('NATIVE16_COLOR_PROFILE_REQUIRED', 'The working RGB profile has no exact private identity.');
    if (color.hdr === true && !hdr) return limited('NATIVE16_HDR_RANGE_REQUIRED', 'The working HDR flag has no PQ/HLG luminance transfer contract.');
    // The maintained HDR adapter gives ICC colorants/TRCs priority and uses
    // the working PQ/HLG declaration for tone reproduction. Never reapply an
    // encoded Original's gain map to these modified working samples.
    return {known: true, mode: hdr ? 'icc-hdr' : 'icc', profile, primary, transfer, hdr};
  }
  if (!knownPrimaries.has(primary) || !knownTransfers.has(transfer)) {
    if (displayAssumption && primary === undefined && transfer === undefined && color.hdr !== true)
      return {known: true, mode: 'code-view', displayAssumption, colorimetryKnown: false, hdr: false};
    return limited('NATIVE16_COLOR_DECLARATION_REQUIRED', 'The working RGB needs an exact profile or recognized primaries and transfer; no sRGB assumption is made.');
  }
  if (color.hdr === true && transfer !== 16 && transfer !== 18)
    return limited('NATIVE16_HDR_RANGE_REQUIRED', 'An HDR flag alone does not define how the modified RGB codes encode luminance.');
  return {known: true, mode: primary === 1 && transfer === 13 ? 'srgb' : 'cicp', primary, transfer, hdr};
}

/** Additional presentation admission only. Native windows/output pixels are
 * already owned by createRgb16Surface and are reported separately below. */
export function native16DisplayPlan(descriptor, {maximumPixels = 65536, totalPixels = descriptor?.width * descriptor?.height, maximumMemoryBytes = 64 * MiB,
  displayMemoryBytes = 64 * MiB, backend = 'auto', displayAssumption} = {}) {
  requireValue(descriptor?.format === 'rgb16' && descriptor.depth === 16 &&
    [descriptor.width, descriptor.height, maximumPixels, totalPixels, maximumMemoryBytes, displayMemoryBytes].every(Number.isSafeInteger) &&
    descriptor.width > 0 && descriptor.height > 0 && Number.isSafeInteger(descriptor.width * descriptor.height * 6) && totalPixels > 0 &&
    totalPixels <= descriptor.width * descriptor.height && maximumPixels > 0 && maximumMemoryBytes >= 16 * MiB &&
    maximumMemoryBytes <= 2 ** 32 && maximumMemoryBytes % 65536 === 0 && displayMemoryBytes >= 0 &&
    ['auto', 'cpu'].includes(backend), 'An admitted native RGB16 presentation plan is required.');
  const assumption = originalDisplayAssumption(displayAssumption);
  const policy = colorPolicy(descriptor, assumption); if (!policy.known) return policy;
  const bandPixels = Math.min(maximumPixels, totalPixels, Math.floor(maximumMemoryBytes / 24));
  requireValue(Number.isSafeInteger(bandPixels) && bandPixels > 0, 'The native color band must fit its admitted extent.');
  const hasProfile = !!policy.profile, colorBytes = hasProfile ? maximumMemoryBytes : 0;
  // native-color-display retains a4096-pixel first useful CPU prefix. No
  // optional accelerator can have remaining work in a final at or below it.
  const displayBytes = policy.mode === 'icc' && backend === 'auto' && totalPixels > FIRST_USEFUL_CPU_PIXELS ? displayMemoryBytes : 0;
  const profileBytes = policy.profile?.bytes ?? 0;
  // The existing no-ICC HDR adapter holds its base/gain LUTs, copied model,
  // and (for PQ/HLG) four tone tables. No CMM heap is instantiated on this path.
  const hdrInputs = hasProfile ? 3 * HDR_ENTRIES : HDR_ENTRIES;
  const hdrModelBytes = ['cicp', 'icc-hdr'].includes(policy.mode) ? 4 * (hdrInputs + 6 + 32 + hdrInputs + 6 + HDR_ENTRIES +
    (policy.hdr ? 32 + 3 * HDR_ENTRIES + 4 * HDR_ENTRIES : 0)) + 4096 : 0;
  const ownerResidentBytes = colorBytes + displayBytes + (hasProfile ? 2 * COLOR_NATIVE_RESOURCE.bytes + PROFILE_OUTPUT_BYTES : 0) + hdrModelBytes;
  const residentBytes = ownerResidentBytes + profileBytes; // The exact private profile borrow stays financed.
  const setupTransientBytes = profileBytes * 2;
  // A Gray ICC over a three-channel working view needs one funded word plane.
  // The exact private ICC signature is read lazily, so the bound covers either.
  const grayPackingBytes = hasProfile ? bandPixels * 2 : 0;
  const conversionTransientBytes = (['srgb', 'code-view'].includes(policy.mode) ? 0 : bandPixels * (policy.mode === 'icc-hdr' ? 24 : displayBytes ? 6 : 3)) + grayPackingBytes;
  const bytes = residentBytes + Math.max(setupTransientBytes, conversionTransientBytes);
  requireValue([residentBytes, setupTransientBytes, conversionTransientBytes, bytes].every(Number.isSafeInteger), 'Unsafe native color admission arithmetic.');
  return {known: true, completeResidentAlternative: true, mode: policy.mode, bytes, residentBytes, ownerResidentBytes, setupTransientBytes,
    conversionTransientBytes, grayPackingBytes, surfaceReadBytes: bandPixels * 9, totalPixels, bandPixels, hdrBandPixels: Math.max(2, bandPixels), maximumMemoryBytes, displayBytes, profileBytes,
    profileSha256: policy.profile?.sha256 ?? null, primary: policy.primary, transfer: policy.transfer, hdr: policy.hdr,
    backend, nativePrecision: 16, presentationPrecision: 8, gainMapApplied: false, colorimetryKnown: policy.mode !== 'code-view',
    ...(policy.displayAssumption ? {displayAssumption: policy.displayAssumption} : {})};
}

/** One final owns one lazy presentation cache. Scientific stores, profiles and
 * the Original are borrowed; only this owner's CMM/display allocations retire. */
export function createNative16DisplayOwner({nativeSource, budget, sourceBinding, isCurrent, backend = 'auto',
  maximumPixels = 65536, totalPixels, maximumMemoryBytes = 64 * MiB, displayMemoryBytes = 64 * MiB, displayAssumption} = {}, hooks = {}) {
  const descriptor = nativeSource?.descriptor;
  requireValue(descriptor && budget?.reserve && typeof isCurrent === 'function' && sourceBinding &&
    /^[a-f0-9]{64}$/.test(sourceBinding.sourceSha256 ?? '') && typeof descriptor.id === 'string' &&
    Number.isSafeInteger(descriptor.revision) && (sourceBinding.nativeSurfaceId === undefined || sourceBinding.nativeSurfaceId === descriptor.id) &&
    (sourceBinding.nativeRevision === undefined || sourceBinding.nativeRevision === descriptor.revision),
    'The presentation needs its real Original binding and budget.');
  const binding = Object.freeze({...sourceBinding, nativeSurfaceId: descriptor.id, nativeRevision: descriptor.revision});
  const options = {maximumPixels, ...(totalPixels === undefined ? {} : {totalPixels}), maximumMemoryBytes, displayMemoryBytes, backend,
    ...(displayAssumption === undefined ? {} : {displayAssumption})}, calculated = native16DisplayPlan(descriptor, options);
  const plan = Object.freeze({...calculated, ...(calculated.limitation ? {limitation: Object.freeze({...calculated.limitation})} : {})});
  const stop = new AbortController(); let closing = false, closed = false, closeFlight, retiring, queued = 0, active = false;
  let tail = Promise.resolve(), cache, transform, display, hdr, fee, profile, copies, ready = false, unregister, attached;
  let preparations = 0, conversions = 0, pixels = 0, reclaimCount = 0, peakTransientBytes = 0, lastDisplay = null, inputFormat = null;
  const debt = new Set(), bands = new Set();
  const check = signal => { checkAbort(signal); if (closed || closing) throw new EngineError('CLOSED', 'Native16 presentation is closing.');
    if (isCurrent(binding) !== true || nativeSource.descriptor.id !== binding.nativeSurfaceId || nativeSource.descriptor.revision !== binding.nativeRevision)
      throw new EngineError('SOURCE_CHANGED', 'The native color Original binding changed.'); };
  const linked = signal => signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  const retirementOwner = {dispose: () => retireColor()};
  async function retireBand(band) { await ack(band.free); band.rgb = null; band.packed = null; bands.delete(band); }
  async function retireColor() {
    if (retiring) return retiring; ready = false;
    const run = (async () => {
      for (const band of [...bands]) await retireBand(band);
      for (const owner of [...debt]) { await ack(() => owner.dispose()); debt.delete(owner); }
      if (display) { lastDisplay = display.metrics(); await ack(() => display.dispose()); display = null; transform = null; }
      if (hdr) { await ack(() => hdr.dispose()); hdr = null; }
      if (transform) { await ack(() => transform.dispose()); transform = null; }
      if (cache) { const actual = cache.snapshot().heapCapacityBytes; await ack(() => cache.dispose()); cache = null;
        if (actual) budget.notifyBackingRelease?.('wasm', actual); }
      if (profile) { await ack(() => profile.release()); profile = null; }
      if (copies) { await ack(copies); copies = null; }
      if (fee) { await ack(fee); fee = null; }
      inputFormat = null;
    })();
    retiring = run; void run.finally(() => { if (retiring === run) retiring = null; }).catch(() => {}); return run;
  }
  async function prepare(signal) {
    if (ready) return; if (retiring) await retiring;
    // A failed/NACKed preparation remains owned and must retire before retry.
    if (fee || cache || transform || display || hdr || profile || copies || debt.size || bands.size) {
      try { await retireColor(); } catch (error) { throw withRetirementOwner(error, retirementOwner, error); }
    }
    check(signal); if (!plan.known) throw new EngineError(plan.limitation.code, plan.limitation.message, {details: {presentationOnly: true}});
    if (['srgb', 'code-view'].includes(plan.mode)) { ready = true; return; }
    try {
      fee = budget.reserve(plan.ownerResidentBytes);
      if (plan.profileSha256) {
        requireValue(typeof nativeSource.readColorProfile === 'function', 'The exact private working ICC reader is required.');
        profile = await nativeSource.readColorProfile(plan.profileSha256, {signal, reserve: bytes => budget.reserve(bytes)}); check(signal);
        requireValue(profile?.data instanceof Uint8Array && profile.data.byteLength === plan.profileBytes && typeof profile.release === 'function', 'The native profile borrow differs from its declared extent.');
        copies = budget.reserve(plan.profileBytes * 2);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', profile.data)), n => n.toString(16).padStart(2, '0')).join('');
        check(signal); requireValue(digest === plan.profileSha256, 'The private working profile bytes differ from their identity.');
        const signature = String.fromCharCode(...profile.data.subarray(16, 20));
        if (!['RGB ', 'GRAY'].includes(signature)) throw new EngineError('COLOR_PROFILE_MISMATCH', 'The working RGB16 view requires its RGB or exact neutral Gray profile, not an encoded CMYK profile.');
        inputFormat = signature === 'GRAY' ? 'gray16' : 'rgb16';
        if (plan.mode === 'icc-hdr' && inputFormat !== 'rgb16') throw new EngineError('NATIVE16_GRAY_HDR_POLICY_UNAVAILABLE', 'The maintained HDR ICC adapter currently requires an RGB profile; no Gray HDR basis is invented.');
        cache = (hooks.createColorTransformCache ?? createColorTransformCache)({maximumMemoryBytes, maxEntries: 1,
          maximumBandBytes: Math.max(8, plan.bandPixels * 6)}, {...hooks.colorHooks, signal: stop.signal});
      }
      if (plan.mode === 'icc') {
        transform = await cache.acquire({inputProfileBytes: profile.data, inputFormat, outputFormat: 'rgb8',
          intent: descriptor.color?.renderingIntent ?? 1, blackPointCompensation: descriptor.color?.blackPointCompensation ?? false}, {signal});
        check(signal); requireValue(transform.metadata.inputProfileSha256 === plan.profileSha256, 'The acquired working ICC identity differs.');
        display = await (hooks.createNativeColorDisplay ?? createNativeColorDisplay)({backend, transform, colorCache: cache,
          maximumPixels: plan.bandPixels, totalPixels: plan.totalPixels,
          maximumMemoryBytes: cache.snapshot().heapCapacityBytes + plan.displayBytes, signal: stop.signal,
          nativeInput: {sampleType: 'uint16', decodedDepth: 16, sourceDepth: descriptor.sourceDepth, promoted: false}}, hooks.displayHooks);
      } else {
        hdr = await (hooks.createHdrColorPresentation ?? createHdrColorPresentation)({baseDepth: 16, gainDepth: 0,
          baseColor: {primaries: plan.primary, transfer: plan.transfer}, gainMap: null,
          ...(profile ? {baseIcc: profile.data, colorCache: cache} : {}),
          maximumBandPixels: plan.hdrBandPixels, maximumMemoryBytes,
          ...(Number.isFinite(descriptor.color?.peakNits) ? {peakNits: descriptor.color.peakNits} : {}),
          ...(Number.isFinite(descriptor.color?.referenceWhiteNits) ? {referenceWhiteNits: descriptor.color.referenceWhiteNits} : {})}, {signal: stop.signal});
      }
      if (copies) { await ack(copies); copies = null; }
      check(signal); preparations++; ready = true;
    } catch (error) {
      if (error?.cleanupOwner && error.cleanupOwner !== retirementOwner && error.cleanupOwner !== api) debt.add(error.cleanupOwner);
      try { await retireColor(); } catch (cleanup) { throw withRetirementOwner(error, retirementOwner, cleanup); }
      throw error;
    }
  }
  function displayTransform(input, output, callHooks = {}) {
    const signal = linked(callHooks.signal); check(signal);
    requireValue(input?.format === 'rgb16' && input.depth === 16 && input.data instanceof Uint16Array &&
      Number.isSafeInteger(input.width) && Number.isSafeInteger(input.height) && input.width > 0 && input.height > 0 &&
      input.data.length === input.width * input.height * 3 && output instanceof Uint8Array && output.length === input.data.length,
      'A real RGB16 window and its separately owned RGB8 destination are required.');
    queued++;
    const run = async () => { queued--; active = true;
      try {
        check(signal); await prepare(signal); check(signal);
        if (['srgb', 'code-view'].includes(plan.mode)) { for (let i = 0; i < output.length; i++) { if (i % 12288 === 0) check(signal);
          output[i] = plan.mode === 'code-view' ? Math.round(input.data[i] / 257) : roundEven(input.data[i] / 257); } }
        else for (let at = 0; at < input.data.length; at += plan.bandPixels * 3) {
          check(signal); const samples = input.data.subarray(at, Math.min(input.data.length, at + plan.bandPixels * 3));
          const bytes = samples.length / 3 * ((plan.mode === 'icc-hdr' ? 24 : plan.displayBytes ? 6 : 3) + (plan.profileSha256 ? 2 : 0)),
            band = {free: budget.reserve(bytes), rgb: null, packed: null};
          bands.add(band); peakTransientBytes = Math.max(peakTransientBytes, bytes);
          let primary, failed = false;
          try {
            let native = samples;
            if (inputFormat === 'gray16') {
              band.packed = allocateTypedArray(Uint16Array, samples.length / 3, {label: 'native16-gray-display-plane'});
              for (let at = 0, p = 0; at < samples.length; at += 3, p++) {
                if (at % 12288 === 0) check(signal);
                if (samples[at] !== samples[at + 1] || samples[at] !== samples[at + 2]) throw new EngineError('COLOR_PROFILE_MISMATCH', 'A Gray working ICC cannot characterize unequal RGB channels.');
                band.packed[p] = samples[at];
              }
              native = band.packed;
            }
            band.rgb = plan.mode === 'icc' ? await display.convert(native, {signal}) : await hdr.convert(native, undefined, {signal});
            check(signal); requireValue(band.rgb instanceof Uint8Array && band.rgb.length === samples.length, 'Native color presentation returned a different RGB extent.'); output.set(band.rgb, at);
          } catch (error) { failed = true; primary = error; throw error; }
          finally { try { await retireBand(band); } catch (error) { throw withRetirementOwner(failed ? primary : error, retirementOwner, error); } }
        }
        check(signal); conversions++; pixels += input.width * input.height;
      } finally { active = false; budget.notifyReclaimable?.(); }
    };
    const task = tail.then(run); tail = task.catch(() => {}); return task;
  }
  async function reclaim() {
    if (active || queued || closing || closed || retiring || !fee) return 0;
    const before = budget.backingReleased?.get('wasm') ?? 0;
    try { await retireColor(); reclaimCount++; } catch (error) { throw withRetirementOwner(error, retirementOwner, error); }
    return Math.max(0, (budget.backingReleased?.get('wasm') ?? 0) - before);
  }
  const api = {
    binding, plan, limitation: plan.limitation ?? null, displayTransform,
    metrics() { return {nativePrecision: 16, presentationPrecision: 8, mode: plan.mode ?? 'limited', ready, closing, closed,
      active, queued, preparations, conversions, pixels, reclaimCount, peakTransientBytes, residentChargedBytes: (fee ? plan.ownerResidentBytes : 0) + (profile?.data.byteLength ?? 0),
      profileBorrowed: !!profile, acquisitionCopiesCharged: !!copies, pendingBandLoans: bands.size, pendingRetirementOwners: debt.size, retiring: !!retiring,
      cache: cache?.snapshot() ?? null, display: display?.metrics() ?? lastDisplay, hdr: hdr?.metadata ?? null,
      profileSha256: plan.profileSha256 ?? null, inputFormat, gainMapApplied: false, colorimetryKnown: plan.colorimetryKnown,
      ...(plan.displayAssumption ? {displayAssumption: plan.displayAssumption} : {}), binding}; },
    reclaim,
    attach(surface) {
      requireValue(!attached && surface?.descriptor?.format === 'rgb16' && surface.descriptor.depth === 16 &&
        typeof surface.dispose === 'function', 'A presentation owner attaches to one real RGB16 final.');
      attached = surface; const original = surface.dispose.bind(surface); let surfaceDone = false, flight;
      composedColorContexts.set(surface,Object.freeze({nativeSource,budget,sourceBinding:binding,isCurrent,backend,maximumPixels,maximumMemoryBytes,displayMemoryBytes,displayAssumption}));
      if (typeof surface.readSampledWindow === 'function') {
        const readSampledWindow = surface.readSampledWindow.bind(surface);
        surface.readSampledWindow = async (...args) => {
          const frame = await readSampledWindow(...args);
          try { return {...frame, metrics: {...frame.metrics, nativeColorPresentation: structuredClone(api.metrics())}}; }
          catch (primary) {
            let held = frame, flight;
            const loan = {dispose() {
              if (!held) return Promise.resolve(); if (flight) return flight;
              const task = (async () => { await ack(() => held.release()); held = null; debt.delete(loan); })();
              flight = task; void task.finally(() => { if (flight === task) flight = null; }).catch(() => {}); return task;
            }};
            debt.add(loan);
            try { await loan.dispose(); } catch (cleanup) { throw withRetirementOwner(primary, retirementOwner, cleanup); }
            throw primary;
          }
        };
      }
      if (plan.profileSha256 && !Object.hasOwn(surface, 'readColorProfile')) Object.defineProperty(surface, 'readColorProfile', {
        value(hash, callHooks = {}) { check(callHooks.signal); requireValue(hash === plan.profileSha256, 'This working ICC does not belong to the final.'); return nativeSource.readColorProfile(hash, callHooks); }
      });
      surface.dispose = () => { if (flight) return flight;
        const task = (async () => { try { if (!surfaceDone) { await ack(original); surfaceDone = true; } await api.dispose(); }
          catch (error) { throw withRetirementOwner(error, surface, error); } })();
        flight = task; void task.finally(() => { if (flight === task) flight = null; }).catch(() => {}); return task;
      }; return surface;
    },
    dispose() {
      if (closed) return Promise.resolve(); if (closeFlight) return closeFlight; closing = true; stop.abort();
      const task = (async () => { await tail; try { await retireColor(); } catch (error) { throw withRetirementOwner(error, api, error); }
        unregister?.(); unregister = null; closed = true; })();
      closeFlight = task; void task.finally(() => { if (closeFlight === task) closeFlight = null; }).catch(() => {}); return task;
    }
  };
  unregister = budget.registerAsyncReclaimer?.(reclaim, {allocationKind: 'wasm', owner: 'native16-display/' + descriptor.id,
    label: 'Idle final RGB16 color presentation; scientific store retained'});
  return api;
}
