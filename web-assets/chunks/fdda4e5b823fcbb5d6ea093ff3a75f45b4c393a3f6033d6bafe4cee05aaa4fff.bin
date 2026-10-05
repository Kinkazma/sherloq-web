# SHERLOQ browser engine contract — 0.28.0

## 0.28 — ELA energy

`ela.energy` now executes the energy-only native scientific chain on the loaded
original bytes/pixels. Defaults are `{quality:0,block:32,minimum:3,profile:'standard',
histogramLow:10,histogramHigh:990,shadow:50,highlight:50}`. Histogram controls use
thousandths (0–500 /500–1000); deviations use tenths (0–200). Thus the default
**Conservateur** remains1/99 percentiles and5/5 deviations. Manual values require
`profile:'manual'`; other profiles reject explicit nondefault slider values.
The native ids `sensitive` / `conservative` select the adaptive **Aggressive** /
**Sensitive** profiles. Preserve these distinct UI names. Saved snapshots should
run as manual values; saving/naming/persisting a profile belongs to the UI.

Quality0 uses the **closest** original JPEG quantization table, without subtracting
table deviation; unusable/non-JPEG tables fall back to75 and say so in metadata.
Manual quality is1–100. The three probes preserve native boundary rules near1/100.
Block accepts16/32/64/96; the native16,384-cell cap may increase its effective value
by8, recorded separately from `requested_block`. At least25 full cells are required.
No pixel resizing occurs. Minimum is1–1000 cells; component and strong support
are tested in actual pixels using the effective block area.

Owned data contains full-resolution `energy_low_score` / `energy_high_score`
Float32 maps, `energy_scope` / `energy_labels` Int32 maps, three stacked Float32
`energy_planes`, panel summaries, regions, stable RGB colours and complete parameter
metadata. Labels0 mean no retained energy class; disconnected support shares a
panel/class id without filling gaps. Layer descriptors reference the two scalar
fields and label field; no native composite RGB rendering is implied. These
uncalibrated descriptive contrasts are not probabilities or editing attribution.
Legacy peer biomes, background/Ghost corroboration and `analysis.complete` stay
unavailable. Energy label ids start at1 without a legacy-region offset.

Panel geometry, JPEG planes, score maps and adaptive estimates have independent cache keys.
Changing deviations/minimum reuses recompressions and scores; changing histogram
bounds recomputes scores while reusing the detected panels. `energyPanelDetections`
reports actual geometry executions; changing JPEG quality also reuses this geometry.
Original bytes remain unchanged. JSON and NPZ exports
preserve all five arrays; NPZ includes shapes/dtypes plus metadata/provenance JSON
and requires no pickle. The default bounded JSON export may refuse large rasters;
NPZ is the compact numeric export, still admitted under the shared budget.

CPU only, full-memory only; GPU/segmented sources/arbitrary region requests fail
explicitly. At1MP, independent useful JPEG+energy tasks use up to three single-thread
workers under the existing shared budget, with no calibration. CPU single mode
remains available. `energyCodecMs`, `energyPrimitivesMs`, `energyPreparationMs`,
`energyProfileMs`, `energySegmentationMs` separate serial stages. Pooled codec+
primitive work is reported together as `energyPoolMs`, with actual workers,
`energyScheduling` and useful recompression count. Hard main-worker cancellation
clears originals/caches; reload before retry. Accounting does not measure RSS.

51 complete native original-file paths pass actual worker API tests in Chrome,
Firefox and WebKit, including3 useful workers, cache ownership, cancellation/reload,
JSON and NPZ. Node NPZ was independently read with NumPy `allow_pickle=False`.
Global regression passes174/174; isolated timings/memory are documented in the
energy study. WordPress integration and physical devices remain unqualified.
Use the immutable archives and post-extraction proofs, not the live development tree. See `docs/ELA-ENERGY-STUDY.md` and pipeline browser proofs.

## 0.27 — automatic panel geometry

`subimages.detect` accepts empty parameters and returns `data.polygons` (native
inclusive pixel-centre vertices) and `data.regions` (`{id,bounds}` with half-open
integer bounds). These regions can feed the existing scope controller. No image
raster is returned; JSON contains the geometry and untouched-source provenance.
An empty list stays empty. The complete-analysis adapter is still unavailable.

144 original-byte cases are exact in Node and Chrome/Firefox/WebKit; cancellation,
reload, shared-budget refusal/retry, cache ownership and JSON are tested. CPU only,
full-memory only; segmented sources, arbitrary input ROIs and WebGPU are refused.
Read `docs/AUTO-ZONES.md` for native thresholds, coordinate conversion, measurements
and explicit limits. Use the versioned archives and post-extraction evidence for delivery.

## 0.26 — explicit AKAZE copy/move

`tampering.copyMove.akaze` is qualified on 223 generated product cases in Chrome,
Firefox and WebKit. It uses the same parameters, result
layout, masks, exports and resource contract as ORB below, with `algorithm:'AKAZE'`.
The native default AKAZE settings and full 61-byte MLDB descriptors are retained.
The fixed historical Matching scale remains `matching/100*255`; it is not rescaled
to descriptor length. Cache keys include the operation, so ORB and AKAZE detections
cannot be mixed. BRISK remains unavailable, without automatic substitution.
The dense 1MP checker default is separately qualified as a match-budget refusal
in the native reference and Chrome; its other dense settings remain unqualified.
AKAZE's heap admission is `256*width*height + 160 MiB`, with the same 1GiB
WASM limit and additional shared JavaScript budget. The detector is full-memory.
WordPress integration and physical Safari/mobile/non-Apple hardware remain open.

