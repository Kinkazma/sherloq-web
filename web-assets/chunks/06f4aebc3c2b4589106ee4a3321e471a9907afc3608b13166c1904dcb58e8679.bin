> M1 increment0.30.0-m1.14 adds segmented contrast maps and corrects native
> float32 reduction order in both source layouts. See [SEGMENTED-CONTRAST.md](docs/SEGMENTED-CONTRAST.md).

> M1 increment0.30.0-m1.13 adds segmented illuminant maps, compact estimate
> caching and surface-aware CSV. See [SEGMENTED-ILLUMINANT.md](docs/SEGMENTED-ILLUMINANT.md).

> M1 increment0.30.0-m1.12 runs segmented Echo in admitted CPU row workers;
> `cpuKernel:single` retains one worker. See [SEGMENTED-ECHO.md](docs/SEGMENTED-ECHO.md).

> M1 increment0.30.0-m1.11 selects the measured exact Echo CPU optimization;
> parameters and outputs remain unchanged. See [SEGMENTED-ECHO.md](docs/SEGMENTED-ECHO.md).

> M1 increment0.30.0-m1.10 adds segmented Echo, radii1–15, with exact halos
> and global normalization; see [SEGMENTED-ECHO.md](docs/SEGMENTED-ECHO.md).

> M1 increment0.30.0-m1.9 selects measured, bit-exact gradient lookup reuse;
> API and scientific settings are unchanged. See [SEGMENTED-GRADIENT.md](docs/SEGMENTED-GRADIENT.md).

> M1 increment0.30.0-m1.8 adds the segmented luminance gradient with global
> normalization and bounded arithmetic; see [SEGMENTED-GRADIENT.md](docs/SEGMENTED-GRADIENT.md).

> M1 increment0.30.0-m1.7 adds nine color-space families on segmented sources; see
> [SEGMENTED-COLOR-SPACES.md](docs/SEGMENTED-COLOR-SPACES.md).

> Development increment0.30.0-m1.6 adds exact ROI magnification on segmented JPEG
> sources. See [SEGMENTED-MAGNIFIER.md](docs/SEGMENTED-MAGNIFIER.md). The M1 segmentation operation is specified in
> [SEGMENTATION-M1-CONTRACT.md](docs/SEGMENTATION-M1-CONTRACT.md). The0.29 archives
> retain their original immutable contract. Shared release integration is pending.

# SHERLOQ browser engine contract — 0.29.0

## 0.29 — D2PRL model, zones and cached filters

Use the immutable runtime archive and verified release receipt, not the live
working tree. The scientific corpus, runtime delivery and WordPress integration
are separate qualifications; the API does not imply a WordPress release.
The immutable0.28 energy runtime remains available independently.

`loadD2prlModel({url,bytes,sha256})` verifies a pinned external model manifest of
at most2MiB. Pass an absolute mirror URL plus the exported
`D2PRL_MODEL_IDENTITY.bytes` and `.sha256`. Other conversions are refused before
fetch; the downloaded body is verified independently. It loads configuration
only, with no tensor preloading or inference.
Actual parameters are fetched lazily, bounded by their manifest sizes and checked
by SHA256. The original `.pth` cannot be passed to the browser. Converted model
parameters are separate from the runtime archive. `unloadD2prlModel()` drops the
session, caches, helper heaps and manifest. A missing model returns
`MODEL_UNAVAILABLE`; there is no remote inference service.

`run({id,imageId,operation:'ai.clones.d2prl',backend:'auto',params:{minimum:500}})`
uses the existing qualified loaded RGB8 source. `minimum` is an integer0–5000,
applied independently to each448×448 model grid before source-coordinate resizing.
Zero disables only removal of small components; the native50×50 role filter remains.
The model stays448px,40PatchMatch iterations and seed22. No scientific parameter
is changed by a compute profile. `cpuKernel:'single'` uses one useful worker per
pool; the default uses the resource profile's useful ceiling under one shared
engine budget. Pools execute sequential stages and use one WASM thread per worker.

Explicit `regions:[{id,kind,bounds:[x0,y0,x1,y1]}]` are independent half-open source
rectangles, at least8×8. `kind` is `region`, `envelope` or `whole-image` and is
retained as provenance. Pass every active subimage and the active envelope; the
engine does not add an envelope implicitly. Empty regions use the whole image,
unless `params.selectionPresent:true`, which refuses an empty selection.
`params.exclusions` contains half-open source rectangles, also at least8×8, applied to the projected
outputs, preserving the native input-crop policy. No source pixels are blackened.
Full-image inputs smaller than8px on an axis retain the native whole-image rule.

Returned `data` contains full source dimensions and owned arrays: Float32 `map`,
`target`, `source`; Uint8 `mask`, `analyzed`, `candidates`. `map` is the continuous
union model score. `mask` is its native binary support; target/source are native
role masks derived from residual signs and filtering, not class probabilities.
`analyzed` is the union of analyzed rectangles minus exclusions. `candidates` is
zero, matching the native adapter; this model emits no keypoint candidate table.
Overlapping outputs use exact pixelwise union/maximum and preserve holes. Several
D2PRL passes give **one model vote**, never one corroboration vote per pass.
Metadata includes per-zone geometry, provenance kind, arithmetic decision,
component minimum and executed backends; JSON/NPZ preserve the numeric arrays.

Changing only the minimum, exclusions, region identifiers or active subset reuses
available raw-grid caches. Backend, actual source pixels, model identity or crop
geometry change the inference key. For an explicit analysis request, an evicted grid may be recomputed and is
reported in the inference count. The slider must instead pass
`params:{minimum,refilterOf:previous.data.metadata.analysisId}`. This path only
refilters existing grids and throws `CACHE_MISS` if they were evicted; it never
loads weights or performs inference. Omit `regions` and `selectionPresent` on a
refilter request. The original analysis backend is retained unless the caller
explicitly requests a conflicting backend, which is refused. `analysisId` stays
stable across refilters; `resultId` and `revision` identify each returned view.
A new explicit analysis invalidates the previous analysis token. This also lets
a slider retry after cancellation races a just-completed view response.
No unlimited cache is promised. `metrics.inferences` and
`metrics.cache.rawGrids` report actual work. `onProgress` carries task/zone/revision
identities, phase and counts where available; a phase without a count does not
invent a completion percentage. The UI must retain its latest request identity.

`backend:'webgpu'` selects GPU convolutions with WASM/worker PatchMatch and ONNX-WASM
roles; `'cpu'` selects the complete CPU path. `'auto'` prefers an exposed WebGPU API,
otherwise CPU. An unavailable adapter or oversized GPU buffer fails explicitly;
CPU remains selectable. No device-brand dispatch, warm-up or runtime calibration.
Only full-memory decoded sources are supported, within8192 per axis/32Mi pixels
and each helper's actual allocation limits; insufficient budgets fail explicitly.

D2PRL worker cancellation is cooperative so completed raw caches can survive a
slider change. A cancelled request rejects with `CANCELLED`; inspect
`imagesCleared`. `false` permits immediate retry without reloading. The bounded
forced-stop fallback sets it to`true`, requiring source and model-manifest reload.
Other operation cancellation keeps its existing documented behavior. Returned
arrays belong to the caller, so changing an old result cannot alter cached scores.

`readD2prlRaw({imageId,resultId})` returns owned, unfiltered raw grids for the
current completed result. It performs no inference and throws `CACHE_MISS` after
eviction. `data.rawGrids` contains `{id,kind,bounds,raw}`, with `raw` Float32 in
plane order union probability / target residual / source residual, shape
3×448×448. Source/target residuals may be negative; they are distinct from the
projected role masks. The returned result supports JSON and NPZ export; NPZ names
are `raw_union_0`, `raw_target_0`, `raw_source_0`, then index1 and so forth in
`metadata.zones` order. Metadata keeps the current component minimum while
`raw_filter_applied:false` states that the raw arrays are unfiltered.

