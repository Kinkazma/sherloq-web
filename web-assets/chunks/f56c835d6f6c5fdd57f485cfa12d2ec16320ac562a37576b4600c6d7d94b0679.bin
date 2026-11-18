import "../../runtime-context.js?v=0.33.2";
// Typed source storage over the existing shared byte store.
// This module neither decodes, applies a profile nor chooses an analysis domain.
import {createSegmentedBytes} from './segmented-bytes.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError, requireValue, checkAbort, createCooperator} from './errors.js';
import {displayGeometry} from './display-sampling.js';
import {withRetirementOwner} from './owner-retirement-error.js';

const TYPES = Object.freeze({uint8: Uint8Array, uint16: Uint16Array, float32: Float32Array});
const HOST_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const bytesOf = value => new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
const ack = async action => { const value = await action(); if (value === false || value === 0) throw value; return value; };

function metadata(value, name) {
  let remaining = 1024;
  const clone = (input, depth) => {
    requireValue(depth <= 16 && remaining-- > 0, `Excessive ${name} metadata.`);
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') { requireValue(Number.isFinite(input), `Non-finite ${name} metadata.`); return input; }
    requireValue(input && typeof input === 'object' && !ArrayBuffer.isView(input)
      && !(input instanceof ArrayBuffer) && (Array.isArray(input) || Object.getPrototypeOf(input) === Object.prototype),
    `${name} must contain only public metadata, not profile payloads or owners.`);
    if (Array.isArray(input)) return Object.freeze(input.map(part => clone(part, depth + 1)));
    return Object.freeze(Object.fromEntries(Object.entries(input).map(([key, part]) => [key, clone(part, depth + 1)])));
  };
  return clone(value, 0);
}

function originalIdentity(value) {
  requireValue(value && typeof value.imageId === 'string' && value.imageId.length > 0
    && typeof value.sourceSurfaceId === 'string' && value.sourceSurfaceId.length > 0
    && Number.isSafeInteger(value.sourceRevision) && value.sourceRevision > 0
    && ['encoded', 'fixture'].includes(value.kind)
    && (value.sourceSha256 === null || typeof value.sourceSha256 === 'string'
      && /^[a-f0-9]{64}$/i.test(value.sourceSha256)), 'An explicit typed source identity is required.');
  return Object.freeze({imageId: value.imageId, sourceSurfaceId: value.sourceSurfaceId, sourceRevision: value.sourceRevision,
    sourceSha256: value.sourceSha256?.toLowerCase() ?? null, kind: value.kind});
}

function swapSamples(bytes, sampleBytes) {
  for (let at = 0; at < bytes.length; at += sampleBytes) for (let left = 0; left < sampleBytes / 2; ++left) {
    const right = sampleBytes - 1 - left, value = bytes[at + left];
    bytes[at + left] = bytes[at + right]; bytes[at + right] = value;
  }
}

