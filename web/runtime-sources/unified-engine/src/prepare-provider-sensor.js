import "../../runtime-context.js?v=0.33.2";
import {rawSensorFacts} from './raw-sensor-facts.js';
import {EngineError, requireValue, checkAbort} from './errors.js';
import {createNativeSampleBank} from './native-sample-bank.js';
import {RAW_SENSOR_METADATA_MAXIMUM_BYTES} from './raw-codec-runtime.js';
import {createSourceSamplesCodecPeer} from './source-samples-codec-peer.js';

const MiB = 1024 ** 2, PAGE = 65536;
const HOST_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Preparation provider for the existing B source service. Its codec admission
 * comes from the Original's actual RAW plan, never from image dimensions here.
 * B owns every bank, calibration owner, phase and published source/window. */
export function createPrepareProviderSensor({blob, maximumMemoryBytes, workerFactory, storageOptions = {}} = {}) {
  requireValue(blob && Number.isSafeInteger(blob.size) && blob.size > 0 && typeof workerFactory === 'function'
    && Number.isSafeInteger(maximumMemoryBytes) && maximumMemoryBytes >= 16 * MiB
    && maximumMemoryBytes <= 2 ** 32 && maximumMemoryBytes % PAGE === 0,
  'An encoded source and admitted sensor codec owner are required.');
  requireValue(Object.keys(storageOptions).every(key =>
    ['storage', 'chunkBytes', 'temporarySession', 'getTemporarySession'].includes(key)),
  'Storage options cannot replace sensor type/domain/budget/identity.');

  return async context => {
    requireValue(context.domain === 'sensor' && context.frame === 0,
      'The sensor provider qualifies the explicit frame0 domain.'); checkAbort(context.signal);
    const phase = context.codecPhase({bytes: maximumMemoryBytes + blob.size + 2 * MiB + 16 * 1024,
      label: 'raw-sensor-codec'});
    let metadataPlan, calibration, header, bank, failedBankOwner;
    const bankOwner = {
      async dispose() {
        const result = bank ? await bank.dispose() : failedBankOwner ? await failedBankOwner.dispose() : undefined;
        if (result === false || result === 0) throw result;
        bank = null; failedBankOwner = null; header = null; metadataPlan = null;
      },
    };
    const handleRequest = async (action, value) => {
      checkAbort(context.signal);
      if (action === 'metadata-admit') {
        requireValue(!metadataPlan && value?.schema === 'raw-sensor-post-unpack/1'
          && Number.isSafeInteger(value.serializedBytes) && value.serializedBytes > 0
          && value.serializedBytes <= RAW_SENSOR_METADATA_MAXIMUM_BYTES && value.maximumRetainedBytes === 2 * MiB,
        'Sensor metadata admission differs from its producer.');
        const fee = context.budget.reserve(value.maximumRetainedBytes); let data = null, retired = false;
        const owner = {
          set(next) { requireValue(!retired, 'The calibration owner is retired.'); data = next; },
          // Private owner method for a future calibrated consumer, not an API
          // on the provider, Core, worker client or public descriptor.
          read() { requireValue(!retired, 'The calibration owner is retired.'); return data; },
          dispose() { if (retired) return; data = null; fee(); retired = true; },
        };
        // No caller-visible calibration reader is introduced. The retained
        // private payload is owned and paid until the source's last ACK.
        try { context.adoptAuxiliaryOwner(owner); } catch (error) { owner.dispose(); throw error; }
        calibration = owner; metadataPlan = value; return {admitted: true};
      }
      if (action === 'sensor-header') {
        requireValue(metadataPlan && calibration && !header && value?.sourceSha256 === context.bindingOriginal.sourceSha256
          && value.domain === 'sensor' && value.sampleModel === 'raw-decoded-sensor'
          && value.selectedFrame === 0 && value.orientationApplied === false
          && ['uint16', 'float32'].includes(value.sampleType) && [1, 3, 4].includes(value.channels)
          && [value.width, value.height].every(v => Number.isSafeInteger(v) && v > 0),
        'The sensor header differs from the captured Original/domain/frame/type.');
        const encoded = new TextEncoder().encode(JSON.stringify(value));
        requireValue(encoded.length <= metadataPlan.serializedBytes + 4096,
          'The calibration clone exceeds its admitted payload.');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
        const calibrationSha256 = Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
        const factsFee = context.budget.reserve(16 * 1024);let factsPaid=true;
        const factsOwner={dispose(){if(factsPaid){factsPaid=false;factsFee();}}};
        try{context.adoptAuxiliaryOwner(factsOwner);}catch(primary){factsOwner.dispose();throw primary;}
        const facts = rawSensorFacts(value);
        calibration.set(value); header = value;
        const rowBytes = value.width * value.channels * (value.sampleType === 'float32' ? 4 : 2);
        const bandMaximum = Math.max(rowBytes, MiB);
        requireValue(Number.isSafeInteger(rowBytes) && Number.isSafeInteger(bandMaximum * 2),
          'Sensor transport geometry exceeds the admitted range.');
        phase.admitCapacity(maximumMemoryBytes + blob.size + 2 * bandMaximum + 16 * 1024);
        // Adopt before the async constructor; failed constructors can retain a
        // retryable storage owner that must remain reachable by the parent.
        context.adoptSourceOwner(bankOwner);
        try {
          bank = await createNativeSampleBank({width: value.width, height: value.height,
            sampleType: value.sampleType, channels: value.channels,
            channelMap: Array.from({length: value.channels}, (_, i) => 'sensor-' + i), sourceDepth: value.sourceDepth,
            domain: 'sensor', sampleModel: 'raw-decoded-sensor',
            sampleSemantics: {stage: value.stage, developmentApplied: false, coordinateRelationToDeveloped: 'requires-validated-development-geometry', sensor: facts},
            valueEncoding: {kind: 'decoded-sensor-sample', normalization: 'none',
              units: 'decoder-defined; calibration retained separately'},
            bindingOriginal: context.bindingOriginal, orientation: 1, budget: context.budget, signal: context.signal,
            provenance: {decoder: 'LibRaw-' + value.decoding.librawVersion, selectedFrame: 0,
              calibration: {schema: 'raw-sensor-post-unpack/1', sha256: calibrationSha256, bytes: encoded.length},
              mappingToDeveloped: 'requires-validated-development-geometry'}, ...storageOptions});
        } catch (error) { try { failedBankOwner = error?.cleanupOwner; } catch {} throw error; }
        return {admitted: true};
      }
      if (action === 'sensor-band') {
        const bytes = value?.bytes, sampleBytes = header?.sampleType === 'float32' ? 4 : 2;
        requireValue(bank && bytes instanceof Uint8Array && value.width === header.width
          && value.channels === header.channels && value.sampleType === header.sampleType
          && value.byteOrder === 'little-endian' && Number.isSafeInteger(value.rows) && value.rows > 0
          && bytes.byteLength === value.width * value.rows * value.channels * sampleBytes,
        'The sensor band differs from its admitted typed grid.');
        let native = bytes;
        if (!HOST_LE) {
          native = bytes.slice();
          for (let at = 0; at < native.length; at += sampleBytes) for (let a = 0; a < sampleBytes / 2; a++) {
            const b = at + sampleBytes - 1 - a, v = native[at + a]; native[at + a] = native[b]; native[b] = v;
          }
        }
        const Type = header.sampleType === 'float32' ? Float32Array : Uint16Array;
        await bank.writeBand({y: value.y, width: value.width, rows: value.rows,
          samples: new Type(native.buffer, native.byteOffset, native.byteLength / sampleBytes)}, {signal: context.signal});
        return {stored: true};
      }
      throw new EngineError('INVALID_INPUT', 'Unknown sensor preparation action.');
    };
    const peer = createSourceSamplesCodecPeer({workerURL: new URL('./sensor-codec-worker.js', import.meta.url),
      workerFactory, signal: context.signal, handleRequest});
    phase.adopt(peer);
    await peer.start({blob, sourceSha256: context.bindingOriginal.sourceSha256, maximumMemoryBytes, frame: context.frame});
    checkAbort(context.signal); const surface = await bank.seal({signal: context.signal}); context.publishSource(surface);
  };
}