Whole-file API paths, cache refiltering and independent NumPy NPZ reads pass on
CPU and GPU in Chrome. Two real ROI inferences plus their envelope pass, including
exclusions and envelope removal. Common-worker CPU and GPU paths pass at a3GiB shared budget, including
lazy loading, strict refilter, raw-grid ownership/export, cancellation during
useful inference and filtering, cache recovery and unload. Conservative peak
accounting is about3GiB CPU and2.10GiB GPU on this source; these are reservations,
not RSS or universal minimum-device requirements. Idle CPU worker heaps can be
reclaimed before evicting scientific caches when a later stage needs memory. Read `docs/D2PRL-WEB-STUDY.md`; do not infer physical-device
coverage, universal detection quality or a WordPress release from these proofs.

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
Both contiguous and segmented sources support all six visual hashes by default.
`{imageHashes:false}` computes only the ten original-byte digests. Capabilities
no longer restrict that parameter. Visual hashes use exact native source rows;
see `docs/DIGEST-STREAM.md` for resource bounds, cache, progress and cancellation.
See `docs/ORIGINAL-BYTE-ENGINES.md` for original-byte provenance and JSON.

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

When a full-memory JPEG or static PNG is not admitted, scanlines use bounded RAM or local
OPFS/IndexedDB storage. Current qualified segmented operations include `jpeg.ghosts`, `ela.classic`, `inspection.histogram`, `colors.stats`,
`noise.planes`, `noise.minmax`, `pixels.defects`, `file.hex`, and `file.digest`
(including all six visual hashes). Other operations report `UNSUPPORTED_LAYOUT`. Use the load result's
`availableOperations`. 96 MP pixel windows and the global histogram pass native
comparison in three browsers. This is not arbitrary-size support or qualification
of every engine. PNG raster exports are described in docs/RASTER-EXPORT.md. Segmented TIFF and static PNG loading are
described in docs/TIFF-STREAM.md and docs/PNG-STREAM.md.

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

Two exported helpers manage workflow state independently of the engine adapters:
`createAnalysisScopeController()` handles automatic-region / whole-image resets
and obsolete jobs; `createElaEnergyControls()` preserves four explicit values and
manual ownership across asynchronous profile responses. Read
`docs/COMPLETE-ANALYSIS-SCOPE.md` and `docs/ELA-ENERGY-CONTROLS.md` before wiring
them. The energy engine and profiles are qualified separately in0.28 above.
The integrated runtime now supplies `analysis.complete`, legacy peer biomes and
Ghost support through the real adapters. See `docs/AUTOMATIC-RUNTIME.md` and
`docs/M5-LARGE-SOURCE-COVERAGE.md` for current API and qualification boundaries;
the combined96MP recipe and WordPress UI execution are still pending. Historical
operation counts and earlier proof scopes below retain their original meaning.

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


### M1 0.30.0-m1.15 — segmented median detector

`various.median` accepts segmented JPEG sources with the existing explicit local
model. Native64×64 blocks, complete score grid, model identity, thresholds and
linear64 rendering are preserved. `data` retains compact arrays; raw `masks.valid`
and `masks.decisions` remain JSON-exportable. Independent `maskSurfaces` have grid
resolution, not source resolution. All owned handles need release or source unload.
The private cache depends on source/model identity; model unload invalidates that
cache while published evidence survives. Useful feature workers reserve window
headroom and keep their existing fixed16MiB heaps; CPU single/reference remains.
See `docs/SEGMENTED-MEDIAN.md` for provenance, storage, numerical and import limits.

`loadBlob({id,blob,layout})` accepts optional `layout:'auto'|'segmented'`. The default
keeps existing budget selection. Explicit segmented access preserves full pixels
and fails if this branch has no qualified decoder (currently JPEG only). It does
not reduce the existing roughly1GiB budget needed to import the median JSON model.


### M1 0.30.0-m1.16 — signal separation and large histogram counts

`noise.separation` accepts segmented sources for all five existing filters.
Outputs are owned RGB surfaces; real row halos and the global residual histogram
preserve native pixels. NLM's radius remains strength, with fixed7×7/21×21 windows.
The dedicated arithmetic heap is fixed64MiB; a full oriented row and its halo must
fit. This initial segmented route uses one CPU worker; inter-task denoising cache
and new GPU/pool gains are not claimed. JSON carries parameters/provenance/surface
metadata. Release outputs or unload the source; hard cancellation requires reload.
See `docs/SEGMENTED-SEPARATION.md` for bounds, native hashes and storage tests.

The shared equalization LUT now preserves OpenCV float32 conversions of histogram
population/cumulative counts above2^24. This also corrects the existing magnifier;
no threshold, normalization rule or resolution changed. Public before/after proof:
`docs/equalize-count-proof.json`, with a16,777,218-pixel synthetic native oracle.


### M1 0.30.0-m1.17 — useful separation workers

Segmented `noise.separation` now starts the requested row work with the maximum
admitted useful workers (profile/budget/task bound, at most32). Each child uses
one fixed64MiB single-thread heap; source reads and output writes remain ordered.
Global residual equalization follows worker termination. Transferred windows keep
their budget leases until completion. No calibration, resolution change or new
threshold. `cpuKernel:'single'` keeps serial execution. Only resource failures may
retry once serially after partial output cleanup. Metrics include `workers`,
`workerJobs`, `filterWallMs`, `dispatchAccountedBytes` and `scheduling`; kernel and
worker postprocessing times are summed job times, not elapsed wall time.

Same768MiB96MP Gaussian comparison: warm RPC20.737s→8.021s with four workers and
exact whole native RGB. RAM/OPFS output choice shares that budget and is included.
See `docs/SEGMENTED-SEPARATION.md` for the bounded claim and reproducible evidence.
Inter-task filter cache and GPU qualification remain separate work.


### M1 0.30.0-m1.18 — gradient histogram count correction

The segmented gradient now shares the native-exact global equalization LUT used
by magnifier/separation. OpenCV casts the denominator and cumulative integer counts
to float32. Above2^24, omitting the denominator cast can change output bytes.
Two compact native histogram oracles reproduce the previous one-byte differences;
corrected bins and640 complete gradient views are exact. No parameters or thresholds
change. `docs/gradient-counts-proof.json` isolates this display-stage correction;
it is not a new large-image end-to-end or performance claim.


### M1 0.30.0-m1.19 — separation display reuses private filter bases

Segmented `noise.separation` optionally caches raw denoised/residual RGB in bounded
RAM chunks, with global counts for residual equalization. Levels are excluded
from its key. A retained base produces an independent output surface with zero
source reads/filter workers. Denoised/residual toggle has separate bases. Cache
admission follows useful worker admission and shares the global budget; it may
move the new output to temporary storage, never evict an owned output. Incomplete
work is not cached. Borrowed data is pinned while rendering and source unload
invalidates its cache. RAM-only callers protect result admission before caching.

`metrics.cache.analysis` / `analysisCacheHit` marks reuse; `filterCacheStored`,
`filterCacheBytes`, `cacheWriteMs` describe creation. Cache hit still renders a new
owned surface (`cache.result:false`). Same1GiB96MP/four-worker comparison gives
warm7.434s→1.144s with cold7.470s→8.123s; the measured cold storage/memory tradeoff
is explicit. See `docs/SEGMENTED-SEPARATION.md`, proof and reproducer.


### M1 0.30.0-m1.20 — segmented global adjustments

