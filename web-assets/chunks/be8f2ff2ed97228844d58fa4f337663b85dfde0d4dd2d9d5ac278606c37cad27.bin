> M1.45 adds the [addnoise hybrid route](CMSEG-ADDNOISE-GPU.md) with the same
> CPU bundle, separate normalization, retained global context and new96MP proof.

> M1.30 adds [TNT CPU with native-order backbone](TNT-NUMERICAL-REPAIR.md),
> qualified final masks, bounded useful workers and segmented JPEG/NPZ.
> The original TNT ONNX identity remains rejected; VIG uses the separately pinned repaired M1.31 bundle.

> M1.28 restores CMSeg generalization with a new pinned backbone bundle and
> native-order kernels. The rejected old bundle remains refused. Read
> [the numerical repair and current identity](CMSEG-BACKBONE-REPAIR.md);
> earlier performance/corpus observations below belong to their recorded versions.

# Segmentation increment — M1 development0.30.0-m1.5

The common worker exposes **MGCFDN base40×40, MGCFDN16×16, MPDN16×16,
EffNet16×16 and source/target** as separately pinned CPU candidates. Native
global-mean arithmetic fixes the former EffNet and source/target rejections.
The original TNT graph failed masks; its M1.30 replacement is qualified separately.
Historical VIG ONNX changed-mask failures are retained; M1.31 repairs the CPU chain with a new identity.
**CMSeg-Net generalization and addnoise** have separate
bounded CPU paths with native512 inputs and global correlation. Integration into
the shared release is coordinated through Git; the immutable0.29 ZIPs remain
unchanged. MPDN also has a qualified, measured WebGPU/CPU hybrid path.
The actual WordPress recipe remains with B.

## Qualified identities and remaining numerical work

| API variant | Native feature grid | ONNX bytes | SHA256 |
|---|---:|---:|---|
| `mgcfdn-mpdn` |16×16|24005734|`d90097900a0005e19f7240ee1fd6c1f05b6ebf6fac2bc553ba2ccc01d6a5195b`|
| `mgcfdn-16` |16×16|89049900|`81efce16baa78f0383fa822918fd51f0a3843163756c6d16421065175c1d7a90`|
| `mgcfdn` |40×40|89060850|`8b99302269be19e214139b533e198f85169c3821a637a89ff93f6ab0c720b44e`|
| `mgcfdn-effnet` |16×16|74209401|`e132aa38d8c2726e1e6bc4a2e2a9760b24901757b938580f00742ea25ce569fe`|
| `mgcfdn-st` |40×40|89592572|`d7b577b68f862a43d12959291e93ecd2143d0feb4723efeb56f2bd7f941cba6d`|

The five MGCF variants preserve the native256×256 model input, strict checkpoint
load and decision rules. ST uses its native three-class softmax; the others use
sigmoid. Changing variants requires `unloadSegmentationModel()` followed by
configuration of the new exact identity. No other model is silently substituted.

The unmodified EffNet/ST conversions remain rejected. Only the repaired
`native-mean.onnx` identities above are accepted. Forty/forty-one global means
retain the native cascade addition order reused from D2PRL and CMSeg. No weight,
threshold or expected activation is substituted. See the source document
`SEGMENTATION-NUMERICAL-CANDIDATES.md` for the retained failures and corrections.

## Configuration and requested work

```js
import {createWorkerEngine} from './src/worker-client.js';
import {SEGMENTATION_MODEL_IDENTITIES} from './src/index.js';

const engine = createWorkerEngine({computeProfile: 'aggressive'});
await engine.load({id: 'image', bytes: originalFileBytes});
const model = SEGMENTATION_MODEL_IDENTITIES['mgcfdn-mpdn'];
await engine.loadSegmentationModel({
  variant: 'mgcfdn-mpdn', url: absoluteModelMirrorUrl,
  bytes: model.bytes, sha256: model.sha256,
  // Optional for MPDN: configure both mirrors to enable auto GPU and CPU choice.
  gpu: {url: absoluteGpuModelMirrorUrl, bytes: model.gpu.bytes, sha256: model.gpu.sha256}
});
const result = await engine.run({
  id: 'analysis', imageId: 'image', operation: 'ai.clones.segmentation',
  backend: 'auto', params: {variant: 'mgcfdn-mpdn'},
  regions: [{id: 'region-a', kind: 'region', bounds: [20, 20, 276, 276]}]
}, {signal, onProgress});
```

