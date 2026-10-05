# CMSeg generalization GPU convolutions — M1.34

The existing `cmseg-generalization-native512-backbone-v2` bundle supports an
explicit `webgpu` backend and automatic selection by capabilities and shared
budget. CPU remains selectable. Both backends use the same verified bundle,
metadata, parameters and ONNX assets; no additional model download, conversion,
startup inference or performance calibration is needed. Addnoise remains on its
separately qualified CPU path.

Only the 39 ordinary backbone convolutions move to WebGPU, using the existing
D2PRL ordered float32 FMA helper. Depthwise 3×3 stride-1 Winograd remains CPU,
as do normalization, residuals, all three complete global correlations and the
ONNX bypass/decoder. Every output retains its complete reduction and receptive
field. Native512 preparation, precision, thresholds and output coordinates do
not change. There is no outer ROI pool multiplying the correlation workers.

## Resources and numerical evidence

Explicit GPU buffers are bounded by64MiB; observed maximum54,532,552 bytes.
One inference writes111,902,456 and reads101,482,496 GPU bytes, with273 explicit
buffer allocations. The common helper accounts CPU copies, returned outputs and
GPU buffers in the shared budget; pipeline residency uses bounded estimates.
Driver/compiler residency and process RSS are not measured. Each convolution
destroys its buffers; the backbone is disposed before the512MiB ONNX stages.
The selector's768MiB residency estimate does not replace actual admission of all
allocations. Model parameters are still verified lazily for each inference.

`execution.backend` is `webgpu-cpu`, `gpuMaximumBytes` is67,108,864 and
`gpuPeakBufferBytes` reports the explicit buffers. GPU transfers and backbone
timings reach the common API and NPZ metadata. Other operations retain their
own proven memory paths; this change does not qualify every model for every GPU.

Four generated model cases pass: structured-copy, constant, paired-spots and
blobs-copy. Preparation is exact; masks match native decisions, including2611
positive pixels in blobs-copy. Native probability maximum1.639128e-5 and
positive-case mean6.403390e-8 on the normalized[0,1] scale. A fresh CPU/GPU
comparison on the same positive input returns identical probability SHA256.

| Component, same1GiB budget | CPU | GPU convolutions + CPU |
| --- | ---: | ---: |
| Complete inference including parameter reads | 9.7420 s | 9.2367 s |
| Backbone execution excluding parameter reads | 2.0191 s | 1.4125 s |
| Parameter reads/verification | 0.4487 s | 0.4569 s |
| Global correlations | 6.2989 s | 6.3975 s |
| Peak accounted memory | 1,059,462,734 B | 1,055,643,012 B |

The measured backbone gain is1.43×; total inference gain is1.055×. Correlations
remain the dominant cost. These are serial runs with fresh helpers in one
Chrome154 context on a shared development workstation; OS/driver caches are not
flushed. This is a local backend comparison, not a whole-application speed claim.
See `cmseg-backend-comparison-proof.json` and `cmseg-gpu-model-corpus-proof.json`.

Real GPU submission cancellation, repeated cancellation with a reused pipeline,
pre-abort, admission failure and constructor rollback release every owned
reservation (`cmseg-gpu-lifecycle-proof.json`). The common-worker recipe also
checks source reloading after cancellation and ownership of views/exports.

## Large-source coverage

The actual immutable M1.33 CPU runtime processes a public generated JPEG of
12000×8000 pixels, two large copy regions and a full-image envelope. Three real
inferences yield935,251 exact positive mask pixels. All96 million values in
each full-resolution plane are checked. Map maximum1.460314e-5, mean5.980451e-8.
The cached two-region view has522,005 exact positives and performs no inference.

CPU load1.1908s, analysis46.5484s (projection6.2995s included), cached view3.6025s,
NPZ13.7591s; accounted peak3,200,872,430 bytes under3GiB. The672,013,940-byte
four-plane NPZ is independently read in full with NumPy, with CRC/SHA, types,
source identity and coordinates checked. These are functional observations.
Reports: `neural-segmented-cmseg-generalization-large-rich-cpu-m1-33-extracted-*`.

The new GPU path also completes the same96MP source and all three regions.
All four plane hashes, including probabilities, equal the CPU M1.33 result in
both the initial and cached views. Masks remain exact against native. Automatic
selection actually dispatches the GPU backend; ten bounded CPU workers perform
the unchanged global correlations.

GPU load1.1406s, analysis41.1425s (projection6.1408s included), cached view3.5439s,
NPZ14.7624s. Source and both sets of result planes are in RAM, export uses OPFS.
Peak accounted2,329,340,164 bytes under3GiB, final ownership zero. The complete
672,015,232-byte NPZ has SHA256
`4a036dadba80944566b1ae5d6f901b07e85ddd91ba8425831b137d245e2e4ceb`;
all four planes, CRC, types and source identities are independently NumPy-checked.
Reports: `neural-segmented-cmseg-generalization-large-rich-webgpu-m1-34-candidate-*`.
These large-path times are functional observations, not a controlled additional
speedup claim; the isolated comparison above establishes the local gain.

`cmseg-gpu-delivery-binding.json` verifies every file of the immutable M1.34
runtime, with identical hashes for the actual GPU96MP execution modules. A fresh
recipe against that copy checks automatic GPU selection, three JPEG zones,
cache-only projection, full NPZ, cancellation after a GPU submission and source
reload. No heavy unchanged inference is repeated just for packaging.

## Reproduction and native reuse

```sh
node scripts/study-cmseg-gpu.mjs --compare-backends
node scripts/study-cmseg-gpu.mjs
node scripts/study-cmseg-gpu-lifecycle.mjs
node scripts/study-neural-segmented.mjs --variant=cmseg-generalization --gpu --auto --large --rich --tag=m1-34-candidate
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-neural-segmented-npz.py cmseg-generalization --gpu --large --rich --tag=m1-34-candidate
```

The native reference/fixture generation uses the existing verified local assets;
weights, generated JPEGs and private native arrays remain outside the portable
source/runtime delivery. Browser experiments do not modify the native engine.
The reusable Mac idea is to move only independent ordered convolution outputs to
GPU while keeping sensitive Winograd and correlation arithmetic unchanged. A
native implementation would need its own transfer and full-chain measurement;
no native Metal/MPS speed gain is asserted here.
