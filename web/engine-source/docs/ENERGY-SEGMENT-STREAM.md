# Global segmented energy hysteresis

Internal segmentSegmentedEnergy consumes the prepared float32 low/high stores,
int32 scope, panel summaries, dimensions and metadata.block. It accepts the same
threshold/thresholds, minimum and offset options, plus optional byte energy_allowed.
It returns an owned int32 label store, native region summaries and dispose().
This does not expose a partial public energy detector; full integration remains.

Weak/strong comparisons keep the native float32 thresholds and special strict
positive test when the threshold is zero. Eight-connected components grow over
the complete reference panel through a paged uint32 queue, never independently
by strip. The native area and strong-pixel criteria retain only measured support.
All accepted disconnected components of a panel/class share one region id; gaps
are not filled. Native id offsets, component counts, bounds, pixel/strong counts,
class/source fields and labels are preserved.

Selected scores are gathered to an external float32 stream. Two radix passes
recover exact central ranks; even medians preserve the native float32 sum/divide
rule, rather than percentile interpolation. The shared selectFloat32Ranks helper
also serves bounded preparation statistics, whose216 native summaries and million-
value NumPy cases remain exact after this refactor. General finite nonnegative
score inputs are supported; the existing native overflow behavior of a very large
even-median sum is preserved. Real ELA energy scores use the qualified log domain.

Working buffers are14*width+65536*8+8192 bytes, plus bounded page caches (64 pages
each for weak/selected/scores, four pages for queue, page size64KiB and one spare
page per pager). Median selection adds at most2MiB after pagers are released.
Initial admission conservatively protects both. Logical scratch is weak+selected
(two bytes/pixel), queue(four), and selected-score values(up tofour); output labels
usefour bytes/pixel. Region metadata reserves1024 bytes per emitted class. Original,
energy and prepared inputs are admitted independently. Explicit memory/storage
limits remain; no resizing or approximate connectivity/medians.

All624 existing native segmentation cases match every label byte and region field,
including weak/strong/zero thresholds, allowed masks, disconnected support, id
sensitivity and minimum sizes. Additional rank/wide-domain/even-rounding, refusal,
cancellation and consumer-error checks pass. Pager/statistics regressions pass.

The Chrome15412MiB OPFS preparation/profile test now also segments the native
1027×1021 two-panel case: four regions and every label match native exactly.
Segmentation's conservative working allowance9459700 bytes; combined-stage peak
10446836 bytes. Cancellation while growing a component removes all scratch and
preserves the seven input/prepared stores. Final budget0 and storage cleanup pass.
See energy-prepare-stream-chrome-proof.json. This uses supplied native panel
polygons and synthetic energy planes, not a complete JPEG-to-regions public test.

Progress energy-region-growing identifies panel/class, energy-segmentation gives
completed panel/class fraction; median ranks emit energy-quantile-prefix/suffix.
Run tests/energy-segment-stream.test.mjs and scripts/test-m5-browser.mjs
--energy-prepare-stream. Native sources/shared fixtures remain unchanged.
