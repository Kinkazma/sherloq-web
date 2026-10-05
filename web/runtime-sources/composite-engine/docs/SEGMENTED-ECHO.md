# Segmented Echo filter — M1 0.30.0-m1.10

`detail.echo` now accepts segmented JPEG sources from `loadBlob`. Radii1–15,
contrast0–100 and the grayscale switch keep their native definitions. The
derived full-resolution RGB image is returned as an owned result surface;
`readPixels` selects display windows, `releaseSurface` releases that result and
source unload releases all dependent results. Existing result handles survive
subsequent filter runs.

```js
const source = await engine.loadBlob({id: 'photo', blob: file});
const result = await engine.run({id: 'echo', imageId: source.id,
  operation: 'detail.echo', params: {radius: 15, contrast: 85, grayscale: false}});
const window = await engine.readPixels({surfaceId: result.surface.id,
  revision: result.surface.revision, rect: {x: 100, y: 100, width: 512, height: 512}});
await engine.releaseSurface(result.surface.id);
```

This is `layout:'surface'`, not a whole-image pixel transfer. The output origin
is `[0,0]` in oriented source coordinates. Original bytes/hash, source resolution
and decode policy remain unchanged. JSON contains the result descriptor and
provenance; a complete streamed image export remains a consumer task.

## Exact neighborhood and global normalization

Each oriented row group is read with a halo of `radius` rows. Native reflect101
applies only at the actual image boundary; halo output is discarded. The
separable integer/binomial kernels and the native float32 FMA accumulation order
are retained. Extrema are collected separately for each RGB channel over **all
core pixels of the complete image**. The following pass normalizes with those
global extrema, applies the contrast LUT, then optionally converts to gray.
Normalizing separate tiles would change the result and is not done here.

The temporary absolute derivatives use float32 storage without changing their
values: for radii1–4, absolute partial integer sums are at most4700160, below the
float32 exact-integer boundary. The native OpenCV Laplacian uses a float32 working
depth for larger kernels before converting to its float64 output. The portable
kernel reproduces that working arithmetic; values return to float64 semantics
for extrema/normalization. All150 native intermediate arrays in the declared
corpus have exact float64→float32→float64 roundtrips and exact browser checksums.
The native small-image normalization exception is based on complete-image pixel
count, never the size of a band.

## Admission, lifetime and cancellation

The arithmetic module has a fixed64MiB heap. Existing codec heaps are admitted
separately in the common budget. A minimum full oriented row plus its halo must
fit both heap and JS staging; failure is `MEMORY_LIMIT` before reads or resizing.
Band height then follows the available budget, with a target262144core pixels.
Raw derivatives require12bytes/pixel and the final RGB output3bytes/pixel. Stores
use admitted RAM or the source's owned temporary session. Derivatives are removed
after rendering; no cross-task derivative cache is added by this increment.

RAM-backed segmented sources can create temporary storage when the analysis
requires it. Public worker cancellation closes that storage before termination,
reports `imagesCleared:true`, and requires a source reload. Direct cancellation
discards partial intermediates/results and preserves the source. The fixed heap
remains resident after first use and participates in later engine admissions.

## Evidence and limits

- `tests/echo-math.test.mjs`:900 native rendered outputs, all15radii, three
  contrasts, both grayscale choices;150 raw derivative arrays and extrema exact.
  `generate-echo-derivatives.py` creates the independent native intermediate proof.
- `tests/segmented-echo.test.mjs`:900 native outputs through segmented stores and
  seven-row groups; eight orientations, radii1/4/5/15, groups1/5/67; cancellation
  in preparation/render/completion, refusal before reads, retry and zero residual
  reservations and unpublished stores.
- `generate-large-echo.py`: public deterministic4099×3077JPEG (12612623pixels),
  with unchanged native EchoEngine CPU outputs for radii4,5,15. Native processing
  is whole-image, including its global normalization.
- `study-segmented-echo.mjs`: actual common worker under256MiB, segmented source
  initially in RAM and deferred temporary derivative storage. All three
  complete-image SHA256 hashes and four windows each are native-exact. Owned
  earlier results, release/unload, cancellation/storage cleanup and reload/retry
  pass. The copied-runtime recipe is recorded separately.

Maximum **recorded completed-task** admission across worker lifetimes is
205396824bytes, with83886080bytes of resident JPEG/Echo heap after reload.
The final worker's169115039-byte high-water mark is not the maximum of the
earlier worker. `memorySummary` keeps that distinction; aborted intervals do not
return a peak. Final retained/cache/active bytes and temporary artifacts are zero.
These figures exclude browser-managed Blob/process overhead.

Functional observations were about1.15s,3.81s and17.37s for the three parameter
sets. They are not isolated optimization comparisons. One CPU worker is used;
no GPU or multiworker gain is claimed. Useful parallelism, derivative reuse and
kernel cost reduction remain work. No native Mac code was changed, and no Mac
speed gain is inferred. WordPress wiring and segmented PNG/TIFF remain separate.