`inspection.adjust` accepts segmented sources and returns an owned RGB surface.
All controls retain their native order and values. Sharpen uses real row halos;
global value equalization, global8×8 CLAHE (including native asymmetric padding)
and a single Otsu threshold follow the local stages. Processing bands do not define
analysis regions. Fixed64MiB arithmetic, small complete histograms and source/output
windows share the budget. The signed native histogram domain is explicitly bounded.

Metrics include `localMs`, `histogramMs`, `equalizeMs`, `finishMs`, `sourceReads`,
`haloRows`, `clahePaddedSize` and the exact `otsuThreshold` when selected. JSON carries
parameters/provenance/surface metadata; use `readPixels`, release each owned result
or unload its source. Hard cancellation closes storage and requires reload. This
lot uses one CPU worker; new segmented prefix caches/GPU gains are not claimed.
See `docs/SEGMENTED-ADJUSTMENTS.md` for complete native outputs and resource limits.


### M1 0.30.0-m1.21 — cached adjustment thresholds/inversion

Segmented adjustments can retain the exact completed RGB prefix after equalization,
plus its complete grayscale histogram. Threshold/inversion changes produce owned
surfaces without source reads or refiltering; Otsu retains its native reduction.
Other controls remain in the key. Identity prefixes are not duplicated. Optional
RAM cache shares the budget, is pinned when borrowed, and is invalidated on source
unload; incomplete work is never cached. `cache.analysis` reports reuse;
`prefixCacheStored`, `prefixCacheBytes`, `cacheWriteMs` report retention. The same
bounded RAM-chunk helper serves separation, with its prior contract unchanged.

Same256MiB12.61MP prefix comparison: warm2.402s→0.144s, extra37.8MB RAM, exact
native whole RGB. Six changed real views, cached cancellation/reload and independent
output ownership are qualified. See `docs/SEGMENTED-ADJUSTMENTS.md` for scope and
reproducer. Cold preparation is still mono-worker; no new GPU or cold speed claim.


### M1 0.30.0-m1.22 — useful adjustment row workers

Cold segmented adjustments admit useful single-thread64MiB row workers under the
common budget. CLAHE histograms use the original global coordinates and integer
counts; padding/global mapping/Otsu follow after children terminate. Reads/writes
stay ordered, transferred input leases remain charged, and an existing main heap
is included. Optional caches cannot steal worker admission. Resource failures may
retry once serially after cleanup; invalid outputs fail. `cpuKernel:'single'` stays.

`filterWallMs` is elapsed time, `localMs`/worker histogram time are sums of jobs.
`workers`, `workerJobs`, `dispatchAccountedBytes` and `scheduling` describe the plan;
no startup calibration occurs. The .21 cached-view contract is unchanged. Same512MiB
12.61MP real recomputation gives warm2.385s→1.359s with four workers; see the proof
and full limitations in `docs/SEGMENTED-ADJUSTMENTS.md`.


### M1 0.30.0-m1.23 — optional gradient derivative cache

`detail.gradient` now reuses admitted private source-wide Sobel pairs independently
of display controls. Length extrema after inversion, rendering and histograms are
still recomputed; outputs remain independently owned surfaces. New metrics are
`analysisCacheHit`, `sourceReads`, `derivativeCacheStored`, `derivativeCacheBytes`;
the common cache metric exposes `cache.analysis`. Hits have zero derivative time
and source reads, with one rendering worker. Source unload evicts the complete
private value; no partial or asynchronously disposable store enters the RAM LRU.
A budget that cannot hold4N bytes keeps the existing streamed path.

640 native cached views plus orientation/lifecycle checks pass. The isolated96MP
same1GiB comparison observes warm1690.2→1209.5ms (1.40×), cold unchanged; whole-image
SHA matches native. See `docs/SEGMENTED-GRADIENT.md` and the normal/copied common
worker recipes. There is no claim of neural segmented-source support in this lot;
D2PRL/CMSeg/MGCF source preparation and output memory remain the next M1 work.


### M1 0.30.0-m1.24 — bounded neural preparation helper

Internal `rgbRowSource(surface,bounds)` supplies exact leased RGB row windows.
D2PRL `runRows` retains its native TorchAA448 tensor; CMSeg/MGCF row-provider input
retains Pillow256/512 bytes and NCHW tensors. Complete96MP and rectangular-crop
preparation matches native exactly under256MiB, including OPFS input and cancellation.
See `docs/NEURAL-ROWS-PREPARATION.md` for admission, arithmetic and reproducer.

Public AI operations still reject segmented images in this increment. Source
hash/cache coordination, full-resolution result projection, owned maps/masks and
exports must be integrated before that guard changes. A valid preparation tensor
alone is not an inference or final-mask qualification.


### M1 0.30.0-m1.25 — native projection rows and owned scientific windows

Internal `createNeuralSpatialRows` projects native grids to complete rectangle
coordinates while emitting bounded float32 rows. Its64MiB heap, staging admission,
exact bilinear/nearest rules and real-stage cancellation are qualified by236
small native comparisons and three complete96MP planes in OPFS. Numeric windows
reuse M5's `numeric-surface.js` from8d4ce76 without changes. See
`docs/NEURAL-SPATIAL-ROWS.md`. Public AI segmented-image availability remains
unchanged until inference, composition, owned maps/masks and exports are integrated.


### M1 0.30.0-m1.26 — segmented neural composition/exports

Internal native-grid projection now composes global maps and masks into owned
RAM/temp stores, preserves D2PRL exclusions/component semantics and CMSeg/MGCF
maximum/OR semantics, and exports native float32/uint8 arrays through bounded NPZ
pages. Result handles share their owned analysis independently of evictable model
caches. The scientific stream writer is reused from M5 with uint8 support and its
shared session budget. See `docs/SEGMENTED-NEURAL-COMPOSITION.md` for32 D2PRL and14
segmentation native cases, real OPFS/NumPy recipes, memory and isolated I/O change.
Public segmented AI remains unavailable until its real inference controllers and
surface/export dispatch are connected; no inference is fabricated by these helpers.

### M1 0.30.0-m1.27 — actual segmented neural inference and owned exports

`ai.clones.d2prl` and the six callable segmentation variants accept immutable
segmented JPEG sources through the same worker API. Model inputs retain their
native sizes; oriented RGB/crops are read incrementally and hashed completely.
Returned `planeSurfaces` and `maskSurfaces` own source-resolution outputs;
`readPlane`, `readMask` and `releaseSurface` preserve type/revision/ownership.
`exportSurface({surfaceId,revision,format:'npz'})`, `readExport` and `releaseExport`
use the M5 names and independent export lifetime. This branch's dispatcher
handles neural NPZ only; the coordinator merges it with M5's other exporters.
See [segmented neural API](docs/SEGMENTED-NEURAL-API.md) for parameters, numerical
semantics, memory, real-model proofs and limits.

Historical M1.27 state (superseded by the M1.28 bundle below): CMSeg generalization was refused with `MODEL_PARITY` for both source layouts:
a new JPEG score exceeds1e-4 despite unchanged masks. Its identity stays visible
for diagnostics, but it is excluded from callable capability variants. The
arithmetic candidate remains private and unpromoted. Previous generalization
proofs do not override this new counterexample. TNT/VIG remain unavailable.


## M1.30 — repaired TNT bundle

