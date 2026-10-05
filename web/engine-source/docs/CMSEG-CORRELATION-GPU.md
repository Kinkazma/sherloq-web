# Streamed global CMSeg correlation

M1.40 accelerates the128×128 feature correlation of CMSeg generalization.
Each64-row GPU job compares those rows against **all16,384 locations**, in the
original24-term zero-initialized float32 FMA order. Two full passes retain the
global softmax dependencies. No distant pair is dropped and no quadratic matrix
is kept in RAM. Model inputs and full source-coordinate outputs are unchanged.

The CPU still normalizes the features and applies Gaussian suppression, the
distinct native rounding orders of the two softmax axes and sorted TopK. One
GPU job overlaps independent single-thread CPU postprocessing jobs. The two
smaller correlations retain their existing CPU implementation; the explicit CPU
model route and CMSeg addnoise are unchanged. There is no user calibration.

## Selection and memory

The separate postprocessor has a **real32MiB WASM maximum**. Its budget includes
that ceiling and owned transfers, rather than assuming the smaller initial heap
is its maximum. Workers start immediately on useful jobs and their count follows
available shared memory and hardware concurrency. No nested pool is started.
The previous64MiB prototype and256-row alternative are retained as historical
measurements; they are not the delivered runtime. For historical reproduction
in a separate checkout, apply [the64MiB source patch](cmseg-correlation-64m-reproduction.patch),
run its build script with the pinned Emscripten4.0.15 and then the staging script.
The patch restores the measured helper/worker/recipe sources and the64MiB build;
it must not be applied to the delivered32MiB runtime.

The final [operator proof](cmseg-correlation-gpu-streaming-r64-32m-probe.json)
compares all three complete native feature geometries to the qualified CPU and
independent native correlations. Every output value is bit-exact. It also checks
actual GPU-submission cancellation, pre-abort, invalid geometry, memory refusal,
and exact retry with one worker under64MiB. Final reservations are zero.

For the selected largest geometry, the CPU observation is9.3383s versus5.1532s
hybrid, including initialization, normalization, all transfers and postprocessing.
Accounted peaks are708,698,112B versus475,411,200B under2GiB. The GPU explicitly
holds at most9,967,944B of buffers, but reads back2,147,483,648B over the complete
two passes and writes808,620,032B. The transfer cost is included, not hidden.

The initial64MiB/r64 probe measured9.8095→6.1037s for the large correlation while
both smaller shapes slowed down. The256-row probe reduced submissions and
repeated input writes, but raised its peak from810,955,520B to1,100,788,736B for
a modest, load-sensitive timing difference. The smaller64-row working set was
retained. Final small-shape observations also vary; no stable advantage is
claimed for replacing their CPU paths in this release.

## Actual model measurements

Three actual inferences use the same positive RGB, model,2GiB budget, parameter
retention and ONNX session reuse in both conditions. None is an output-cache hit.

| Condition | Cold, s | Warm1, s | Warm2, s | Accounted peak, B |
| --- | ---: | ---: | ---: | ---: |
| [Immutable M1.39](correlation-reuse-cmseg-generalization-baseline-m1-39-proof.json) | 11.9112 | 10.0236 | 11.5793 | 1,346,857,604 |
| [Final32MiB hybrid](correlation-reuse-cmseg-generalization-candidate-32m-proof.json) | 8.0857 | 11.9955 | 7.6950 | 1,323,240,068 |

Observed warm means10.80145→9.84525s; one candidate iteration is slower and is
retained in the report. Shared workstation load prevents a stable universal
speed claim. Both conditions have zero warm parameter/ONNX HTTP reads. The
initial64MiB full-model candidate is recorded separately and is superseded.

All probabilities retain SHA
`13e4925c4a2d22c43b5799de9643f116bcd9e652e1a61f156b69cf8db840b8f2`,
with2611 exact native-positive mask pixels. The
[four-case1GiB model corpus](cmseg-correlation-model-corpus-32m-proof.json)
retains every prior CPU/GPU probability hash and native mask decision. The
maximum native probability error is1.6391277313232422e-5, mean6.403389791890049e-8
on the positive case; exact correlation does not make the whole network bit-exact
against native. Nine useful workers are observed under1GiB, with peak1,068,469,636B
and zero final owned reservations.

The model creates two GPU devices **sequentially**, one for its backbone and one
for the selected correlation, with at most one active device. Its explicit
buffer peak54,532,552B is unchanged; total3857 allocations,920,522,488B written
and2,248,966,144B read include the new correlation work. Accounted capacity is
not process RSS or driver/compiler residency.

## API and large-source qualification

`execution.correlationBackend` identifies `webgpu-dot-128-wasm-rest` or
`wasm-cpu`. `timings.correlationGpuMs` measures the complete largest hybrid
stage, including CPU postprocessing, not only GPU time. `correlationMs` retains
all three stages. Cached views perform no new correlation work. These fields
reach the paged NPZ provenance.

[The96MP browser route](neural-segmented-cmseg-generalization-large-rich-webgpu-m1-40-candidate-proof.json)
uses a rich12000×8000 original JPEG, two large ROI and a full-image envelope.
All four full-resolution plane hashes in both views equal the earlier CPU/GPU
routes. The first mask has935,251 native-positive pixels and the cached view522,005;
both are exact. Map error is max1.4603137969970703e-5, mean5.980451104596677e-8.

Load1.3211s, analysis49.1865s including6.8200s projection, cached view3.9095s,
NPZ preparation16.7025s. This functional observation is slower than the earlier
41.1425s large-path GPU run; no total96MP speedup is claimed. Current source and
both results use RAM; export uses OPFS. Peak2,338,438,660B stays below3GiB. One
session creation/two reuses,520 parameter hits/260 misses, and zero neural work
on the cached view are verified. Final owned reservations are zero.

[Independent NumPy verification](neural-segmented-cmseg-generalization-large-rich-webgpu-m1-40-candidate-npz-proof.json)
checks all four exported planes, shapes/dtypes/values/SHA, CRC and provenance.
The full672,016,264-byte NPZ has SHA
`6d957f3a413639370c4b3cfb9af2a9014146fb1ce6baf8a629dc215f1670c0c6`.
This route and the copied common-worker API are bound to exact runtime bytes
in the release binding and the [memory-path table](NEURAL-96MP-COVERAGE.md).
The API recipe cancels after actual correlation GPU submission and reloads the
original source; the independently owned export remains readable after releasing
the source, model and result. This engine evidence does not qualify WordPress
cohabitation or untested physical mobile devices and GPU vendors.

## Native reuse

Reusing a bounded GPU product stream with exact CPU global statistics may be
useful on the Mac, but its transfer costs and native parallel libraries differ.
Only the browser path was changed. No native speedup is claimed. The lower heap
reservation is specific to this separately compiled browser postprocessor and
must not be copied into unrelated native or browser workers.