Configuration validates the pinned identity but loads no weights, WASM or neural
session. The requested job streams and checks the exact24,005,734byte ONNX before
execution. SHA256:
`d90097900a0005e19f7240ee1fd6c1f05b6ebf6fac2bc553ba2ccc01d6a5195b`.
Native checkpoint SHA256:
`9cea785aaba1612c55218f52c6bbe8c1419f3a1065b368066e8e3869a194e6ee`.
No expected activations are embedded. Native `.pth` files cannot be supplied as
these browser assets. Model redistribution rights remain separate from conversion.

The operation advertises `model-required` until configured, then
`experimental-qualified-corpus`. Base,16×16,EffNet,ST and both CMSeg variants remain CPU-only. MPDN accepts
an optional `gpu:{url,bytes,sha256}` mirror for the separately pinned graph:
24,006,373bytes, SHA256
`179a4275466aecae1e2a9d1cb5eea044eb4bd8198e87386b3fb88ba8d388ae39`.
It preserves ordered Concats by grouping at most seven inputs per node, fitting
eight storage bindings; no weights, thresholds, sizes or precision change.

With that mirror, `auto` selects the hybrid when the actual requested job has
sufficient memory eligibility and a WebGPU adapter with eight storage bindings.
Otherwise it chooses CPU and records why in `provenance.backendSelection`.
This is capability/admission selection, with no synthetic startup inference or
persistent calibration. Every allocation is still admitted under the shared
budget. `cpu` always requests CPU. Explicit `webgpu` requires the configured
GPU graph and real execution: GPU failure discards output and reports the error;
it is never presented as successful GPU after silently running the whole graph
on CPU. Hybrid provenance is `webgpu-cpu`: TopK still runs on CPU. UI should show
that distinction. Do not label it pure GPU or assume all seven variants support it.

Omit regions only for an intentional whole-image job. A present empty selection
must set `params.selectionPresent:true`, which refuses. Bounds are half-open
integer source coordinates, minimum8×8 for selected rectangles. A whole image may
be smaller. Every ROI and explicit envelope is an independent crop and inference;
there is no inferred envelope or cross-region neural context. `exclusions` must
be absent or empty and `compare` absent or false, matching the native restrictions.

## Result meaning

`data.map` is the float32 probability map in original coordinates. `data.mask`
is uint8 support. `data.analyzed` marks the active rectangles; `data.candidates`
is zero as in the native adapter. All have source width/height. Layers name the
binary mask and continuous map separately. A sigmoid model has no fabricated
source/target role arrays. The source/target MGCF variant returns its native
`target` and `source` float32 layers separately. Its raw channel order is
target/source/background, union map is `p[0]+p[1]`, and binary support is
`p[0]>=.5 OR p[1]>=.5`; summing probabilities before thresholding would be wrong.

The input is native PIL-compatible RGB8 bilinear resize to256 for MGCF or512
for CMSeg, then float32
NCHW/255. MPDN has its native16×16 feature grid; this is a named native model,
not a reduced substitute for MGCFDN base40×40. Sigmoid decisions are `p > .5` on
the native model grid. Continuous maps return through the pinned native bilinear policy;
binary masks use nearest. Overlap is maximum for probability and OR for masks.
No area filter, hole filling, D2PRL residual roles or tunable threshold is added.

## Cached views and exports

```js
const view = await engine.run({
  id: 'view', imageId: 'image', operation: 'ai.clones.segmentation',
  params: {variant: 'mgcfdn-mpdn',
    reprojectOf: result.data.metadata.analysisId, zoneIds: ['region-a']}
});
const raw = await engine.readSegmentationRaw({
  imageId: 'image', resultId: view.data.metadata.resultId
});
const npz = await engine.exportResult(raw, {format: 'npz', maxBytes: 16 * 1024 ** 2});
```

