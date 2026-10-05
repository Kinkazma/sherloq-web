# Segmentation numerical candidates and explicit rejections

MGCFDN base,16×16,MPDN and the repaired EffNet/source-target graphs are available
experimentally through the common CPU worker, alongside both bounded CMSeg-Net
variants. Their native masks agree on the declared generated corpus; continuous
values are not bit exact. TNT and VIG remain rejected. The active contract records
the useful limits. This document retains the failed candidates as well.

The following failed cases must not be hidden by a close-looking display or an
empty first fixture. Model bytes and native arrays stay outside the source tree.
All checkpoints are loaded strictly from the existing verified native inventory;
there is no training, threshold adjustment or substitution of another network.

## EffNet16×16

The original conversion changes two mask pixels on the paired dark spots:
native7373, browser7371. Maximum probability difference2.31266e-5 is small but
crosses the fixed `p > .5` decision. The original model SHA256 is
`60e4cca2ef8298f5e5f3655f1b6aad2a99c696358c083d8d322d24ad3a3bbed6`.

Two isolated arithmetic experiments reuse the earlier D2PRL work. Native rounded
BatchNorm affine constants leave two changed pixels (max probability2.27392e-5).
Native bilinear rounding also leaves two (max2.10405e-5). Neither is accepted.
These rewrites depend on checkpoint parameters and fixed geometry only; they
do not fit expected activations.

Reports: `segmentation-mgcfdn-effnet[-native-bn|-native-resize]-onnx-cpu-candidate.json`.
The historical `candidate-comparison` status is descriptive, not an acceptance;
the `mask.changed` fields explicitly contain the failure.

The corrected `native-mean.onnx` replaces40 global averages with the native
cascade reduction order. Whole-image probability max is4.82798e-6 and every mask
now matches, including7373 foreground pixels on the formerly failing spots.
The common worker then passes3ROI, raw/cache/annulation/JSON/NPZ:9089 foreground
pixels, raw max7.65920e-6, source map max7.59960e-6. The original identity remains
rejected; only the repaired SHA in the contract can be configured.

## MGCFDN source/target

The first three generated inputs produced empty masks. Eight additional
procedural images exercise positive roles; their complete native counts are in
`segmentation-st-positive-coverage.json`. A fixed multiscale texture with a copied
80×80 rectangle (seed192) is retained for branch coverage, not an accuracy claim.
It has4625 target and1851 source pixels; class order is target/source/background.

The unchanged CPU conversion reproduces all6476 whole-image decisions and the
7226-pixel mask from three independent crops. However, the envelope raw grid has
maximum error1.69725e-4, exceeding the1e-4 study ceiling. The composed map's smaller
error7.51913e-5 does not erase that raw-grid failure. The common-worker and NumPy
reports were explicitly rejected and that original identity remains absent from
the public configuration allowlist.

Combining native BN constants and bilinear arithmetic does not fix the failure:
envelope raw error1.79917e-4, while its binary decisions still match. This candidate
is also withheld. Logit errors reach5.53847e-4; no claim of an intermediate-tensor
bound is made. No wider tolerance was adopted to mark the engine complete.

Original reports: `segmentation-mgcfdn-st-unmodified-common-worker-rejected.json`,
`segmentation-mgcfdn-st-unmodified-common-npz-rejected.json`,
`segmentation-mgcfdn-st-native-bn-resize-onnx-cpu-candidate.json`.
The common-worker rejection was captured while the development identity was
temporarily enabled for that recipe; that original graph stays disabled in the delivered
allowlist. Direct candidate scripts remain available for continuing arithmetic
work. Mask agreement does not imply equal class probabilities or scientific
accuracy, and this source/target model is not D2PRL's residual-role model.

The corrected `native-mean.onnx` repairs41 global means. Its envelope raw maximum
is1.16826e-5, below the declared1e-4 bound without changing that bound. All six
whole/crop candidates match masks. The common worker preserves7226 ROI union
pixels, source/target arrays, cache-only views and cancellation/retry. NumPy
independently reads both actual exports. Current common-worker/NPZ proofs describe
this repaired identity, with the original rejections retained separately above.

## Reproduction

Use the existing `integration/clone_detectors/.venv-validation/bin/python` with
`PYTHONDONTWRITEBYTECODE=1` and the local `.build/onnx-python` path. The base
application interpreter lacks einops; the existing isolated interpreter already
has einops0.8.1. No native environment has been modified.

`export-segmentation-study.py VARIANT` writes fixed native references and the
unchanged model. `study-segmentation-model.mjs VARIANT` compares that network.
`rewrite-segmentation-batchnorm.py VARIANT` and
`rewrite-segmentation-resize.py VARIANT [--bn]` create separate arithmetic
candidates. Pass `--model native-bn`, `native-resize` or `native-bn-resize` to the
browser study. Candidate hashes distinguish each graph; rejected conversions
never overwrite an accepted model or release archive.

`rewrite-segmentation-mean.py VARIANT` captures only pool geometry from a strict
native forward that must reproduce the original logits, then reuses the D2PRL
cascade sum. `--base` can compose earlier arithmetic candidates for diagnosis.
Use `--model native-mean` in both the model and common-worker studies; all model
bytes remain checked against the configured identity. No oracle activations are
inserted in a network. EffNet/ST need only the mean correction, not BN/resize.

