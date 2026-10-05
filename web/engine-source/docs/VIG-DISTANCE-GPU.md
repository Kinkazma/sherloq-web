# VIG graph distances on the shared GPU

M1.39 moves VIG's ordered graph dot products to the same WebGPU device already
used for convolutions. All 640 terms remain in their original zero-initialized
float32 FMA reduction. The normalized 640×256 tensor is borrowed from the bounded
WASM heap; its transposed weights, returned matrix and GPU buffers are admitted
under the common budget. The existing 640/1 pipeline is reused.

Normalization and norm sums retain their native WASM implementation. Distance
formation preserves separate float32 operations in their original order:
`-((sums[i] + (-2 * dot(i,j))) + sums[j])`. TopK, including ties, dilation and
max-relative gathering stay in the existing WASM code. No change to checkpoints,
network input size, thresholds or independent region semantics is introduced.
The explicit CPU route retains its original distance calculation. No synthetic
probe or calibration enters the product.

## Evidence and measured scope

[Operator recipe](../scripts/study-vig-distance.mjs) and
[Chrome proof](vig-distance-operations-proof.json) use the existing independently
generated native random and tied graph fixtures. All repeated distances, selected
neighbor indices and gathered values are bit-exact. Native arrays are comparison
oracles only. Actual GPU-submission cancellation, pre-abort, invalid geometry,
memory refusal, exact retry and zero final owned reservations pass.

| Fixture | First CPU / GPU, ms | Warm CPU, ms | Warm GPU, ms |
| --- | ---: | ---: | ---: |
| Random, k18/dilation4 | 51.3 / 18.2 | 49.7 / 49.2 | 12.5 / 15.5 |
| Ties, k15/dilation3 | 49.5 / 13.0 | 49.4 / 49.4 | 4.6 / 9.4 |

Timings include output copies, GPU layout, transfers and readback; both routes
exclude the same normalization and neighbor selection. Explicit simultaneous
GPU buffers total1,836,104B; the complete operator's accounted peak73,536,512B
includes its64MiB WASM heap. Driver/compiler residency is not inferred from those
buffer capacities. Device acquisition precedes these operator timings.

The actual repeated-inference recipe compares an immutable M1.38 runtime against
the candidate, with the same2GiB budget and parameter/session retention in both:

| Condition | Cold, s | Warm1, s | Warm2, s | Accounted peak, B |
| --- | ---: | ---: | ---: | ---: |
| [M1.38](distance-reuse-mgcfdn-vig-baseline-m1-38-proof.json) | 7.7808 | 5.8975 | 4.6804 | 1,183,749,073 |
| [M1.39](distance-reuse-mgcfdn-vig-candidate-proof.json) | 7.3899 | 5.1138 | 4.0192 | 1,183,749,073 |

Observed warm means5.28895→4.5665s, about13.7% less time. These are serial
observations on a shared workstation, not isolated statistical or universal
performance claims. Each row runs a real inference, never a cached output.
Both conditions make zero parameter/ONNX HTTP requests at warm inference.
Probability SHA remains
`a050434b5773fbf9f8f5faee40c6fb2cb6654e57c0b2d9caa18646bfe5260a55`,
with7256 exact native-positive pixels. Candidate graph formation totals81.0ms
cold and132.3/79.5ms warm; this excludes normalization and neighbor selection.

[The three-case model corpus](vig-distance-model-corpus-proof.json) retains every
prior CPU probability SHA and the same native mask decisions. Maximum probability
error against native is7.808208465576172e-6, mean2.8543736096875905e-7 for the
positive case; the ONNX tail remains numerically distinct from native. Exact
graph operators do not imply all internal native tensors are exact. One GPU
device performs714 allocations per inference; explicit peak buffers16,714,312B
remain unchanged. Writes476,635,960B and reads109,051,904B include the graph
transfers. The full inference owns zero reservations after disposal.

## API, large sources and provenance

`execution.graphDistanceBackend` is `webgpu-dot-wasm-postprocess` or `wasm-cpu`.
`timings.graphDistanceMs` measures distance formation and its copies/transfers;
normalization, TopK and gathering are outside that timer. Cached views report no
new graph-distance work. Execution metadata is carried into the paged NPZ export.

[The96MP source recipe](neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-39-candidate-proof.json)
uses a rich12000×8000 original JPEG, two large independent ROI and a full-image
envelope. All four full-resolution plane hashes in both views equal M1.37GPU
and M1.34CPU. The first mask has3,848,796 exact native-positive pixels; the cached
view has3,589,606. Map error against native is max3.236532211303711e-5 and
mean3.054464762202193e-7, unchanged from the prior route.

Load1.4619s; analysis37.3323s, including6.1689s projection; cached view2.7744s;
NPZ preparation25.3717s. These functional observations do not establish a full
96MP speed gain against the earlier37.0844s run on this shared workstation.
Accounted peak2,713,889,617B remains below3GiB and equals M1.37. Source and both
results use RAM, export uses OPFS. One ONNX session creation/two reuses and1022
parameter hits/511 misses are verified; cached views perform no neural work.

[Independent NumPy readback](neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-39-candidate-npz-proof.json)
checks all four planes, their dimensions/dtypes/values/SHA, ZIP CRC and provenance.
The owned672,015,512-byte NPZ has SHA
`c5d6d767e6eb1898a14127114e0b58eca6ae1f6e6979c53639a4d0fcd83212d7`.
All final owned reservations are zero. The release binding and common
[memory-path table](NEURAL-96MP-COVERAGE.md) retain exact proof identities. The copied
API recipe explicitly cancels after graph-distance GPU submission, then reloads
the original source; exports keep their independent ownership after source,
result and model release. These tests qualify the engine API; WordPress
cohabitation and other physical devices require their own integration evidence.

## Native reuse

The reusable idea is to retain the exact graph-neighbor policy while measuring
ordered dot products on the GPU already used by the backbone, including layout
and readback. Native Torch/Metal may have different overhead and reduction order.
No Mac code was changed and no Mac acceleration is claimed. Validate its actual
neighbor indices and final masks before adopting a native implementation.