Reprojection accepts zones from the completed analysis only. Removing/restoring
an envelope uses cached grids and never infers; `CACHE_MISS` requires an explicit
analysis request. Omit `regions` and `selectionPresent` during reprojection.
The analysis ID stays stable across these views; result ID/revision changes. A
new explicit analysis invalidates the old analysis ID, while reusable raw grids
may remain cached by source digest/model/bounds. Cache-only views preserve their
original backend; a conflicting explicit backend is refused. To use the CPU
button after a GPU analysis, request a new analysis (without `reprojectOf`); old
backend grids/session are cleared while original source bytes stay available. Zoom and display visibility need
no engine call at all.

Raw output owns its copies and records `raw_shape:[1,256,256]` for MGCF or `[1,512,512]` for CMSeg, one grid per active
zone, before thresholding. NPZ normal results contain map/mask/analyzed/candidates;
raw NPZ contains `raw_probabilities` shape[zone,channel,height,width]. Both include
Unicode `metadata_json` and `browser_provenance_json`, with no pickle. JSON also
works through the existing exporter, under its explicit byte limit.

## Lifecycle and limits

All stages share the engine budget. The pinned ORT1.30 CPU worker has a512MiB
linear-memory ceiling and one internal thread. Idle session reclamation precedes
scientific cache eviction. Sequential useful jobs reuse the model; no startup
probe, calibration or preloading of other weights occurs. The MPDN hybrid uses
a separate pinned JSEP runtime with512MiB WASM plus a512MiB actual GPU-buffer
ceiling, both reserved globally along with model copies and live workspaces.
GPU allocations are checked before creation; destroyed-buffer leases are held
until submitted work completes inside the helper. Validation errors discard
outputs. Admission is not a measurement of process RSS or driver/compiler memory.
Additional useful parallel ROI workers remain work for this family; current ROI
inferences are sequential and the internal ORT pool is one thread.

Run cancellation cooperates with the common worker and terminates active neural
work. `imagesCleared:false` preserves the original and completed caches; after a
forced5s watchdog reset, `imagesCleared:true` requires source/model reconfiguration.
Exports and other methods keep their existing cancellation rules. Unloading
images clears the family session/cache; `unloadSegmentationModel` also removes
its configuration. Original bytes remain available unchanged.

This first path needs a contiguous decoded source, maximum8192 per axis and
32Mipixels, with stricter refusal when the actual common budget is insufficient.
It is not a large-image streaming implementation. No physically mobile, Safari
or non-Apple hardware claim follows from Chrome on the current host.

## Evidence and integration boundary

Preparation:18 synthetic source/size cases exact in RGB8 and float32 NCHW.
Actual model: three whole inputs, including189 positive native pixels, then two
ROI plus envelope producing561 positive pixels. Binary masks, coverage and
candidates match exactly. Continuous scores are **not bit exact**: maximum
observed raw difference2.608e-6, projected-map difference2.563e-6. These are corpus
measurements, not universal detector accuracy or a new tolerance for every model.

The common-worker original-PNG recipe includes lazy loading, three actual
inferences, zero-inference views, raw/JSON/NPZ exports, source-byte preservation,
cooperative cancellation/retry and zero final reservations. NumPy independently
reads the actual NPZ. The standalone worker also covers corrupt weights, memory
refusal and idle-session reclamation. Twenty-one targeted engine/ELA/D2PRL/new
family checks passed the first common integration. Eight family checks pass the
additional identities, including rejection of unqualified variants. The two new
variants run the same original-PNG common-worker recipe and NumPy export checks. Reuse earlier numerical proofs rather than
requalifying unchanged algorithms at every integration.

Reports: `segmentation-mpdn-common-worker-chrome-proof.json`,
`segmentation-mpdn-common-npz-proof.json`, `segmentation-mpdn-zones-chrome-proof.json`
and `segmentation-mpdn-worker-chrome-proof.json`. B still owns the actual WordPress
variant selector, rendering, mirrored asset URLs/CORS and integrated recipe.


The added base and16×16 variants reproduce masks/coverage/candidates on three
whole-image references and three independent crops. Base has9409 positive pixels
on the paired-spot whole image;16×16 has2892. Maximum observed raw probability
errors including ROI are1.89245e-5 and4.76838e-6 respectively; neither is bit exact.
Some internal base logits exceed1e-4, so the qualification is explicitly about
reported probability/map errors and exact tested binary decisions, not a bound
on every intermediate tensor. No general detector accuracy or new universal
CPU tolerance follows from these finite-corpus observations.