## 0.25 — explicit ORB copy/move variant

`tampering.copyMove.orb` is qualified on the declared generated corpus in
Chrome, Firefox and WebKit. The historical panel defaults to BRISK; this separate operation must be offered as an explicit **ORB** choice.
BRISK remains unavailable. AKAZE is a separate explicit operation above; there
is no automatic substitution.

Defaults are `{response:90,matching:20,distance:15,minimum:5,showPoints:false,
hideLines:false,maskImageId:null}`. Response is finite0–100; matching and distance
are finite1–100; minimum is an integer1–20. The two drawing controls are boolean.
The source must be a contiguous RGB8 image at least7×7. It uses the native RGB
to gray conversion, distinct from decoding original bytes directly as grayscale.
Optional `maskImageId` names a loaded image of identical decoded dimensions:
RGB→gray→strictly-positive becomes **1**, otherwise0, matching the native mask
loader. No resize, crop or threshold adjustment is implicit. ORB pyramid behavior
can differ between masks valued1 and255; the native UI's binary1 rule is retained.

`data.points` is owned Float64Array rows `[x,y,size,angle,response,octave,classId]`;
`data.matches` is owned Float64Array rows `[queryIndex,trainIndex,hammingDistance]`
after the native displacement filter. `groupLengths` and `groupIndices` are owned
Uint32Array CSR-style group lengths and concatenated indices into `matches`.
They contain the native overlapping groups built with minimum1. Apply `minimum`
to group lengths for the displayed groups. `data.stats` contains native `total`,
`filtered`, `matches`, `clusters` and `regions`; `algorithm` is `ORB`. The regions
value is a directional clustering heuristic, not a number of proven forgeries.
`pixels` contains the complete source-coordinate RGB visualization; there is no
binary authenticity mask. JSON uses the existing bounded export and provenance.

Detection, response selection, matching, geometry and count have separate caches.
Drawing changes reuse analysis; minimum changes reuse geometry. Mask references
participate in cache invalidation and source provenance. CPU only, full image only;
segmented sources, regions and GPU fail explicitly. No image resolution changes.
The shared budget admits the growing WASM heap, dynamic matches/groups and owned
copies. Native caps remain30000 selected points,256MiB of match triples and128MiB
of logical int64 group indices, even though portable indices use32bits. Insufficient
memory produces an error. Hard worker cancellation requires reloading image and
mask originals; direct drawing/matching/clustering yield during useful batches.
The module grows from32MiB to at most1GiB, admitted before use; this is not a
segmented or unlimited-image implementation. JSON retains its default32MiB export
bound; a caller may explicitly request a larger `maxBytes` under the shared budget.

The exact point-pair decision cache is used for at least1024 filtered matches and
at most2048 points, if memory allows. At4096 filtered matches, `cpuKernel:'auto'`
may dispatch independent16-row grouping batches to the useful worker count admitted
by the same budget. Inputs/clone staging, output bounds and per-worker bookkeeping
are charged; workers load no ORB or codec heap. Results concatenate in original row
order; repeated matches and antialiased draws remain intact. Small jobs and
`cpuKernel:'single'` keep serial grouping. `cloningGroupWorkers` and
`cloningGroupScheduling` report actual dispatch, useful-work resource retries and
reuse. There is no runtime calibration, image probe or stored performance profile.
`cloningPreparationMs`, `cloningDetectionMs`, `cloningSelectionMs`,
`cloningMatchingMs`, `cloningClusteringMs`, `cloningCountMs` and `viewMs` separate
work from transport. Accounted memory is not browser process RSS.

## 0.24 — standalone resampling Fourier evidence

`tampering.resampling.fourier` selects original-file gray pixels, normalized over
the whole image before optional half-open `params.rect:[x0,y0,x1,y1]`. Defaults:
`{rect:null,window:'hanning',upsample:true,center:false,highpass:'simple',gamma:4,
rescale:true}`. Window accepts `hanning|radial`, highpass `simple|radial`, gamma
finite0–5; other options are boolean. Invalid/small/out-of-bounds rectangles fail.
Caller-only RGB fallback and segmented sources are unavailable for this operation.

Owned `data.magnitude`/`data.values` are binary64 **frequency-grid** arrays;
`data.geometry` links the spatial square and FFT crop to the selected region.
`pixels` is the native gray LUT at fixed0–1 display limits, while numeric values
may exceed one. The layer declares `coordinateSpace:'frequency-grid'`. JSON
preserves geometry and original-byte provenance. No probability map, authenticity
mask, automated peak decision or Matplotlib figure composition is implied.

Preparation/spectrum/magnitude caches allow gamma/rescale-only presentation.
CPU presentation workers start immediately for at least1MP output under the
shared budget, with single CPU retained and no runtime calibration. Resident
FFT heap32–512MiB, allocations and copies are admitted before calculation.
`fourierViewWorkers` is separate from the FFT worker count. Full numerical chain
has a declared measured tolerance, not bit identity; equal/near-equal peak ordering
can differ. See `docs/RESAMPLING.md` for errors, timings and reproduction.
Probability EM and WordPress integration remain unfinished.

