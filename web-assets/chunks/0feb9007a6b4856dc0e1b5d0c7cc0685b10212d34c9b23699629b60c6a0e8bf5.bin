import "../../runtime-context.js?v=0.33.3";
import {checkAbort} from './errors.js';
import {createOpeningPreviewAccumulator, openingPreviewAccumulatorPlan} from './opening-preview-accumulator.js';

// This optional presentation owns its accumulator and the bounded payload
// until the progress callback has handed it off. The parent callback already
// associates this event with the current image's load identity.
export function createNativeOpeningPreview({width, height, budget, signal, onPreview, allowReordering}) {
  if (!onPreview) return null;
  const grid = {width, height};
  const plan = openingPreviewAccumulatorPlan(grid);
  const indexBytes = allowReordering && !plan.exact ? 8 * plan.height : 0;
  // Include the output and a structured-clone copy at the progress boundary.
  const bytes = plan.workspaceBytes + (plan.exact ? 1 : 2) * plan.rasterBytes + indexBytes;
  // Preview is optional under pressure. The already admitted store and useful
  // projection window retain their original allocation and residency choice.
  if (bytes > budget.limit - budget.total()) return null;
  let reservation = budget.reserve(bytes);
  let accumulator, spans, used = 0, contributingRows = 0;
  try {
    accumulator = createOpeningPreviewAccumulator(grid);
    if (indexBytes) {
      spans = new Uint32Array(2 * plan.height);
      for (const [start, end] of accumulator.sourceRowSpans()) {
        spans[used++] = start;
        spans[used++] = end;
        contributingRows += end - start;
      }
    }
  } catch (error) {
    accumulator?.dispose();
    reservation();
    if (error instanceof RangeError || ['MEMORY_ALLOCATION', 'MEMORY_LIMIT'].includes(error?.code)) return null;
    throw error;
  }
  function dispose() {
    accumulator?.dispose();
    accumulator = null;
    spans = null;
    reservation?.();
    reservation = null;
  }
  return {
    *rowSpans() {
      // If the preview covers most source rows, split traversal would add
      // small calls with little latency benefit. Keep the regular bands.
      if (!spans || 2 * contributingRows >= height) {
        yield [0, height];
        return;
      }
      // The compact index is needed after preview publication to skip the
      // converted rows. The two sequences together cover each row once.
      const ranges = spans;
      for (let at = 0; at < used; at += 2) yield [ranges[at], ranges[at + 1]];
      for (let at = 0, y = 0; ; at += 2) {
        const end = at === used ? height : ranges[at];
        if (y < end) yield [y, end];
        if (at === used) break;
        y = ranges[at + 1];
      }
    },
    add(rect) {
      accumulator?.add(rect);
      return accumulator?.complete === true;
    },
    async publishIfComplete() {
      if (!accumulator?.complete) return;
      checkAbort(signal);
      const pixels = accumulator.finish();
      accumulator = null;
      const releaseOutput = reservation.split(bytes - indexBytes);
      try {
        await onPreview({pixels, sourceWidth: width, sourceHeight: height, orientation: 1,
          decoder: 'Magick native shared SDR preview', presentationOnly: true});
      } finally {
        releaseOutput();
      }
      checkAbort(signal);
    },
    dispose,
  };
}
