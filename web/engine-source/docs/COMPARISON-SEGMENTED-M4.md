# Reference Comparison with segmented sources and independent global workers

`comparison.image` accepts a pair when either source uses segmented JPEG storage.
The twenty native measures, four views, equalization, grayscale and undefined-score
policy are unchanged. There is no resizing, per-tile normalization, substitute
similarity metric, or GPU parity claim. Both source surfaces use oriented,
full-resolution coordinates and must have equal dimensions.

The owner reads RGB bands. Each metric worker fills its own BGR inputs directly,
without whole-image JavaScript arrays, repeated RGB/BGR copies or encoded image
copies. Histogram, Sewar, SSIMULACRA, Butteraugli and SSIM stages can run concurrently
as shared memory permits. The six basic measures stream their global sums in
source order. Normal/difference views and equalization use global extrema and
histograms with bounded input/output windows. Their output can spill to OPFS/IDB.

The dedicated WASM starts at 8 MiB and is discarded with its worker. This does
**not** segment the internal convolution/pyramid workspaces of every metric.
Those stages retain the qualified native global implementation. They are admitted
independently, avoiding the old single `384*N + 256 MiB` reservation for the whole
pair. Conservative per-worker admission, including inputs and allocator room:

| Stage | Reservation |
|---|---|
| SSIM | 16 MiB + 128*N bytes |
| Sewar five metrics | 16 MiB + 144*N bytes |
| SSIMULACRA | 16 MiB + 176*N bytes |
| Butteraugli | 16 MiB + 384*N bytes |
| Histogram, N < 2^24 | 144 MiB + 12*N bytes |
| Histogram, N >= 2^24 | 288 MiB + 144*N bytes |

N is the complete image pixel count. A global stage above 1900 MiB, or dimensions
above 16384 per axis, is refused before execution. Other stages must fit the
shared engine budget alongside sources, output storage and I/O. Normal/difference
without metrics do not need a global metric workspace. Memory hints select useful
concurrency directly; no synthetic work or calibration is performed. These are
accounted reservations, not a measurement of browser process RSS.

## UI contract

Use `loadBlob({id, blob, layout:'segmented'})` and then:

```js
const result = await engine.run({
  id:'pair', imageId:'evidence', operation:'comparison.image',
  params:{referenceImageId:'reference', metrics:true, view:'ssim',
          equalized:false, grayscale:false}
});
```

`view` is `normal`, `difference`, `ssim`, or `butter`. Params, score names, errors,
JSON/CSV scalar exports and the historical histogram divisor remain unchanged.
`layout:'surface'` returns an RGB surface descriptor and one display layer.
Read windows with `readPixels`; release the handle with `releaseSurface`. There
is no duplicate full `pixels.data`. Unloading either member invalidates dependent
comparison surfaces before closing its temporary storage; unrelated results survive.
Await unload/dispose. A mixed contiguous/segmented pair follows the same rule.

`comparison-basic`, `comparison-reference`, `comparison-difference`,
`comparison-input` and `comparison-metric` progress events identify useful work.
Metric events include `metric`; input progress covers two source uploads. A global
kernel reports its start/end rather than an invented fractional ETA. Abort stops
active metric workers and disposes unpublished outputs. Retrying starts real work.

Scalar stage caches are tied to the loaded reference object, so a replacement
with the same id cannot reuse the previous pair. Views and display controls reuse
cached metrics. SSIM/Butteraugli maps are currently recomputed when that view is
requested; a retained map cache is a separate optimization, not claimed here.
`metrics.workers`, `completedMetricJobs`, `workerHeapPeakBytes`, `blockPixels`,
`globalStageMaximumBytes`, `cache.stages` and shared memory counters describe the
actual run. GPU is not used for these twenty measures.

## Evidence

The existing 33-pair native corpus covers the twenty metrics and 528 combinations
of views/equalization/grayscale. The existing policy is unchanged: helper printed
scores exact, other finite metrics within absolute/relative 1e-12, undefined
outcomes exact, rendered bytes exact. `tests/comparison-stream.test.mjs` checks
this adapter against those stored references, including band seams and cancellation.

The JPEG 1024x1024 public Chrome recipe checks all twenty scores, eight native
view hashes at 768 MiB with four workers, and four normal/difference hashes at
64 MiB. It also checks cancellation during a metric and dependent result cleanup.
Sources and the oracle generator stay in this worktree's `.build`; shared fixtures
are never rewritten. See `comparison-stream-browser-proof.json` for observations.

Native helper sources/licenses remain in `vendor/comparison`, OpenCV in
`vendor/opencv`. `scripts/build-comparison-stream.py` uses read-only pinned OpenCV
and Butteraugli object files via `OPENCV_BUILD_ROOT`, and writes only local outputs.

A further targeted run uses one contiguous JPEG and one segmented JPEG at
512 MiB: all twenty scores and the native normal-view checksum pass, with three
workers, a peak accounted 510385617 bytes and largest observed worker heap
230686720 bytes. The former contiguous admission requires over 640 MiB for this
1 MP pair before source/codec residency. This extends an actual admitted case,
without claiming every metric runs under the 64 MiB view-only budget. The targeted
recipe also confirms cancellation and release when either member unloads.
