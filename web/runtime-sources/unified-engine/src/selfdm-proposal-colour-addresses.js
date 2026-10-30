import "../../runtime-context.js?v=0.30.0";
import {requireValue, EngineError} from './errors.js';
import {proposalSeedsBytes} from './selfdm-proposal-pyramid.js';

/** Conservative native heap requirement, to pass to the EXISTING imported
 * WASM/kernel admission before RGB reads and native allocations. It does not
 * grant memory or change native resolution, iterations or backend itself. */
export function estimateSelfDMProposalColourSeedsMemory({width, height, outWidth, outHeight, sourceCount, rectanglesCount}) {
  requireValue([width, height, outWidth, outHeight].every(n => Number.isSafeInteger(n) && n > 0) && width * height <= 0x7fffffff && outWidth * outHeight <= 0x7fffffff && Number.isSafeInteger(sourceCount) && sourceCount >= 0 && sourceCount <= width * height && Number.isSafeInteger(rectanglesCount) && rectanglesCount >= 0 && rectanglesCount <= sourceCount, 'Native proposal color/SEEDS memory geometry required');
  if (!sourceCount) return {empty: true, heapBytes: 0, inputBytes: 0, outputBytesUpper: 0, nativeInvocationRequired: false};
  const sourceArea = width * height, area = outWidth * outHeight;
  // Color: two int32 source maps; 53 bytes/site for destinations, anchor,
  // tap addresses, packed offsets, coefficients, owner and clamp flags.
  // SEEDS support: presence, visited epoch, queue and admitted site indices.
  const addedNativeBytes = sourceArea * 8 + area * (53 + 13) + rectanglesCount * 16 + (outWidth + outHeight) * 8 + sourceCount * 4 + 65536;
  const heapBytes = Math.ceil((proposalSeedsBytes(outWidth, outHeight, sourceCount * 3) + addedNativeBytes) / 1048576) * 1048576;
  if (!Number.isSafeInteger(heapBytes) || heapBytes > 2147483648) throw new EngineError('MEMORY_LIMIT', 'The unchanged native proposal color/SEEDS support exceeds its WASM maximum; no pixels or parameters were reduced.');
  return {empty: false, heapBytes, inputBytes: sourceCount * 7 + rectanglesCount * 16, outputBytesUpper: area * (53 + 3 + 4), addedNativeBytes, nativeInvocationRequired: true,
    policy: 'existing-native-SEEDS-hierarchy-plus-complete-color-address-and-support-scratch/1', noSilentResolutionOrIterationReduction: true};
}

/** The literal owners come from the verified view's canonical equal-row-span
 * union, never from acquisition IDs, caller rectangles or read tile sizes.
 * This prepares addresses only, before any RGB read or native allocation. */
export function createSelfDMProposalColourAddresses(view, rect, {budget} = {}) {
  requireValue(view?.domain?.descriptor && typeof view.rowIntervals === 'function' && typeof view.admittedRectangles === 'function' && typeof budget?.reserve === 'function', 'Verified source view and address allocation admission required');
  requireValue(rect && ['x','y','width','height'].every(key => Number.isSafeInteger(rect[key])) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= view.domain.width && rect.y + rect.height <= view.domain.height && rect.width * rect.height <= 0x7fffffff, 'Proposal ROI must stay on the verified native view');
  let count = 0, rectanglesCount = 0;
  for (const r of view.admittedRectangles(rect)) { count += r.width * r.height; rectanglesCount++; }
  requireValue(Number.isSafeInteger(count) && count >= 0 && count <= rect.width * rect.height, 'Canonical proposal support count differs');
  const free = budget.reserve(4096 + count * 4 + rectanglesCount * 16);
  try {
    const indices = new Uint32Array(count), rectangles = new Int32Array(rectanglesCount * 4);
    let next = 0;
    for (let y = 0; y < rect.height; y++) for (const [a, b] of view.rowIntervals(rect.y + y)) {
      const left = Math.max(rect.x, a), right = Math.min(rect.x + rect.width, b);
      for (let x = left; x < right; x++) indices[next++] = y * rect.width + x - rect.x;
    }
    requireValue(next === count, 'Canonical proposal row support changed during preparation');
    next = 0;
    for (const r of view.admittedRectangles(rect)) {
      rectangles.set([r.x - rect.x, r.y - rect.y, r.x + r.width - rect.x, r.y + r.height - rect.y], next * 4); next++;
    }
    requireValue(next === rectanglesCount, 'Canonical proposal owner geometry changed during preparation');
    let released = false;
    return {indices, rectangles, count, rectanglesCount, sourceRect: {...rect},
      metadata: {policy: 'proposal-colour-owners-from-verified-union/1', sourceSha256: view.domain.sourceSha256, sourceContextFingerprint: view.domain.fingerprint,
        canonicalization: 'existing SourceRegionView.admittedRectangles: equal adjacent row spans',
        RGBReads: 0, readerPartitionOrAcquisitionOrderUsed: false},
      release() { if (!released) { free(); released = true; } }};
  } catch (error) { free(); throw error; }
}