Each added variant makes three inferences on first ROI analysis, then none on
cache views/retry; cancellation preserves the source. Accounted recipe peaks are
1382745269bytes (base) and1382712419bytes (16×16), under3GiB, with zero final
reservations/cache/retained data and a separate32MiB known codec heap. These are
admission figures, not RSS, speed measurements or mobile-device claims.
Reports are named `segmentation-mgcfdn[-16]-common-worker-chrome-proof.json` and
`segmentation-mgcfdn[-16]-common-npz-proof.json`. Weight conversion can use the
existing isolated native validation interpreter; no environment installation or
native file change is needed.

## MPDN hybrid evidence and measurements

Three full inputs and the three native ROI preserve every tested binary mask.
The common ROI raw maximum error is2.13087e-6 and source-map maximum2.10107e-6.
The recipe checks automatic GPU selection, actual GPU allocations, cache-only
views, original bytes, cancellation/retry, raw/JSON/NPZ and a new CPU-button
analysis. NumPy independently reads exported NPZ. Ten targeted family tests
cover GPU admission/lifetime and automatic selection as well as earlier paths.

In the four measured requested jobs (three actual inferences each), complete
source→exports took CPU1441.3/1029.7ms and GPU1135.4/322.4ms for cold/warm
respectively. This supports enabling the qualified hybrid locally; it is one
observation per condition on Chrome154/Mac, with local asset reads, not universal
performance. Source-pixel SHA changes outside the ROI force real warm inference.
Physical display and WordPress latency were not measured. See
[SEGMENTATION-MPDN-GPU.md](SEGMENTATION-MPDN-GPU.md) and the detailed JSON report.

## CMSeg-Net generalization and addnoise

Use the same `loadSegmentationModel` and `ai.clones.segmentation` operation with
`variant:'cmseg-generalization'` or `'cmseg-addnoise'`. For these two variants,
`url` points to the pinned **bundle JSON**, with the identity below, instead of a
single ONNX. The two graph files named by that bundle must be available beside
it; the requested job verifies every graph's size and SHA256 before execution.
Configuration fetches nothing. Addnoise has21,243,915bytes of graph assets.
Generalization v2 has12,010,557bytes of ONNX graphs plus the verified backbone
manifest and actual float32 parameters detailed in CMSEG-BACKBONE-REPAIR.md.

| Variant | Bundle bytes | Bundle SHA256 | Native checkpoint SHA256 |
|---|---:|---|---|
| `cmseg-generalization` |885|`5971bb653cecd0c6f9672bed99c2f694151ed9b50693501642ca66213b820c2c`|`a3351ae664fca9780c3ca56db708fe3fdc74878c07327dfdd6ed75f14537454b`|
| `cmseg-addnoise` |987|`699c450495030f6dcb8b03bfa5d6fbcb0835763af9e31f20a05aa42856e2908a`|`0f549f213e67712791e2778f4df005532dabd563a9fea3bafc851d4d449fb1ba`|

CPU and auto use the same bounded pipeline; explicit GPU is unavailable for
CMSeg. One512MiB ORT heap runs the ONNX stages with one internal thread.
Generalization executes its actual backbone before creating this heap, using
the shared D2PRL convolution/BN helpers and fixed64MiB Winograd helper. Global
correlation uses a separate pool of useful CPU workers, up to reported logical
cores and remaining shared memory, each with a64MiB enforced heap ceiling. The
CNN does not execute concurrently with this pool. Rows are independent jobs;
there is no N×N nesting of thread pools and no startup calibration. All128²×128²
comparisons remain at the finest level, including distant candidates. ROI jobs
remain sequential, with every pixel region independently prepared at512.

The historical v1 common recipe covers two ROI plus envelope, source-byte preservation, native
projection, cached views without inference, cancellation during correlation,
JSON/raw/NPZ, and independent NumPy readback. Generalization's ROI mask has3647
positive pixels, addnoise812; masks/coverage/candidates are exact on this corpus.
Maximum raw difference7.19429e-5 /6.52075e-5 respectively. These are probability
metrics, not bounds on logits or all intermediate tensors. Native thresholds are
unchanged; no claim of universal detector equivalence follows from this corpus.