The Adaptive CFA ONNX conversion study rejected CPU and GPU parity. No CFA
runtime is enabled and no weights are bundled; see `docs/CFA-CONVERSION-STUDY.md`.

## 0.23 — optional learned JPEG-quality estimate

`loadQualityModel({id,blob},hooks)` loads an explicit local saved XGBoost JSON
regressor. The qualified historical checkpoint has100 features,140 trees and
6948 nodes. Its original pickle is **never** accepted or executed by the browser;
the offline hash-gated converter produces JSON. No trained weights, download,
training or remote inference is included. Unsupported model layouts fail with
`UNSUPPORTED_MODEL`; budget and cancellation follow `loadMedianModel`.

`jpeg.quality` adds optional `params.modelId`, default `null`. The loaded reference
must have kind `jpeg-quality-model`. Original JPEG signatures use their stored
quantization tables first; a corrupt JPEG's metadata error suppresses prediction.
For non-JPEG signatures only, the optional regressor consumes the100 normalized
gray recompression means and returns `data.prediction`. With no model this field
is `null` and `data.modelError` explains availability. IDs requested explicitly
but not loaded raise `NOT_FOUND`; wrong source kinds raise `INVALID_INPUT`.

`data.minimum`, `data.estimate` (tables), and `data.prediction` are distinct.
Prediction is the raw finite float32 regression score, without clipping, sigmoid,
rounding or a fabricated authenticity threshold. The native UI displays one
decimal. Curve values remain binary64, including tiny signed rounding residuals.
JSON preserves all evidence and model SHA256; CSV retains the100 curve rows.
This is a heuristic estimate of previous JPEG quality, not a probability of fraud
or a reconstruction of compression history. No detection mask is defined.

The curve cache depends only on the image. Replacing/unloading the model removes
dependent results but can reuse all100 useful recompressions. Unloading the image
invalidates both. Worker cancellation clears image and model, requiring reload.
At1MP and above, useful qualities use the existing shared codec-worker budget;
smaller inputs and `cpuKernel:'single'` remain serial. No runtime calibration.
The normalizer has a fixed128KiB WASM heap. `qualityPreparationMs`,
`qualityRecompressionMs`, `qualityNormalizationMs`, `qualityPredictionMs` separate
phases (including cooperative yields); reused curve phases are zero.
Source decoding and the loss curve still require the full-memory adapter.
See `docs/JPEG-QUALITY.md` for corpus, measurements and boundaries.

## 0.22 — median-filter detector and explicit local model

`loadMedianModel({id,blob},hooks)` loads a locally selected saved XGBoost JSON
checkpoint. No model is embedded or automatically fetched. The existing native
128-feature model is the qualified checkpoint; availability of other feature
formats does not qualify arbitrary weights. IDs share the image/database namespace.
The reader accepts only the documented numeric binary-logistic tree subset;
unsupported layouts fail with `UNSUPPORTED_MODEL`. JSON parsing has conservative
memory admission; the existing27.8MB file needs about0.9GiB temporary allowance.

`various.median` requires `params.modelId`. Other defaults are
`{variance:5,threshold:0.4,showScore:false,speckle:true}`. Variance is an integer
0–100; threshold is finite0–1. The comparison converts the scalar to float32,
matching native NumPy. `speckle` is the native3×3 median on the float32 score grid.
`backend:'cpu'` is retained; no WebGPU/ONNX equivalent is advertised.

`data.geometry` declares64×64 blocks, constant-black padding (one full block even
at divisible dimensions), and the additional zero grid row/column.
`data.probabilities`, `data.margins`, and `data.variances` retain raw grid values;
`data.filtered`, `data.mean` and `data.validBlocks` describe the selected view.
`masks.valid` is0/1, `masks.decisions` is0 invalid /1 below threshold /2 at or above.
These masks have **grid dimensions**, not image dimensions. `pixels` is the native
uint8 RGB linear64 enlargement cropped to the image: blue invalid, green below,
red at/above, or gray score. It is not a full-resolution segmentation mask.

Changing variance, threshold, score mode or speckle reuses the analysis. Model
and image lifetimes invalidate its cache. Results and JSON export are owned copies;
provenance records the model SHA256 and layout. Hard worker cancellation requires
explicitly reloading both image and model. No partial detector result is published.
Features use one shared forest plus bounded block workers (16MiB hard WASM heap
per worker), admitted globally and dispatched immediately, with no startup probe.
Current source loading and RGB output remain full-memory; segmented sources are
explicitly refused. See `docs/MEDIAN.md` for corpus and numerical limitations.

Admission includes the capacities of already resident WASM modules, including
when a second engine is created in the same JS realm. Imports, ELA/pixel tasks,
PRNU operations and owned legacy copies use this floor. `imagePixels` and
`original` now enforce `BUSY` and `MEMORY_LIMIT` before copying, consistent with
the window APIs. Unloading sources does not shrink a shared module's heap.

## 0.21.0 — isolated-pixel evidence and candidate pages

