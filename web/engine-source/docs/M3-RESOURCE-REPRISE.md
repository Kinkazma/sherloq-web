# M3 resource continuation

## Budgeted matches and index pages

The historical30,000point check was a resource guard, not a scientific setting.
Selection and both native Hamming entry points now accept the admitted point
population. Ordered row matching and native equal-distance sorting are unchanged.
On a genuine native allocation failure, the useful batch halves down to one row;
a complete row still has to fit its actual WASM heap. GPU batch size respects
storage/dispatch limits and shared admission, with CPU retained. No calibration.

`TypedPages` replaces boxed correspondence/index accumulation with numeric pages.
Pages shrink when admission fails. Final arrays preserve the existing owned-array
API, and staging reservations are released when consumed. The100,000pair limits
in G2NN, spatial matching and learned matching, the256MiB Hamming result limit,
and the128MiB grouping index guard are removed. Explicit caller `maxPairs` remains
an opt-in refusal, never a truncation. G2NN sorts globally by zone/endpoints,
keeps the last score for duplicates, and retains overlapping context provenance.
Spatial results retain native candidate order within every context. Learned
candidates no longer have6,000point or4,000,000edge guards; the complete graph
must still pass actual runtime and memory admission.

This is an incremental delivery: final arrays, global extraction and several
WASM/neural spaces are still contiguous. Paging accumulation is not a claim of
out-of-core inference. Source/preparation/render/export continuation remains active.

## Evidence

-31targeted Node tests pass, including existing native G2NN/spatial/Hamming oracles.
-30,001historical points survive selection and start useful Hamming processing;
  cancellation after the first64queries releases all task reservations.
-G2NN:104,000unique pairs over8,000contexts, exact endpoints/scores/owners.
-Spatial:202,050pairs across two contexts, complete and identically ordered.
-Historical grouping:17,230,800indices, every row/index checked, under200MiB.
-3learned candidate tests:6,001points,4,006,002directed edges, native mutual/tie
  ordering. These are graph construction tests, not large-network inference claims.
-2historical primitive/resource-retry checks retain native results.
-Chrome:24ordered Hamming CPU/GPU comparisons agree. A4,096point constrained
  run uses8query rows,983,040admitted bytes, exact distances and zero final bytes;
  see `m3-hamming-webgpu-proof.json`.

An old full ORB fixture expected rejection at the removed ceiling; its unbounded
regression run was stopped locally, and that stale expectation now checks bounded
cancellation after useful detection. The entire historical pipeline corpus was
not rerun for this lot. No measured speedup or universal numerical guarantee is
inferred from these checks.

## Global G2NN with bounded training staging; geometric population limits

G2NN now falls back from global staging admission to bounded CPU staging. Each
query batch visits every training block in the same search context. Integer
squared top-four states survive block boundaries; float32 square roots, ratio,
last-value deduplication and final global ordering are unchanged. Context id lists
are built one context at a time. The original admitted CPU/GPU path remains the
fast path; explicit GPU selection still reports an inability to fit that path.
Compute staging is dropped before consolidating the final result arrays.

18tests pass, including all existing native G2NN oracles through both paths.
A9,001point control with a6MiB matching-workspace budget forces real training
blocks and matches the global path in every pair, owner and comparison count.
The borrowed original points/descriptors belong to the caller's input budget;
the6MiB figure is not process RSS or total source memory.

Geometric fit, hull and rendering population checks no longer reject100,001
points/rows merely by count. Actual WASM allocation remains bounded/admitted,
and fit/hull out-of-memory errors are identified. The2,000model guard is replaced
by existing termination through exhaustion of inlier matches; no RANSAC setting
or model condition threshold changes.16geometry tests pass, including a real
100,001point Homography/global hull and2,001independent verified models. Existing
native groups and self-copy decisions remain concordant; no extra numerical
latitude was needed for these changes.

## Research models: original96MP and native fixed grids

SAFIRE, FOCAL and AdaIFL now consume qualified source rows directly. Their existing
native1024 input reduction is preserved (OpenCV integer bilinear for FOCAL/SAM,
Pillow22-bit separable bilinear for AdaIFL); this is not an additional reduction.
Only support rows and the12MiB NCHW input are resident during preparation. The
10 small/rectangular/portrait preparation cases are float-for-float identical to
native, as are the three preparations from the rich12000×8000 source. Network
stages and CPU/GPU choices are unchanged; prior floating-arithmetic qualifications
still apply, without claiming a new native neural oracle on the96MP source.