// The shared byte-store convention accepts undefined on success. Preserve an
// explicit false/0 NACK before it can forget a still-owned temporary file.
function retirementCheckedSession(session) {
  if (!session) return session;
  return new Proxy(Object.create(null), {get(_target, key) {
    const target = session;
    if (key === 'create') return async (...args) => {
      const file = await target.create(...args);
      requireValue(file && typeof file.dispose === 'function', 'A temporary file owner is required.');
      return new Proxy(Object.create(null), {get(_resource, member) {
        const resource = file;
        if (member === 'dispose') return () => ack(() => resource.dispose());
        const value = Reflect.get(resource, member, resource);
        return typeof value === 'function' ? value.bind(resource) : value;
      }});
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
}

/** Ordered full-width bands; stored samples never pass through Number. Float32
 * NaNs, signed zero and subnormal payloads survive byte copies/permutations.
 * A fixed encoded/fixture identity is required before seal/read publication. */
export async function createNativeSampleBank({width: sw, height: sh, sampleType,
  channels, channelMap, sourceDepth = null, domain, sampleModel, sampleSemantics = null, valueEncoding = null,
  bindingOriginal, orientation = 1, color = null, provenance = null,
  budget, signal, temporarySession, getTemporarySession, ...storageOptions} = {}) {
  const Type = TYPES[sampleType], sampleBytes = Type?.BYTES_PER_ELEMENT;
  requireValue(Type && [sw, sh, channels].every(value => Number.isSafeInteger(value) && value > 0)
    && Number.isSafeInteger(sw * sh * channels * sampleBytes)
    && Array.isArray(channelMap) && channelMap.length === channels
    && Array.from(channelMap).every(value => typeof value === 'string' && value.length > 0)
    && (sourceDepth === null || Number.isSafeInteger(sourceDepth) && sourceDepth > 0)
    && Number.isInteger(orientation) && orientation >= 1 && orientation <= 8,
  'Invalid typed source geometry or sample layout.');
  requireValue(['decoded', 'sensor'].includes(domain) && typeof sampleModel === 'string' && sampleModel.length > 0,
    'The source domain and sample model must be explicit.');
  requireValue(domain !== 'sensor' || orientation === 1, 'Sensor samples must retain their unrotated physical grid.');
  checkAbort(signal);
  const semantics = metadata(sampleSemantics, 'sample semantics'), publicColor = metadata(color, 'color'),
    publicProvenance = metadata(provenance, 'provenance'), encoding = metadata(valueEncoding, 'value encoding'),
    map = Object.freeze([...channelMap]);
  let original = originalIdentity(bindingOriginal);
  const width = orientation >= 5 ? sh : sw, height = orientation >= 5 ? sw : sh,
    pixelBytes = channels * sampleBytes, byteLength = sw * sh * pixelBytes,
    stop = new AbortController(), pending = new Set(), leases = new Set();
  let store, nextRow = 0, writing = false, sealing = false, sealed = false,
    closing = false, closed = false, closeFlight, closeAttempts = 0, closeFailed = false;
  const descriptor = Object.freeze({id: crypto.randomUUID(), revision: 1,
    width, height, sourceWidth: sw, sourceHeight: sh, orientation,
    format: 'native-samples', sampleType, containerBits: sampleBytes * 8, sourceDepth,
    channels, channelMap: map, byteOrder: 'little-endian', byteLength,
    domain, sampleModel, sampleSemantics: semantics, valueEncoding: encoding, color: publicColor, provenance: publicProvenance,
    get bindingOriginal() { return original; }, get identityStatus() { return original.sourceSha256 ? 'fixed' : 'pending'; },
    get storage() { return store?.storage ?? 'unallocated'; }, coordinates: 'full-resolution'});
  const alive = () => { if (closing || closed) throw new EngineError('DISPOSED', 'Typed source is closing or disposed.'); };
  const combined = extra => AbortSignal.any([stop.signal, ...(extra ? [extra] : [])]);
  const track = task => { pending.add(task); task.then(() => pending.delete(task), () => pending.delete(task)); return task; };
  const sourcePoint = (x, y) => {
    switch (orientation) {
      case 2: return [sw - 1 - x, y]; case 3: return [sw - 1 - x, sh - 1 - y];
      case 4: return [x, sh - 1 - y]; case 5: return [y, x];
      case 6: return [y, sh - 1 - x]; case 7: return [sw - 1 - y, sh - 1 - x];
      case 8: return [sw - 1 - y, x]; default: return [x, y];
    }
  };
  function dispose() {
    if (closed) return Promise.resolve(); if (closeFlight) return closeFlight;
    closing = true; stop.abort(); ++closeAttempts;
    const task = (async () => {
      await Promise.allSettled([...pending]);
      for (const lease of [...leases]) lease.release();
      await ack(() => store?.dispose());
      closed = true; closeFailed = false;
    })();
    closeFlight = task;
    task.then(() => { if (closeFlight === task) closeFlight = undefined; }, () => {
      closeFailed = true; if (closeFlight === task) closeFlight = undefined;
    });
    return task;
  }
  const surface = {descriptor,
    readWindow({x = 0, y = 0, width: w = width, height: h = height} = {}, hooks = {}) {
      return track((async () => {
        alive(); const readSignal = combined(hooks.signal); checkAbort(readSignal);
        requireValue(sealed && original.sourceSha256 !== null, 'The typed source has not been sealed with a fixed identity.');
        requireValue([x, y, w, h].every(Number.isSafeInteger) && x >= 0 && y >= 0 && w > 0 && h > 0
          && x <= width - w && y <= height - h, 'Typed source window is outside its grid.');
        const output = allocateOwnedTypedArray(Type, w * h * channels,
          {...hooks, budget, owner: 'native-sample-window', label: 'native-sample-window'});
        let row;
        try {
          const out = bytesOf(output.data);
          if (orientation === 1 || orientation === 4) {
            for (let dy = 0; dy < h; ++dy) {
              alive(); checkAbort(readSignal); const sy = orientation === 1 ? y + dy : sh - 1 - y - dy;
              await ack(() => store.readInto(out.subarray(dy * w * pixelBytes, (dy + 1) * w * pixelBytes),
                (sy * sw + x) * pixelBytes, {...hooks, signal: readSignal}));
            }
          } else {
            const corners = [sourcePoint(x, y), sourcePoint(x + w - 1, y),
              sourcePoint(x, y + h - 1), sourcePoint(x + w - 1, y + h - 1)],
              left = Math.min(...corners.map(point => point[0])), right = Math.max(...corners.map(point => point[0])),
              top = Math.min(...corners.map(point => point[1])), bottom = Math.max(...corners.map(point => point[1]));
            row = allocateOwnedTypedArray(Uint8Array, (right - left + 1) * pixelBytes,
              {...hooks, budget, owner: 'native-sample-window', label: 'native-sample-row'});
            for (let sy = top; sy <= bottom; ++sy) {
              alive(); checkAbort(readSignal);
              await ack(() => store.readInto(row.data, (sy * sw + left) * pixelBytes, {...hooks, signal: readSignal}));
              alive(); checkAbort(readSignal);
              for (let sx = left; sx <= right; ++sx) {
                let dx = sx, dy = sy;
                switch (orientation) {
                  case 2: dx = sw - 1 - sx; break; case 3: dx = sw - 1 - sx; dy = sh - 1 - sy; break;
                  case 5: dx = sy; dy = sx; break; case 6: dx = sh - 1 - sy; dy = sx; break;
                  case 7: dx = sh - 1 - sy; dy = sw - 1 - sx; break; case 8: dx = sy; dy = sw - 1 - sx; break;
                }
                const from = (sx - left) * pixelBytes, to = ((dy - y) * w + dx - x) * pixelBytes;
                out.set(row.data.subarray(from, from + pixelBytes), to);
              }
            }
          }
          alive(); checkAbort(readSignal); if (!HOST_LE && sampleBytes > 1) swapSamples(out, sampleBytes);
          const answer = {windowLeaseId: crypto.randomUUID(), surfaceId: descriptor.id, revision: descriptor.revision,
            bindingOriginal: original, origin: Object.freeze([x, y]), width: w, height: h,
            descriptor, samples: output.data, release() {
              if (!leases.delete(answer)) return;
              answer.samples = null; output.release();
            }};
          leases.add(answer); return answer;
        } catch (error) { output.release(); throw error; }
        finally { row?.release(); }
      })());
    },
    // A presentation tile samples the same owned byte store. Copy sample
    // bytes, including Float32 NaN payloads, without converting their values.
    // Only one contributing stored scanline is needed at a time.
    readSampledWindow(tile, hooks = {}) {
      return track((async () => {
        alive(); const readSignal = combined(hooks.signal); checkAbort(readSignal);
        requireValue(sealed && original.sourceSha256 !== null, 'The typed source has not been sealed with a fixed identity.');
        const g = displayGeometry(descriptor, tile);
        if (g.step === 1) {
          const answer = await surface.readWindow({x: g.x, y: g.y, width: g.w, height: g.h}, hooks);
          return Object.assign(answer, {samplingStep: 1, logicalRect: Object.freeze({x: g.x, y: g.y, width: g.w, height: g.h})});
        }
        const transposed = orientation >= 5,
          a = sourcePoint(g.x, g.y), b = sourcePoint(g.x + (g.width - 1) * g.step, g.y + (g.height - 1) * g.step),
          left = Math.min(a[0], b[0]), span = Math.abs(a[0] - b[0]) + 1,
          output = allocateOwnedTypedArray(Type, g.width * g.height * channels,
            {...hooks, budget, owner: 'native-sample-window', label: 'native-sample-display'}),
          cooperate = createCooperator(readSignal);
        let row, sourceBytes = 0;
        try {
          row = allocateOwnedTypedArray(Uint8Array, span * pixelBytes,
            {...hooks, budget, owner: 'native-sample-window', label: 'native-sample-display-row'});
          const out = bytesOf(output.data), rows = transposed ? g.width : g.height,
            cols = transposed ? g.height : g.width,
            direction = transposed ? (orientation === 5 || orientation === 6 ? 1 : -1) : (orientation === 1 || orientation === 4 ? 1 : -1);
          for (let at = 0; at < rows; ++at) {
            await cooperate(); alive(); checkAbort(readSignal);
            const first = sourcePoint(g.x + (transposed ? at * g.step : 0), g.y + (transposed ? 0 : at * g.step));
            await ack(() => store.readInto(row.data, (first[1] * sw + left) * pixelBytes, {...hooks, signal: readSignal}));
            alive(); checkAbort(readSignal); sourceBytes += row.data.byteLength;
            for (let col = 0; col < cols; ++col) {
              const from = (first[0] - left + direction * col * g.step) * pixelBytes,
                to = (transposed ? col * g.width + at : at * g.width + col) * pixelBytes;
              for (let byte = 0; byte < pixelBytes; ++byte) out[to + byte] = row.data[from + byte];
            }
          }
          alive(); checkAbort(readSignal); if (!HOST_LE && sampleBytes > 1) swapSamples(out, sampleBytes);
          const answer = {windowLeaseId: crypto.randomUUID(), surfaceId: descriptor.id, revision: descriptor.revision,
            bindingOriginal: original, origin: Object.freeze([g.x, g.y]), width: g.width, height: g.height,
            samplingStep: g.step, logicalRect: Object.freeze({x: g.x, y: g.y, width: g.w, height: g.h}),
            descriptor, samples: output.data, metrics: {sourceBytes}, release() {
              if (!leases.delete(answer)) return;
              answer.samples = null; output.release();
            }};
          leases.add(answer); return answer;
        } catch (error) { output.release(); throw error; }
        finally { row?.release(); }
      })());
    }, dispose,
  };
  const owner = {get store() { return store; }, get descriptor() { return descriptor; },
    get rowsWritten() { return nextRow; },
    get state() { return Object.freeze({writing, sealing, sealed, closing, closed,
      pendingOperations: pending.size, activeLeases: leases.size,
      retirementPending: closing && !closed, closeAttempts, closeFailed}); },
    bindOriginalIdentity(value) {
      alive(); requireValue(!sealing && !sealed, 'A sealed source identity cannot be rebound.');
      const next = originalIdentity(value);
      requireValue(next.imageId === original.imageId && next.sourceSurfaceId === original.sourceSurfaceId
        && next.sourceRevision === original.sourceRevision
        && next.kind === original.kind && next.sourceSha256 !== null
        && (original.sourceSha256 === null || original.sourceSha256 === next.sourceSha256),
      'The typed source content identity changed.'); original = next;
    },
    writeBand({y, width: w = sw, rows, samples} = {}, hooks = {}) {
      return track((async () => {
        alive(); const writeSignal = combined(hooks.signal ?? signal); checkAbort(writeSignal);
        requireValue(!sealed && !sealing && !writing && w === sw && y === nextRow
          && Number.isSafeInteger(rows) && rows > 0 && rows <= sh - y
          && samples instanceof Type && samples.length === sw * rows * channels,
        'Invalid, concurrent or out-of-order typed source band.');
        writing = true; let swapped;
        try {
          let bytes = bytesOf(samples);
          if (!HOST_LE && sampleBytes > 1) {
            swapped = allocateOwnedTypedArray(Uint8Array, bytes.length,
              {...hooks, budget, owner: 'native-sample-source', label: 'native-source-endian-band'});
            swapped.data.set(bytes); bytes = swapped.data; swapSamples(bytes, sampleBytes);
          }
          await ack(() => store.write(bytes, y * sw * pixelBytes, {...hooks, signal: writeSignal}));
          alive(); checkAbort(writeSignal); nextRow += rows;
        } finally { swapped?.release(); writing = false; }
      })());
    },
    seal(hooks = {}) {
      return track((async () => {
        alive(); checkAbort(hooks.signal ?? signal);
        requireValue(!writing && !sealing && nextRow === sh, 'Typed source coverage is incomplete or busy.');
        requireValue(original.sourceSha256 !== null, 'A canonical content identity must be fixed before source publication.');
        if (sealed) return surface;
        sealing = true;
        try { await ack(() => store.flush()); alive(); checkAbort(hooks.signal ?? signal); sealed = true; return surface; }
        finally { sealing = false; }
      })());
    }, dispose,
  };
  try {
    store = await createSegmentedBytes(byteLength, {...storageOptions, budget, signal,
      temporarySession: retirementCheckedSession(temporarySession),
      ...(getTemporarySession ? {getTemporarySession: async hooks => retirementCheckedSession(await getTemporarySession(hooks))} : {}),
      owner: 'native-sample-source', label: 'native-source-' + sampleType});
    checkAbort(signal); return owner;
  } catch (primary) {
    try { await dispose(); } catch (cleanup) { throw withRetirementOwner(primary, owner, cleanup); }
    throw primary;
  }
}
