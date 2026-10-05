# Signal separation by exact row windows — M1 0.30.0-m1.19

`noise.separation` now accepts segmented JPEG sources. Median, Gaussian, box,
bilateral and non-local means retain their existing parameters and numerical
implementations. The result is an owned RGB surface at the original oriented
resolution. Use `readPixels` for windows, `exportResult(...,{format:'json'})` for
parameters/provenance/surface metadata, and `releaseSurface` when finished.
Full raster streaming export is a separate integration item with M5/B.

```js
const source = await engine.loadBlob({id: 'photo', blob: file});
const result = await engine.run({id: 'separation', imageId: source.id,
  operation: 'noise.separation',
  params: {mode: 4, radius: 10, sigma: 3, grayscale: false,
    denoised: false, levels: 0}});
const window = await engine.readPixels({surfaceId: result.surface.id,
  revision: result.surface.revision,
  rect: {x: 0, y: 0, width: 512, height: 512}});
await engine.releaseSurface(result.surface.id);
```

Mode numbers remain0 median,1 Gaussian,2 box,3 bilateral,4 NLM. Radius is1–10,
sigma1–200, levels0–255; grayscale and denoised are booleans. The default remains
median/radius1/sigma3/color/residual/levels32. Sigma affects bilateral only. For
NLM, the historical radius control sets strength `h=2*radius+1` for luminance and
color; the native7×7 template and21×21 search stay fixed. Denoised mode ignores
residual display settings. These are derived filter/residual visualizations, not
probabilities, binary forensic masks or authenticity decisions.

## Borders and global display

Each core row group gets real neighboring source rows. Median/Gaussian/box/
bilateral require radius rows; NLM requires13, the sum of template and search
half-widths. Only true image edges invoke the original border rule. Full oriented
row width preserves the established native vector-prefix/scalar-tail arithmetic,
especially for bilateral and color conversions. Filters process the window and
only their core rows are retained. There is no independent tile inference or
change to NLM search parameters.

The denoised RGB bytes either become the output or are subtracted from the exact
original RGB/luminance to form absolute residuals. Nonzero levels uses the native
byte LUT. Levels0 first accumulates complete-image per-channel histograms, then
applies a single global equalization in a second storage pass. No tile histogram
or approximate normalization is substituted. The output surface is published only
after both passes and storage flush have completed.

A related pre-existing magnifier bug was corrected: OpenCV converts integer
population and cumulative histogram counts to float32 before division and
multiplication. Omitting those casts can change output bytes above2^24 pixels.
The shared helper now serves separation and magnifier. The public16,777,218-pixel
oracle produced25,165,824 differing RGB components, each off by1, in the previous
magnifier; the corrected whole RGB hash is native-exact. Existing440 magnifier
views and segmented ROI/cache/ownership tests still pass. See
`equalize-count-proof.json` and `generate-equalize-count-reference.py`.

## Memory and availability

The small OpenCV core/imgproc/photo module has a verified fixed64MiB memory:
WASM minimum=maximum1024pages, no threads or memory growth. Its bilateral routine
is extracted at build time from the already qualified native browser source.
Each admitted window fits the heap with a conservative scratch bound, including
NLM's width×21×21 integer scratch. One full oriented row plus its required halo
must fit; oversize requests fail with `MEMORY_LIMIT` before source reads. The
qualified histogram domain is at most2,147,483,647 pixels, matching native signed
integer accumulation. This is not an unlimited-image-size claim.

The common budget covers resident codecs, this heap, source/output window copies,
storage pages and histogram/LUT data. RGB output uses RAM or owned temporary
storage. Global equalization revisits that output in bounded chunks. Later tasks
do not evict live outputs; release or source unload owns their lifetime. On public
cancellation, storage closes before worker termination; reload the source before
retrying. There is no hidden image resize, reduced precision or remote service.

The aggressive profile admits useful row workers immediately under the shared
budget. Each child has one fixed64MiB single-thread heap. The main thread reads
source windows and commits output in source order; independent arithmetic jobs
can overlap. Input-window reservations stay live across transfer and child work.
No N×N pool or startup calibration is used. The worker count is bounded by useful
row groups, the resource profile,32 and available memory. Completed useful tasks
feed the existing adaptive policy. A worker/memory resource failure disposes the
partial result and retries once serially; invalid inputs/numeric errors propagate.
`cpuKernel:'single'` retains explicit serial execution. Filtering children terminate
before the global histogram display pass. An already loaded main arithmetic heap
is still charged when children run.

An optional private RAM cache now reuses complete denoised/residual bases across
display levels, as described below. There is no qualified GPU path. CPU remains available. Additional format decoders and WordPress controls belong
to M5 and B, respectively.

## Evidence and recipes

- 420 native denoised outputs and1,680 complete filter/residual/LUT/equalization
outputs are exact, including small/degenerate images and wide vector tails.
- Eight orientations, minimal core rows/halos, cancellation during filtering and
post-equalization, retry, memory refusal and very wide fixed-heap refusal pass.
- The actual browser recipe uses public96MP Median/Gaussian/Box references and
public1MP Bilateral/NLM-gray/NLM-color references, with original-file SHA and whole
native RGB hashes. It checks real owned storage, parameter/provenance JSON,
annulation/reload and zero retained/cache/active state and temporary artifacts.

`generate-large-separation.py` reads the shared public JPEG fixtures and unchanged
native CPU code. `study-segmented-separation.mjs` runs the common browser worker;
its copied-runtime run verifies the exact delivered files. `verify-fixed-wasm-memory.mjs`
checks the binary memory section. Functional timings do not establish a speedup.
The engine's accounted memory excludes browser process and Blob-managed residency;
peaks from later workers after cancellation must not replace earlier recorded peaks.