Segmented research results expose `layout:'surface'`, a full-resolution RGB
`surface`, original-coordinate layers, native arrays in `data`, and unchanged
`style`/`legend`. `readPixels` materializes only requested windows; `exportSurface`
accepts PNG or native-grid NPZ, with temporary OPFS storage available. `exportResult`
keeps its existing native-array contract. Map/overlay changes reuse inference.
Private retained grids make surfaces independent of transferred public arrays and
inference-cache eviction. `releaseSurface`, image release and model unload retain
the existing lifetimes. The adapter/index and the additive `m3Research` branch in
`raster-export.js` are common-file changes for the integration owner to merge.

The fixture is public deterministic RGB noise with two distant cloned patches
(one mirrored), encoded as JPEG90; it is neither an empty source nor a crop.
Browser scripts consume the original12000×8000 image. Proof JSON records backend,
source storage, shared memory peak, actual stage runs, elapsed times, views and
exports. FOCAL's full PNG was independently compared with OpenCV native nearest
resize/INFERNO/addWeighted: all288,000,000 RGB bytes agree. Every NPZ is opened
with NumPy without pickle and preserves the original8000×12000 metadata. The
shared raster/export path is exercised fully by FOCAL; AdaIFL and SAFIRE exercise
their different raw arrays and native preparation/inference paths.

This qualifies the recorded research paths only. It does not qualify classical
or learned sparse extraction at96MP, nor complete UI integration. Those memory
paths remain separate work, especially SIFT pyramids and dense XFeat activations.

## ALIKED source rows and sparse global rendering

Both ALIKED checkpoints (standard/rotation) share the new source-row preparation.
It evaluates the original Gaussian antialiasing and bilinear sampling at the
columns actually consumed by the native1024-longest-side grid. Gaussian kernels,
reflected global edges, float32/FMA order and localization coordinate mapping are
unchanged. Six targeted tests include five float-for-float native comparisons and
failure/admission cleanup. Existing CPU/GPU pipeline oracles still have identical
pair identities, groups, owners and RGB; reported pair-coordinate residuals stay
at their previously measured ~6.1e-5. LightGlue consumes the same features; its own
large candidate-network workspace is a separate qualification, not implied here.

The public large-source test uses12000×8000 pixels of multiscale texture, colored
rectangles and original-resolution noise, with an entire6000×8000 half copied at
dx6000. Explicit parameters set radius20000 and biome tolerance600, in original
pixels, to exercise distant matches and grouping at this resolution. The ordinary
50px tolerance left no sufficiently populated biome in the first development
attempt; no detector resolution or extracted population was altered to compensate.

ALIKED extraction consumes all8000 rows and prepares[1,3,682,1024]. Its row-filter
heap was16MiB actual under a43.45MB admission. The former >2GiB contiguous
preparation refusal is gone. Full global sparse drawing remains native OpenCV:
its heap is admitted from the actual image/population size, separately after
inference, and the result is stored in common segmented RGB storage. At96MP this
still materializes the source and drawing once; it is not an out-of-core rasterizer
and requires enough shared budget for that render. Subsequent windows and complete
PNG export read the stored result; they do not refit geometry. NPZ remains available
through `exportResult` with the existing native sparse arrays/JSON contract.

The recorded96MP WebGPU case produced1932 points,55 pairs,2 retained groups in95.2s
including decoding, changed view and full exports, with3.051GB peak accounted under
6GiB. Full PNG91.0MB plus NPZ665KB are checked. The independently reconstructed native
render from exported point/pair data agrees on every288,000,000RGB byte. This checks
the rendering/export path, not a second native neural inference. The source, model
cache and result surfaces all release to zero. Proofs separate the backend runs.

The96MP CPU run also passes:1932points/55pairs/2groups,82.1s end to end and2.851GB
accounted peak. CPU and GPU complete PNG hashes are identical. Separate JSON lists
continuous point/pair differences and equality of discrete decisions. These are
single development runs, not a controlled backend speed comparison.

## Historical group population and cooperative scheduling