M1.28 restored CMSeg generalization with a separate pinned v2 backbone bundle;
see [the repair](docs/CMSEG-BACKBONE-REPAIR.md). M1.30 adds `mgcfdn-tnt` through
the existing segmentation API, including segmented JPEG input, independent ROI,
owned windows, cached reprojection and paged NPZ. Its new507-byte bundle has SHA
`27e4a64f492e0c161c9d50a850bf6e57ba3365e3e7633075bbba4a1edf4c75e3`.
Old TNT ONNX identity is refused. CPU only, native256 input, unchanged >.5 mask
threshold; continuous probabilities are not bit-exact. Useful fixed64MiB linear
workers share the global budget and are disposed before the512MiB ONNX decoder.
No activation captures are used at runtime. See [TNT evidence and limits](docs/TNT-NUMERICAL-REPAIR.md).
VIG remains unavailable. No WordPress or additional-device qualification is
implied by the common-worker recipe; B and the coordinator own that integration.

## M3 sparse and research engines

The main and worker engines expose `loadM3Models({models,language?})` and
`unloadM3Models()`. Loading registers explicit resources without inference or
calibration. Model graph identities are exported as `SAFIRE_MODEL`, `FOCAL_MODEL`,
`ADAIFL_MODEL`, `XFEAT_MODEL`, `XFEAT_PAGED_MODEL`, `ALIKED_MODELS`, `SPARSE_GLUE_MODELS`, and `SPARSE_GLUE_PAGED_MODELS`.
Graphs use `{sha256,url}` (fetched and verified when useful) or `{sha256,data}`.
The `models` keys are `safire`, `focal`, `adaifl`, `xfeat`, `xfeat-paged`, `aliked-n16`,
`aliked-n16rot`, `xfeat-glue`, `aliked-glue`, `sift-glue`, and the three
`*-glue-paged` alternatives. Multi-stage models
wrap a `graphs` object keyed exactly as their exported identities. OCR language
uses `{sha256,data:Uint8Array}` for English traineddata. Assets are external;
no method silently selects an alternative when a required model is missing.

Registering `models['xfeat-paged']` selects the pinned local XFeat graph for
both XFeat profiles, with global InstanceNorm, NMS, original masks, ranking and
descriptor sampling. Native floor32 analysis size and original coordinates remain
unchanged. Its overlapping convolution windows use RAM/temporary storage under
the common budget. `models.xfeat` retains the previous complete graph (including
the CPU reference path); if both resources are registered, the paged graph is used.
No model is synthesized or downloaded without an explicit registered asset.

Registered `*-glue-paged` resources preserve every native global candidate and
learned layer while paging attention and final assignment. They take precedence
over the corresponding full graph when both are provided; the original CPU
graph remains available. Resource hashes, numerical comparisons and large-source
coverage are in [M3-PAGED-ATTENTION.md](docs/M3-PAGED-ATTENTION.md).

Operations:

- `tampering.copyMove.brisk`, alongside historical ORB/AKAZE, accepts the same
  response/matching/distance/minimum/mask controls and optional exact GPU Hamming.
- `tampering.copyMove.sparse` accepts the14`SPARSE_COPY_ALGORITHMS` and typed
  `SparseParams`. Polygons, exclusions, compact guides and compare regions are in
  original pixel-centre coordinates. Compare requires two polygons. Independent
  ROI, true reflected extraction and Panels+Text preserve provenance; zero
  automatic panels returns `status:'no-regions'`.
- `ai.sources.safire` accepts side4/8/16/24/32, groups1..16, kmeans/dbscan,
  epsilon/minimum and binary. Results are1024×1024; prompt coordinates also use
  that1024 analysis frame.
- `ai.localization.focal` and `ai.localization.adaifl` have no artificial model
  controls. Their raw results are64×64, with native1024 preparation. AdaIFL's
  mask is strictly `map>.5`.

All four accept `backend:auto|cpu|webgpu`. `task.view` is independent from
analysis parameters: sparse uses `SparseView`; research uses
`{mode:'overlay'|'map'}`, plus AdaIFL`mask` or multisource SAFIRE`confidence`.
Returned RGB uses original image geometry and native nearest-neighbour display
sampling, INFERNO/palette and overlay rounding. `data` retains native grids,
features, groups and metadata; `provenance` identifies input bytes, decode,
parameters, backend and numerical qualification. `metrics.cache` reports stage,
result or proposal reuse. Rendering controls never invalidate neural results.
NPZ retains typed shapes with Unicode JSON metadata, without pickle. Sparse NPZ
contains points, pairs, BGR colors, search-region indices and biome/display
metadata. Original bytes remain unchanged.

Progress fractions are monotone through final rendering. Worker cancellation
cooperatively terminates M3 computation and preserves completed images/caches;
its bounded forced-stop fallback reports `imagesCleared:true`. Unload clears the
image's M3 engines; unload-models/dispose releases model resources. One shared
budget admits native heaps, workers, stage weights, transfers, caches, outputs
and GPU estimates. Scientific thresholds/resolution are never tuned for memory.
Segmented sources use qualified oriented row/window readers. Native fixed-grid
research/ALIKED preparation consumes source rows; XFeat convolutions and global
SIFT/AKAZE fields use bounded workers and RAM/temporary storage. Historical
source/mask bridges and native sparse drawing still admit a full-resolution RGB
view when needed. These leases are released and temporary pixel references are
removed after the call. Insufficient real memory or storage produces an explicit
error; scientific resolution, candidate domains and population are preserved.
WASM threading uses browser cross-origin isolation when available; independent
workers need none. Large results expose owned surfaces for `readPixels` and
`exportSurface`/`readExport`/`releaseExport`. `exportResultFile(result,{format:'json'})`
streams historical/native JSON under the same budget, avoiding a giant string;
`exportResult` remains available for admitted small outputs.

Historical/source-bridge/CM2 dimensions have no16384-per-axis cap. Native signed
int32 dimensions and linear pixel indices are checked independently from actual
shared-budget admission. The24000×4000 positive browser recipe and inverted-axis
controls are documented in [M3-ELONGATED.md](docs/M3-ELONGATED.md).

The complete M3 coverage matrix, proof commits, 96 MP resource measurements,
shared variant paths and remaining integration boundaries are in
[M3-COVERAGE.md](docs/M3-COVERAGE.md). Arithmetic differences are reported in
that matrix's linked method documents; availability does not imply universal
bit parity or completed WordPress integration.

## M4 — PCA sur sources segmentées

`colors.pca` est disponible pour les JPEG segmentés avec les mêmes paramètres
et des résultats `layout:'surface'`. Base globale mise en cache, rendu complet
sans réduction, stockage adaptatif et annulation entre blocs. Le contrat B et
les limites sont décrits dans `docs/PCA-SEGMENTED-M4.md`.

## M4 — Wavelet Threshold segmenté

`detail.wavelets` sur JPEG segmenté conserve les59 ondelettes, cinq seuils et
coefficients globaux ; rend une surface pleine résolution et réutilise la
 décomposition entre réglages. Contrat et limites : `docs/WAVELETS-SEGMENTED-M4.md`.

M4 segmented `noise.blocking`: original JPEG grayscale, cached global db8 detail,
RGB result surface and paged `float64-table` noise grid. See
[blocking memory/API contract](docs/BLOCKING-SEGMENTED-M4.md). Table pages are
`block_row,block_col,noise`; release noise table and RGB surface independently.

`loadBlob` accepts optional `layout:'auto'|'segmented'` (default auto). Explicit
segmented layout currently requires JPEG and exposes the same qualified
segmented-operation list. Wavelet Threshold and Wavelet Blocking use useful
complete-axis strip workers under the existing shared compute/memory profile;
no user calibration occurs. Per-stage low-memory execution can remain local.

Segmented `detail.frequency` returns low `surface`, additional
`rgbSurfaces.{high,magnitude,phase}` and `tables.mask` with paged native weights.
All transforms and normalization remain global. Each result handle is released
independently. See [frequency contract](docs/FREQUENCY-SEGMENTED-M4.md).