The shared-budget peak in the recipe is about1.401GB under3GiB; each correlation
worker actually reached16MiB, and the CNN heap514,719,744bytes. All reservations
are released on unload. Driver/process RSS is outside these accounting figures.
Under80MiB, an isolated correlation job admits one worker and produces the same
bits as ten workers; below one worker's budget it refuses. This does not imply
that a complete CNN fits80MiB. Source projection512 has18 exact OpenCV tests and
uses a separate binary; the original448 D2PRL binary is retained.

Generalization source→exports measured12.589s cold /11.978s with its session warm,
three fresh ROI inferences each; preparation60.4/50.5ms and projection122.8/129.3ms.
One observation per condition, Chrome154/current Mac/local assets; headless
presentation is not WordPress latency. See `CMSeg-BOUNDED.md` for algorithms,
rejections, reproducibility and the remaining limits. B owns the WordPress recipe.

## EffNet and source/target correction, common API0.30.0-m1.5

The first conversions were rejected on actual native decisions/probabilities.
Preserving40/41 native global-mean reductions repairs those failures. The public
allowlist accepts only the corrected assets above; old graph hashes still refuse.
Checkpoint SHA256 is98b7fc9dbe935c7840799acd8273bec6f27dd7d7f33761b5090918e2be988773
for EffNet and95fa449ba33a4718b66ddcbe948ddc57abdfb34594c43bf47e49515bc63cec98 for ST.

| Corrected model | ROI union positives | Maximum raw error | Maximum source union-map error | Peak admitted bytes | Observed ORT heap bytes |
|---|---:|---:|---:|---:|---:|
| EffNet |9089|7.65920e-6|7.59960e-6|1338190922|208338944|
| Source/target |7226|1.16826e-5|1.15932e-5|1391286445|246349824|

Three actual ROI inferences precede cache-only removal/restoration, cancellation
and original cached retry. All mask, coverage and candidate bytes match. ST's
target/source layers are checked individually (max1.15932e-5/6.19889e-6). JSON
retains the float32 values exactly, NPZ is independently read with NumPy without
pickle, and all admitted memory returns to zero. The existing512MiB neural
worker and3GiB global recipe budget suffice; no larger public runtime was needed.
No speedup is inferred from this arithmetic repair. Both models remain CPU-only.

Reproduce with `rewrite-segmentation-mean.py VARIANT`, then
`study-segmentation-model.mjs VARIANT --model native-mean`, native zone generation,
`study-segmentation-common-worker.mjs --variant VARIANT --model native-mean` and
`check-segmentation-npz.py common VARIANT`. Paths/interpreters follow the earlier
recipe. Current proofs use the `segmentation-mgcfdn-effnet` and
`segmentation-mgcfdn-st` prefixes. Original rejected ST common reports are retained
as `segmentation-mgcfdn-st-unmodified-common-*-rejected.json`. TNT now requires the separately pinned M1.30 bundle; VIG uses the separately pinned repaired M1.31 bundle.

## M1.34 — CMSeg generalization GPU

The generalization v2 bundle supports the shared-asset GPU convention introduced
for VIG: `gpu.sharedAssets:true`, no extra model URL required, explicit CPU and
capability/budget-based auto retained. Only ordinary convolutions move to ordered
WebGPU; Winograd and global correlations remain CPU. Metadata/NPZ record backend,
64MiB GPU-buffer ceiling, observed capacity and transfers. Actual CPU/GPU96MP
source, regions, cache view and complete exports are qualified separately from
small tensors; their four full-plane hashes match. Addnoise stays CPU. See
[CMSeg evidence](CMSEG-GPU.md); other distinct memory paths remain in the queue.

## M1.35 — TNT GPU and memory-path coverage

TNT uses the same `gpu.sharedAssets:true` convention and preserved v1 bundle.
Its GPU linear layers keep ordered FMA and the biased channel32 boundary; CPU
attention/norm/GELU/decoder remain. API, views, cancellation and NPZ preserve
existing semantics and report the selected hybrid and measured buffer capacity.
The CPU/GPU model corpus has identical probability hashes. See
[TNT evidence](TNT-GPU.md) and [96MP coverage](NEURAL-96MP-COVERAGE.md) for actual
full-source CPU/GPU paths, independent complete exports and explicit reuse of
the single-thread ONNX memory adapter across its five variants. The table records
the runtime version actually tested, without upgrading historical proofs silently.
