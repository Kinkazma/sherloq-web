# MGCFDN TNT — native-order CPU repair, M1.30

`mgcfdn-tnt` now has a separate CPU bundle, `mgcfdn-tnt-native-order-v1`.
The previously rejected full ONNX graph is not accepted under this identity.
The native checkpoint, RGB256 preparation, 12 TNT blocks, attention domains,
consistency module, decoder, interpolation and strict `probability > .5` mask
rule are unchanged. No native intermediate tensor is supplied to inference.
VIG is qualified separately in [M1.31](VIG-NUMERICAL-REPAIR.md); this TNT proof does not validate that model.

## Arithmetic and qualification

The former full ONNX candidate changed two mask pixels on `structured-copy`.
An earlier LayerNorm-only repair was insufficient. The replacement backbone
executes the actual parameters with ordered float32 FMA, the native patch layout,
four-lane Welford normalization, the native GELU polynomial and attention softmax
reduction order. Width40 biased linear outputs use native channel-tail bias order.
The unchanged consistency/decoder ONNX subgraph consumes the computed features.

The public synthetic fixtures cover patch extraction/stride4/padding, five
linear shapes including channel32 boundaries, width40/640 norms, both attention
geometries and GELU. Patch, linear, norm and attention arrays are bit-exact on
these fixtures. Attention fixtures preserve the actual QKV strides and batch/head
geometry: native BLAS dispatch is layout-sensitive. No generic batched-matmul
parity is claimed for other layouts. GELU's scalar system exponential differs:
maximum observed synthetic error1.192093e-7 (8/16384 values), so the complete
backbone is deliberately **not** described as bit-exact.

Production-component Chrome154 corpus:

| Input | Maximum absolute probability error | Changed mask pixels | Native foreground |
|---|---:|---:|---:|
| structured-copy |2.980232e-6|0|11990|
| constant |1.296401e-6|0|0|
| paired-spots |3.129244e-6|0|8009|

The real common-worker JPEG recipe adds three independent rectangles, source
projection, owned numeric/mask windows and a cache-only two-zone view. Maximum
source-map error is1.996756e-6; masks, analyzed and candidates are exact. The
four-array NPZ is read completely by NumPy with `allow_pickle=False`, checking
CRC, dtype/shape, source identity and browser window hashes. Cancellation during
`tnt-linear`, storage cleanup and source reload pass. The known rejected reports
remain intact. Neither intermediate/logit errors nor a close rendered image are
used in place of the final probability and mask checks.

## Memory and useful work

One64MiB math heap and96MiB of admitted staging cover the backbone's live tensors,
layout conversions, verified parameter reads and hash copies. Parameters are read
lazily; the entire checkpoint is never preloaded. The linear pool adds fixed64MiB
single-thread heaps and explicitly admitted transport copies, bounded by useful
channel jobs, CPU capacity and the same global budget. A dot product is never
split between workers. There is no calibration run or nested threaded library.

Backbone helpers are disposed before the downstream512MiB ORT worker is admitted;
that worker is released before another useful backbone inference. Component
corpus peak is1039854956 B under1GiB. The JPEG recipe records1036492211 B and
zero final reservations, cached arrays or retained surfaces. These are accounted
allocations, not process RSS; browser-managed Blob storage is separate. Actual
96MP TNT inference and additional browsers/devices have not been qualified.

The unextracted JPEG observation was34.916s for three complete analyses and6.9ms
for cached recomposition, without a new inference. Source preparation, parameter
load, backbone, ONNX, projection and export timings are recorded separately in
the proof. The isolated worker comparison is in `tnt-useful-workers-proof.json`;
it changes only the worker ceiling on the same backbone/input/budget. One worker
takes26.479s (24.932s excluding parameter reads); the useful pool reaches10 workers
and takes11.015s (9.498s excluding reads), an observed2.40× total/2.63× execution
gain. The complete feature SHA256 is identical. Accounted peak rises from
264769632 B to1034389440 B, within the same1GiB ceiling. Setup and parameter
reads are reported separately; runs are serial with fresh helpers, without
flushing OS caches. It is
not a whole-application, decoder, export or native-Mac speedup claim.

## Assets and reproduction

The bundle is507 bytes, SHA256
`27e4a64f492e0c161c9d50a850bf6e57ba3365e3e7633075bbba4a1edf4c75e3`.
Backbone metadata is113507 bytes, SHA256
`6270c09edca590d59fe922dd740999ec7f4dde867ac507bc84cbf8b46cc99fa4`.
The downstream graph is28780560 bytes, SHA256
`0972f12d0ce15c58d1dcd0aa992ca28b3ddb46afeacaf8c9d15dc5419ba5f55b`.
Checkpoint identity remains
`c83f0d1a2840ebfdfafbf5c7ed842f8b5756c8975a6e6aff18cf73f95fbba56e`.
The external `delivery-manifest.json` allowlists only bundle, metadata, graph and
361 parameter entries (deduplicated by content). No private capture, user image,
checkpoint or converted model is included in the source/runtime distribution.
Model redistribution remains separately coordinated with A/B.

With the existing native validation environment and pinned conversion available:

```sh
PYTHONPATH=.build/onnx-python PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/export-tnt-backbone.py
EMSDK=.build/emsdk-4.0.15 EMSDK_QUIET=1 EM_FROZEN_CACHE=1 python3 scripts/build-tnt-kernels.py
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/generate-tnt-math.py
node --test tests/tnt-math.test.mjs tests/tnt-backbone-admission.test.mjs tests/segmentation-admission.test.mjs
node scripts/study-tnt-model.mjs
node scripts/study-tnt-model.mjs --benchmark
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-segmentation-zones.py mgcfdn-tnt
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-neural-segmented.py mgcfdn-tnt
node scripts/study-neural-segmented.mjs --variant=mgcfdn-tnt --tag=tnt-candidate
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-neural-segmented-npz.py mgcfdn-tnt --tag=tnt-candidate
```

Native PyTorch arithmetic sources and licenses are pinned in
`vendor/segmentation/TNT-PINNED.json`; SLEEF attribution remains with its existing
helper. This portable code uses no native macOS library or browser-brand branch.
For Mac reuse, the diagnostic lesson is to preserve operation/layout/bias order
when comparing another backend; the native application is unchanged and no
native acceleration is claimed from this browser implementation.