Segmented pixels.defects adds `flagSurfaces.channels` and
`tables.candidates` alongside RGB and mask handles. `readFlags` returns RGB channel
flags; `readTable` returns uint32 rows; `readTableCsv` returns native-order CSV pages
with a header only at offset0. All requests require matching handle revisions.
`releaseTable` releases a table; source unload/disposal releases all owned outputs.
See `docs/SEGMENTED-DEFECTS.md` for columns, ordering, ownership and qualification.

## 0.20.0 — bounded reuse of IndexedDB pages

Local IndexedDB arrays keep at most two recently read pages each, within the
existing shared evictable memory budget. Writes invalidate the corresponding
page before admission, and disposal clears owned cache entries. Cached pages
cannot force an otherwise admissible live result out of RAM. No new public
setting, prefetch, scientific parameter or output layout is introduced.
See `docs/IDB-PAGE-CACHE.md` for exactness, memory and isolated read-stage evidence.

## 0.19.0 — original-byte views and streaming digests

`file.hex` additionally accepts segmented sources with unchanged window semantics.
`file.digest` adds Boolean `imageHashes` (defaulttrue preserves existing results).
For segmented sources the caller must explicitly request `{imageHashes:false}`
to compute the ten original-byte digests; otherwise `UNSUPPORTED_LAYOUT` explains
that perceptual hashes need their own segmented adapter. Load results expose
`operationConstraints['file.digest']`, and capabilities expose
`sourceAccess.segmentedOperationConstraints`. Visual hashes are never silently
replaced or omitted. See `docs/ORIGINAL-BYTE-ENGINES.md` for memory, cache,
original-byte provenance, JSON admission and reference evidence.

## 0.18.0 — deferred storage for results of RAM sources

Segmented JPEG sources that fit RAM can now create a local temporary session
when an owned result needs it. Channel ranks, bit planes and extrema share the
source's session; earlier live results stay valid. No new API is needed.
`metrics.temporaryBackend`/`temporaryFallback` identify the actual backend;
load metrics remain a snapshot of source preparation. Worker ownership covers
late creation, cancellation and disposal. See `docs/LAZY-RESULT-STORAGE.md`.

## 0.17.0 — segmented extrema and global density views

`noise.minmax` additionally accepts segmented JPEG sources. It returns RGB
`surface` and independent `maskSurfaces.minimum` / `.maximum` (range0/1, strict
8-neighbor evidence with outside borders excluded). All channel/color/filter
parameters retain native meanings. Density grids are anchored in oriented image
coordinates and normalized globally. Read/release each surface with the existing
0.16 APIs. See `docs/SEGMENTED-MINMAX.md` for memory, exactness and limits.

## 0.16.0 — explicit bit-plane mask surfaces

`noise.planes` additionally accepts segmented sources with all channels/bits and
median/Gaussian display filters. The result carries RGB `surface` and
`maskSurfaces.plane`: a separately owned raw `mask8` surface with range0/1 and
explicit semantics. `readMask(request,hooks)` returns an owned exact mask window;
`readPixels` stays RGB-only. Release each handle, or unload the source to invalidate
all of them. Scientific masks remain distinct from filtered presentation.
See `docs/SEGMENTED-PLANES.md` for borders, admission and native/browser evidence.

## 0.15.0 — owned channel-rank result surfaces

`colors.stats` additionally accepts segmented JPEG sources and returns
`layout:'surface'`, `surface` and layers referencing that surface. Read exact
windows through `readPixels`, then `await releaseSurface(id)`. Results stay owned
across later tasks; source unload/disposal invalidates them. Original surfaces
must be released with `unload`. JSON exports contain metadata, not a hidden raster.
See `docs/SEGMENTED-RESULTS.md` for lifetime, quota, tests and remaining limitations.
The contiguous path and its RGB array result remain unchanged.

## 0.14.0 — immutable Blob sources and exact pixel windows

`loadBlob({id,blob},hooks)` adds a transactional source and returns its exact
full-resolution `surface` descriptor. `readPixels({surfaceId,revision,rect},hooks)`
returns owned RGB8 bytes; `originalBlob(id)` and `readOriginal(id,range,hooks)`
preserve original bytes. Await `unload` and `dispose` to finish storage cleanup.
See `docs/SEGMENTED-SOURCES.md` for ownership, errors, cancellation and evidence.

When a full-memory JPEG is not admitted, scanlines use bounded RAM or local
OPFS/IndexedDB storage. Current qualified segmented operations are `inspection.histogram`, `colors.stats`,
`noise.planes`, `noise.minmax`, `pixels.defects`, `file.hex`, and `file.digest` with
`imageHashes:false`. Other operations report `UNSUPPORTED_LAYOUT`. Use the load result's
`availableOperations`. 96 MP pixel windows and the global histogram pass native
comparison in three browsers. This is not arbitrary-size support or qualification
of every engine. Segmented PNG/TIFF and direct raster streams remain open.

## 0.13.0 — immediate useful computation

Fresh sessions require no saved profile, cookie, localStorage or IndexedDB
calibration record. CPU pools dispatch the requested work directly; GPU setup
only creates the device/pipeline used by the requested mask. No synthetic probe,
serial baseline, repeated candidate or separate warm-up runs in the product.
See `docs/IMMEDIATE-COMPUTE.md` for scheduling, first-result measurements and tests.
Scientific ELA parameters and thresholds are unchanged.