Chrome154 passed six whole-image native SHA comparisons under192MiB. Median5×5,
Gaussian21×21 with global residual equalization, and gray box21×21 ran on96MP
source/output OPFS; bilateral21×21 and both NLM modes ran on1MP. Maximum recorded
accounting was183862272bytes; the final worker's93946880-byte peak is a later
lifetime after cancellation. All retained/cache/active bytes and temporary files
were released. The arithmetic module's actual binary memory limits were verified.

Functional RPC observations:96MP median9.914s, Gaussian21.610s, box1.999s;
1MP bilateral2.968s, color NLM3.450s and gray NLM0.957s. Source reads, arithmetic,
postprocessing and writes are recorded separately in the proof. These are single
functional observations, not isolated optimization comparisons. JSON was1860bytes;
source reload and an exact NLM retry passed after cancellation during the global
histogram display pass. The copied runtime receives its own qualification.

## Useful worker measurement (.17)

Chrome154 on the recorded development host,96MP Gaussian21×21/color/residual/
global equalization, same768MiB budget and hardware hint4:

| CPU selection | Cold RPC | Warm RPC | Cold chain | Warm chain | Output |
|---|---:|---:|---:|---:|---|
| single |20.845s|20.737s|23.044s|20.750s|RAM|
| auto,4 workers |8.087s|8.021s|10.268s|8.029s|OPFS|

One cold/warm observation per condition; previous output released before warm.
The2.59× warm RPC gain is local to this workload, not a universal filter/device
claim. Both whole RGB hashes equal the same native reference. The same global
budget permits RAM output in serial and selects temporary output with four heaps;
this storage tradeoff is included in the measured chain. Source Blob fetch and
whole-image validation are outside timing. Cold chain includes segmented load;
both chains include a requested pixel window, Canvas frames and JSON descriptor.
No WordPress timing is claimed.

The serial peak recorded752,963,584bytes; four workers671,084,448bytes, both below
805,306,368bytes. These are engine accounting, not process/RSS measurements.
`filterWallMs` is elapsed filter-stage time; `kernelMs` and worker portions of
`postprocessMs` sum independent jobs and can exceed wall time. Ordered source reads,
output writes, global display and total time are separately recorded. The proof is
`separation-pool-chrome-proof.json`; reproduce with `study-separation-pool.mjs`.
Pool fault tests check transferred source ownership, malformed histograms, bounded
admission, cancellation during a subsequent read and both processing passes,
resource-only retry and no retained partial buffers.

The real common-worker pool recipe also passed all six96MP/1MP native whole-image
hashes, owned outputs, JSON, global-display cancellation/reload and zero remaining
resources. Maximum recorded across lifetimes: 668987296bytes;
final restarted worker peak: 300176384bytes. See
`segmented-separation-chrome-pool-proof.json` and the copied-runtime proof.

## Private filter cache (.19)

A completed filter can retain its denoised RGB or raw absolute residual,3 bytes
per pixel in bounded RAM chunks. Residual bases include768 exact histogram counts.
The key includes source identity, dimensions, filter, radius, active bilateral
sigma, gray/color and denoised/residual mode. Display levels are excluded. Changing
levels, including global equalization, therefore needs neither source reads nor
filter workers while that base is retained. Denoised/residual toggle uses distinct
bases; reuse of filtering across that toggle is not claimed.

Worker admission takes priority. Cache is optional and never reduces the admitted
worker count or releases an owned output. It may move a new output to temporary
storage. If no temporary provider exists, optional admission also protects the
RAM result. The cache contains RAM only, with no asynchronous store hidden behind
the synchronous LRU. A borrowed entry is removed from the LRU and pinned by a
reservation for the complete render; completed data can be reinserted afterwards.
Incomplete/cancelled filter data is never inserted. Output bytes are independently
owned and cache eviction or window mutation does not change them. Source unload
invalidates the key through the existing source prefix. Memory pressure evicts
recomputable cache before refusing live work. No eager preload is added.

`metrics.analysisCacheHit` / `metrics.cache.analysis` reports this reuse;
`sourceReads`, `workers`, `workerJobs`, `kernelMs` are zero for cached display.
`filterCacheStored`, `filterCacheBytes` and `cacheWriteMs` describe cold creation.
The public surface remains independently owned, so `metrics.cache.result` is false.

Isolated Chrome154 comparison, same96MP Gaussian21×21/color/global equalization,
1GiB/hint4, previous .18 workers versus .19 cache, one cold/warm sample each:

| Filter cache | Cold RPC | Warm RPC | Cold chain | Warm chain | Cold/warm output |
|---|---:|---:|---:|---:|---|
| absent (.18) |7.470s|7.434s|9.660s|7.450s|RAM/RAM|
| admitted |8.123s|1.144s|10.332s|1.146s|OPFS/RAM|

Warm RPC improves6.50× locally; cold RPC increases0.653s (~8.7%) including the
storage tradeoff. Both cold runs use four useful workers. The warmed cache has
288,007,504 accounted bytes; peaks959,084,448bytes without and971,765,071bytes with
cache remain below1,073,741,824bytes. The whole RGB native hash is identical.
This is a local latency/memory tradeoff, not a universal acceleration promise.
See `separation-cache-chrome-proof.json` and `study-separation-cache.mjs`.

Tests cover60 native complete outputs across all filters, gray/color,
denoised/residual and three levels, cancellation in cold/cached stages, immutable
published output after cache eviction, RAM-only refusal prevention and cleanup.
The actual common-worker recipe checks six native96MP/1MP images and their six
cached whole-image hashes, source unload, export, cancellation/reload and zero
retained/cache/active resources. The exact copied runtime has its own proof.
