import {createRgb16Surface} from './rgb16-surface.js';
import {EngineError, checkAbort, requireValue} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';

const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const bindingKeys = ['imageId', 'sourceSurfaceId', 'sourceRevision', 'sourceSha256', 'kind'];
const sameBinding = (left, right) => left && right && bindingKeys.every(key => left[key] === right[key]);
const sameChannels = (left, right) => Array.isArray(left) && left.length === right.length && right.every((value, index) => left[index] === value);
const RGB = ['R', 'G', 'B'], RGBA = [...RGB, 'A'];

function copyRgbWords(target, written, samples, channels, skip, count) {
  if (channels === 3 && littleEndian) {
    target.set(new Uint8Array(samples.buffer, samples.byteOffset + skip, count), written);
    return;
  }
  const destination = new DataView(target.buffer, target.byteOffset + written, count);
  const firstWord = skip / 2;
  let channel = firstWord % 3, input = Math.floor(firstWord / 3) * channels + channel;
  for (let byte = 0; byte < count; byte += 2) {
    destination.setUint16(byte, samples[input++], true);
    if (++channel === 3) {
      channel = 0;
      input += channels - 3;
    }
  }
}

/** A read-only working view over the Original's decoded pin. Its virtual RGB
 * store holds no pixels. The Original remains the owner of the pin and ICC. */
