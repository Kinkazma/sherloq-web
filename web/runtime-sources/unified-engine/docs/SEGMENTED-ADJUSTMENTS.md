# Global adjustments by bounded rows — M1 0.30.0-m1.22

`inspection.adjust` accepts segmented sources and returns an owned full-resolution
RGB surface. The existing controls and order remain: sharpen; brightness,
saturation and hue in HSV; composed gamma/shadow/highlight/sweep LUT; global value
equalization or CLAHE; global Otsu or fixed RGB threshold; inversion. These are
image display transformations, not authenticity scores or scientific masks.

```js
const image = await engine.loadBlob({id:'photo', blob:file, layout:'segmented'});
const result = await engine.run({id:'adjust', imageId:image.id,
  operation:'inspection.adjust',
  params:{sharpen:28, equalize:4, threshold:0, invert:true}});
const window = await engine.readPixels({surfaceId:result.surface.id, revision:1,
  rect:{x:0,y:0,width:512,height:512}});
await engine.releaseSurface(result.surface.id);
```

The source format coverage belongs to the source adapter (this M1 branch qualifies
segmented JPEG; M5 owns the other decoders). No image resize, different bit depth,
per-tile threshold or replacement codec is introduced by this operation.

## Native stages and global geometry

Full oriented rows preserve the qualified HSV vector-prefix/scalar-tail arithmetic.
Sharpen uses radius `floor(sharpen/4)`, with actual source neighbors and the original
Gaussian/addWeighted order. Only the true image edge applies the native reflection.
Core rows are cropped after processing; point conversions keep the full row width.
The already qualified gamma LUTs, HSV arithmetic and scalar rounding are reused.

For equalization, the value channel receives one complete-image histogram and the
shared native float32-count LUT. CLAHE uses one global8×8 grid, four original clip
limits2/5/10/20, exact clipping redistribution, float32 tables and native FMA
interpolation at absolute image coordinates. If either image dimension is not a
multiple of8, OpenCV extends both dimensions by `8-(dimension %8)`, including a
complete8-pixel extension on a dimension already divisible by8. Padding uses
REFLECT_101 and is included in the tile histograms. The padded pixels are not
published as output. There is no separate CLAHE grid per processing band.

Otsu builds the complete grayscale histogram after equalization, if selected.
Its original reduction order chooses one scalar threshold; that threshold is then
applied to each RGB component, as in the native panel. Inversion follows threshold.
The native integer histogram domain is explicitly bounded to2,147,483,647 pixels.

## Storage, ownership and cancellation

One fixed64MiB single-thread arithmetic module handles local rows, CLAHE tables/
interpolation and Otsu reduction. The WASM binary memory section is checked for equal
minimum/maximum1024pages and no shared-memory flag. A complete oriented row and
its sharpening halo must fit; impossible widths fail before source reads.

The source, codec heaps, window copies, small global histograms/tables, temporary
storage pages and output share one budget. Internal HSV bytes may occupy the output
store during preparation, but only the fully transformed RGB surface is published.
The internal store is rewritten in order, preserving IndexedDB page ownership.
Output uses RAM or temporary storage. No incomplete surface is returned on failure.

`readPixels` gives owned windows; `exportResult(...,{format:'json'})` describes the
surface, parameters and provenance. Release each result or unload its source.
Public hard cancellation closes temporary storage before worker termination and
requires source reload; a cancellation error states this explicitly. Streaming
full raster export and WordPress controls are separate integration work with M5/B.

Cold prefix preparation now uses admitted useful row workers (.22). An optional prefix cache now reuses
complete preprocessing for threshold/inversion changes; no GPU path is qualified. It establishes the exact bounded chain. Native caches/threading are not
replaced by the browser implementation. No speedup is claimed from functional
recipe timings.

## Evidence

All510 original native adjustment outputs pass with seven-row bands. Additional
48 combined orientation/CLAHE/Otsu/sharpen cases retain exact RGB, including32×33
asymmetric padding to40×40. Cancellation during local processing, global display
and final threshold, clean retry, low-memory refusal and impossible-row refusal
are covered. These are complete outputs, not just matching histogram primitives.

`generate-large-adjust.py` creates whole native oracles from existing public
96MP and12.61MP synthetic JPEGs, including whole RGB hashes, selected windows and
explicit Otsu thresholds. `study-segmented-adjust.mjs` exercises the actual common
browser worker and can target an exact copied runtime with `--runtime-root=DIR`.
The accounting summary preserves earlier worker lifetimes across cancellation;
its scope excludes browser process memory and browser-managed Blob residency.

Chrome154 under192MiB passed all four complete native images:96MP global value
equalization with HSV/LUT/sharpen controls and96MP radius25 sharpening/Otsu;
12.61MP combined CLAHE/Otsu/inversion plus CLAHE color output. Native Otsu thresholds
127 and162 match exactly. All four results used temporary output under this budget.
Maximum recorded accounting180,090,874bytes; the final restarted worker peak
164,269,841bytes is a later lifetime. JSON2011bytes, cancellation in CLAHE, reload/
exact retry and zero retained/cache/active bytes or temporary artifacts passed.
Functional RPC15.264s/105.249s/2.569s/0.647s in that order. The extreme sharpening
case is slow in this first serial bounded route; no speedup or broad performance
claim is made. Caches and useful row parallelism remain measurable follow-up work.


## Reusing completed prefixes (.21)

