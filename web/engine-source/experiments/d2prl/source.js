// Reuse the qualified original-byte decoder API; Canvas never supplies pixels.
import {createWorkerEngine} from '../../src/worker-client.js';
import {imageHeader} from '../../src/image-headers.js';
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
export function createD2prlSource({budget} = {}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required'); let busy = false;
  return {
    async run(bytes, {signal} = {}) {
      if (busy) throw new EngineError('BUSY', 'D2PRL source busy');
      requireValue(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= 256 * 1024 ** 2, 'Original image bytes required');
      const header = imageHeader(bytes);
      requireValue(header.width <= 8192 && header.height <= 8192 && header.width * header.height <= 32 * 1024 ** 2, 'D2PRL preparation geometry limit');
      checkAbort(signal); busy = true; let admitted, outputRelease, engine, complete = false;
      try {
        // Only the selected decoder is instantiated: JPEG512MiB or CV2GiB.
        // Add the existing load working set and transport before worker creation.
        const codecMaximum = header.format === 'jpeg' ? 512 * 1024 ** 2 : 2 * 1024 ** 3;
        const workerBudget = codecMaximum + bytes.length * 3 + header.width * header.height * 24 + 32 * 1024 ** 2;
        admitted = budget.reserve(workerBudget + 3 * bytes.length + 6 * header.width * header.height);
        outputRelease = admitted.split(bytes.length + 3 * header.width * header.height);
        engine = createWorkerEngine({memoryBudgetBytes: workerBudget});
        const descriptor = await engine.load({id: 'd2prl-source', bytes}, {signal}); checkAbort(signal);
        const pixels = await engine.imagePixels('d2prl-source'); checkAbort(signal);
        const original = await engine.original('d2prl-source'); checkAbort(signal);
        requireValue(pixels.width === header.width && pixels.height === header.height && pixels.format === 'rgb8' && original.length === bytes.length, 'Source geometry and bytes');
        complete = true; return {pixels, original, descriptor, release: outputRelease};
      } finally { await engine?.dispose(); admitted?.(); if (!complete) outputRelease?.(); busy = false; }
    }
  };
}
