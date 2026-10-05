# Historical Multiple Compression curve

`jpeg.recompression`, parameters `{}`, operates on the original decoded image and
returns `data.qualities:Uint8Array(101)` (0–100) and `data.raw:Float64Array(101)`.
Each loss is the native grayscale mean absolute pixel error in 0–255 units. Q0
uses libjpeg's minimum quality (the same tables as Q1). No curve normalization,
learned estimate or number of prior compressions is inferred here.

The existing `jpeg.multiple` operation remains the separate aligned double-JPEG
DCT detector. The two native panel tabs now have distinct APIs. Plot x=qualities,
y=raw; labels and units are in the result. CSV export has the native header
`jpeg_quality,mean_absolute_pixel_error_0_255`; JSON retains provenance. PNG plot
export is a renderer concern for B, not an image recompression.

Run through `engine.run` or `createWorkerEngine().run` and export with
`exportResult(result,{format:'csv'})`. Normal progression/AbortSignal/BUSY applies.
The codec worker pool starts useful qualities immediately under the engine's
shared budget (100,000 grayscale pixels threshold, as in native historical curves).
No preflight or persistent performance calibration. The output is 101 binary64
values. Contiguous sources use the original pool; segmented JPEG sources now use
the global scanline route described below.

Raw grayscale losses share per-image cache entries with `jpeg.quality`. Going
from quality estimation to this curve computes only Q0. Going the other direction
requires no additional recompression. Model changes don't invalidate raw losses.
Unloading the source invalidates them. Output arrays are independent copies.
The current worker hard-abort clears loaded images/caches: explicitly reload the
retained original file before retrying. Native partial-quality resume across abort
is not supplied by this worker lifecycle yet.

Validation: three generated PNG images, native 101-loss oracle, both cache orders,
CSV, source unload, invalid parameters and cancellation/recovery. Existing 1–100
quality/model API tests remain exact: 8 targeted Node tests pass. Chrome 154 tests
real worker RPC, two useful codec workers, zero preflight, 101 exact losses,
shared-cache reuse, CSV and hard-abort/reload recovery. See
`recompression-chrome-proof.json`. No speedup or large-source claim is made.


## Global scanline curves on segmented JPEG sources

Both `jpeg.recompression` and `jpeg.quality` now accept segmented JPEG records.
The full, orientation-correct RGB surface is read in whole-row bands. One global
libjpeg encoder receives every grayscale row, then one global decoder supplies the
recompressed rows for an exact integer absolute-error sum. Band boundaries never
restart compression, crop, pad, interpolate or reset an image neighbourhood.
All101 historical qualities and100 quality-estimation values are preserved, including
Q0=Q1. Mean uses the native reciprocal multiplication. The same existing quality
normalization, minimum and quantization-table estimate run afterward; table priority
is unchanged. Model IDs still require a valid loaded model even for JPEG inputs.

The source RGB store may be RAM or temporary storage. Neither a full grayscale input
nor a full reconstructed image is allocated. Encoded output for one quality remains
inside WASM; unusually large/noisy sources can still exceed the explicit heap ceiling.
JPEG dimensions remain limited to65500 per axis by the native codec. A read-only
shared libjpeg-turbo3.0.3 build is linked into the separate vendor/jpeg-stream module;
the main JPEG binary is unchanged. The imported WASM memory is capped between32 and
128MiB, chosen from available shared budget before useful work, in16MiB increments.
The full chosen maximum, input bands and surface read staging are admitted. All
per-operation stream handles and allocations are released on success/error/cancel.

The segmented auto route now starts useful qualities in parallel when at least100000
pixels, hardware hints and the shared budget allow it. Each worker owns one global
JPEG stream with an enforced32MiB heap ceiling. A source band is read once and supplied
to the active qualities; parent windows and worker message copies are admitted too.
Single/reference modes and constrained budgets keep the serial32–128MiB route.
Concurrency starts from available resources, observes completed useful work and reduces
on slower work or allocation failure. A worker resource failure retries only unfinished
qualities with the real serial kernel and a heap ceiling admitted from remaining budget.
The existing pool is still used for contiguous inputs. There is no runtime calibration
or preflight. Encoded stream storage beyond WASM remains pending.
Progress phase `jpeg-scanlines` counts the two source passes for each requested quality.
The shared per-source cache stores completed scalar losses immediately. A direct-engine
abort can resume completed qualities; main-worker hard-abort still clears images/cache.
Threshold/model/panel changes never invent missing qualities. Scalar cache hits are in
`metrics.cache.scalarHits`; `metrics.recompressions` reports newly computed qualities.
Exports and plotting coordinates are unchanged. Array results remain defensive copies.

Qualification:12 full-frame comparisons (including odd dimensions/Q0),24 orientation
comparisons, and one real1600×1100 source under72MiB reproduce native losses exactly.
The main-worker Chrome recipe verifies101 native values, shared cache in both panels,
Q85 table evidence,102 CSV rows and zero active reservations. The example uses a48MiB
heap maximum with16MiB actually allocated and a peak73,641,568 accounted bytes. Already
loaded unrelated WASM heaps consume the same budget and may require a larger limit.
Direct cancellation keeps completed scalar results and resumes without recomputing them.
Codec/budget/cancellation and existing quality/model regression tests pass. See
`docs/segmented-recompression-chrome-proof.json`. Huge temporary-storage sources still need their own qualification.

The additional parallel Chrome recipe verifies six native losses on a1600×1100
segmented surface with two real workers and six shared source passes (instead of12).
Cancellation at the final write band releases workers/reservations; injected worker
allocation refusal retries real serial arithmetic and lowers the next capacity.
The public main-worker API also verifies101 native losses on1600×2200 under112MiB
with two useful workers, cache reuse, Q85 table evidence and CSV export. No preflight
occurs. See `docs/segmented-recompression-pool-chrome-proof.json`. No universal
speedup claim is made; decisions use measured completed requested work only.
