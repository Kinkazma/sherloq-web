> Current M1.30 status and TNT reproduction: [TNT repair](../../docs/TNT-NUMERICAL-REPAIR.md).
> Historical studies below retain their original scope and rejected candidates.

# CMSeg-Net and MGCFDN browser work

Work after the immutable D2PRL0.29 release. The common worker now exposes
MGCFDN base,16×16,MPDN, repaired EffNet/ST and both CMSeg-Net variants
experimentally; see docs/SEGMENTATION-M1-CONTRACT.md. Native reference: `clone_models.py` and
`clone_detectors.py` in SHERLOQ's core. Native files are read only.

`prepare.js` implements the native RGB8 PIL resize followed by float32 ToTensor.
CMSeg-Net uses side512; all seven MGCFDN variants use side256. This preserves the
native model input sizes rather than silently reducing the source. Pillow's two
separable passes round to RGB8 between axes. The fixed22-bit coefficients follow
[Pillow12.2 Resample.c](https://github.com/python-pillow/Pillow/blob/12.2.0/src/libImaging/Resample.c).
The original MIT-CMU attribution and license are in `Pillow-LICENSE`.

Scratch rows are kept only while the vertical filter needs them. The shared
budget admits the borrowed RGB input, coefficients, row cache and owned RGB/NCHW
outputs before allocation; cancellation yields to control messages and releases
all reservations. Source pixels remain caller-owned. This module receives decoded
RGB pixels; it does not qualify additional codecs, alpha policies or ICC handling.

Reproduce preparation only, without checkpoints or network:

```sh
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/generate-segmentation-prepare.py
node scripts/check-segmentation-prepare.mjs
node --test tests/segmentation-prepare.test.mjs
```

The18 synthetic references cover small/narrow sources, enlargement, reduction,
identity and different axis ratios at both native input sizes. The current Node
proof records exact RGB8 and float32 tensors. Model conversion, inference,
projection to source coordinates, masks, exports and the real UI remain separate
work. These references are not neural parity evidence.

## Native differences to preserve

- CMSeg-Net generalization and addnoise are two separately pinned final weights.
  The constructor uses `pretrained=False`; no download or extra MobileNet base
  checkpoint is required by that strict final load.
- MGCFDN has base, source/target,16×16,EffNet16×16,MPDN16×16,TNT16×16,VIG16×16.
  Source/target uses softmax with target/source/background channel order. Others
  use sigmoid. Their feature extractors and align_corners=True resizes must not
  be substituted by another architecture.
- Binary masks use `p > .5` for single-channel outputs, and
  `(p_target >= .5) | (p_source >= .5)` for the three-channel variant.
  Continuous union is `p_target + p_source`, not a maximum or a residual.
- Each active rectangle is an independent inference; overlap combines continuous
  maps with maximum and binary masks with OR. Map/role interpolation is bilinear;
  binary interpolation is nearest. The native adapter rejects exclusions and
  Compare mode for these families. D2PRL's exclusion and residual rules do not
  apply to them.
- CMSeg-Net's128×128 correlation stage creates16384² entries (1GiB per float32
  matrix). Admission and bounded correlation need explicit examination before a
  full-browser claim. MGCFDN variants have different feature-grid sizes;16×16 is
  a named native variant, not a browser shortcut for the base40×40 method.
- VIG has a CPU native reference because graph-neighbour selection amplified
  native MPS differences. Browser choices must depend on verified numerical
  behaviour and capacities, never an Apple-brand test.

All nine final checkpoints are listed present in the existing inventory. Their
contents will be verified by the native strict loader when each conversion is
performed. Conversion and redistribution rights are separate questions; this
directory includes no weights, training or public model distribution.

## In-progress model comparison

`probabilities.js` and `zones.js` preserve the native model-grid decisions and
independent source projection, with owned outputs under the same budget. The
source/target probabilities remain continuous; they are not D2PRL residuals.
The default spatial build remains448. CMSeg uses the separate512 build of the
same native OpenCV policy, qualified with18 bit-exact cases; it never resizes
its model result down to448.

`export-segmentation-study.py` prepares an unchanged ONNX candidate from the
strictly verified native checkpoint. It writes generated synthetic references
and private model bytes under `.build/segmentation-models/<variant>`. Downloads
and training are prohibited by that script. `study-segmentation-model.mjs` runs
actual browser CPU inference with the existing bounded512MiB ORT build, then
compares logits, probabilities, native threshold decisions and source maps/masks.
A conversion alone is not an accepted engine. Only the three qualified variants
are allowlisted; EffNet and source/target failed the stronger corpus checks.

