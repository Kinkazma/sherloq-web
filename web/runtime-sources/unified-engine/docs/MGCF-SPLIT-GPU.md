# MGCF base and source/target: bounded two-stage inference

M1.42 enables a separate qualified GPU mirror for MGCF base and source/target
(ST). The original CPU models and explicit CPU execution remain available.
The same float32 ONNX graph is split at its existing complete encoder outputs:
`[1,640,40,40]` features and one int64 scalar. No weight, operator, native256
input, threshold or search range changes. The head retains the complete
1600×1600 global consistency calculation.

Base uses WebGPU/WASM providers in both stages. ST uses a WebGPU/WASM encoder
and a WASM CPU head: the GPU head is numerically rejected, as detailed below.
A WebGPU stage is a provider preference with unsupported operators on CPU, not
a claim that every node runs on GPU. Both sessions are loaded by useful work
and reused for subsequent requests. No startup probe or calibration is added.

## Model and memory contract

`loadSegmentationModel` keeps its pinned CPU URL and accepts a separate `gpu`
descriptor for `gpu-split-bundle.json`. Serve its two child ONNX files beside
it. The CPU model URL cannot substitute for this GPU manifest. Exact public
manifest fixtures are in `fixtures/segmentation/gpu-split`; weights are external.
`split-mgcf-gpu.py` extracts the original graph and `stage-mgcf-split-gpu.mjs`
validates identities and creates the final manifest. No diagnostic graph ships.

| Variant | Manifest bytes | Child graph bytes | Head provider |
| --- | ---: | ---: | --- |
| MGCF base | 1597 | 89182861 | WebGPU/WASM |
| MGCF ST | 1602 | 89895559 | WASM |

Both child files are streamed into bounded buffers and checked by SHA256 before
session creation. The manifest pins source/checkpoint identities, tensor names,
complete boundary shape and each stage's placement. Admission includes 512MiB
WASM, 512MiB GPU, three times the child asset bytes and 12288024 bridge bytes;
the small manifest size is never used as the weight-memory estimate. Actual
intermediate data is 4096008 bytes. Input/output staging is admitted separately.
The useful GPU encoder completes and its features are read back before the head.
One outer inference lane owns both sessions; CPU retains independent ROI lanes.
Idle sessions are reclaimable, and cancellation terminates the worker and releases
its reservations. Model mirrors are configured lazily without fetching weights.

This route uses a separate ORT1.30 JSEP JavaScript runtime with only its idle
buffer bucket counts changed. Each idle storage/uniform pool is bounded by
32795264 bytes; each bucket retains at most4MiB. Bucket sizes, active buffers,
submitted work, shader arithmetic and the existing WASM binary are unchanged.
Destroyed but submitted buffers remain charged until queue completion. The
original ORT JavaScript file remains in use for other variants. Reproduce with
`build-segmentation-gpu-cache.py`; identities and exact count tables are in
`vendor/segmentation/GPU-CACHE-PINNED.json`. Its `staged-candidate` label records
the build step; qualification is bound separately in the delivery evidence.

## Actual workers, same 2GiB budget

Chrome154, actual production workers, a fresh page/session per backend, one
positive cold inference and two warm repetitions, then the remaining native
corpus. Driver/OS caches were not cleared; the workstation is shared. No profiler
runs during these measurements. Inference includes model initialization when
cold, feature staging, readback and the GPU completion fence.

| Variant/backend | Cold / warm / warm, ms | Peak accounted bytes | Peak GPU buffer bytes |
| --- | ---: | ---: | ---: |
| Base CPU | 4213.5 / 1807.3 / 1805.5 | 1346585849 | 0 |
| Base hybrid | 6079.6 / 218.5 / 173.5 | 1896110818 | 478173504 |
| ST CPU | 2483.2 / 1408.0 / 1342.9 | 1351375231 | 0 |
| ST hybrid | 2955.4 / 1125.8 / 1233.8 | 1901443128 | 297692544 |

Warm means are 1806.4→196.0ms for base and 1375.45→1179.8ms for ST. GPU cold
work is slower and reserves more memory. Preparation+inference+projection base
CPU is 4595.8/2008.9/2034.5ms, hybrid6214.2/770.6/691.3ms; ST CPU2564.7/1481.2/
1419.1ms, hybrid3033.1/1208.7/1327.9ms. These observations do not establish a
universal speedup or that one hybrid lane beats concurrent CPU ROI lanes.