Large historical BRISK/ORB/AKAZE groups can use an endpoint spatial index. Both
endpoints are indexed; a native-accepted group relation necessarily visits one of
the queried cells. Candidate rows return to ascending original order before the
same four exact norms, displacement filter and reverse-duplicate predicate run.
Index admission can fall back to the old direct path. It does not partition the
search or suppress a distant clone: distance between clone endpoints is unchanged.

All native geometry primitives plus direct/indexed reversed/duplicate/boundary
cases agree. A100000-match field retains199900 ordered indices while visiting149800
candidate rows instead of4999950000; workspace peak64.86MB plus13.6MB borrowed
inputs. This test exercises the population without claiming a full96MP historical
extraction qualification. Spatial CM2 matching also yields according to elapsed
useful work (8ms) instead of sleeping every512 descriptor comparisons. This changes
scheduling only; native spatial/descriptor fixtures remain exact, and cancellation
continues to enter through real control-message checkpoints.

## Classical row input and ORB CM2 original96MP

Classical CM2 extraction now stages a grayscale plane from qualified RGB source
rows, preserving the detector-specific conversion (including Kornia-style float
conversion for SIFT+LightGlue), reflected pixel crops and independent ROI masks.
It no longer stages an original-size BGR copy in both controller and worker.
Native response selection retains the requested best K with original-index ties
before JavaScript copies points/descriptors; it reports the full detected count.
The WASM maximum is now an admitted2GiB, with useful-work adaptation and no repeat
of an identical single-worker OOM at that maximum. Native allocation failures are
distinguished from other extraction errors. This does not make the SIFT/AKAZE
pyramids paged or remove G2NN's still-open32-million scaled-input restriction.

Nine extraction reference cases retain their descriptors/members/counts; ORB and
AKAZE metadata are exact, SIFT/BRISK retain documented small angle residuals.
All22 classical pipeline cases, including positive affine results and reflected
Panels+Text, preserve pairs/groups/colors/contexts/counts/RGB; caches and cancellation
pass. Twelve learned Glue pipeline cases on CPU/GPU preserve discrete decisions
and RGB as well, covering the changed SIFT+LightGlue grayscale path.25 targeted
biome/geometry tests pass. Progress now distinguishes grouping from model fitting
and reports useful hypothesis progress rather than appearing stuck at matching.

On the rich96MP deterministic RGB-noise field with an entire half copied6000px
away, ORB CM2 detects6001 points and retains the explicit6000 limit, producing4277
pairs and3 groups. CPU end to end49.5s,2.779GB accounted peak under6GiB, actual
feature heap1.078GB. Decode, whole-image search, changed view, cache reuse, windows,
NPZ3.55MB and complete PNG197MB pass; every288-million exported RGB byte agrees with
native rendering of the exported data. Final retained/cache/reservation counts are
zero. This is the CM2 ORB path, not historical ORB's different detector settings.

The earlier multiscale repetitive field reached matching/fitting but was stopped
after a long CPU run to isolate the cost. The first full-noise extraction failed
at the old1GiB maximum; the row staging and larger admitted heap repair that actual
failure. The repetitive-field end-to-end qualification remains open; it is not
counted as a pass or silently replaced by an empty/constant/cropped input.

## XFeat bounded-backbone study (not yet a runtime delivery)

`export-xfeat-paged.py` exports the pinned real CNN after its **global** input
normalization. A development check feeds the same global normalized image to the
whole network and to globally aligned support windows (256px halo). Assembled
features differ by at most1.05e-6, reliability1.07e-7, and heat values are exact.
This is a local-backbone study, not a complete paged XFeat implementation: global
source preparation, NMS/ranking, descriptor sampling and end-to-end96MP integration
are still to implement and qualify. No patchwise normalization or local search is
substituted for them. Weights/ONNX remain external in .build.

## XFeat paged extraction, global selection and CPU reference

The previous study is now implemented in `xfeat-paged.js`. The same pinned CNN
runs on native floor32 dimensions, with256-pixel support halos aligned to32.
Every original row contributes to one global InstanceNorm. Full-image heat and
stride8 descriptors are retained in shared segmented RAM/temporary storage;
NMS crosses all core boundaries, and masks, ranking and bicubic descriptor
sampling retain the native global coordinates. Masked/zero-score candidates
remain in the global sort so equal-score ordering is not changed by early removal.
No independent-tile detection or restricted matching search is substituted.

