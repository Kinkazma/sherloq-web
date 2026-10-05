# MGCFDN VIG — native-order CPU repair, M1.31

`mgcfdn-vig-native-order-v1` executes the actual VIG checkpoint with a portable
CPU backbone, followed by the unchanged ONNX consistency module and decoder.
RGB256 preparation, 16 graph blocks, all256 candidate vertices, dilation,
interpolation and the strict `probability > .5` decision are preserved.
The divergent original ONNX identity is refused. CPU is available explicitly;
no GPU implementation is qualified by this delivery.

## Numerical cause and correction

The original ONNX candidate changed264 grid/source-mask pixels across the corpus.
Correcting squared-norm sums alone still changed222. Distances were initially
only a few ulps apart, but changed dilated neighbours amplified the discrepancy.
An ONNX TopK tie also selected a different neighbour on identical native input.
These negative reports remain under their original names.

The repair preserves float32 FMA ordering in normalization, dot products and
convolutions, native cascade sums, `nth_element` followed by sorting the first
k-1 elements, dilation and max-relative channel packing. Native batch norms and
GELU are separate operations. The fixed RGB256 stem preserves the native GEMM
bias order at remainder-channel boundary blocks; independent generated inputs
qualify this layout. No universal BLAS-layout equivalence is asserted.

GELU was the remaining divergence after these repairs. It uses the Torch2.8
vec128 erf polynomial and the reference scalar exponential approximation.
The latter is implemented independently as a128-bin base2 range reduction,
a quadratic and explicit float64 FMA. Its table is generated from
round64(2^(j/128)) using Decimal precision100. Two fixed polynomial coefficients
and rounding order describe the locally inspected reference arithmetic; they
are not fitted to image values or model activations. No macOS library, native
binary, captured code or lookup table is distributed, and no OS-brand test is
used. This is reproduction of a specified approximation, not a claim of a
correctly rounded mathematical exponential or equivalence to every libm.

Seven public deterministic cases cover524288 exponential arguments,262144 GELU
values (including signed zeros), the stem/grouped/FFN convolutions and two
complete graph cases including ties. All arrays are bit-exact; convolution jobs
are deliberately split across irregular boundaries. The private full backbone
comparison on paired-spots also has163840 exact output values and16 exact
neighbour lists. Native activations are comparison oracles only, read after
browser computation; product inference consumes source pixels and actual weights.

The complete component is not bit-exact because the unchanged ONNX tail retains
small continuous differences. Chrome154 actual RGB corpus:

| Input | Maximum absolute probability error | Mask changes | Foreground |
|---|---:|---:|---:|
| structured-copy |6.169081e-6|0|0|
| constant |1.084059e-6|0|0|
| paired-spots |7.808209e-6|0|7256|

The common-worker JPEG recipe adds three independent ROI, source projection,
owned windows, a cached two-zone view, complete four-array NPZ read by NumPy,
cancellation during `vig-convolution` and source reload. Maximum source-map error
is1.764298e-5; masks/analyzed/candidates are exact. Original masks and rendered
appearance are never substituted for checks of native final decisions.

## Resources, timing and limits

A64MiB math helper and96MiB admitted staging cover live arrays, parameter reads,
hash copies and layout temporaries. The useful convolution pool adds fixed64MiB
single-thread heaps and admits transport copies under the same budget. Every job
retains complete dot products. Only requested parameters are loaded. There is no
startup calibration, all-model preload or nested thread pool. All backbone helpers
are released before the512MiB ORT tail; its idle worker is released before a new
backbone. Admission failures and cancellations release owned reservations.

Component peaks1073048298B and the three-zone recipe1065241201B are below1GiB;
all final reservations are zero. These are accounted allocations, not process RSS.
The unextracted three-zone observation is34.433s with a7.1ms cached recomposition.
Preparation, parameter reads, execution, projection and export appear separately
in the reports. The isolated useful-worker comparison changes only the worker
ceiling on one backbone/input/budget, with fresh helpers and serial browser runs;
OS caches are not flushed. One worker takes42.9195s versus10.8585s with up to10
workers, an observed3.95× gain; excluding parameter reads40.8263s versus8.9205s
(4.58×). Complete feature SHA256 is identical between both paths and the native
structured-copy output. Peaks283401088/1066854272B remain below the same1GiB
budget. See `vig-useful-workers-proof.json`. It does not measure native-Mac acceleration
or whole-application/export speed.

The fixed model grid remains256; no hidden image-resolution change is introduced.
Actual96MP VIG inference, other browsers and physical mobile hardware are untested.
JPEG segmented source access is inherited from the current engine; formats and
large archive support follow their existing limits. WordPress integration is
separate. The following GPU/inter-zone optimization work belongs to M3 and the
shared integration to M5; this delivery is a qualified CPU reference for them.

## Assets and reproduction

Checkpoint SHA256:
`63996d687b29e49f5c78f8f055395bb196ce37e31f1918817c2f197a88f1e7e6`.
Bundle507B SHA256:
`5ea0f37330567c601ccfb9a7dcd45bbf2dcda0f2405cb60e66a74ed6f980639a`.
Metadata186358B SHA256:
`22c5cf4f797722b5cde861e3f2857f7ceb4f165bd5952fd7ae8d36aa678a2418`.
Tail28780877B SHA256:
`606b6d93a54142cf469fccd023b2200dfe755b190e5527c58c25aa61b847f57f`.

The external delivery manifest allowlists bundle, metadata, tail and the511
parameter entries deduplicated by content. It excludes all diagnostic captures.
Weights are not shipped in the source/runtime package; redistribution is separately
coordinated. `scripts/export-vig-backbone.py` checks native weights and original
ONNX identities before export. Its offline candidate status is distinct from the
registry's subsequently qualified corpus status.

```sh
PYTHONPATH=.build/onnx-python PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/export-vig-backbone.py
EMSDK=.build/emsdk-4.0.15 EMSDK_QUIET=1 EM_FROZEN_CACHE=1 python3 scripts/build-vig-kernels.py
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-vig-math.py
node --test tests/vig-math.test.mjs tests/vig-backbone-admission.test.mjs tests/segmentation-admission.test.mjs
node scripts/study-vig-model.mjs
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-vig-backbone-reference.py
node scripts/study-vig-model.mjs --benchmark
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-segmentation-zones.py mgcfdn-vig
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-neural-segmented.py mgcfdn-vig
node scripts/study-neural-segmented.mjs --variant=mgcfdn-vig --tag=candidate
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-neural-segmented-npz.py mgcfdn-vig --tag=candidate
```

Mac reuse: preserve distances, tied ordering, dilation and activation arithmetic
when changing a graph-model backend; small tensor errors may change discrete
neighbour choices. This browser repair does not change the native application.
The useful-worker gain is a browser observation, not a demonstrated Mac gain.