PRNU segmented sources: `noise.prnu` accepts `loadBlob({layout:'segmented'})`
with the existing databaseId, result, ranking and export contract. Global native
Wiener/pocketfft runs in bounded complete axes; the source retains its residual
across rankings/database changes. See `docs/PRNU-SEGMENTED-M4.md` for progress,
cache/ownership and precise limits. Database fingerprints can use temporary
storage independently of the query source.

PRNU snapshot construction now defaults to progressive source/residual/mean
storage. Optional `fingerprintStorage:'auto'|'memory'|'temporary'` controls the
fingerprint stores. HDF5 import accepts an original Blob; `outputLayout:'pages'`
or automatic admission stores newly encoded HDF5 externally. Use
`createPrnuDatabaseExport`/`readExport`/`releaseExport` for independent encoded
leases that survive database unload. Await `unload`/`dispose`. Progress includes
camera/file context plus complete HDF5 read/write/hash stages. See
`docs/PRNU-PAGED-API-M4.md` for the current contract and96MP evidence.

Segmented resampling Fourier retains the existing params and geometry but returns
`surface`, `tables.magnitude` and `tables.values` instead of full numeric arrays.
Tables are Float64 frequency-grid values with row/column coordinates. Gamma and
rescale reuse the magnitude cache; identical requests lease existing results.
Read/release through the usual surface/table APIs. See
`docs/RESAMPLING-SEGMENTED-M4.md`; this is not probability-map EM.

`comparison.image` also accepts segmented JPEG source pairs (including mixed
contiguous/segmented pairs). Twenty unchanged metrics use independently admitted
global workers; normal/difference and output rendering use segmented storage.
The result has `layout:'surface'`, one RGB surface and the existing scalar
`data.values/errors` JSON/CSV contract. Unloading either image invalidates paired
result surfaces. Histograms, SSIM, Sewar, SSIMULACRA and Butteraugli have bounded
external global workspaces; independent metric workers share the admitted
budget. There is no average of independently computed tile scores. Parameters
and result ownership remain in `docs/COMPARISON-SEGMENTED-M4.md`; current storage/
worker contracts and full96MP evidence are linked in `docs/M4-96MP-COVERAGE.md`.

### M4 segmented Noisesniffer

`noise.noisesniffer` accepts segmented sources with unchanged block/cell/bin/
selection parameters and views `regions`, `mask`, `distribution`. Full global
statistics, native unstable sorting and ordered region growth precede segmented
rendering. `layout: "surface"` returns a source-coordinate RGB surface plus small
metadata/numerics. Statistics are cached by block size; analysis by parameters
excluding view. Published surfaces retain their analysis independently of cache
replacement. No resolution reduction or independent-region segmentation.

`readNpz({surfaceId, revision, offset=0, length=262144}, hooks)` prepares the native
NPZ archive on first request and returns bounded byte pages (maximum 1 MiB) with
`nextOffset`, `totalBytes`, `done`, MIME and bytes. First-request CRC computation
is actual requested export work, cancellable with progress. Concatenate pages
in offset order for the archive. Native mask, BGR distribution, float64 cell
counts, int64 selected IDs, metadata and browser provenance are preserved.
Release the surface or unload its source to release the export. `exportResult`
continues to handle JSON; synchronous whole-array NPZ is for contiguous results.
See `docs/NOISESNIFFER-SEGMENTED-M4.md` for memory limits and evidence.

### M4 segmented stereogram

`various.stereogram` keeps modes0–3 and the native global period/Farneback
method. Detected periods return a cropped-pair RGB surface and mode2/3 also
`tables.flow` (row,column,horizontal_disparity; native float32 represented exactly
in float64 table pages). `data.comparedBounds` links both original source crops.
No period returns `layout:'none'`, no surface, and `data.detected:false`.
Search/pattern/lazy-flow/view caches and leases avoid repeating completed work.
Global Farneback pyramids/flow also have a bounded external path with native
full-frame dependencies and update order. Pattern-only modes can fit smaller
budgets. See `docs/STEREO-PAGED-M4.md` and `docs/STEREOGRAM-SEGMENTED-M4.md`;
full96MP numerical differences and display effects are recorded explicitly.

## M4 native EM and probability/composite Fourier

`tampering.resampling` now accepts stage probability/fourier, size3/5, nonoverlapping
half-open source `regions`, `fourierRegions` and existing nested Fourier params.
Maps, full composite, original-gray normalization, convergence and singularity
retain native definitions. Results are leased RGB surfaces and binary64 paged
probability/composite/frequency tables, with source-interior origins and FFT
geometry. See `docs/RESAMPLING-ANALYSIS-M4.md` for exact params, rendering, exports,
progress, ownership and cancellation. Existing standalone original-gray Fourier
is unchanged. Region workers and temporary storage are admitted under one budget;
no user calibration, independent tile fitting or authenticity verdict.

`jpeg.recompression` supplies the historical 101-quality (0–100) raw grayscale loss curve and CSV export, separately from `jpeg.multiple`. It shares original-image losses with `jpeg.quality`. See [JPEG-RECOMPRESSION.md](docs/JPEG-RECOMPRESSION.md) for units, cache, worker cancellation and current contiguous-source limits.

`ela.biomes` supplies native ELA cell profiles, content-matched peers, background and one/64-phase Ghost evidence, seeded cell labels, JSON and NPZ. Threshold/minimum changes reuse prepared scores; pixel-energy controls remain under `ela.energy`. See [ELA-CELLS.md](docs/ELA-CELLS.md) and [SEGMENTED-ELA-BIOMES.md](docs/SEGMENTED-ELA-BIOMES.md) for source coordinates, defaults, admission, cache and rendering limits. Segmented JPEG/PNG/TIFF providers preserve the native cell/background/Ghost pipeline; scientific grids still have explicit RAM admission.

PNG loading includes packed gray/palette depths, Adam7 and EXIF orientations1–8 with native RGB conversion; see [PNG-FORMATS.md](docs/PNG-FORMATS.md). PNG remains a contiguous-memory path.

Derived encoded-byte exports: `deriveOriginal({imageId,patches},hooks)` returns an owned Blob and edit/provenance report. Original-coordinate patches never mutate loaded sources or caches. See `docs/ORIGINAL-BYTE-ENGINES.md` for ranges, memory, cancellation and B editor contract.

C2PA: `metadata.c2pa` validates original bytes in an isolated browser worker with offline SDK0.91 policy and local PEM anchors. Integrity/signature/trust remain separate. Embedded manifests only; sidecars unsupported. See `docs/C2PA.md` for states, memory ceilings, report differences, cancellation and exports.

Segmented JPEG sources now support `jpeg.recompression` and `jpeg.quality` through global scanline compression/decompression and shared quality-scalar caches. One global stream per useful quality, adaptive parallel32MiB workers or bounded32–128MiB serial fallback, native dimensions and parameters, no full grayscale/reconstructed arrays. See docs/JPEG-RECOMPRESSION.md.

`inspectHeaders({blob,name?,mime?,lastModified?},hooks)` inspects JPEG/PNG/classic TIFF/BigTIFF without pixel decoding, codec initialization or source registration. JPEG reads its marker prefix; PNG visits chunk headers and EXIF while skipping pixel/compressed ancillary payloads. TIFF/BigTIFF visits directory tables and exposed metadata values by original offset, skipping strips/tiles and undefined payloads under metadata admission. No SHA256 is invented. See docs/HEADER-INSPECTION.md.

`inspectMetadata({blob,mode:'dump'|'location'|'headers'|'thumbnail',name?,mime?,lastModified?},hooks)` runs actual ExifTool13.55 before pixel decode. Loaded sources expose the same modes through `metadata.exiftool`. Complete numeric JSON, native HTML and binary thumbnails, explicit composite GPS policy, isolated offline worker, bounded memory/output and cancellation. Virtual filesystem facts are separated from original metadata. See docs/EXIFTOOL.md for B's contract and qualified limits.