`XFEAT_PAGED_MODEL` identifies the external2,661,632-byte graph from the same
checkpoint (`14dc0893…` ONNX). Register it as `models['xfeat-paged']` to use this
path for XFeat or XFeat+LighterGlue. The old complete `models.xfeat` resource and
CPU path remain available. When both are registered, the paged graph is selected.
The public sparse params, original coordinates, members, caches, cancellation,
views and exports retain their contract. The M3 source adapter supplies qualified
rows and its temporary-storage session; it no longer reconstructs global RGB for
this extractor. Global native drawing still has its separate admitted RGB phase.

Workers begin useful convolution immediately after global preparation, with
concurrency admitted before allocating stores. Real allocation/inference failures
can grow the WASM heap, fall back from auto WebGPU to CPU, and retire concurrency
while preserving completed cores. No runtime calibration or trial inference.
An injected allocation failure **after a real useful tile** exercises the recovery:
one concurrency reduction, unchanged1000 selected points, descriptors max7.64e-7,
all reservations released. This is a development failure-injection recipe only.

Native preparation tests cover1317×789,128×96,97×131 and cleanup. Gray max error
4.58e-5 on the0..255 scale; normalized tensor max1.91e-6. The source-coordinate
multiply-add follows the native fused rounding. Separate NMS/sampling tests include
width12000: identical points/scores, descriptor max2.98e-8. Global equal-score
ordering matches PyTorch for100 and17001 candidates. Six actual CPU/GPU extraction
cases include six overlapping windows on1317×789 with distant copied patches:
all point coordinates equal; scores max2.46e-7, unit descriptors max1.48e-6.
Six sparse CPU/GPU pipelines retain points, pairs, groups, search owners and RGB.

A real OPFS execution stores all three global arrays on disk (12,091,392 bytes),
returns the same1000 points, scores max2.46e-7 and descriptors max7.64e-7, completes
in4.79s in this shared development session, and closes/deletes every temporary
file. Final memory is zero. Preparation reads64-row leases (13 leases for789 rows)
instead of issuing one asynchronous surface read for every analysis row. Biome
construction/traversal yields after8ms of useful work without changing predicates
or traversal order; its nine existing references pass.

The96MP recipe is running separately; the small/source-window and OPFS checks
alone do not qualify it. Large Glue attention workspaces and historical/SIFT/AKAZE/
BRISK pyramids remain separate work. These changes do not assert unrestricted
image sizes, unlimited point populations, or completed WordPress integration.

The additional six XFeat+LighterGlue CPU/GPU pipelines also retain all pairs,
groups, owners and RGB. Point response max5.13e-8. First96MP WebGPU trial finishes
all analysis and rendering with6000 points and944950 matches, but no fitted group
under threshold0.3/tolerance600; the positive-group recipe therefore fails and
exports/final memory were not checked. It is explicitly not an end-to-end pass.
The next recipe uses explicit threshold0.1/tolerance300 on the same entire image;
no extraction crop, hidden population cap or changed matching algorithm.

## XFeat actual96MP qualification

Commit69e6a0b completes the public worker path on the12000×8000 full RGB-noise
source with its entire6000×8000 half copied6000px away. Explicit matching threshold
0.1 and biome tolerance300 produce6000 retained points,2162 pairs and11 fitted
groups. No crop or extra reduction: native analysis remains12000×8000, with
2,711,345 global NMS candidates preceding the requested6000-point selection.
Two WebGPU workers execute96 real cores with no retry or preflight. The three
full global arrays occupy1,152,000,000 bytes in segmented RAM;127 source leases.
Maximum observed ORT heap62,324,736 bytes per worker, native post43,515,904 bytes,
mask96,862,208 bytes. Shared6GiB budget peaks at4,723,548,678 accounted bytes.

Chrome154 completes decode, analysis, result windows, cached hide-group view,
NPZ and full PNG export in129.80s (decode2.94s). The NPZ is2,012,876 bytes; PNG
144,259,415 bytes. All288,000,000 decoded PNG RGB bytes match native OpenCV drawing
from the exported points/pairs/models, and NumPy reads the archive. This drawing
comparison is not a second96MP native CNN inference. Final active/retained/cache
bytes are zero; no WordPress deployment is implied. This is the paged XFeat
extraction memory family; large LighterGlue attention remains to qualify separately.
CPU reference and six-window CPU execution are covered by their small native
oracles; this particular96MP record used WebGPU.
