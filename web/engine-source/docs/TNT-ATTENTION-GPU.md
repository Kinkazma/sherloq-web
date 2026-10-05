# TNT outer attention on GPU — M1.38

The GPU/hybrid TNT path retains small inner attention matrices on CPU and moves
only the two outer matrix products to its existing ordered GPU device. This
selection follows paired development measurements, with layout, transfers and
readback included. No calibration, new device pool or precision change enters
the user path. Explicit CPU retains the original WASM arithmetic.

## Operator decision

Each head keeps its complete zero-initialized FMA reduction in native order.
A head becomes one group of a 1×1 convolution. Rows are converted from
`A[head,row,k]` to channel-major `input[head,k,row]`; each output channel's weights
are the corresponding column of B. Output is converted back to row-major.
Splitting independent heads never splits a reduction or softmax domain.

| Product | Heads / rows / k / columns | CPU warm, ms | GPU warm, ms | Retained route |
| --- | --- | ---: | ---: | --- |
| Inner scores | 1024 / 16 / 10 / 16 | 5.3–5.4 | 11.8–13.8 | CPU |
| Inner context | 1024 / 16 / 16 / 10 | 5.3–5.5 | 9.1–9.8 | CPU |
| Outer scores | 10 / 257 / 64 / 257 | 126.0–152.3 | 6.7–10.7 | GPU |
| Outer context | 10 / 257 / 257 / 64 | 141.3–168.6 | 8.9–9.1 | GPU |

All four geometries, the scaled scores and the unchanged WASM softmax are
native-exact in the [paired operator proof](tnt-attention-operations-proof.json).
After the initial pair, two warm pairs alternate execution order. First GPU
calls include pipeline preparation and cost 118.9 / 22.3 / 23.4 / 33.6 ms. The
inner GPU implementation is retained as a tested development candidate but is
rejected by the production selector because its complete cost is higher.
The earlier [correctness-only proof](tnt-attention-operations-correctness-proof.json)
ran during another native calculation; its times are excluded from gain evidence.

The largest explicit attention GPU working set is 6,610,112 bytes. Both selected
outer products fit one job, within the existing 4096-channel geometry and 64 MiB
explicit GPU ceiling. Layout copies and returned arrays have shared-budget
reservations; the existing 96 MiB live-activation staging remains. Submitted
work drains before buffer release on cancellation. Layout loops cooperate with
control messages. Actual submitted-work cancellation, pre-abort, geometry and
memory refusal, exact retry and final ownership all pass.

## Complete model, same caches on both sides

The [baseline](attention-reuse-mgcfdn-tnt-baseline-m1-37-proof.json) executes
immutable M1.37, which already has GPU linear layers, parameter caching and
reclaimable ONNX sessions. The [candidate](attention-reuse-mgcfdn-tnt-candidate-proof.json)
changes the outer attention route. Each condition runs three actual positive
inferences under 2 GiB in a fresh Chrome 154 browser. There is no result-grid
cache supplying these outputs. OS and driver caches are not flushed; the
workstation remains shared.

| Measurement | M1.37 | Outer-GPU candidate |
| --- | ---: | ---: |
| Cold complete inference | 9.4265 s | 8.6724 s |
| Warm inference 1 | 7.8113 s | 2.8851 s |
| Warm inference 2 | 7.6279 s | 4.3349 s |
| Mean of the two warm observations | 7.7196 s | 3.6100 s |
| Peak accounted bytes | 1,088,214,620 | 1,092,408,924 |
| Warm parameter / ONNX requests | 0 / 0 | 0 / 0 |

The observed warm mean improves by 2.14×; both individual warm runs improve,
with visible timing variation retained. This is not a universal speed ratio.
The additional 4 MiB accounts for two cached pipeline reservations. GPU buffer
peak stays 12,485,192 bytes. Candidate attention products together take
333.7 / 503.5 ms in the warm runs, including CPU inner products and GPU staging.
The full model uses one GPU device, 1267 explicit buffer allocations, 487,949,352
GPU write bytes and 189,952,480 read bytes per inference. Driver/compiler
residency and browser-process RSS are not reported as zero.

Every probability SHA equals M1.37 and the earlier CPU result. The three-case
[model corpus](tnt-attention-model-corpus-proof.json) preserves all decisions:

| Native case | Positive mask pixels | Probability max / mean absolute error |
| --- | ---: | --- |
| Structured copy | 11,990 | 2.980232e-6 / 6.533844e-7 |
| Constant | 0 | 1.296401e-6 / 9.895602e-8 |
| Paired spots | 8,009 | 3.129244e-6 / 1.226219e-7 |

These are final normalized probabilities, not logits or universal bounds on
intermediate tensors. Patch extraction, normalization, scaling, softmax, GELU,
residuals, decoder, native256 preparation, projection and thresholds are unchanged.
All owned component reservations return to zero.

## API and large source

`execution.attentionBackend` is `webgpu-outer-wasm-inner` or `wasm-cpu`.
`timings.attentionMatmulMs` includes all attention products and their staging,
layout and transfers, rather than GPU-kernel-only time. Execution metadata goes
into the scientific NPZ; cache-only projection reports no new attention work.

The [rich 12000×8000 browser run](neural-segmented-mgcfdn-tnt-large-rich-webgpu-m1-38-candidate-proof.json)
and [complete NumPy readback](neural-segmented-mgcfdn-tnt-large-rich-webgpu-m1-38-candidate-npz-proof.json)
pass. Two large ROI plus the full envelope produce 4,949,629 exact native mask
pixels; the cached two-zone view has 3,908,651. All four plane SHA in both views
match the earlier M1.35 GPU and M1.34 CPU source proofs. The initial map's maximum
native error is 3.039837e-6, mean 8.608047e-8. Raw-grid errors are reported separately.

Load takes 1.3717 s, analysis 30.4512 s including 5.2798 s projection, cached view
2.8522 s, and NPZ preparation 73.6128 s. This complete source recipe is a functional
observation, not an isolated attention speed comparison with earlier versions.
In particular the export observation is slower than earlier runs; its code is
unchanged and no export gain is claimed. The timer covers archive preparation,
with subsequent full readback verified separately.

The accounted peak is 2,630,886,876 bytes under 3 GiB. Source and both results
reside in RAM; export uses OPFS. Three real inferences use one ONNX session
creation and two reuses, with 722 parameter hits and 361 misses. Cached view
reports zero attention, parameter or session work. Final owned memory is zero.
The independently checked four-plane NPZ is 672,015,440 bytes, SHA256
`c0d5083d329f5b866369a0c3bba81df146612c47ef6f3c4e3f66eb0b41d417fb`.

Delivery checks also exercise the copied runtime's auto-GPU API, cache-only view,
NPZ metadata, cancellation after an actual outer-attention GPU submission and
source reload. The [delivery binding](tnt-attention-delivery-binding.json) verifies
all runtime bytes and the exact component/96MP execution sources. Prior distinct
CPU paths are reused only for unchanged arithmetic, with their version identified.

Native Mac code is untouched. Grouping independent matrix heads into ordered
GPU jobs is a transferable implementation idea; the native attention backend
already has a different dispatch/runtime, so no Mac speedup is established here.
Additional physical devices and shared WordPress cohabitation remain separate
qualifications.