Optional private RAM chunks retain the complete RGB prefix after equalization and
before threshold/inversion, plus the exact256-bin grayscale histogram. The key
includes source identity, oriented dimensions and all active preprocessing controls;
threshold and inversion are excluded. Canonical sharpen radius and inactive sweep
are keyed by their effective native values. An identity prefix is not duplicated.
Changing an earlier control legitimately needs a new prefix. This is one retained
prefix stage, not every native prefix cache.

Admission protects useful row work and live result surfaces first. Private cache
may change where a new output is stored. With a RAM-only caller, output admission
is protected too. The LRU contains bounded RAM chunks only; the same small helper
is shared with separation. A borrowed prefix is pinned for the full cached render.
Partial/cancelled preparation is never inserted. Cache eviction, window mutation
and releasing a surface cannot change another owned result. Source unload clears
its prefixes. Cached Otsu uses the original complete grayscale histogram and native
reduction; fixed thresholds/inversion do not invoke preceding transformations.

`metrics.cache.analysis` / `analysisCacheHit` signals reuse. Cached views have zero
source reads and filter workers, while the main engine still renders the requested
output. `prefixCacheStored`, `prefixCacheBytes` and `cacheWriteMs` describe retention.
No final-result buffer is shared with the cache; `cache.result` remains false.

Isolated Chrome15412.61MP comparison, sharpen radius7 plus HSV/LUT/CLAHE level4
(clip10), Otsu/inversion, same256MiB budget; one cold/warm task each:

| Prefix cache | Cold RPC | Warm RPC | Cold chain | Warm chain |
|---|---:|---:|---:|---:|
| absent (.20) |2.459s|2.402s|2.822s|2.417s|
| admitted |2.392s|0.144s|2.741s|0.149s|

Warm RPC improves16.69× in this observation. Cold timings are close and do not
establish a cold-kernel improvement. Both cold tasks use one filter worker; both
outputs remain RAM. Cache37,839,309bytes; peak164,441,999bytes before and203,708,967
with cache, below268,435,456bytes. The warm complete RGB remains native-exact.
See `adjust-cache-chrome-proof.json`; this is not a WordPress or universal claim.

24 native cache views and lifecycle/cancellation tests pass. The real common-worker
recipe checks two12.61MP native prefixes and six different fixed/Otsu/inverted views
by whole-image hashes, verifies original output ownership, JSON, cached cancellation,
source reload and zero retained/cache/active/storage resources. The exact copied
runtime receives the same recipe. Existing60 separation cache views still pass
after extracting the shared RAM-chunk helper.


## Useful row workers (.22)

The aggressive profile starts useful full-width row jobs immediately, bounded by
its worker limit,32, task geometry and the global budget. Each child has one fixed
64MiB single-thread heap. Local sharpen/HSV/LUT runs in parallel; CLAHE jobs return
integer counts for the original global tile coordinates. The owner adds those
counts exactly and handles the native reflected padding. Independent per-band
CLAHE grids, thresholds or normalization are never introduced.

Source reads and output writes remain ordered. Input reservations survive buffer
transfer until the batch completes. Children terminate before global interpolation/
Otsu/final rendering. An already loaded main arithmetic heap remains charged while
children run; a newly needed main heap is admitted after their termination.
`arithmeticHeapCapacityBytes` records the admitted filtering-phase capacity, not a
sum of disjoint worker lifetimes. Invalid/malformed numerical outputs fail. Only
worker/memory resource failures discard partial output and retry once serially.
`cpuKernel:'single'` is retained. Adaptation observes completed useful work only;
no startup calibration, probe image, nested thread pool or backend-brand test.
Cache hits still skip filtering altogether. Optional new cache admission follows
worker admission, including enough headroom for the targeted rows.

Metrics include `workers`, `workerJobs`, `dispatchAccountedBytes`, `filterWallMs`
and `scheduling`. Local/histogram times sum job durations; `filterWallMs` measures
elapsed filtering. Complete global equalization, finish and source load are separate.
The shared row transport also serves separation; its numerical contract is unchanged.

Same512MiB/hint4,12.61MP combined adjustment, one cold/warm sample per condition:

| CPU selection | Cold RPC | Warm RPC | Cold chain | Warm chain |
|---|---:|---:|---:|---:|
| single |2.390s|2.385s|2.730s|2.649s|
| auto,4 workers |1.393s|1.359s|1.744s|1.631s|

Warm RPC improves1.75× locally. Source unload/reload deliberately invalidates the
prefix cache before the warm task, so both tasks really filter the full image.
Both source loads are included in chain timings. No cache-disable setting or
runtime calibration is added to the product. The original whole RGB hash matches
in both conditions. Peaks202,346,844bytes single/478,467,781bytes auto remain under
536,870,912bytes. The warm auto task includes the already loaded64MiB parent heap
alongside four children. See `adjust-pool-chrome-proof.json` and its reproducer.

Functional Chrome768MiB with four workers also passes all four original96MP/
12.61MP whole RGB hashes, Otsu127/162, owned surfaces, JSON, cancellation/reload and
zero resources. RPC7.255s/31.948s/1.431s/0.633s; the96MP maximum sharpen case remains
costly. Those functional values use a different budget from the earlier192MiB
recipe and are not an isolated same-budget speed claim. Maximum recorded
743,959,488bytes; the final restarted worker peak410,670,285bytes is a later lifetime.
The copied runtime receives the same functional recipe.
