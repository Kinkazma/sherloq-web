// Numeric export of owned source-coordinate results. No canvas rendering and
// no conversion of discontinuous masks into bounding boxes or convex hulls.
import {d2prlNpz} from '../../src/npz.js';
import {requireValue} from '../../src/errors.js';
export function exportD2prlNpz(result, {budget, maxBytes = 256 * 1024 ** 2}) {
  requireValue(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 1024 ** 3, 'Explicit NPZ byte limit');
  const release = budget.reserve(maxBytes); let complete = false;
  try {
    const {bytes, mime} = d2prlNpz({data: result, provenance: {modelId: result.metadata.modelId, backend: result.metadata.backend, pixelSha256: result.metadata.pixelSha256, original: result.metadata.sourceProvenance}}, maxBytes);
    complete = true; return {bytes, mime, release};
  } finally {if (!complete) release();}
}
