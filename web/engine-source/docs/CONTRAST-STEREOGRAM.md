# Contrast indicators and stereogram decoding

Two portable operations preserve the native OpenCV 4.11.0 / NumPy 1.26.4
reference on public synthetic fixtures. WordPress integration and physical
Safari/mobile testing remain separate work. Neither operation uses a remote
service, changes image resolution to save time, or returns an authenticity verdict.

## Contrast Enhancement — panel 7:0

`tampering.contrast` defaults to `{block:64,mode:2}`. Block sizes are 32, 64, 128
or 256. Modes are 0 histogram error, 1 channel similarity, 2 their joint indicator.
The joint value is a heuristic, not a calibrated probability of manipulation.

`data.values` is Float32Array in row, column, indicator order, with `rows`,
`cols`, three `indicators`, `block`, source `width`/`height` and `paddedSize`.
`pixels` is the selected RGB8 view at source dimensions. JSON export retains
the numerical grid and provenance. The cache depends on block size; changing
mode reuses analysis and produces an independently owned raster.

Historical details are intentional: padding adds a complete zero block when a
dimension is already divisible, and the maps contain an extra zero row and
column. Histogram taper constants, float64 DFT, NumPy reduction order, float32
indicator storage, median display filter and nearest-neighbor expansion match
the native algorithm. No smoothing or statistical threshold was substituted.

Qualification: 13 images, all four blocks, **52 grids and 156 views exact**.
The corpus includes constant/tiny images, divisible and odd dimensions,
correlated channels, quantization, gamma, monochrome and a synthetic 1 MP JPEG
decoded to RGB8 by the native reference. See `contrast-reference.json`,
`contrast-parity-experiment.json` and the three `contrast-*-proof.json` reports.

## Stereogram Decoder — panel 9:3

`various.stereogram` defaults to `{mode:0}`. Modes are 0 pattern, 1 silhouette,
2 normalized relative disparity, 3 disparity-shaded pattern. `data.detected`
indicates whether the native periodicity heuristic found an offset. Failure to
find a period is a successful result with `offset:null`, no `pixels`, and no
fabricated disparity. Very small images can have an empty search curve.

`data.differences` is the Float32Array of offset costs starting at
`firstTestedOffset:10`. A detected period supplies `offset`, output `width` and
`height`, plus the two half-open `comparedBounds`. Output width is source width
minus offset. The two source slices are compared without a hidden crop choice.
Search uses native half-height grayscale; optical flow uses the full-height
cropped pair. This is the original algorithm, not an acceleration downsample.

Only modes 2 and 3 compute or return `data.flow`, a Float32Array in row,column
order. It contains horizontal Farneback displacement, not physical depth. The
search and pattern are separately cached, then shared by the lazy flow stage;
switching between modes 2 and 3 never recomputes optical flow. Returned arrays
and pixels do not alias private caches. JSON export includes the selected
mode's available arrays and provenance.

The reference's fused arithmetic is explicit in the generated OpenCV Farneback
object. Gaussian pyramid filtering, linear resizing, half-size area reduction
and float32 normalization also pin native rounding order, including odd tails.
This prevents small flow differences from becoming visible after normalization.
The source OpenCV tree and native SHERLOQ application are not modified.

The optimized CPU path uses exact binary64 products for binary32 FMA operands,
with software FMA fallback at binary32 midpoints, underflow and nonfinite values.
For binary64 accumulations, the shortcut is used only when both factors are
exactly representable as finite binary32 numbers. General binary64 FMA remains
unchanged. `cpuKernel:'reference'` retains the software-FMA path. Both run in a
single main worker; additional workers/GPU are not claimed for this operation.

Qualification: **28 searches, 25 float32 flows and 100 views exact**, including
odd/even pyramid boundaries, multiple periods, three absent-period outcomes
and a synthetic 1024×1024 case. Six million random IEEE-bit triples exercise
both arithmetic shortcuts against software FMA; 63,891 additional binary32
corner/halfway cases include signed zero, subnormals and exceptional values.
See `stereo-reference.json`, `stereo-parity-experiment.json`, Node tests and
the three `stereo-*-proof.json` reports. This is fixture qualification, not a
claim that all real-world stereograms decode correctly.

## Resources and measurements

Use one worker engine per page for shared admission. Conservative operation
reservations are 48 bytes per source pixel plus 64 MiB for contrast, and 192
bytes per source pixel plus 64 MiB for stereo, in addition to retained sources
and caches. These are working-set accounting bounds, not measured process RSS.
WASM memory grows as needed; unload drops source and analysis references,
while disposing the worker releases its runtime heap.

All three browser suites verify exact values, owned buffers, lazy caches,
hard cancellation, explicit reload, insufficient-budget rejection and cleanup.
The isolated `contrast-stereo-benchmark.json` records three sequential 1 MP
samples, load, RPC, raster presentation and cached view costs separately.
`contrast-stereo-reference-benchmark.json` preserves the initial software-FMA
measurement. No WordPress rendering, hardware utilization percentage, universal
speedup or physical-device coverage is inferred from these measurements.

Chrome154 isolated medians: contrast RPC **26.2 ms**, cached view **1.8–2.0 ms**;
stereo originally **19,981.3 ms**, then **3,238.2 ms** with contiguous Gaussian
passes and reference FMA, and **2,729.9 ms** with the qualified arithmetic
shortcuts as well. The final cold stereo run is **3,588.7 ms**; subsequent
view changes cost **25.6–26.2 ms**. All recorded output hashes match the native
reference. The earlier arithmetic-only experiment showed no useful end-to-end
gain and is retained as `stereo-arithmetic-experiment.json`; reordering the
filter loops was the major improvement. The final measurement isolates the
additional arithmetic gain after that change (about 16% lower median RPC).

`metrics.stages` includes search/pattern/flow timings and a `flowBreakdown` for
Gaussian filtering, resizing, polynomial expansion, initial matrices and flow
iterations (which include their internal matrix updates). These are elapsed
stage times, not hardware utilization measurements. Cached results expose
cache hits rather than replaying old timing measurements as new work.

Rebuild: `EMSDK=/path/to/emsdk-4.0.15 bash scripts/build-opencv.sh`.
Regenerate native fixtures with the pinned reference environment, then run:

```sh
node scripts/check-contrast-reference.mjs
node scripts/check-stereo-reference.mjs
node --test tests/contrast.test.mjs tests/stereogram.test.mjs
node scripts/browser-test.mjs --contrast --stereo
node scripts/browser-test.mjs --contrast-stereo-benchmark
```

Repeat browser qualification with `--browser=firefox` and `--browser=webkit`.
Benchmark only after other measurement jobs are idle.