## Increment .11 — measured CPU kernel optimization

The selected build uses `ECHO_OPTIMIZATIONS=5`: coordinates inside the image
bypass reflection arithmetic, and the horizontal float32 FMA is evaluated as an
exact double product/sum followed by one float32 rounding. Every input here is an
integer: RGB is uint8; each float32 kernel coefficient is an integer of magnitude
below2^28; at most31 terms and rounded integer partial sums remain below2^43.
Double represents these products/sums exactly. This proof is specific to the
horizontal domain. The vertical pass and normalization retain native FMA.
No precision, kernel, image size, thresholds or quality setting changes.

Each of five compiled candidates passed900 native renders plus150 raw derivative
hashes/extrema. Their full12.612623MP output also matches the native checksum.
An offline Chrome154 comparison under256MiB, with one requested cold and warm task
per condition, gave the following times (milliseconds):

| Build | Cold RPC | Warm RPC | Cold chain | Warm chain |
|---|---:|---:|---:|---:|
| 0, reference kernel |12636.7|12822.7|12981.3|12832.1|
| 1, interior coordinates |11024.3|10878.9|11402.5|10882.4|
| 3, plus vertical index reuse |11030.7|10874.8|11380.8|10881.7|
| 7, plus horizontal integer-domain FMA |6859.2|6669.2|7189.3|6682.2|
| **5, selected: interior + horizontal FMA** |6874.3|6768.3|7216.2|6783.5|

The vertical index table is omitted because it showed no additional material
benefit. Selected warm RPC is47.2% shorter than the reference in this observation.
The chain includes source loading for cold, RPC, a257×63window transfer, two
Canvas frames and JSON descriptor export. Blob fetch, full-image checksum and
WordPress are outside the timed chain. This is a small development comparison,
not a universal speed guarantee or a runtime calibration. Memory admission is
unchanged. Proofs: `echo-optimizations-chrome-proof.json` and
`echo-optimizations-selected-chrome-proof.json`. Native reuse is discussed in
[ECHO-OPTIMIZATION-MAC.md](ECHO-OPTIMIZATION-MAC.md).

## Increment .12 — bounded useful row workers

With `cpuKernel:'auto'`, the first requested analysis starts immediately with as
many row workers as admitted by resource hints and the shared budget. Each has a
fixed64MiB arithmetic heap and no internal threads. Existing source/result bytes,
main-thread heaps (including a previously used Echo heap), border buffers, I/O,
and transfers are all counted before dispatch. Small images retain one worker;
parallel bands normally have at least as many core rows as halo rows to limit
duplicated halo work. This changes only scheduling, never the analysis domain.

Independent derivatives overlap. Source reads, global channel extrema reductions,
and storage writes remain ordered: disjoint byte windows may share one temporary
storage page. Rendering starts only after all native extrema are known. Transfers
use newly owned window buffers, never source/cache storage. Workers are stopped
before intermediate stores are released after cancellation or error, and all child
heaps are released after each analysis. A recognized worker/resource failure can
retry once on the same single CPU kernel; non-resource errors are propagated.
`metrics.scheduling` reports the retry, requested task executions, zero preflight
executions, and observations used for later concurrency. No calibration runs.

`cpuKernel:'single'` or `'reference'` keeps the one-worker CPU path. No GPU is
introduced. The native Mac filter already has an OpenCV execution policy; this
browser pool is not an authorization to add nested native thread pools.

The offline Chrome154 comparison uses the same12.612623MP source and radius15,
contrast85/color output. Each condition has one cold and warm requested task;
previous results are released before the next sample. Times are milliseconds:

| Budget / CPU mode | Workers | Cold RPC | Warm RPC | Cold chain | Warm chain |
|---|---:|---:|---:|---:|---:|
|256MiB / single|1|6946.7|6865.4|7295.1|6882.3|
|256MiB / auto|2|3780.3|3779.1|4177.6|3796.0|
|352MiB / single|1|6656.7|6651.7|7007.9|6666.6|
|352MiB / auto|4|2346.1|2344.1|2697.3|2364.8|

All four complete output hashes are native-exact. Each comparison holds the
budget fixed. Under352MiB, four heaps favor temporary output storage whereas one
worker keeps it in RAM; the reported chain includes that storage cost. This is
one observation per temperature, not a universal speed claim. See
`echo-pool-chrome-proof.json` for individual stages, accounting, and source hashes.

The functional352MiB real-worker recipe separately checks radii4/5/15, three
complete native output hashes, twelve native windows, overlapping ownership,
release/unload, cancellation/storage closure and reload. The maximum recorded
completed-task snapshot is354953046bytes; after worker restart only the16MiB
JPEG heap remains, with zero retained/cache/active bytes and temporary artifacts.
Aborted intervals do not return their peak and browser process/Blob overhead is
excluded. The copied-runtime proof verifies the delivered worker dependency path.
`tests/echo-workers.test.mjs` adds admission, transfer ownership, resource-only
retry and cancellation fault injection. Inter-task derivative reuse remains open.
