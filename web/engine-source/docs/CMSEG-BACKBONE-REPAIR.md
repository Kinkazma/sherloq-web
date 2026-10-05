# CMSeg generalization: native-order backbone, M1.28

The callable `cmseg-generalization` variant now requires
`cmseg-generalization-native512-backbone-v2`. The former bundle remains rejected
with `MODEL_IDENTITY`; its [JPEG counterexample](CMSEG-JPEG-NUMERICAL-LIMIT.md)
and negative reports are preserved. Addnoise retains its own qualified graph
and correlation arithmetic. TNT/VIG remain unavailable.

## Repair and scientific boundary

The new JPEG exposed probability error1.516342e-4 in v1; changing only the
correlation primitive did not fix it. Isolated native encoder operators localized
the remaining error. Ordinary/pointwise convolutions and stride2 depthwise
convolutions use the existing D2PRL ordered float32 FMA helper. Stride1 depthwise
3×3 convolutions use the pinned native Winograd F(2,3) arithmetic. BatchNorm uses
the existing qualified D2PRL helper; ReLU6 and residual additions preserve the
original order. No checkpoint, layer, precision, threshold, native512 preparation
or all-pairs search domain is changed.

The implementation follows the pinned [PyTorch2.8 CPU depthwise source](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/DepthwiseConvKernel.cpp).
It selects operators from the verified model graph, never from an Apple or
browser-brand test. This is reference arithmetic on portable WASM, not a native
macOS library loaded by the browser. The original v1 conversion already had
native-order BN replacements; the isolated original ONNX BN diagnostic alone
must not be misrepresented as the cause of all v1 errors.

The actual149-node checkpoint backbone feeds the existing ASPP/SAM bypass and
decoder ONNX arithmetic. Its x2–x5 boundaries and all three full correlation
outputs are bit-exact on the recorded old corpus and localized JPEG case.
The ASPP/SAM x1 path and decoder remain numerically different: this is not a
claim of bit-exact full-network logits. In the four old cases, probability
maximum error is1.6391277e-5 with zero changed mask pixels, including the positive
case with2611 pixels. Recorded logits can differ by2.3651123e-4; the declared
acceptance metric is probability absolute error≤1e-4 plus exact masks, not logits
or every intermediate tensor. Model calibration/accuracy on arbitrary real images
is outside this numerical comparison.

The real segmented JPEG API compares three independent zones and complete
source-coordinate arrays. Generalization now yields probability maximum
1.3619661e-5; mask, analyzed and candidates are exact. Cache-only reprojection,
owned numeric windows, independently owned paged NPZ and NumPy readback pass.
The copied-runtime recipe also cancels during actual backbone work and reloads
a readable source. No native comparator tensor enters product inference.

## Model delivery and admission

| Item | Bytes | SHA256 |
| --- | ---: | --- |
| bundle.json |885|5971bb653cecd0c6f9672bed99c2f694151ed9b50693501642ca66213b820c2c|
| backbone.json |123659|229eb4777e368f0350afdf3e1f96e290227dd85d4dc7b814c6ed51ef71d5e025|
| native checkpoint | unchanged |a3351ae664fca9780c3ca56db708fe3fdc74878c07327dfdd6ed75f14537454b|

The bundle names `bypass.onnx` and `decoder-native-mean-bn.onnx`, totaling
12,010,557bytes. Backbone metadata names9,031,936 parameter bytes, with each
float32 shape, size and SHA; identical content may share one file. The exported
`delivery-manifest.json` lists only bundle, backbone, these two graphs and the
unique `parameters/<sha>.bin` files. Serve those relative paths from the explicit
model URL, with browser fetch/CORS permission. Model assets remain separate from
source/runtime delivery; this conversion does not grant redistribution rights.
Do not ship a whole `.build` directory or diagnostic activations.

Configuration is lazy. Each actual node reads and verifies its needed parameter;
values are released after their final consumer. Pool admission uses the common
budget and useful convolution tiles. Each convolution worker is single-threaded
with256MiB ceiling; Winograd has a fixed64MiB heap, neural math grows only after
admission. Backbone helper heaps and idle convolution workers are released before
the512MiB ORT CNN worker is created. The FMA correlation workers retain64MiB
ceilings and all global pairs. No startup calibration, unrelated model preloads
or nested thread pools are introduced.

The initial three-zone JPEG observation completed in30.31s under1GiB, with peak
accounted1,073,580,334bytes and zero remaining ownership after release. This is
functional evidence, not an isolated speed comparison or process RSS. Final
copied observations are recorded separately; times may differ. Parameter reads,
backbone setup and backbone execution are attributed separately;
`parameterLoadMs` is a component of `modelLoadMs`, and `backboneMs` of
`inferenceMs`. Do not sum these overlapping timing fields a second time.

## Reproduction and limits

Use the existing pinned native conversion environment, local checkpoints and
Emscripten4.0.15. No download, training or mutation of the native application is
performed. The earlier split conversion/native-mean-BN recipes remain prerequisites.

```sh
PYTHONPATH=.build/onnx-python PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/export-cmseg-backbone.py
python3 scripts/build-cmseg-exact-kernels.py
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/generate-cmseg-winograd.py
node --test tests/cmseg-winograd.test.mjs tests/cmseg-backbone-admission.test.mjs tests/segmentation-admission.test.mjs
node scripts/study-cmseg-backbone.mjs generalization --legacy
node scripts/study-neural-segmented.mjs --variant=cmseg-generalization --tag=backbone
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-neural-segmented-npz.py cmseg-generalization --tag=backbone
```

The tagged recipe preserves the old negative reports. Use `--runtime-root=<copy>`
for the explicit runtime-manifest copy. Model weights stay at their separate
local mirror. Nine synthetic Winograd fixtures cover entire float32 outputs,
odd edges, padding0/1 and nonzero bias. Admission tests cover partial constructor
rollback, malformed/failing reads, cancellation and refusal of the old identity.
`probe-cmseg-encoder.py` and `study-cmseg-encoder.mjs --refined` reproduce isolated
operator diagnosis on native comparator inputs; they are not product inference.
The preserved encoder diagnostic reports originated during localization, whereas
the component and common-worker proofs hash the delivered production sources.

Chrome154 on the reference workstation is qualified here. Other physical devices,
Safari/Firefox execution and WordPress integration remain separate work. CMSeg
has no qualified GPU backend. No Mac performance gain is claimed from this
numerical repair; reusable ordered convolution/BN primitives already have their
own D2PRL evidence. The full50-panel mission remains open.