The first candidate is the native MGCFDN MPDN16×16 variant. This does not replace
MGCFDN base40×40 or either CMSeg-Net network. Reproduction commands:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.build/onnx-python ../integration/clone_detectors/.venv-validation/bin/python scripts/export-segmentation-study.py mgcfdn-mpdn
node scripts/study-segmentation-model.mjs mgcfdn-mpdn
```

## First real CPU worker result (MPDN only)

The three synthetic sources (structured copy, constant, paired dark spots) now
run through an actual bounded CPU worker. Preparation is exact. Continuous
probability/source maps have a maximum observed absolute difference1.90735e-6
from native Torch CPU; they are explicitly not bit exact. All final masks match,
including189 positive pixels on the paired-spot case. See
`docs/segmentation-mpdn-worker-chrome-proof.json` and the separate direct-ONNX
candidate report. This finite corpus does not establish universal detector parity.

The worker loads a separately served24,005,734byte model only when first requested,
checks its exact SHA256, and reuses the existing bounded512MiB ORT numerical code.
Three useful jobs share one session. It uses one ORT thread (no nested pool); the
shared budget can reclaim an idle session before scientific cache data. Busy
refusal, cancellation during actual inference, retry, forced idle reclamation and
reload, corrupt model rejection, memory refusal and final release pass in Chrome.
Reported heap capacity is83,296,256bytes; the512MiB admission ceiling is distinct.
The proof's peak includes an intentionally large reservation that exercises
reclamation; it is not an inference-memory measurement.

The constructor fixes the shipped ORT URLs so a caller cannot substitute an
unbounded heap under the512MiB admission assumption. Only the model mirror URL is
configurable, and the bytes/identity remain pinned in `models.js`. No expected
activations are included in this ONNX model. The later base,16×16 and repaired
source/target/EffNet candidates reuse the same worker with separate pinned
identities. Their unmodified source/target/EffNet graphs remain rejected.

MPDN common-engine original-source/worker integration passed in0.30.0-m1.1.
The subsequent increments add a measured MPDN GPU hybrid and bounded CMSeg CPU.
B's real UI and TNT/VIG numerical corrections remain open; rejection evidence
is retained separately. These experimental files
do not change or replace the frozen D2PRL0.29 runtime.

## Actual ROI and export increment

`analysis.js` computes each crop through the real preparation/inference worker
and caches immutable probability grids by model, source-pixel digest and bounds.
Requests supersede older generations, source snapshots are admitted before copy,
and exported raw grids are defensive owned copies. `reproject` only accepts a
subset of the completed analysis's zones; an evicted grid returns CACHE_MISS
without inference. Removing then restoring an envelope retains the original
zone set and does not cut independent ROI masks.

The native adapter's two ROI plus envelope produce561 positive pixels. Browser
CPU reproduces mask, analyzed and candidates exactly; source-map max error is
2.563e-6 and raw-probability max error2.608e-6. Three initial real inferences are
followed by zero-inference envelope removal/restoration and cached explicit
analysis. Corruption/pressure worker checks from the preceding increment remain
applicable because those sources did not change.

`npz.js` writes original-coordinate arrays or the native stacked
`raw_probabilities` shape[zone,channel,height,width], plus Unicode JSON metadata
and provenance. NumPy with allow_pickle=False independently reads the actual
browser exports: integer arrays exact, continuous errors unchanged, shapes/dtypes
and Unicode preserved. Sigmoid models do not invent source/target arrays. The
small generic ZIP/NPY writer is connected to the common exporter starting with
0.30.0-m1.1; its format follows the existing exporter.

Reproduce this increment:

```sh
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/generate-segmentation-zones.py
node scripts/study-segmentation-zones.mjs
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-segmentation-npz.py
```

Reports: `docs/segmentation-mpdn-zones-chrome-proof.json` and
`docs/segmentation-mpdn-npz-proof.json`. This remains a declared finite numerical
corpus, not bit-exact continuous output or universal detector performance.

## Measured MPDN hybrid (local0.30.0-m1.3)

`gpu-budget.js` admits actual GPU buffers; `inference-gpu-worker.js` uses the
separate bounded JSEP runtime. The original wide Concats exceed portable binding
limits; `rewrite-segmentation-concat.py` groups ordered copies without changing
model arithmetic. The direct and common-worker GPU proofs preserve native masks.
`backend.js` selects from capabilities and memory for real requested jobs only;
CPU remains explicit. See `docs/SEGMENTATION-MPDN-GPU.md` for full-chain measures,
reproduction, failed alternatives and integration limits. Other variants remain
CPU or explicitly unavailable according to their existing qualification.

## Bounded CMSeg pipeline (local0.30.0-m1.4)

Both final CMSeg checkpoints now run through the common worker, independently
pinned as bundle manifests plus encoder/decoder graphs. The split is exactly
equal in native Torch; the portable global correlation retains all pairs with
linear working storage and independent useful rows in a shared-budget pool.
Native global mean and distinct softmax-axis rounding were necessary to qualify
positive masks and probabilities. See `docs/CMSeg-BOUNDED.md` and
`docs/SEGMENTATION-M1-CONTRACT.md`; the4MGCF numerical rejections remain open.
