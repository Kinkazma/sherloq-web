# Ordered TNT linear layers on GPU — M1.35

The existing `mgcfdn-tnt-native-order-v1` bundle supports `webgpu`, with the
same verified assets as CPU. Automatic selection checks capabilities and shared
memory admission; explicit CPU remains available. No extra weights, model
conversion, calibration inference, precision or input resolution change occurs.

Only linear layers move to GPU. Their existing channel-major layout is treated
as a1×1 convolution, with each invocation retaining its complete ordered float32
FMA sum. The biased width40 layers split output channels0..31 from32..39 to
preserve native bias-before/bias-after order. Biasless layers retain the CPU's
zero-initialized FMA order. This partitions output work, not the reduction or
receptive field. Patch extraction/convolution, norms, GELU, attention matrices,
softmax, residuals and the ONNX decoder retain their existing CPU arithmetic.

Five independent seeded native linear fixtures are byte-exact, including width40
and biasless cases. Actual GPU submission cancellation, pre-abort, memory and
geometry refusal, retry and disposal pass. All three model probability hashes
match the prior M1.30 CPU delivery: structured-copy, constant and paired-spots.
Native masks remain exact, including11990 and8009 positive pixels. Maximum
native probability error3.129244e-6 on normalized[0,1]; paired-spots mean1.226219e-7.
The unchanged CPU GELU approximation is still not claimed bit-exact to native.

## Resources and timing boundaries

The64MiB math heap and96MiB staging remain. Explicit GPU buffers are bounded
by64MiB, observed peak12,485,192 bytes. A full inference makes1099 buffer
allocations, writes432,404,904 and reads150,353,920 bytes. Copies and buffers use
the shared budget; shader pipelines have bounded estimated reservations.
Driver/compiler residency and process RSS are not measured. The backbone is
disposed before its512MiB ONNX decoder, so these stages do not accumulate heaps.

The component's accounted peak is630,316,508 bytes, versus1,039,854,956 on CPU
under the same1GiB budget (39.4% lower). The hybrid has no outer ROI pool.
`execution.backend` is `webgpu-cpu`; execution metadata and NPZ retain the
64MiB GPU ceiling, observed capacities and transfer counts. Parameters remain
lazy and verified; cross-region parameter caching is a separate optimization.

The first sequential positive CPU/GPU observation was25.8065/8.8985s, but CPU
parameter reads alone took6.8944s versus2.2878s on GPU. Workstation activity
varied substantially, so that2.90× ratio is not a controlled speedup claim.
The three GPU corpus inferences took7.97–9.01s. Fresh-helper comparison is
reported separately, with stage timings and exact output hashes; OS/driver
caches are not flushed. There is no native Mac or WordPress performance claim.

One repeated pair on the same positive input and1GiB budget gives13.1126s CPU
versus8.5405s hybrid (1.535×). Parameter reads are1.8807/1.9919s; backbone
execution excluding those reads is10.8275/6.1391s (1.764×). Probability SHA is
identical and the accounted peaks are unchanged. This repeat resolves the
obvious first-run load variation without claiming an isolated hardware lab.
See `tnt-backend-comparison-repeat-proof.json`; the earlier observation is
preserved rather than silently replaced.

Evidence: `tnt-gpu-lifecycle-proof.json`, `tnt-gpu-model-corpus-proof.json`,
`tnt-backend-comparison-proof.json` and the independent CPU arithmetic proofs
in [TNT numerical repair](TNT-NUMERICAL-REPAIR.md).

## Actual96MP source and portable delivery

The public generated JPEG12000×8000 contains copied structures in two large
regions, plus a full-image envelope. The existing CPU runtime M1.34 and new
GPU runtime each perform three complete inferences. Four full-size plane hashes
are identical between CPU and GPU, both before and after cache-only projection.
The initial mask has4,949,629 exact native positives; the cached view3,908,651.
Map maximum3.039837e-6, mean8.608047e-8 on normalized[0,1]. Every value of all
96-million-element planes is compared with native, not sampled.

GPU load1.3591s, analysis45.1989s (projection5.3853s included), cached view2.6123s,
NPZ15.6960s. CPU load1.1474s, analysis57.0635s (projection5.2920s included), cache
2.5640s, NPZ14.8361s. These are functional observations, not another controlled
backend benchmark. Both peaks are2,371,490,140 bytes under3GiB because retained
full-size outputs dominate this path. Source and both result sets are in RAM;
export uses OPFS. The GPU672,014,364-byte NPZ SHA256 is
`661ec7beb3ea2bbe15dc8099c54be9407dec2ac8ae36f8b4980c9d90c0f725df`.
Both exports pass independent full NumPy/CRC/SHA/type/source-coordinate checks,
with zero final owned reservations. Reports are
`neural-segmented-mgcfdn-tnt-large-rich-{cpu-m1-34-extracted,webgpu-m1-35-candidate}-*`.

The immutable M1.35 runtime also runs the small JPEG three-zone API recipe,
automatic GPU selection, cached view, independently owned full NPZ, cancellation
after GPU submission and source reload. `tnt-gpu-delivery-binding.json` checks
every copied file and binds the actual96MP GPU execution to identical delivered
modules, without normalized hashes. The wider
[96MP memory-path table](NEURAL-96MP-COVERAGE.md) records the additional MPDN GPU,
VIG CPU and addnoise CPU paths and the exact scope of shared ONNX adapter reuse.

## Reproduction and native reuse

```sh
node scripts/study-tnt-gpu-lifecycle.mjs
node scripts/study-tnt-gpu.mjs --compare-backends
node scripts/study-tnt-gpu.mjs
```

Native checkpoint assets and generated oracle arrays remain outside portable
source/runtime delivery. The general Mac optimization is to dispatch independent
linear outputs on GPU while retaining sensitive attention and normalization
operations on CPU. No native Metal/MPS implementation or native gain is shipped;
it would require a separate measurement of transfers and the complete pipeline.