The separate MPDN WebGPU path accounts explicitly for CPU TopK and GPU allocations.
None of these arithmetic CPU studies establishes GPU support or a speed gain for
EffNet,ST,TNT or VIG. CMSeg-Net's global correlation now has a bounded CPU solution;
its complete proof and remaining limits are in `CMSeg-BOUNDED.md`.


## TNT and VIG studies after the first three variants

Both actual converted models run under a private1GiB ORT factory. WASM arithmetic
is identical to the existing runtime; only its instantiated maximum changes.
This factory remains outside the current public package. Actual observed heaps
are617414656bytes for TNT and854392832bytes for VIG, both above512MiB.

TNT is also rejected: the structured-copy input changes two binary pixels,
despite a maximum probability error8.79169e-6. Its constant and paired-spot
inputs match (including8009 positive pixels), which does not cancel the first
failure. Numerical repair precedes common-worker activation or delivery of the
larger runtime. No TNT model is accepted by the public configuration.

VIG is rejected: paired spots change132 binary pixels (native7256, browser7278),
with max probability0.0799824 and logit1.432325. Even the structured negative input
has probability error0.0624529. The graph-neighbour choices and their downstream
amplification require dedicated numerical work; using a tiny tensor tolerance or
matching empty masks would not establish parity. No VIG model is activated.

Reports: `segmentation-mgcfdn-tnt-heap1024-onnx-cpu-candidate.json` and
`segmentation-mgcfdn-vig-heap1024-onnx-cpu-candidate.json`. Use the private factory
builder and `--heap-mib 1024` for those studies. Their runtime admission is shared
with other model data;1GiB is a per-session ceiling, not permission for unbounded
parallel session creation.

## Remaining failures after native-mean repair

VIG's two corrected global means leave132 changed spot-mask pixels and maximum
probability0.0799828. TNT also retains its two changed structured-mask pixels
(maximum probability8.79169e-6); a separate BN candidate still changes two.
They remain excluded from the configured models. These are dedicated numerical
work items, not failures hidden by admitting them at a wider threshold.

One TNT average receives a channels-last tensor. Its native outer reduction sums
spatial positions in a different cascade from the contiguous inner reduction.
The separate ONNX primitive reproduces640 actual native channel means and three
signed synthetic regular/odd geometries bit for bit. That local success does not
erase the full TNT failure. Reports: `segmentation-outer-mean-chrome-proof.json`,
`segmentation-mgcfdn-tnt-native-mean-heap1024-onnx-cpu-candidate.json`,
`segmentation-mgcfdn-tnt-native-bn-heap1024-onnx-cpu-candidate.json`, and
`segmentation-mgcfdn-vig-native-mean-heap1024-onnx-cpu-candidate.json`.

## Localized TNT/VIG boundaries, after the0.30.0-m1.5 delivery

The unchanged VIG neighbour graph first diverges at block4 (zero-based) on the
paired-spots image: one dilated neighbour set changes while the distance input
maximum error is4.88759e-6. Block5 already has18 differing neighbour sets and
block7 has202. Running isolated TopK on the exact native distances matches
indices through block9; block10 has one tie-order difference affecting a dilated
neighbour. Thus both upstream arithmetic and tie ordering matter.
`segmentation-vig-paired-spots-topk-diagnostic.json` separates these observations;
oracle inputs are used only for diagnosis.

The native outer cascade sum is bit-exact on all16 captured squared-feature
tensors (4096 scalar outputs). Replacing only these sums reduces changed VIG
mask pixels from132 to111, but maximum probability error remains0.061361. This
candidate stays rejected, including its inaccurate empty-mask cases. See
`segmentation-vig-sums-chrome-proof.json` and
`segmentation-mgcfdn-vig-native-sums-heap1024-onnx-cpu-candidate.json`.

TNT's structured example has native probabilities0.4999997616 and0.4999994636 at
its two changed pixels. The backbone feature error reaches9.53675e-5. Supplying
the native features to an isolated downstream graph removes both mask changes
(probability max2.74182e-6); native consistency or low logits reduce that further.
These are localization experiments, never accepted model outputs. Standard ORT
full graph optimization also keeps the two failures.

A separate LayerNorm candidate reproduces the native four-lane Welford moments
and final scalar merges. Native scalar multiply/add contraction required a
widened intermediate before float32 rounding; no input precision, epsilon,
weights or model dimensions changed. On four actual tensors and two generated
cases, all output/mean/rstd values match bits. This observed result is not a
universal proof that double-based contraction emulates every possible float FMA.
The initial separate-rounding failure is retained. The reference is pinned
[Torch2.8 LayerNorm](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/layer_norm_kernel.cpp)
and its [moment reduction](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/moments_utils.h).

Replacing all75 TNT LayerNorm nodes still leaves two changed structured pixels
(max probability8.49367e-6); the other two whole-image masks match. Its observed
WASM heap is723451904bytes under the private1GiB study maximum. Graph construction
and execution are slower, and no speed benefit is asserted. The graph is not
registered or distributed. Reports: `segmentation-tnt-stages-diagnostic.json`,
`segmentation-tnt-layernorm[-separate]-chrome-candidate.json`, and
`segmentation-mgcfdn-tnt-native-layernorm-heap1024-onnx-cpu-candidate.json`.

Further TNT work concerns feature-network matrix/nonlinear arithmetic; VIG needs
those numerical paths plus native neighbour ordering. Neither failure is erased
by the successful local primitives. These explicit remaining defects do not
prevent independent qualified pixel/large-image work from progressing.