`metrics.scheduling` (or each ZERO `votePasses[].scheduling`) reports capacity,
selected concurrency, prior useful samples, `preflightExecutions:0`, execution
count and any resource retry. Noisesniffer additionally reports DCT child count;
its main worker handles global statistics concurrently. Observations live only
in RAM. Runtime calibration metrics from older versions are superseded.

Segmented RAM/OPFS/IndexedDB never stores performance profiles. Image adapters
retain their documented per-operation limits; see the 0.14 source extension above.

## 0.12.0 — Noisesniffer

`noise.noisesniffer` exposes blockSize 3/5/7/8, cellSize 10–500,
samplesPerBin 100–200000, lowFrequencyFraction .01–1 and lowNoiseFraction .01–.99.
Defaults are 3, 100, 20000, .1 and .5. Views are `regions`, `mask`, `distribution`.
Statistics are cached by block size; changing a view never reruns analysis.
The public result contains native region cells in row/column order, raw mask
0/255, float64 count grids and uint32 selected-window indices (duplicates retained).
The distribution is RGB8 in the engine; NPZ preserves native BGR8 and int64 indices.
Noisesniffer and ZERO both support NPZ. See `docs/NOISESNIFFER.md` for qualification, first-use measurements and
explicit implementation limits. Use immutable release archives for integration.

The cross-family memory target is defined in `docs/MEMORY-EXECUTION-CONTRACT.md`.
The 0.14–0.17 extensions qualify JPEG windows, histogram, channel ranks, bit planes
and extrema. Other segmented adapters remain unavailable.
Existing global budgets and per-allocation limits must not be advertised as
support for arbitrary photo sizes. Every adapter needs browser-specific evidence.

## 0.11.0 — PRNU Wiener/NCC and typed HDF5 references

`noise.prnu` requires a loaded `params.databaseId`, supplied through
`loadPrnuDatabase({id,bytes},hooks)`. `buildPrnuDatabase({id,queryImageId,files,
singleCamera?},hooks)` creates and loads an explicit new HDF5 snapshot from
immutable File/Blob inputs; existing IDs are rejected. The selected query is
excluded by original SHA256 and at least two readable JPEGs per camera must
remain. `exportPrnuDatabase(id)` returns owned HDF5 bytes. These methods are
available in both direct and worker engines; build/import support AbortSignal.

Database IDs share the source namespace with images, with explicit kind checks.
Both lifetimes invalidate matching results; the query residual can survive a
database change. Hard worker cancellation clears all sources. JSON/CSV expose
stable raw NCC rankings and provenance; HDF5 preserves float64 fingerprints.
The 0.005 score and 0.01 gap cutoffs are historical and uncalibrated. The result
has no primary raster. `docs/PRNU.md` defines formatting, metadata flags,
streaming construction, memory admission, exactness and measured limitations.
The optimized SIMD CPU path is default; `cpuKernel:'reference'` remains available.

## 0.10.0 — pairwise comparison

`comparison.image` requires a loaded `params.referenceImageId` with exactly the
same dimensions as `imageId`. Defaults are `{view:'normal',metrics:false,
equalized:false,grayscale:false}`. The four views are normal (reference),
difference, SSIM and Butteraugli; `metrics:true` requests all twenty measures.
Both source lifetimes participate in caches and `provenance.references` records
the reference's original hash and decode policy. Unloading either source removes
the pair's cached analyses. Hard cancellation requires reloading both images.

`data.values` contains finite scores and the string `'+Infinity'` for perfect
PSNR; undefined scores appear in `data.errors`. Historical histogram correlation
is preserved with an explicit warning and a separate corrected full-bin result.
JSON and CSV are available. Read `docs/COMPARISON.md` for exact data semantics,
helper precision, dimensions, memory admission and validation evidence.
The compiled OpenCV module now requires WebAssembly SIMD. CPU reference remains
selectable through `cpuKernel:'reference'`.

## 0.9.0 — contrast and stereogram

`tampering.contrast` exposes all four native block sizes and three indicator
views, defaults `{block:64,mode:2}`. Its Float32Array grid preserves historical
padding. Mode changes reuse analysis. `various.stereogram` exposes all four
native views, default `{mode:0}`. Absence of a periodic offset returns
`data.detected:false`, `offset:null` and no raster; disparity is computed only
for modes 2/3, and its width is source width minus detected offset. The
horizontal float32 flow is relative displacement, not physical depth.
Read `docs/CONTRAST-STEREOGRAM.md` for arrays, cropping, semantics, numerical
qualification and CPU performance. Both operations support JSON export,
shared memory admission, cancellation and independently owned result arrays.

## 0.8.0 — ZERO grids and typed export

`jpeg.zero` adds native grid votes, global log10 NFA, detected and regularized
foreign/missing-grid masks, five views and NPZ. Defaults are `{missing:true,view:0}`.
Read `docs/ZERO-ENGINE.md` for inclusive region boxes, typed arrays, the JPEG99
4:4:4 companion, original/optimized CPU, immediate bounded workers and limits. ZERO has
a separate AGPL-3.0-or-later license and corresponding sources in the delivery.

