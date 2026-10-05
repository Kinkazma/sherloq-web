> M1.28 restores CMSeg generalization with a new pinned backbone bundle and
> native-order kernels. The rejected old bundle remains refused. Read
> [the numerical repair and current identity](CMSEG-BACKBONE-REPAIR.md);
> earlier performance/corpus observations below belong to their recorded versions.

# CMSeg-Net512 — bounded common-worker pipeline

Both native final checkpoints, generalization and addnoise, execute experimentally
through `ai.clones.segmentation`. The contract and mirror identities are in
[SEGMENTATION-M1-CONTRACT.md](SEGMENTATION-M1-CONTRACT.md). No native source,
checkpoint, threshold or model resolution was changed; no training occurred.

## Preserve the complete global method

The native finest feature map is128×128. Its full float32 affinity matrix alone
is1GiB, before Gaussian windows, both softmax outputs and other temporaries.
The browser computes normalized feature dot products twice, retaining features,
row maxima, both normalization summaries and sorted top-k values. Every global
pair is included, including distant positions. Scratch is linear in feature
count plus retained top-k; this is not local matching or approximate pruning.

The convolutional encoder and decoder are separate ONNX graphs from the strict
native load. Feeding native correlation outputs through the split reproduces
native logits/probabilities bit for bit in Torch. Each graph uses the repaired
native global-mean ordering and native BN constants, with unchanged weights.
The candidate ONNXs and weights remain outside source/runtime delivery.

The correlation CPU pool starts useful row jobs immediately. Each WASM instance
has a64MiB maximum; input/output copies and all heaps are admitted under the
same engine budget. One ORT heap with a512MiB maximum handles the two CNN graphs
with one internal thread. CNN execution and correlation workers are sequential,
so this pipeline does not multiply ten workers by ten library threads. ROI
inferences also remain sequential. Temporary workers terminate on completion,
error or cancellation; idle CNN sessions can be reclaimed before scientific
raw-grid caches. Lower available memory reduces the worker count before dispatch.

## Numerical failures that were corrected

The first unchanged ONNX mean produced a visible numerical failure on the
generated copied-blobs fixture:18 mask pixels changed and maximum probability
error0.02137. The native cascade mean, reused from D2PRL with its domain extended
to256×256, removed those mask differences but left probability error1.64e-4.
Native BN constants alone did not fix that remaining failure.

Localization with oracle tensors was used only in the diagnostic script, never
in the product or accepted inference. It identified the correlation branch.
Although the affinity matrix is symmetric, native softmax reductions differ:
the contiguous axis reduces lanes and multiplies by a reciprocal; the other
axis sums in index order and divides. Preserving both paths brought the positive
whole-image probability error to7.19429e-5, without changing any threshold.
See the pinned [Torch2.8 softmax implementation](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/SoftMaxKernel.cpp)
and [vector reductions](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/cpu/vec/functional_base.h).
Reference hashes are recorded in `CMSEG-PINNED.json`; no OS-brand test selects
the arithmetic. The portable kernel still differs numerically from native GEMM
and normalization, so no continuous bit-exact claim is made.

## Final observed evidence

Four synthetic whole images per checkpoint cover empty and positive outcomes.
The copied-blobs image has2611 native foreground pixels for generalization and
245 for addnoise; every tested binary decision matches. Then the common API
runs two512-pixel ROI and an explicit envelope on a640×768 original PNG.

| Checkpoint | Native ROI union positives | Maximum raw probability error | Maximum source-map error |
|---|---:|---:|---:|
| Generalization |3647|7.19429e-5|7.19429e-5|
| Addnoise |812|6.52075e-5|6.31214e-5 including envelope-off view|

All tested masks, coverage and candidate arrays are exact. Some intermediate
features/logits exceed1e-4; the declared bound concerns probabilities and maps,
with binary decisions checked separately. These generated examples establish
implementation evidence, not universal scientific detection performance.

Both common-worker recipes include original-byte preservation, three actual
ROI inferences, zero-inference cache views, envelope removal/restoration,
cancellation during correlation and retry, raw grids, JSON and NPZ. NumPy reads
the actual NPZ with `allow_pickle=False`. Projection512 uses an independent
build of the existing OpenCV policy;18 native tests match bits, including thin
outputs, identity, exact half reduction and the real positive model grid. The
delivered D2PRL448 binary is unchanged.

Recipe peak admission is1,400,973,377bytes (generalization) and1,400,973,329bytes
(addnoise), under3GiB, with no retained/cache/reservation bytes after unload.
The CNN heap reached514,719,744bytes and each correlation worker16MiB. This is
allocation accounting, not process RSS. A separate isolated correlation job
under80MiB admits one worker; a32MiB limit refuses before computation. It does
not mean a full CNN fits either limit.

## Development measurements

The same64×64 global feature job takes1381.1ms with one worker and271.7ms with
ten, including setup and transfers, with bit-identical output. Under80MiB it
uses one worker and retains the same output. Cancellation/retry also match.
This is one observed comparison, not a universal5.08× guarantee.

Generalization's original-source-to-both-NPZ chain takes12.589s cold and11.978s
with the CNN session warm. Both jobs perform three fresh ROI inferences; a
changed pixel outside the crops prevents a raw-cache hit without changing the
model inputs. Cold/warm preparation is60.4/50.5ms, correlation9397.1/9409.6ms,
projection122.8/129.3ms. Full phase breakdown and memory are retained in
`segmentation-cmseg-generalization-common-benchmark.json`.

Chrome154.0.8037.58/current Mac, local assets, one observation per condition;
the desktop and neighbouring light development remain active. Cold refers to
a new browser context, not an OS cache reset. Canvas is presentation only.
Physical display and WordPress latency were not measured. No measurement or
discarded calibration job runs during normal user startup.

## Reproduction and boundaries

```sh
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/probe-cmseg-positive.py
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.build/onnx-python ../integration/clone_detectors/.venv-validation/bin/python scripts/export-cmseg-split.py generalization
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.build/onnx-python ../venv/bin/python scripts/rewrite-cmseg-arithmetic.py generalization --bn
EMSDK="$PWD/.build/emsdk-4.0.15" python3 scripts/build-cmseg-correlation.py
EMSDK="$PWD/.build/emsdk-4.0.15" python3 scripts/build-cmseg-spatial.py
python3 scripts/package-cmseg-models.py
python3 scripts/stage-cmseg-runtime.py
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-segmentation-zones.py cmseg-generalization
node scripts/study-segmentation-common-worker.mjs --variant cmseg-generalization
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-segmentation-npz.py common cmseg-generalization
```

Repeat export/rewrite for addnoise before packaging both bundles. Existing
native assets and pinned compiler/ONNX/OpenCV dependencies are prerequisites;
there is no download of checkpoints or environment modification. Benchmark
scripts require a free coordinated slot. The graph assets remain separate from
runtime/source manifests and their redistribution rights remain to be settled.

Source input still requires contiguous RGB8 under the existing8192-axis/32Mpixel
limit and actual shared admission. No CMSeg GPU path, streaming large-source
claim, other-browser or other-physical-device qualification is asserted. B owns
WordPress integration. TNT/VIG numerical rejections and the remaining M1
pixels/large-image/parallelism work remain in the queue. Native reuse is tracked
separately in [MAC-REUSE.md](MAC-REUSE.md).
