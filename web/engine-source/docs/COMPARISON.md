# Pairwise image comparison — 0.10.0

`comparison.image` accepts a loaded `imageId` and a loaded
`params.referenceImageId`. Both must have exactly the same dimensions. Original
bytes and decode provenance remain separate for each image; the engine neither
resizes nor converts through Canvas. Comparing an image to itself is supported.

Parameters: `view: 'normal' | 'difference' | 'ssim' | 'butter'` (default normal),
`metrics: boolean` (default false), `equalized: boolean`, `grayscale: boolean`.
Normal displays the reference. Difference is the native globally normalized
absolute RGB difference. SSIM and Butteraugli use the native grayscale input
policy. Equalization precedes grayscale rendering. All presentation combinations
are supported by the numerical API; a native-style UI may disable controls for
normal/Butteraugli, as the native UI does independently of its display engine.

With `metrics: true`, `data.values` contains the defined members of the native
20-measure sequence: RMSE, SAM, ERGAS, MB, PFE, PSNR, SSIM, MS-SSIM, RASE, SCC,
UQI, VIFP, SSIMULACRA, Butteraugli and six RGB histogram comparisons. PSNR +∞ is
encoded as the string `'+Infinity'` so JSON does not silently turn it into null.
Undefined measures appear in `data.errors` and do not suppress other measures.
The two external native helpers are now in-process WASM functions; minimum-size
and printed-score precision (eight / six decimals) are retained.

## Historical histogram correlation

The native Python binding converts its 256×256×256 histogram into a two-dimensional
256-channel Mat. The usual `hist_0` therefore uses a divisor of 65,536 while
summing 16,777,216 bins, and can lie outside [-1,1]. The browser preserves that
historical score, reports `histogramCorrelationBinDivisor`, and adds an explicit
warning. `histogramCorrelationFullBins` is a separate, correctly dimensioned
correlation verified against a flattened native histogram. Neither score is
clamped. The native integer-count correction above 2²⁴ already uses the correct
bin count and is handled separately.

## Ownership, lifecycle and exports

Both image lifetimes are dependencies of every cached pair result and stage.
Unloading either image removes those entries. Reusing the same ID or original
bytes with different explicitly supplied pixels cannot reuse an old analysis.
Unrelated single-image caches remain available. Caller-owned results are clones.
`provenance.references` identifies the reference hash and its decode policy.
Hard worker cancellation discards the worker and requires both sources to reload.

JSON preserves both provenances, maps, scores and explicit errors. CSV is a new
browser export: metric, value, status, detail, including the independent full-bin
correlation and native divisor. It is not represented as a native CSV format.
Analysis stages are shared across display changes; requesting a display without
all metrics avoids unrelated calculations. All computation is local.

## Numerical qualification

The synthetic native corpus contains 33 pairs, including 1 MP, degenerate/tiny
images, scale boundaries, anticorrelation, impulses, gradients and saturation.
All 528 rendered views are byte-exact. SSIMULACRA and Butteraugli printed scores
are exact. Other finite scores are checked with absolute/relative tolerance
1e-12, and the sets of undefined measures must match exactly. Source and helper
binary hashes identify the actual oracle. The browser never invokes these
native binaries. See comparison-parity-experiment.json and browser proof files.

Sewar uses pinned float64 Gaussian coefficients, native convolution grouping,
reflection and reduction rules, complex MS-SSIM powers and the original tiny-image
valid-convolution behavior. SSIMULACRA preserves float32 Gaussian, reciprocal,
mean and area-resize rules. Butteraugli preserves its unfused four-value
convolution prefix and fused tail. The guarded binary64 Sewar FMA is checked against the software reference on
30,073,152 scalar and 24,097,152 SIMD arithmetic cases and all 33 image pairs. The original remains selectable
with `cpuKernel: 'reference'`; see COMPARISON-ARITHMETIC.md for the rounding guard.
Arithmetic is determined by the reference,
not by the brand of the browser host.

The shared budget accounts conservatively for both retained sources, stages,
working arrays and returned copies. Display-only requests have smaller admission
costs. All-measure jobs run in one CPU worker using independent binary64 SIMD lanes;
multicore/GPU acceleration has not been measured for this family. The
conservative 1,900 MiB working limit protects this 2 GiB WASM module; refusal is
explicit and does not change image resolution. Physical device and WordPress
integration remain separate acceptance steps.


## Isolated performance evidence

On the synthetic 1024×1024 pair, Chrome 154's median full-worker RPC fell from
43,594.7 ms to 17,109.3 ms (2.55×). The first optimized pass was 17,479.3 ms;
these measurements include worker messaging, input copies and all twenty scores.
The three warm samples are recorded separately. Cached presentation changes,
source loading, raster display and the accounted memory peak are also reported
in `comparison-benchmark.json`: median load/RPC/raster chain 17,154.9 ms,
accounted peak 736,114,578 bytes; SSIM/Butteraugli cached views around 0.6–0.9 ms. The memory metric is accounting, not RSS or
available physical RAM. There is no WordPress or device-wide speed guarantee.

The 512×512 kernel experiment isolates each change: original Sewar 9,957.9 ms,
contiguous loops with original FMA 9,016.0 ms, guarded SIMD 3,404.0 ms (medians of
three). The earlier scalar-only rounding shortcut was slower (48,004.8 ms full
1 MP RPC) and was rejected as a default. Baseline and rejected measurements are
retained; the original arithmetic and loop path remain selectable. No image
resizing, threshold change, lower precision or extra CPU pool produced this gain.

Release qualification: all 69 Node tests pass; the complete comparison corpus,
scalar/SIMD arithmetic checks and lifecycle pass in Chrome 154, Firefox 155 and
WebKit 26.6. The runtime archive receives a separate 30-operation smoke test.