`exportAnalysis(result,{format:'npz',maxBytes})` supports ZERO's and Noisesniffer's native arrays.
`workerEngine.exportResult(result,options,hooks)` runs supported serialization in
the existing worker with shared memory admission; source buffers remain owned by
the caller. Default export budget is 32 MiB; a large NPZ needs an explicit larger
bound. Cancellation clears loaded images, as for computation. Other NPZ operation
requests are explicitly unsupported.

## 0.7.0 — JPEG evidence and explicit control state

`jpeg.multiple` reads the original stored JPEG DCT coefficients and returns the
experimental aligned-lattice report. `jpeg.ghosts` computes full-resolution
recompression errors, normalized 16×16 block grids and per-quality RGB previews.
Neither has a primary raster. Field layouts, parameters, caches, scientific
limitations and proof corpus are specified in `docs/JPEG-ANALYSIS.md`. Ghost
qualities and JPEG quality curves share one bounded, immediately dispatched codec-worker pool.

Two exported helpers prepare future workflows without enabling missing engines:
`createAnalysisScopeController()` handles automatic-region / whole-image resets
and obsolete jobs; `createElaEnergyControls()` preserves four explicit values and
manual ownership across asynchronous profile responses. Read
`docs/COMPLETE-ANALYSIS-SCOPE.md` and `docs/ELA-ENERGY-CONTROLS.md` before wiring
them. The energy engine and profiles are qualified separately in0.28 above.
`analysis.complete`, legacy peer biomes and their Ghost corroboration remain unavailable.

Owner: C. Portable ES modules, no WordPress, network service or platform-brand test.
Status: 38 callable operations (CPU reference retained); synthetic reference evidence and explicit limits
are recorded per capability. New WordPress panel integration remains pending.

## Entry point (stable for B)

`import { createEngine, DEFAULT_ELA_PARAMS } from './src/index.js'`.
`const engine = createEngine({computeProfile:'aggressive'})`.
An explicit `memoryBudgetBytes` overrides the resource profile; avoid a fixed 256 MiB cap.
`await engine.load({id, bytes, mime, pixels?, provenance?}, {signal})` returns an
image descriptor. `bytes` is the untouched original `Uint8Array`; never use a
Canvas JPEG as the original. Engine copies input and retains bytes until unload.
`pixels`, when supplied, is `{width,height,data:Uint8Array,format:'rgb8'}`,
top-left origin, contiguous rows, RGB, no alpha, no implicit orientation/ICC or
resizing. Provenance must state decoder, orientation, ICC, depth and alpha policy.
Unknown provenance remains explicitly unverified, never promoted to native parity.
Only formats enumerated by `engine.capabilities()` are available.

`await engine.run({id, imageId, operation:'ela.classic', params, backend:'cpu',
regions:[]}, {signal,onProgress})` resolves result; failures throw EngineError
with `code`. Result: `{id,imageId,operation,status:'ok',pixels,provenance,metrics}`.
Pixels have the same RGB descriptor. Consumers own returned buffers and may
transfer them. Engine caches remain private. `engine.original(imageId)` returns
a defensive copy of original bytes. `engine.unload(imageId)` clears its caches;
`engine.dispose()` clears all. Job ids identify UI revisions; B discards stale
completions. AbortSignal cancellation rejects with `CANCELLED`; progress uses
`{id,phase,fraction}`. Latest-wins scheduling belongs to B's UI; one engine job
at a time initially, `BUSY` otherwise. Worker wrapper follows the same lifecycle.

Default classic parameters: quality 75 (1–100), scale 50 (1–100), contrast 20
(0–100), linear false, grayscale false. These are classic native controls.
Separate energy analysis profile is **Conservateur**: percentile 1/99, deviations
5/5, adaptive false. The separate `ela.energy` operation supplies energy maps.
Legacy biomes and their Ghost corroboration remain unavailable; classic ELA
must not masquerade as those panels or a detection mask.

## Scientific boundaries

Regions use source pixel coordinates; rectangles are half-open `[x0,y0,x1,y1)`;
polygons require a named rasterization rule. Generic task.regions remain unsupported.
Magnifier alone accepts params.bounds and returns a cropped result plus its layer
origin; other operations work on the full image.
Future masks include semantic label, value range, threshold, interpolation,
source coordinate transform and decision metrics. No automatic resampling.

Kernel and codec parity are independent. Results must expose both. JPEG codec
identity/options and original SHA256 enter provenance; source RGB/recompressed
RGB hashes are reference evidence. Canvas is for display/export of a derived
visualization only. No TIFF/high-depth/ICC/alpha support may be claimed merely
because the browser paints the file. Unsupported input fails explicitly.

CPU bit equality preferred. GPU maximum absolute error ≤1e-4 in declared units
and mask/decision agreement must be measured; a similar-looking rendering is
insufficient. GPU request must never silently fall back; auto backend records
chosen backend/reason. CPU remains selectable. No hidden FP16 or size changes.

## Budget, export and error surface

One global memory budget includes retained source, cache, active scratch and
worker reservations. Caches are bounded LRU. Job admission rejects `MEMORY_LIMIT`
before known large allocations. Browser/codec runtime overhead must be reported
separately; no claim that JS can measure total device RAM. Intensive means the
largest **measured useful** concurrency within budget, not cores × internal pools.
No model preloading. Warm cache should avoid recompression on display changes.