Classic TIFF admission includes bilevel/CCITT, palette8, white-is-zero8/16 and native planar/alpha variants. Tag258 absent means source depth1. Tiled inputs use a bounded mapped decoder worker; float32 remains an explicit refusal; see docs/TIFF-FORMATS.md and its native corpus.

Standalone BigTIFF uses the same header/load APIs with `bigTiff:true` and provenance `container:BigTIFF`. Structural 64-bit integers outside the safe Number range use `{integer64:string}`; unsafe offsets/counts are rejected. Container parity is qualified on bounded files, not giant-source storage. See docs/BIGTIFF.md.

Static PNG now has a bounded libpng row decoder for `loadBlob`, with segmented
RAM or temporary storage and exact native Adam7/EXIF RGB. See docs/PNG-STREAM.md
for read windows, memory, cancellation, source properties and qualification.

TIFF/BigTIFF `loadBlob` falls back to a bounded native strip/tile decoder and
segmented RAM/temporary storage. Original source blocks and native TIFF orientation
semantics are preserved. `layout:segmented-strips-tiles`, format:tiff, block/heap/read
metrics and unchanged RGB surface APIs are documented in docs/TIFF-STREAM.md.
Two22MP sources match native RGB and all six hashes under96MiB in Chrome OPFS.
Single blocks that exceed the bounded decoder heap remain explicit refusals.

`exportSurface({surfaceId,revision,format:png,compression:6,maxBytes?},hooks)`
creates an owned full-resolution PNG from RGB8/mask8/RGB-flags8 surfaces, using
native bands and bounded output storage. `readExport` returns owned pages (default
1MiB, maximum4MiB); `releaseExport` removes the artifact. Exports survive source
unload and are removed on engine disposal/cancellation. `pipeRasterExport` sends
pages to a caller-provided WritableStream with backpressure and automatic release.
Only surface bytes are encoded; original metadata and signatures are not copied.
See docs/RASTER-EXPORT.md for memory, errors, provenance and Chrome evidence.

Segmented `ela.classic` returns an owned RGB surface, using one global JPEG
recompression through external bounded storage and the existing exact tone lookup.
Two completed qualities per source are cached across render controls; no partial
result is published. Use readPixels/exportSurface/releaseSurface. Phases are
jpeg-encode, jpeg-render and complete. See docs/SEGMENTED-ELA.md for native evidence,
cache/storage limits and the other ELA/Ghost/ZERO work still remaining.

Segmented `jpeg.ghosts` preserves native global phase/quality calculations and
returns the existing float64 grids and RGB block previews. includeOriginal uses
`data.originalSurface` plus a borrowed original layer instead of full RGB copying.
Quality subsets reuse cached block planes; palette changes reuse the owned analysis.
Grid memory is explicitly admitted. See docs/SEGMENTED-GHOST.md for cache, coordinates,
64MiB/22MP native evidence and the remaining parallel/grid-storage limits.

Segmented `jpeg.zero` now preserves global votes/regions/closing and returns lazy
RGB surfaces plus four binary mask surfaces. Views0–4 reuse one completed source
analysis; missing toggle, source unload and independent surface ownership are
explicit. Scientific int32/float64 arrays are expanded only while writing paged
NPZ through `exportSurface({surfaceId,revision,format:'npz',storage:'auto'})`.
`readExport`/`releaseExport` also serve NPZ, with an owned artifact that survives
source unload; `exportResult` NPZ directs segmented callers to this API. ZIP32 and
shared-budget limits remain explicit. See docs/SEGMENTED-ZERO.md for native tests,
phase/cache/cancellation semantics, memory and browser qualification limits.

## Segmented ELA energy

`ela.energy` now executes the full native scientific chain on segmented sources.
Results use seven `planeSurfaces` (`float32` energy/scores, `int32` scopes/labels),
`readPlane` windows and progressive NPZ through `exportSurface`. Regions, panel
summaries, profiles and metadata keep the contiguous contract. Live scientific
handles retain results across parameter/cache changes. See
[SEGMENTED-ENERGY.md](docs/SEGMENTED-ENERGY.md) for types, ownership, exports,
progress, memory and qualification limits. The primary surface aliases the low
score plane; release distinct surface ids once.

## Segmented embedded thumbnail analysis

`metadata.thumbnail` accepts segmented sources and returns the resized RGB
thumbnail as `surface` and its absolute difference as `rgbSurfaces.difference`,
with exact extracted bytes and decoded miniature in data. Native ExifTool
selection, cache ownership, PNG exports and memory limits are detailed in
[THUMBNAIL-API.md](docs/THUMBNAIL-API.md). Absence returns no surfaces.
`loadBlob` additionally accepts optional `layout:'segmented'` to select the
qualified source adapter explicitly; default/`'auto'` behavior is unchanged.


## Integrated automatic operations (0.31.0-integration.2)

`analysis.complete` and `analysis.clones` are callable through the common worker.
See AUTOMATIC-RUNTIME.md for explicit resource loaders, group MODEL_UNAVAILABLE
states, retained analysis identity, filter/view updates, numeric/RGB layers and
independent paged exports. This supersedes earlier unavailable-operation notes.
The >=94 MP complete composition target is pending; no large-source success is
implied by operation availability. Scientific ZIP64 is shared across M1/M5, M2
and Noisesniffer through scientific-zip.js; small ZIP32 archive bytes stay exact.
The final WordPress acceptance recipe is WORDPRESS-AUTOMATIC-RECIPE.md.

## M1.31 — repaired VIG bundle

`mgcfdn-vig` requires `mgcfdn-vig-native-order-v1`, with immutable external
backbone metadata511parameters and an unchanged ONNX tail. It exposes the same
segmented source/zone, owned plane, cache-only view and paged NPZ API. Old full
ONNX identity is refused; CPU only, native256 input and strict >.5 decision.
Useful convolution workers have fixed64MiB heaps and share transport admission;
all backbone helpers are disposed before the512MiB tail. Execution reports
`convolutionWorkerMaximumBytes` and `observedConvolutionWorkers`. The complete
chain has exact masks on its corpus, not bit-exact continuous probabilities.
See [VIG qualification](docs/VIG-NUMERICAL-REPAIR.md); historical unavailable
statements above are superseded only for this identity. Additional devices and
WordPress integration remain separate. GPU/inter-zone follow-up belongs to M1,
shared integration to M5.

## Integration.4 — stored JPEG curves and physical OPFS shards

Large segmented jpeg.recompression/jpeg.quality now store encoded grayscale JPEG streams outside WASM, retaining native scalar cache keys and global arithmetic. Shared budget selects useful quality workers immediately, with real serial streaming fallback. OPFS logical arrays split into at-most1GiB physical files, preserving caller offsets and scientific ZIP64 layouts. Allocation and I/O counts are verified; actual storage refusal remains an error. See OPFS-LARGE-ARRAYS.md and M5-LARGE-SOURCE-COVERAGE.md for96MP coverage and private-context limits.

## M1.32 — independent CPU zone execution

MGCF base,16,MPDN,EffNet and ST may execute distinct rectangle jobs concurrently.
The planner uses actual jobs, CPU capacity and the shared memory budget. Each
ONNX session remains single-threaded; CMSeg/TNT/VIG internal pools and the MPDN
GPU session are not multiplied. Bounds, native input dimensions, models, numeric
precision, thresholds, result order and mask semantics remain unchanged.