export function createBorrowedRgb16WorkingSurface({
  pin, decodedMetadata, budget, maximumWindowBytes = 1024 ** 2, readProfile,
} = {}) {
  const source = pin?.source, d = source?.descriptor, m = decodedMetadata;
  requireValue(d?.format === 'native-samples' && d.identityStatus === 'fixed'
    && source.domain === 'decoded' && source.frame === 0 && d.domain === source.domain
    && source.sourceId === d.id && source.revision === d.revision
    && typeof source.sourceLeaseId === 'string' && sameBinding(d.bindingOriginal, source.bindingOriginal)
    && sameBinding(d.bindingOriginal, m?.bindingOriginal)
    && m.canonicalGrid?.width === d.width && m.canonicalGrid?.height === d.height
    && m.sourceGrid?.width === d.sourceWidth && m.sourceGrid?.height === d.sourceHeight && m.sourceGrid?.orientation === d.orientation
    && m.sampleType === d.sampleType && m.channels === d.channels && sameChannels(m.channelMap, d.channelMap)
    && m.valueEncoding?.units === d.valueEncoding?.units
    && typeof pin.readWindow === 'function' && typeof pin.retireWindow === 'function' && budget?.reserve,
  'The RGB16 working view requires the actual fixed decoded pin and Read metadata.');
  const semantics = d.sampleSemantics, coded = Array.isArray(semantics?.codedChannels)
    ? semantics.codedChannels.filter(channel => channel?.role === 'color') : [];
  if (m.sourceModel !== 'RGB' || d.sampleModel !== 'decoded-rgb-samples'
    || d.sampleType !== 'uint16' || d.containerBits !== 16 || d.byteOrder !== 'little-endian'
    || !sameChannels(d.channelMap, RGB) && !sameChannels(d.channelMap, RGBA)
    || d.valueEncoding?.units !== 'unsigned-code-values-0..65535'
    || semantics?.colorConversionApplied !== false || semantics?.developmentApplied !== false
    || semantics.paletteExpansionApplied === true
    || coded.length !== 3 || coded.some(channel => channel.codedType !== 'uint'
      || !Number.isInteger(channel.codedBits) || channel.codedBits < 1 || channel.codedBits > 16)) return null;
  const sourceDepth = Math.max(...coded.map(channel => channel.codedBits));
  if (sourceDepth <= 8) return null;

  const {width, height, channels} = d, byteLength = width * height * 6;
  const maximumPixels = Math.floor(maximumWindowBytes / (channels * 2));
  requireValue(Number.isSafeInteger(maximumWindowBytes) && maximumPixels >= 1, 'One native RGB window pixel must be admitted.');
  const profile = d.color?.iccProfile;
  requireValue(!profile || typeof readProfile === 'function' && /^[a-f0-9]{64}$/.test(profile.sha256 ?? ''),
    'The decoded RGB profile must keep its exact private reader.');
  const unpaidWindows = new Set();
  let closing = false, closeFlight, drainFlight, surface;
  const alive = () => { if (closing) throw new EngineError('DISPOSED', 'The borrowed RGB16 view is retiring.'); };

  async function retireWindow(receipt) {
    try {
      const answer = await pin.retireWindow(receipt);
      if (answer?.retired !== true) throw answer;
      unpaidWindows.delete(receipt);
    } catch (cause) {
      unpaidWindows.add(receipt);
      throw new EngineError('SOURCE_WINDOW_RETIREMENT_FAILED', 'The decoded window has not acknowledged retirement.', {cause});
    }
  }

  function drainWindows() {
    if (drainFlight) return drainFlight;
    if (!unpaidWindows.size) return;
    const task = (async () => {
      for (const receipt of unpaidWindows) await retireWindow(receipt);
    })();
    drainFlight = task;
    task.then(() => { drainFlight = null; }, () => { drainFlight = null; });
    return task;
  }
  // A failed decoded-window ACK is not ownership of the Original itself.
  // Its retry may occur inside an active scientific reader of this surface.
  const windowDebtOwner = {dispose: () => drainWindows()};

  const store = {
    byteLength, storage: d.storage,
    async readInto(target, offset, hooks = {}) {
      alive(); checkAbort(hooks.signal);
      requireValue(target instanceof Uint8Array && target.byteLength % 2 === 0
        && Number.isSafeInteger(offset) && offset >= 0 && offset % 2 === 0 && offset <= byteLength - target.byteLength,
      'An aligned RGB16 byte interval within the working view is required.');
      if (unpaidWindows.size) await drainWindows();
      let written = 0;
      while (written < target.byteLength) {
        alive(); checkAbort(hooks.signal);
        const at = offset + written, pixel = Math.floor(at / 6), skip = at % 6;
        const x = pixel % width, y = Math.floor(pixel / width), remaining = target.byteLength - written;
        const wholeRows = x === 0 && skip === 0 && remaining >= width * 6 && maximumPixels >= width;
        const rect = wholeRows
          ? {x, y, width, height: Math.min(Math.floor(maximumPixels / width), Math.floor(remaining / (width * 6)))}
          : {x, y, width: Math.min(maximumPixels, width - x, Math.ceil((skip + remaining) / 6)), height: 1};
        const count = Math.min(remaining, rect.width * rect.height * 6 - skip);
        const window = await pin.readWindow(rect, hooks);
        const {sourceId, sourceLeaseId, revision, domain, frame, bindingOriginal} = source;
        const receipt = {sourceId, sourceLeaseId, revision, domain, frame, bindingOriginal, windowLeaseId: window?.windowLeaseId};
        let failed = false, primary;
        try {
          alive(); checkAbort(hooks.signal);
          requireValue(window?.sourceId === sourceId && window.sourceLeaseId === sourceLeaseId && window.revision === revision
            && window.domain === domain && window.frame === frame && sameBinding(window.bindingOriginal, bindingOriginal)
            && typeof window.windowLeaseId === 'string' && window.windowLeaseId.startsWith(sourceLeaseId + '/w/')
            && window.origin?.[0] === x && window.origin?.[1] === y && window.width === rect.width && window.height === rect.height
            && window.sampleType === 'uint16' && window.channels === channels && sameChannels(window.channelMap, d.channelMap)
            && window.samples instanceof Uint16Array && window.samples.length === rect.width * rect.height * channels,
          'The decoded RGB16 window differs from its fixed pin.');
          copyRgbWords(target, written, window.samples, channels, skip, count);
        } catch (error) { failed = true; primary = error; }
        try { await retireWindow(receipt); }
        catch (cleanup) { throw withRetirementOwner(failed ? primary : cleanup, windowDebtOwner, cleanup); }
        if (failed) throw primary;
        written += count;
      }
    },
  };
  surface = createRgb16Surface(store, {
    width, height, orientation: 1, budget, ownsStore: false, sourceDepth, color: d.color,
    provenance: {sourceSelection: 'borrowed-decoded-rgb16', bindingOriginal: source.bindingOriginal,
      decodedSurfaceId: d.id, decodedSurfaceRevision: d.revision, decodedOrientation: d.orientation,
      sourceBitDepth: sourceDepth, alphaPreservedInSource: channels === 4, alphaOmittedFromView: channels === 4,
      sourceAlphaAssociation: channels === 4 ? semantics.decodedAlphaAssociation ?? 'unknown' : null,
      colorConversionApplied: false, orientationAppliedBy: 'decoded-sample-bank'},
  });
  // Passive plan of this exact adapter, including the temporary decoded pin
  // window used while filling the already-owned RGB16 destination. It performs
  // the same integer packet geometry as readInto; no samples are read here.
  Object.defineProperty(surface, 'readWindowPlan', {value({x = 0, y = 0, width: w = width, height: h = height} = {}) {
    alive();
    requireValue([x, y, w, h].every(Number.isSafeInteger) && x >= 0 && y >= 0 && w > 0 && h > 0
      && x <= width - w && y <= height - h && Number.isSafeInteger(w * h * 6), 'Invalid borrowed RGB16 read plan.');
    let sourceWindowBytes = 0, sourceRowScratchBytes = 0, sourcePeakBytes = 0;
    const ledgerBytes = 256, outputBytes = w * h * 6, outerRowScratchBytes = x === 0 && w === width ? 0 : w * 6;
    const packet = (offset, length) => {
      let written = 0;
      while (written < length) {
        const at = offset + written, pixel = Math.floor(at / 6), skip = at % 6,
          px = pixel % width, remaining = length - written,
          wholeRows = px === 0 && skip === 0 && remaining >= width * 6 && maximumPixels >= width,
          rw = wholeRows ? width : Math.min(maximumPixels, width - px, Math.ceil((skip + remaining) / 6)),
          rh = wholeRows ? Math.min(Math.floor(maximumPixels / width), Math.floor(remaining / (width * 6))) : 1,
          bytes = rw * rh * channels * 2,
          scratch = d.orientation === 1 || d.orientation === 4 ? 0 : (d.orientation >= 5 ? rh : rw) * channels * 2;
        sourceWindowBytes = Math.max(sourceWindowBytes, bytes);
        sourceRowScratchBytes = Math.max(sourceRowScratchBytes, scratch);
        sourcePeakBytes = Math.max(sourcePeakBytes, bytes + scratch + ledgerBytes);
        written += Math.min(remaining, rw * rh * 6 - skip);
      }
    };
    if (!outerRowScratchBytes) {
      // createRgb16Surface.fill uses these same4MiB byte packets for a full row span.
      for (let offset = 0; offset < outputBytes; offset += 4 * 1024 ** 2)
        packet(y * width * 6 + offset, Math.min(4 * 1024 ** 2, outputBytes - offset));
    } else packet((y * width + x) * 6, w * 6); // Every row has the same peak geometry.
    return Object.freeze({schema: 'sherloq.rgb16-window-read-plan/1', known: true, outputBytes,
      additionalBytes: outerRowScratchBytes + sourcePeakBytes, sourceWindowBytes, sourceRowScratchBytes,
      outerRowScratchBytes, ledgerBytes, maximumWindowBytes, sourceChannels: channels,
      sourceOrientation: d.orientation, sourceSurfaceId: d.id, sourceRevision: d.revision});
  }});
  if (profile) Object.defineProperty(surface, 'readColorProfile', {
    value(hash, hooks) {
      alive();
      requireValue(hash === profile.sha256, 'This profile does not belong to the decoded RGB working view.');
      return readProfile(hash, hooks);
    },
  });
  const disposeSurface = surface.dispose.bind(surface);
  surface.dispose = () => {
    if (closeFlight) return closeFlight;
    closing = true;
    const task = (async () => { await disposeSurface(); await drainWindows(); })();
    closeFlight = task;
    task.catch(() => { if (closeFlight === task) closeFlight = null; });
    return task;
  };
  return surface;
}
