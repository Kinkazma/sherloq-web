# CMSeg generalization: retain the normalized GPU tensor

M1.46 reuses the resident dot-product helper qualified for addnoise in M1.45.
Generalization keeps its own FMA normalization and existing CPU postprocessor;
the two models must not exchange normalization implementations. Its convolution
backbone, CPU Winograd, decoder, native 512 input and all model assets are
unchanged. The two smaller correlations remain CPU in this increment.

The largest full-global correlation uploads its normalized tensor once and
retains four buffers across both complete passes. Every distant comparison and
native softmax dependency remains. No quadratic matrix is retained. The same
shared budget admits useful CPU postprocessing workers with a real 32 MiB
WASM ceiling, overlapping one GPU job. No startup probe or calibration is added.

`gpu.residentCorrelation:true` selects this execution policy using the existing
shared model bundle. `execution.correlationBackend` now reports
`webgpu-resident-dot-128-wasm-rest`, including in NPZ. Explicit CPU, automatic
capability/budget selection, parameters and session caches keep their behavior.
Addnoise's M1.45 execution and all other model descriptors remain unchanged.

## Exactness and measured costs

The [three full operator geometries](cmseg-correlation-gpu-resident-r64-32m-m1-46-proof.json)
are bit-exact against both qualified CPU and independent native correlations.
The largest observation is 6.0711 s CPU versus 3.4549 s hybrid, with accounted
peaks 708,698,112 versus 475,396,416 bytes. This is one shared-host observation.
Actual-submission cancellation, pre-abort, invalid geometry, memory refusal
and one-worker retry under 64 MiB pass with no remaining reservations.

The [four-image complete corpus](cmseg-correlation-model-corpus-resident-m1-46-proof.json)
retains every M1.40 probability SHA. All native mask decisions are unchanged,
including 2,611 positive pixels. The whole network's native probability error
remains max 1.63912773e-5, mean 6.40338979e-8 on that case. Exact CPU/GPU output
identity does not make the complete network bit-exact against native.

Actual complete inference uses the same positive RGB, 2 GiB budget, warm
parameter cache and ONNX sessions in both conditions. Each run computes useful
inference again; none is a result-cache hit.

| Condition | Cold, s | Warm 1, s | Warm 2, s | Accounted peak, B |
| --- | ---: | ---: | ---: | ---: |
| Immutable M1.45 | 7.9891 | 6.6778 | 6.8267 | 1,323,240,068 |
| Resident input | 6.7067 | 5.5733 | 5.5576 | 1,323,240,068 |

Observed warm means are 6.75225 versus 5.56545 s, 17.58% less. The complete
peak stays unchanged because other stages dominate it. GPU allocations fall
from 3,857 to 277 and written bytes from 920,522,488 to 113,483,512 for the
whole model. Readback remains 2,248,966,144 bytes; its cost is included. Backbone
and correlation use two successive devices, with at most one active at once.
Explicit buffer peak stays 54,532,552 bytes and excludes driver residency.

Warm parameter and ONNX requests are zero, the output probability SHA stays
`13e4925c4a2d22c43b5799de9643f116bcd9e652e1a61f156b69cf8db840b8f2`,
and final reservations are zero. [Baseline](correlation-reuse-cmseg-generalization-baseline-m1-45-proof.json)
and [candidate](correlation-reuse-cmseg-generalization-resident-m1-46-proof.json)
record all runs. The baseline report corrects only inherited recipe wording
that named M1.39; its recorded runtime manifest and actual source bytes identify
M1.45. No timing or output was changed. Each condition uses a fresh browser;
OS/driver caches were not flushed, so the measurements are not a universal gain.

## Delivery and reuse boundaries

The [new rich 96 MP recipe](neural-segmented-cmseg-generalization-large-rich-webgpu-m1-46-candidate-proof.json)
loads the original 12000×8000 JPEG and analyzes two large regions plus a full-
image envelope. All four complete plane hashes in both views equal M1.40:
935,251 then 522,005 native-positive mask pixels. The first map error remains
max 1.46031380e-5, mean 5.98045110e-8. One ONNX session creation/two reuses and
520 parameter hits/260 misses are recorded; the cached view has no neural work.

Load 1.2084 s; analysis 39.0788 s including 6.7646 s projection; cached view
3.9796 s; NPZ preparation 15.0051 s. These are functional observations, not
a controlled 96 MP speed comparison. The peak stays 2,338,438,660 bytes under
3 GiB. Source and both results use RAM; export uses OPFS. Every reservation is
released after independent export readback.

The [complete NumPy NPZ check](neural-segmented-cmseg-generalization-large-rich-webgpu-m1-46-candidate-npz-proof.json)
verifies all four planes, shapes/dtypes, native values, CRC and provenance.
The archive is 672,016,516 bytes, SHA
`cccd186f65f132e25ee1a1f5117b250a0671b3c690a9b8b9208b8266751feda1`.
Its bytes differ from older archives because the execution provenance changes;
the numerical and mask plane hashes remain identical.

The exact copied-runtime receipt, large-source evidence and unchanged-path
checks are in `cmseg-resident-delivery-binding.json`. The source package retains
the operator, model, warm-inference and original-JPEG/NPZ recipes. The new helper
does not change or redistribute any model weights.

The copied API receipt also covers cancellation after an actual correlation
GPU submission and source reload, cache-only views and independently owned
exports. Unchanged CPU and addnoise paths reuse their earlier proofs with
explicit source/descriptor checks; they are not labeled as newly executed.
WordPress cohabitation and additional physical GPUs/browsers remain unqualified.

The same tensor-retention idea may reduce native Mac transfers, but requires
separate measurement with native libraries and scheduling. No native code was
modified and this browser result makes no Mac performance claim.