`execution.independentZones` exposes requested/observed active zone jobs,
`memoryBackoffs` and `internalThreadsPerWorker`. Observed zone jobs include
preparation; they are not a measurement of CPU core occupancy. `zoneWallMs` is
elapsed preparation/inference time; accumulated stage times can overlap.
Idle sessions remain reusable unless their reservation prevents the requested
segmented result from fitting RAM; `projectionReleasedSessionBytes` records
reservations released for that projection. Exact duplicate bounds share a grid.
Memory pressure drains active jobs and retries unfinished jobs serially. A
single-job refusal stays explicit. Cache-only views never initiate inference.
Provenance and scientific exports preserve this execution metadata.
See [measurements and coverage](docs/NEURAL-INDEPENDENT-ZONES.md).

## M1.33 — VIG hybrid with shared assets

The existing VIG native-order bundle also supports `webgpu`: only its ordered
convolutions move to GPU, with graph decisions/GELU/decoder on CPU. The pinned
model identity and weights are unchanged. `gpu.sharedAssets:true` configures the
GPU path from the existing CPU URL; `auto` checks capabilities and its staged
memory requirement, without probing an inference. Explicit CPU remains available.
Execution declares `webgpu-cpu`, a64MiB explicit GPU-buffer ceiling, observed
buffer capacity and transfer bytes. Small-corpus GPU/CPU probabilities are byte
identical; the actual positive96MP GPU source/ROI/output/NPZ path is independently
qualified. See [VIG GPU evidence and boundaries](docs/VIG-GPU.md).


## Integration.6 — paged automatic PatchMatch

The automatic Extended PatchMatch profile consumes an original segmented source,
including M4 paged detail/guides and full scientific field stores. Shared NPZ
snapshots preserve native types and array shapes; dense disposal completes before
source leases are released. M3 classical methods outside Panels/XFeat consume
original rows. Automatic SIFT Panels+Text and D2 entry assembly still use admitted
RGB. These changes do not declare the full>=94MP composition qualified.

## M1.34 — CMSeg generalization hybrid and96MP coverage

The existing generalization v2 bundle now supports `webgpu` using the same
verified CPU assets (`gpu.sharedAssets:true`); `auto` selects by capability and
shared memory admission. `cpu` remains explicit. Only ordinary convolutions move
to ordered float32 GPU; native Winograd, global correlations and ONNX stages are
unchanged. Addnoise retains CPU. There is no new resolution/precision/threshold.

Execution metadata records `webgpu-cpu`, a64MiB explicit GPU-buffer ceiling,
observed capacity and transfer bytes. ROI jobs remain serial around bounded
internal correlation workers. Actual CPU and GPU96MP recipes include two large
regions, the full envelope, cache projection and complete four-plane NPZ; their
source-coordinate plane hashes match. This is not WordPress or universal-device
qualification. See [CMSeg GPU evidence and boundaries](docs/CMSEG-GPU.md).

## M1.35 — TNT hybrid and remaining neural96MP paths

The existing TNT native-order v1 bundle now shares its CPU assets with `webgpu`.
Only its ordered linear layers move to GPU, preserving channel32 bias order;
patch extraction, normalization, attention, GELU and decoder remain CPU. `auto`
uses capabilities and the shared budget, with explicit CPU retained. Metadata
and NPZ report `webgpu-cpu`,64MiB explicit-buffer ceiling and observed transfers.

TNT's full GPU probability hashes match its CPU corpus; complete CPU/GPU96MP
maps, cache views and exports are qualified separately. Additional immutable
M1.34 recipes cover MPDN GPU, VIG CPU and addnoise CPU96MP. See
[TNT GPU evidence](docs/TNT-GPU.md) and [the memory-path coverage table](docs/NEURAL-96MP-COVERAGE.md)
for exact proof versions, shared-adapter reuse and limits. These are full-source
engine proofs, not WordPress cohabitation or physical-device certification.

## M1.36 — budgeted reuse of verified GPU parameters

VIG, TNT and CMSeg generalization GPU reuse verified parameters fetched by real
work, within the shared budget and only for the current model session. There is
no preload, persistent cache, new precision or changed CPU path. Idle entries
are reclaimable before raw analysis grids; their insertion never evicts a result.
CMSeg still admits its useful correlation workers using this recoverable memory.

`execution.parameterCache` adds current-operation `hits`, `misses`, `hitBytes`,
`fetchBytes`, `evictions`, plus historical `sessionPeakResidentBytes`. Duplicate
zones do not double-count. Cache-only projection reports zero current work.
These fields follow existing execution provenance into NPZ. ONNX session reuse
is unchanged in this increment. See [measurements](docs/NEURAL-PARAMETER-REUSE.md)
and its delivery binding for API, pressure and96MP evidence.

## M1.37 — reclaimable GPU model sessions

VIG/TNT tails and CMSeg generalization bypass/decoder sessions may remain warm
during an independent GPU backbone. Their existing512MiB heap reservations
remain within the shared budget and can be evicted while idle; active dependent
RPC/correlation stages explicitly protect their session. CPU backbone admission
keeps its previous retirement policy. No inference is run for calibration.

`execution.sessionCache` records current-operation model-worker `creations`,
`reuses` and `pressureEvictions` with `enabled:true`. Cached views report zero
events; duplicates do not multiply them. Execution provenance and NPZ carry
these values. This optimization is measured separately from M1.36 parameters;
see [session evidence and limits](docs/NEURAL-SESSION-REUSE.md).


## M1.38 — measured TNT outer attention and positive D2PRL96MP

TNT's GPU/hybrid route now executes the two outer attention matrix products on
its existing ordered GPU device. Small inner attention matrices remain on CPU:
offline paired measurements found their layout/transfers slower on GPU. Complete
FMA reductions, normalization, softmax, GELU, model assets and native256 inputs
are unchanged. Explicit CPU retains the existing arithmetic; no user calibration
or device-brand selection is added.

TNT execution metadata adds `attentionBackend` (`webgpu-outer-wasm-inner` or
`wasm-cpu`); `timings.attentionMatmulMs` includes all attention products and their
staging/layout/transfers, not just GPU kernels. These follow result metadata into
NPZ; cached views perform no attention work. See [TNT evidence](docs/TNT-ATTENTION-GPU.md)
and its exact delivery binding for component,96MP and copied API qualification.

The unchanged D2PRL M1.37 runtime now has positive96MP CPU and GPU proofs with two
large ROI plus the full envelope. Six source-coordinate planes are native-exact
in both views and both complete NPZ archives pass independent NumPy readback.
Raw residual tensor errors remain declared separately from final decisions.
See [the source and measurements](docs/D2PRL-96MP-RICH.md); the historical empty
large-source proof remains available. These engine proofs do not establish
shared WordPress cohabitation or qualification on additional physical devices.


## M1.39 — VIG graph dot products on the shared GPU

The VIG hybrid route uses the same GPU device for convolutions and the 640-term
ordered graph dot products. Each reduction remains complete. Native WASM
normalization and norm sums, float32 distance postprocessing order, TopK ties,
dilation and max-relative gather are preserved. Assets, resolution and thresholds
are unchanged. Explicit CPU keeps the original WASM distance implementation.

VIG execution metadata adds `graphDistanceBackend` (`webgpu-dot-wasm-postprocess`
or `wasm-cpu`); `timings.graphDistanceMs` measures distance formation, including
GPU layout, transfers, readback and float32 postprocessing, excluding unchanged
normalization and neighbor selection. The same provenance reaches paged NPZ;
cached views perform no new distance calculation. No user calibration is added.
See [operator, model and full-source evidence](docs/VIG-DISTANCE-GPU.md).


## M1.40 — streamed global CMSeg correlation