Errors: INVALID_INPUT, UNSUPPORTED_FORMAT, UNSUPPORTED_OPERATION,
UNSUPPORTED_REGION, UNSUPPORTED_BACKEND, CODEC_UNAVAILABLE, MEMORY_LIMIT,
CANCELLED, BUSY, NOT_FOUND, DISPOSED. Public messages contain no local file paths.
Timings in milliseconds: preparation, codec, kernel, transfer, display and total
where actually measurable; absent fields are unmeasured, never zero guesses.
B owns display and download dialogs. Export RGB as a derived PNG plus JSON
provenance/parameters; keep original byte download separate. Do not put original
filenames or EXIF into public test reports.

Changes to these names require a contract version and coordination with B.

## 0.1.0 implementation notes (C → B, CPU slice ready)

- `engine.imagePixels(imageId)` returns an owned RGB8 copy of the exact analysis
  input. Use this for the original layer. It does not decode via Canvas again.
- `src/worker-client.js` exports `createWorkerEngine(options)` with asynchronous
  counterparts to these methods. It keeps one persistent module worker, uses
  transferables for results, and hard-terminates on AbortSignal (including WASM).
  Cancellation clears loaded images and caches: error `imagesCleared:true`;
  reload original bytes before retrying. B may retain its equivalent transport.
- Default codec is controlled libjpeg-turbo 3.0.3, JDCT_ISLOW, 4:2:0, baseline,
  quality 1–100. Eight synthetic JPEG decode cases and 57 recompressions are
  bit-exact with native OpenCV; 40 ELA render expectations also pass. This is
  bounded evidence, not validation of all JPEG files or hardware.
- Historical 0.1 slice rejected APP1/APP2, TIFF, alpha and high depth; 0.4 decode
  rules below supersede that restriction. CMYK remains unavailable.
  Source bytes remain intact. Progressive/grayscale and odd/tiny dimensions have
  explicit fixtures. No orientation, ICC, alpha or depth conversion is hidden.
- Budget is for one engine/session. Use **one shared engine instance per page**;
  independent instances cannot coordinate budgets yet. It reserves 32 MiB runtime
  overhead plus conservative pixel scratch before allocating. WASM heap capacity,
  browser GC, copies owned by B and actual process RSS are not totalled as device
  RAM; these limitations must remain visible in measurement reports.
- Energy deviations are dimensionless log residual-energy scores (LOG_SCALE .2,
  ENERGY_FLOOR .25), separately low/high; they are not pixel gray thresholds.
  Conservateur uses percentile bounds 1/99 and score thresholds 5/5. Adaptive
  Sensible/Agressif are explicit energy profiles. Saved profiles belong to the UI
  and replay explicit manual values without an implicit new estimate.
- Runtime file list: `runtime-manifest.json`, SHA256 for every file. Load assets
  locally with JavaScript/WASM MIME types; no CDN. A/B must exclude `.build/`,
  `node_modules/`, and all private coordination files.
- Chrome 154 headless using the installed Chrome binary: native parity, cache,
  gain change without recompression, worker termination and reload passed;
  `docs/browser-proof.json`. Real WordPress recipe remains B's responsibility.


## 0.2.0 — aggressive calculation profiles

Default: `createEngine({computeProfile:'aggressive'})`; optional
`computeProfile:'maximum'`. Resource-only policies; analysis profiles and default
parameters stay identical. Remove obsolete fixed 256 MiB limits in adapters.
`resolveComputeProfile()` can run in the UI and pass `resourceHints` to a worker:
`{deviceMemoryGiB,heapLimitBytes,hardwareConcurrency}`. UI-side heap hints are
not always exposed inside workers. Explicit `memoryBudgetBytes` still overrides.

Aggressive budgets up to 65% of reported RAM and 75% of reported JS heap limit;
Maximum uses 80%/85%. The minimum applicable hint is used, with no fixed global accounting
ceiling. Unknown hints use 1/2 GiB respectively. These are browser hints, not
measurements of free system memory; allocations remain lazy. Codec-specific
working-set checks remain separate from the global cache budget. Results report
observed WASM heap capacity where available, not total process RSS.

For at least 1 MP, CPU LUT jobs start at the highest exposed core count admitted
by the shared budget. Every worker executes requested pixels once; table broadcast,
copies and assembly belong to that useful task. Subsequent requested work may
use a reduced count after real slowdowns/resource failures. Each worker runs one
thread; JPEG stays a sequential dependency. No candidate sweep or warm-up occurs.
`cpuKernel:'single'` uses optimized serial arithmetic; `'reference'` uses the
original arithmetic. `auto` is the default. See the 0.13 scheduling contract.

ELA GPU lookup remains unselected because its measured full path loses to CPU.
Frequency smoothing in 0.6.0 has a separately qualified GPU path; see below.

## Additive operations in 0.3.0

`capabilities().operations` now advertises `inspection.histogram`, `colors.stats`,
`noise.planes`, `noise.minmax`, and `pixels.defects`, with native defaults and
export availability. Exact parameter/semantic mapping: `docs/PIXEL-ENGINES.md`.
Every task still uses the same load/run lifecycle and budget. Unknown controls,
GPU or ROI requests fail explicitly. All five currently use one CPU worker.

