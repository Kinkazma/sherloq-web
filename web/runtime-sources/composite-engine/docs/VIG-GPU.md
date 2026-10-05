# Ordered VIG WebGPU convolutions — M1.33

VIG now has a qualified hybrid option through the same segmentation API.
`backend:'cpu'` retains the original useful-worker reference; `backend:'webgpu'`
uses ordered float32 WebGPU convolutions. `auto` selects the hybrid when device
capabilities and the shared budget permit, without any test inference or startup
calibration. The CPU bundle also supplies every GPU parameter: `gpu.sharedAssets`
is true, so no second model URL or new conversion/weight download is needed.
The model bundle ID and its507-byte SHA remain unchanged.

Only convolutions move to GPU. Native256 preparation, CPU normalization and
pairwise graph distances, TopK/ties/dilation, interleaved max-relative features,
GELU and residuals remain unchanged, followed by the same CPU ONNX tail. There is
no FP16, quantization, layer replacement or threshold change. Each GPU invocation
owns a complete ordered dot product, using the existing D2PRL grouped/strided FMA
helper. The RGB stem is split into output channels0..63 and64..79 to preserve
its bias-after spatial domains; no receptive field or reduction is split.

## Budget and useful work

The backbone keeps its64MiB math heap and96MiB staging. Explicit GPU buffers are
bounded by64MiB and admitted through the same budget; the observed maximum is
16,714,312 bytes. Input/output transfers are included in execution: one inference
writes455,646,904 and reads104,857,600 GPU bytes over602 buffer allocations.
These capacities exclude driver/compiler residency; pipeline reservations are
estimates, not measured RSS. GPU buffers are destroyed after each convolution,
and the backbone is disposed before admitting the512MiB CPU decoder. There is no
outer ROI pool around this hybrid or its existing CPU internal pool.

The selector uses the staged residency of this path rather than adding unrelated
simultaneous512MiB CPU and512MiB GPU heaps. A1GiB component run fits. Actual
allocations still enforce the common budget. Missing GPU capability selects CPU
in automatic mode; an explicitly requested unavailable GPU remains an error.
Model/parameter identities are verified exactly as for CPU. Parameters are read
lazily, not all preloaded. Cross-region parameter reuse remains future work.

`execution.backend` is `webgpu-cpu`, `gpuMaximumBytes` is67,108,864 and
`gpuPeakBufferBytes` records explicit buffer capacity. Stage timings include
GPU write/read bytes. Results, raw-grid views and paged NPZ retain the same
source-coordinate semantics and execution metadata. CPU remains user-selectable.

## Numerical and performance evidence

Three independent seeded native convolutions cover the stem bias domains,
grouped graph convolution and FFN: all GPU output bytes are exact. Real GPU
submission cancellation, already-cancelled work, memory/geometry refusal and
retry pass with no reservations left after disposal. The three actual model
cases (structured-copy, constant, paired-spots) have exactly the same probability
SHA256 as the M1.31 CPU delivery; native masks are unchanged, including7,256
positive pixels. Native probability maximum7.808209e-6, mean on the positive
case2.854374e-7, on the normalized[0,1] scale. This is not a universal numerical
or detector-accuracy guarantee.

A fresh CPU/GPU pair on the identical positive input and1GiB budget measures:

| Component | CPU, up to10 workers | GPU convolutions + CPU |
| --- | ---: | ---: |
| Complete inference, parameter reads included | 13.3475 s | 8.3890 s |
| Backbone execution, reads excluded | 10.3718 s | 5.4001 s |
| Parameter reads/verification | 2.5448 s | 2.5321 s |
| Peak accounted memory | 1,073,048,298 B | 631,045,969 B |

The local inference gain is1.59× and the accounted peak is41% lower. Outputs
have identical SHA. Both conditions use fresh helpers, in one Chrome154 session;
OS/driver caches are not flushed and other workstation development remains
active. This is a backend comparison, not a WordPress or native Mac speed claim.
See `vig-backend-comparison-proof.json`, `vig-gpu-model-corpus-proof.json` and
`vig-gpu-operations-proof.json`. The unchanged CPU arithmetic proofs are reused;
there is no new requirement to re-qualify every activation.

## Actual96MP GPU path

The original public JPEG is12000×8000, with copy structures spanning two large
regions and a full-image envelope, bounded per-pixel noise and no extra input
subsampling. The three real GPU/hybrid inferences, native-coordinate projection,
owned plane reads, cache-only view and complete four-plane NPZ pass. The full
analysis has3,848,796 exact foreground pixels; its cached two-region view has
3,589,606. All96 million values of each full-size plane are compared with native.
Probability map maximum3.236533e-5, mean3.054465e-7; masks/analyzed/candidates are
exact. Preparation and output dimensions remain the native method's own choices.

Load1.1563s, analysis38.3671s (5.2042s projection included), cache-only view2.5434s,
NPZ15.3944s. Source and both independently owned sets of result planes are in RAM;
export uses OPFS. The672,014,404-byte NPZ is read completely with NumPy, verifies
ZIP CRC, SHA256, types, original/pixel identities and all four native arrays.
Peak accounted2,372,219,601 bytes under3GiB, final ownership zero. Timings are
functional observations on a shared workstation. Reports are
`neural-segmented-mgcfdn-vig-large-rich-webgpu-gpu-candidate-{proof,npz-proof}.json`.

This covers VIG's actual GPU96MP path. It does not automatically qualify the
CPU internal-pool96MP path, CMSeg512, TNT or MPDN GPU96MP. Their shared input and
projection proofs are reusable, but distinct memory paths remain explicit work.
Additional physical browsers/devices and WordPress integration remain open.

## Reproduce and integrate

```sh
node scripts/study-vig-model.mjs --gpu
node scripts/study-vig-model.mjs --compare-backends
node scripts/study-vig-gpu-operations.mjs
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-neural-segmented.py mgcfdn-vig --large --rich
node scripts/study-neural-segmented.mjs --variant=mgcfdn-vig --gpu --large --rich --tag=gpu-candidate
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-neural-segmented-npz.py mgcfdn-vig --large --rich --gpu --tag=gpu-candidate
```

Only the existing verified VIG external assets are required. No native libraries,
weights, private activation captures or generated JPEG/oracle arrays are added
to the portable runtime. Shared integration consumes the immutable M1 commit.

The reusable Mac idea is independent ordered output work on GPU while retaining
sensitive graph operations on CPU. No native Metal/MPS change or native gain is
included; that would require its own transfer and full-chain measurements.