CMSeg generalization's hybrid route streams complete ordered GPU dot-product rows
for its128×128 feature level. Two passes still cover every global pair. Native
CPU normalization, Gaussian suppression, both distinct softmax-axis arithmetic,
sorted TopK and the two smaller correlations remain unchanged. Work overlaps one
GPU job with bounded single-thread CPU postprocessing jobs under the shared
budget. No quadratic matrix is retained. The explicit CPU route is unchanged.

`execution.correlationBackend` is `webgpu-dot-128-wasm-rest` or `wasm-cpu`;
`timings.correlationGpuMs` is the complete largest hybrid correlation stage,
including its CPU work, staging, transfers and GPU readback. `correlationMs`
still covers all three stages. Cached views perform no new correlation work;
provenance reaches the independently owned paged NPZ. Backbone and correlation
GPU devices are created sequentially, with at most one active device. See
[correlation evidence and resource limits](docs/CMSEG-CORRELATION-GPU.md).

## M1.41 — shared-model MGCF16 and EffNet hybrid execution

MGCF16 and the repaired EffNet graph use their identical pinned CPU assets in
the bounded ONNX WebGPU/WASM worker. `auto` selects by capabilities and budget;
explicit CPU and CPU zone concurrency remain available. No model conversion,
threshold/input/precision change or startup probe is added. GPU512MiB and
WASM512MiB reservations remain coordinated with source, projection and exports.

MGCF16's declared corpus masks are exact. EffNet's positive corpus changes one
threshold pixel with probability error below4.2e-6, preserving its two connected
components; this difference is declared by the GPU model's `numericalParity`
and propagated into result/NPZ `kernelParity`. Continuous and decision errors
must be interpreted separately. Base MGCF and source/target GPU candidates remain
unavailable after bounded allocation refusal. See [measurements, full-source
coverage and limitations](docs/MGCF-ORT-GPU.md).

## M4 current large-source and pixel contracts

`docs/M4-DELIVERY.md` indexes every M4 family; `docs/M4-96MP-COVERAGE.md`
distinguishes completed whole-source qualifications from still-running recipes.
The original smaller-corpus statements above are historical, not new claims
that external paths remain unavailable. Stores preserve global algorithms and
native coordinates; no source is silently resized to satisfy a budget.

`colors.plots` supports paged full RGB/HSV tables, and the paged WebGL renderer
visits every retained point under its own buffer budget. Camera/style changes
reuse numeric data. Complete SVG/PNG/NPZ exports are available; see
`docs/PLOTS-SEGMENTED-M4.md` and `docs/PLOTS-RENDERER-M4.md`.

The seven M1 pixel tools consumed from pinned225eab8 expose their existing params
through surface results on large sources. Parallel strips, source-owned temporary
caches and full-region magnifier histograms preserve native values. See
`docs/PIXEL-STREAM-M4.md` for IDs, progress, cache invalidation, cancellation and
independent PNG export lifetimes. `exportSurface` defaults to external encoded
storage when its source surface is external; optional `storage:'auto'` or
`'temporary'` selects explicitly. The shared M5 export registry must be merged
once, retaining its other scientific format extensions.

Six dense CM2 profiles use `DenseCopyEngine` with the injected M3 geometry
adapter. Full paged descriptor/field/coherence/detail paths and search provenance
are documented in `docs/DENSE-PAGED-M4.md`; `exportDenseNpz` uses the shared ZIP64
scientific writer and owns an archive independent of its source/engine. Its full
arrays are evidence, not an assertion of forgery. PatchMatch D2PRL is a separate
M1 implementation and is not replaced by these dense profiles.

## M1.42 — bounded MGCF base/ST two-stage mirrors

Base and ST now accept separate pinned GPU manifests with two external child
graphs. Original CPU mirrors remain unchanged. The full encoder feature boundary
is preserved; base uses WebGPU/WASM for both stages, ST keeps its head on WASM
after the GPU head failed numerical qualification. Both sessions and complete
assets/bridge allocations share the existing budget; the GPU ceiling stays512MiB.
No resolution, precision, threshold or startup calibration changes.

GPU manifests require `gpu-split-bundle.json` and its sibling encoder/head files;
they cannot reuse the CPU ONNX URL. `execution` records `onnxStages:2`,
`stageBackends` and `intermediateBytes`; `timings.encoderMs`/`headMs` include
readback and completion fences. Existing cache-only views perform no inference.
Base declares continuous probability tolerance1e-3 via model/result/NPZ parity;
native corpus masks are exact. ST probability/role tolerance remains1e-4 with
exact masks. These tolerances never apply to binary decisions. Explicit CPU and
CPU independent-zone concurrency remain available. See [evidence and limits](docs/MGCF-SPLIT-GPU.md).

## M1.43 — idle hybrid residency yields to large projections

Segmented projections can retire their generic ONNX hybrid worker, just as they
already retire CPU workers, when full result planes plus the existing staging
margin do not fit alongside its idle reservation. Native grids, prior results
and scientific outputs remain intact. Sessions stay warm when the plan fits;
new useful inference reloads a retired model. CPU/GPU selection is unchanged.
Existing `execution.projectionReleasedSessionBytes` records the released capacity
and follows the result into NPZ. [Actual96MP storage and timing evidence](docs/NEURAL-PROJECTION-RESIDENCY.md)
distinguishes this gain from the independent CPU/GPU zone comparison.

## M1.44 — useful ST CPU zone preference

MGCF ST `auto` prefers CPU when three distinct zones can run on three admitted
single-thread CPU lanes. This model's hybrid head is itself CPU; the preference
follows the measured multi-zone costs. Selector and scheduler share the capacity
calculation and count own idle sessions as reclaimable, preserving stable warm
selection. Source/other owners remain charged. Explicit CPU/GPU and cached-view
backend choices are unchanged. Other models retain their existing policy.

The existing `backendSelection` provenance/NPZ reason can now be
`parallel-cpu-zones-fit-preference`; actual execution still reports CPU and its
observed lane count. No calibration, scientific parameter, model identity or
precision change. [Selection and integration evidence](docs/ST-AUTOMATIC-PLACEMENT.md)
states the scope of this measured preference and reused96MP paths.

## M1.45 — CMSeg addnoise hybrid global correlation

Addnoise can use the same pinned CPU bundle and child ONNX assets for its new
hybrid route (`gpu.sharedAssets`). Its ONNX encoder and decoder stay on CPU.
Only the largest full-global dot stage uses resident-input ordered GPU FMA;
addnoise normalization, native Gaussian/softmax/TopK and both smaller
correlations stay CPU. Native input size, thresholds and precision are unchanged.
`auto` uses existing capability/budget checks; explicit CPU remains available.

`execution.correlationBackend` adds `webgpu-resident-dot-128-wasm-rest`.
The existing correlation timing, session reuse and GPU buffer fields reach
result/NPZ provenance. Cached views perform no inference. Native corpus masks
are exact while probability bytes differ; the declared continuous tolerance
remains 1e-4. The new complete 96 MP source-to-NPZ path and measured budget-
dependent costs are documented in [addnoise evidence](docs/CMSEG-ADDNOISE-GPU.md).

## M1.46 — generalization retains its GPU correlation input

CMSeg generalization now also retains the complete normalized GPU tensor across
both passes of its largest global correlation. Its own FMA normalization and
CPU postprocessor stay unchanged, as do the two smaller CPU correlations and
model assets. `gpu.residentCorrelation:true` identifies the execution policy;
`execution.correlationBackend` uses `webgpu-resident-dot-128-wasm-rest` in
results and NPZ. Explicit CPU and addnoise's M1.45 route are unchanged.

All corpus probabilities retain the previous CPU/GPU hashes; native mask
decisions remain exact. [Measured costs and complete-source evidence](docs/CMSEG-RESIDENT-CORRELATION.md)
separate tensor retention from earlier backbone and correlation changes.