One model-load event occurs per condition. CPU reads one model; hybrid reads
one manifest and two graphs, with zero model requests on every warm call.
Repeated raw output SHA is stable. Base GPU transfers per warm inference are
5205952 bytes written and14860288 read; ST13778112 written and4207552 read.
Observed WASM heaps are146014208 and212140032 bytes. Accounted peaks include
admitted ceilings and buffers, not browser/driver RSS; final ownership is zero.
Full measurements: [base](mgcf-split-mgcfdn-workers-proof.json) and
[ST](mgcf-split-mgcfdn-st-workers-proof.json).

## Numerical qualification and rejected paths

Base probability max error is1.3643503e-4 against the native corpus, maximum mean
error5.775505e-6 across its three cases; the positive case mean is3.1857703e-6.
The declared verification tolerance is1e-3, under the authorized numerical
latitude and with the measured warm gain above. All native projected masks and
their connected components remain exact on this corpus. The earlier strict1e-4
probe remains rejected. `numericalParity` propagates this continuous limitation
into result/NPZ `kernelParity`; CPU remains selectable.

ST encoder-GPU/head-CPU max probability error is1.6152859e-5 and maximum mean
1.2966799e-7 across six cases. Mask decisions are exact; continuous target/source
planes pass1e-4. Neither a binary label nor a component identity uses a float
tolerance. The native source-coordinate preparation is exact in both variants.

The original full GPU graphs exceeded512MiB before completing. Reducing idle
retention alone still failed: base531164832 bytes, no result, cleanup zero.
Two-stage execution resolves that memory issue without raising the ceiling.
The ST all-GPU head nevertheless produced max probability error0.754385 and up
to3293 changed mask pixels. CPU encoder/GPU head reproduces it; GPU encoder/CPU
head passes. That head placement is explicitly rejected.

Diagnostic output captures localize large divergence after initially close
correlation/TopK values, but exposing intermediates changes the divergence too.
Individual pooling/resize outputs remain close while final logits diverge.
This does not establish a simple arithmetic root cause or a repaired GPU head.
Retained evidence: `segmentation-mgcfdn*-gpu-concat-*-candidate.json`,
[head diagnostics](mgcf-st-head-diagnostic-proof.json) and
[pool diagnostics](mgcf-st-pool-diagnostic-proof.json).

## Actual source and API qualification

The new ST12000×8000 rich JPEG recipe executes two large ROI plus the full-image
envelope, three actual automatic hybrid inferences and a cache-only second view.
Both views have3370950 native-exact positive mask pixels; all six source-coordinate
planes are checked. Map max/mean error is1.1444092e-5/1.1170483e-7 in the first
view. Target/source maxima are1.1384487e-5/8.225441e-6. Continuous full-plane hashes
can differ from CPU; exact mask decisions are assessed separately.

Load1.2696s, analysis29.4794s including projection11.919s, cached view9.2045s,
NPZ preparation36.7979s. Peak3205063469 bytes under3GiB; source/first result use
RAM, the second result's six planes use temporary storage, and the export uses
OPFS. The complete1440014924-byte NPZ is independently NumPy-checked for CRC,
SHA, names/types/shapes, provenance and every array value; final ownership is
zero. SHA256: `66bfb93577cf08cafc6e10354455197c689691e02caa938d37b81fc630ddb6ff`.
This is slower than the historical CPU analysis20.5802s; no96MP total gain is
claimed. Timing on a shared host is not a controlled CPU/GPU comparison.

ST exercises the new two-session path with its larger assets and six output
planes; base's four-plane adapter reuses this memory-path evidence explicitly.
This is not a newly executed96MP base network. Original CPU96MP qualification is
unchanged. See [browser proof](neural-segmented-mgcfdn-st-large-rich-webgpu-m1-42-candidate-proof.json),
[full export](neural-segmented-mgcfdn-st-large-rich-webgpu-m1-42-candidate-npz-proof.json)
and [current memory-path coverage](NEURAL-96MP-COVERAGE.md).

`mgcf-split-delivery-binding.json` binds the immutable runtime to these component
sources and the copied common-worker API recipes for both variants: automatic
GPU selection, three zones, retained cached views, independently owned NPZ,
cancellation after useful encoder GPU completion and a fresh source reload.
Execution provenance adds `onnxStages:2`, `stageBackends` and `intermediateBytes`;
timings include `encoderMs` and `headMs`. Cached views perform no new inference.
Manifest, integrity, admission-before-worker, scheduler, ownership and export
tests cover the affected contracts. WordPress cohabitation, other browsers/GPU
vendors and physical mobile devices remain separate integration qualifications.

## Potential native reuse

Separating complete encoder features from the global consistency head, bounding
idle GPU allocation pools and reusing verified sessions are candidates for a
native implementation. No native code was changed. Browser-specific ORT allocator
behavior, costs and rejected ST head do not establish a native Metal benefit;
that requires a separate native measurement with unchanged scientific outputs.
