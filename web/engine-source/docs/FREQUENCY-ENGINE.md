# Frequency separation — 0.6.0

`detail.frequency` ports native `FrequencyEngine` and `circular_mask` at original
resolution. Controls are integer percentages `split` (default 15), `smooth` (25),
`threshold` (0), each 0–100, and display `filter` (0), 0–15. No scientific defaults
change with the computation profile.

Outputs: `pixels` is the low-frequency RGB8 image. `data.high` is the high-frequency
RGB8 image. `data.magnitude` and `data.phase` retain optimal-DFT padded dimensions;
`data.frequencyDimensions` describes that coordinate system. The four `layers`
identify their field paths and whether their coordinates refer to the source or
frequency domain. `data.mask` contains float32 low-pass coefficients, not a
manipulation-detection mask. `data.zeroPercent` reproduces the native threshold
count (zero when threshold is disabled). Low frequency is cropped before min/max
normalization, high frequency after normalization. Display filtering affects
magnitude and phase only. Degenerate/constant inputs preserve native behavior.

The native pinned reference is OpenCV 4.11.0 with GCD/Carotene. Its float32 DFT
uses fused arithmetic; the portable build compiles the same DFT source with
explicit correctly rounded fused operations. Native log/angle/normalization and
reciprocal-square-root arithmetic are reproduced without requiring ARM hardware.
Odd scalar tails at native 64K parallel stripe boundaries are material to output
normalization, including 625×625 images. The shipped reference tables are portable;
the optional ARM table generator is a build-time reference aid, not a dependency
on the end user's architecture. Constants and OpenCV/Carotene licenses are retained.

The CPU Gaussian path shares identical circle rows, moves border lookup outside
the inner vertical loop, and uses exact double intermediates with fused fallback
at float32 halfway/underflow cases. Accumulation order, weights and output size
are preserved. DFT, masks (by split/smooth), reconstruction (by split/smooth/threshold)
and display-filter views have separate bounded caches. `metrics.cache.stages`
reports reuse; changing threshold reuses the mask, changing filter reuses all
four unfiltered analysis views. Transfers return owned copies.

## GPU selection and resource lifecycle

Default `backend:'auto'` considers a high-performance WebGPU adapter for smoothing
work above 1,048,576 pixel×kernel units. No brand or operating-system test is used.
From 0.13, setup creates only the required device and shader pipeline. Numerical
corpus checks and performance comparisons run in development tests, never before
the user's request. No mask is computed twice to compare CPU/GPU at runtime.
The declared development adapters pass exact masks and final views; other adapters
remain unverified, without a universal bit-exactness claim.
Only Gaussian smoothing runs on GPU; DFT, thresholding, normalization and
reconstruction stay on CPU. `provenance.backend` and GPU metrics record this path.

`backend:'cpu'` always computes/caches the CPU path independently. An explicit GPU
request fails if admission, device setup or computation fails; automatic selection records its
CPU fallback reason. `cpuKernel:'single'|'reference'` also keeps automatic frequency
work on CPU. CPU remains usable in Firefox configurations with WebGPU blocked.

GPU buffers are admitted under the same engine budget as images/WASM/caches.
Accounting includes four full-resolution GPU buffers, coefficients, uniforms,
staging headroom and an estimated 32 MiB device/driver reserve. Actual physical GPU
allocation is not observable here. Buffers are destroyed after each dispatch;
the device is destroyed after the last image unload or disposal. Hard worker
cancellation destroys the job; the caller then reloads the original. Backend
cache keys prevent a CPU override from returning an earlier GPU analysis.

WGSL permits floating-point reassociation and does not require universally fused
`fma` results ([WGSL floating-point rules](https://www.w3.org/TR/WGSL/#floating-point-accuracy)).
Runtime probes and the recorded corpus demonstrate bounded qualifications, not
universal equality for untested GPU implementations. No precision reduction is used.

## Evidence and measurements

- `frequency-reference.json`: 4,320 native images across ten small synthetic inputs,
  including row/column/constant cases; DFT, normalized log magnitude and phase exact.
- `frequency-large-reference.json`: 48 further native images at 257×261, 625×625
  and 1024×1024; native outputs independently repeated; all images/base floats exact.
- 132 Gaussian masks checked against native floats. Chrome and WebKit GPU: zero differing
  coefficients, max absolute error 0, RMSE 0, zero/nonzero decisions identical.
- `frequency-*-proof.json`: 4,368 images pass through real workers in Chrome 154,
  Firefox 155 and Playwright WebKit 26.6; owned transfers, cache, CPU override,
  cancellation, recovery and unload. Firefox follows its available CPU path.
- `frequency-lifecycle-*-proof.json`: explicit GPU, low-budget refusal, automatic
  fallback, separate CPU cache and released reservations/device.
- 44 Node regression tests pass. Existing hashes/codecs/filters remain qualified
  after the DFT arithmetic override.

`frequency-benchmark.json` records three sequential 1024×1024 trials per backend,
with split 50, smooth 100, threshold 37, display filter 0, under Chrome 154.
No concurrent heavy benchmark ran. Full worker RPC medians: CPU **21,604.9 ms**,
GPU+CPU **301.5 ms**. Including source loading and raster presentation through two
animation frames: **21,627.6 ms** and **315.8 ms**. First GPU run, including runtime
qualification: **485.9 ms**. Subsequent runs: 301.5 and 299.6 ms. All four output
hashes and threshold counts match native. A changed threshold reuses the mask
(~154 ms GPU series); filter-only changes reuse analysis (~367 ms including a
large CPU display blur). Accounted GPU-series peak: 362,832,410 bytes.

These are measurements for one synthetic workload and one accessible machine,
not WordPress, physical Safari, mobile GPU/memory or a universal speed promise.
The browser renderer uploads the low view; the other three buffers are transferred
and verified but are not simultaneously displayed by this benchmark. Timestamp
query instrumentation is not used; dispatch time includes GPU wait/readback.