**Consumers must make `result.pixels` optional**: histogram returns numeric `data`,
not an invented raster plot. Other operations return RGB8 `pixels`, and where
applicable `masks` plus numeric `data`. Masks are `mask8` with width/height, typed
`data`, explicit range/semantics, source dimensions and no interpolation.
Do not threshold the Gaussian bit-plane display or reinterpret defect colors as
a probability mask. `result.layers` describes the RGB display when present.
`provenance` keeps scientific parameters, native reference, source SHA256, decode
policy and interpretation. UI masks/graphs must follow those semantics.

`import {exportAnalysis} from './src/index.js'` (or lightweight `src/exports.js`).
`exportAnalysis(result,{format:'json'|'csv',maxBytes?})` returns `{mime,bytes}`.
JSON preserves arrays, masks, settings and provenance. CSV is supported for
histogram bins and defect candidate coordinates; defect CSV matches native bytes
including row order and CRLF. Unsupported formats throw `UNSUPPORTED_EXPORT`.
Exports default to a separate conservative 32 MiB bound; larger limits must be
explicit. JSON stores typed arrays as arrays, not numbered object properties.
Results and exports are derivatives; no source modification or implicit download.

C's module worker transfers **all** nested typed-array buffers, including masks,
histograms and candidate coordinates. Custom B transports may structured-clone
them but must not assume every result has pixels. Cloning costs belong in their
own integration measurements. No protocol change to ELA or original image APIs.

## 0.4.0 — file decoding and additional CPU engines

See `docs/EXTENDED-ENGINES.md` for all 13 additions and native control mappings.
`src/index.d.ts` enumerates exact parameter names. The load/run/worker APIs are
unchanged. Magnifier layer origin can be nonzero and output dimensions smaller
than the source. An empty ROI or absent thumbnail has no pixels. Metadata and
digests return numeric/structural data, not a fabricated image.

Default decoding now handles EXIF-oriented JPEG and explicitly qualified PNG/TIFF
subsets through locally bundled OpenCV WASM. ICC is retained but not applied;
alpha is converted using native IMREAD_COLOR policy; source depth and analysis
RGB8 conversion are stated in provenance. TIFF orientations 5–8, BigTIFF and
unqualified PNG/TIFF modes fail explicitly. Original encoded bytes are unchanged.

Metadata structure is not full ExifTool; GPS uses EXIF rationals only. File digest
returns four validated perceptual hashes and explicit unavailable reasons for
two rejected hashes. JPEG quality's learned predictor is not replaced by a
heuristic; its quantization estimate and loss-curve minimum remain separate.
Quality and illuminant CSV are additive exports. Illuminant floating formatting
can differ from Python while values agree within the declared 1e-12 bound.

New kernels execute in one worker; hard cancellation interrupts synchronous WASM
by terminating that worker. Cache entries and all exported arrays remain owned
defensively. Reported codecHeapCapacityBytes covers both local codec heaps; it is
not total process RSS. Resource profiles use the immediate scheduling policy described above.

## 0.5.0 — wavelets, PCA, point data and useful codec workers

Added `colors.pca`, `colors.plots`, `detail.wavelets` and `noise.blocking`. Defaults,
parameter domains, original-byte grayscale rules and numerical proofs are listed
in EXTENDED-ENGINES.md and the TypeScript declarations. RGB/HSV points are analysis
data for the UI; graph rendering and SVG/PDF export are not supplied by this engine.

PCA basis, RGB/HSV analysis, wavelet coefficients and db8 detail are shared across
view changes. Their `metrics.cache.analysis` describes that reuse; `cache.view`
remains false because the requested view is computed. For compatibility,
`cache.result` also reports the base-analysis hit on these operations. These view
calls still report one compute worker. Cached internal inputs/coefficients never
appear in the result or export and are charged to the shared LRU budget.

At one megapixel or above, JPEG qualities execute immediately on independent
single-thread codec workers under the shared memory budget. Workers are destroyed
after every job; only observations of useful work remain in session RAM.
`cpuKernel:'single'` and `'reference'` retain the serial path. Qualities 1–100,
pixels, thresholds and scientific arithmetic stay fixed.

## 0.6.0 — frequency CPU/GPU path

`detail.frequency` adds `split`, `smooth`, `threshold` (0–100, defaults 15/25/0)
and `filter` (0–15, default 0). See `docs/FREQUENCY-ENGINE.md` for all four output
fields, frequency-domain dimensions, masks, caching and scientific limitations.
Only this operation accepts explicit `backend:'webgpu'`. Auto dispatches the offline-qualified Gaussian smoothing kernel on GPU, retaining DFT/reconstruction on CPU.
CPU override uses independent result/mask cache keys. Explicit GPU errors never
silently fall back; auto fallback records its reason. `provenance.backend` records
the actual analysis path, including when a result is cached. GPU capabilities
describe API support, not universal numerical proof. No runtime probes execute;
other adapters beyond the documented development corpus remain unverified.

There is one shared budget including GPU buffers and estimated device overhead.
Device/buffers are released on final unload/disposal, hard cancellation terminates
the worker. Full original pixels and original bytes remain unchanged. The new
backend is additive; existing operations and ELA defaults are unchanged.
