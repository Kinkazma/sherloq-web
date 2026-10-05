# Corrected IPOL Noisesniffer — browser CPU engine

`noise.noisesniffer` follows the unchanged SHERLOQ `core/noisesniffer.py`
reference, including its corrected flat-block criterion and bounded DCT batches.
It does not reproduce the original upstream mistake of testing block IDs for
zero instead of testing standard deviations.

Defaults: `{blockSize:3,cellSize:100,samplesPerBin:20000,
lowFrequencyFraction:.1,lowNoiseFraction:.5,view:'regions'}`. Block sizes are
3/5/7/8; the other ranges match the native UI: cell 10–500, samples 100–200000,
low-frequency fraction .01–1 and low-noise fraction .01–.99.

The three views are `regions`, `mask` and `distribution`. Red regions are
statistical noise inconsistency evidence, not manipulation probabilities or an
authenticity verdict. Empty block selection sets `metadata.inconclusive:true`.
An empty mask alone must not be labeled an authenticity result.

## Arrays and exact native choices

`data` has source width/height, `mask` (uint8 0/255), `distribution` (RGB8),
`all_blocks` and `low_noise_blocks` (float64 cell counts), `gridWidth/gridHeight`,
`selected` and `low_noise` (uint32 row-major window indices). Selected indices
retain duplicates across channels. Grid size is floor(height/cell)+1 by
floor(width/cell)+1, including historical empty edge cells. Window width is
source width minus blockSize plus one. Metadata records original parameters,
valid/selected/low-noise counts and ordered region cell coordinates `[row,col]`.
Region `log10_nfa`, selected/all counts and overlapping regions are preserved.

Validity excludes each channel's global extrema. Means follow OpenCV's actual
float64 filter arithmetic, including its full-image DFT path for an 8×8 kernel.
DCT-II uses pinned SciPy 1.17.1 pocketfft, axis 1 then axis 2, orthonormal scaling,
the native float32 frequency mask/square and NumPy reduction order. The native
trigonometric seeds are frozen constants, not a check of the user's device brand.
Native NumPy 1.26.4 unstable indirect quicksort/heapsort is retained at all three
selection steps; replacing it with JS stable sort changes selected equal values.

Binomial survival uses SciPy's pinned Boost.Math source/policy. Underflow uses
the native decreasing-PMF-ratio fallback. Measured logarithmic errors are
declared separately from exact masks. Strict native growth comparisons remain
strict, including equalities; `data.numerics.nearGrowthBoundaries` counts margins
below 1e-9. Significance within 1e-9 of zero is explicitly rejected with
`NUMERIC_RANGE`, rather than issuing an unqualified threshold decision.
This guard is an implementation limit, not a changed significance threshold or
a universal proof of floating-point error bounds for arbitrary images.

## Public lifecycle, memory and exports

Use the existing engine/worker `load`, `run`, `unload` and `dispose` calls.
Statistics cache keys include block size; selection parameters reuse statistics,
and changing a view reuses the complete analysis. Owned input/result buffers,
reload invalidation, global admission and hard worker cancellation are tested.
After hard cancellation the source must be reloaded.

NPZ contains six native arrays and Unicode JSON metadata/provenance. Distribution
is exported as BGR8 and window indices as int64, preserving the native NPZ
contract while the browser API remains RGB8. Native NumPy readback verifies
dtypes, shapes, every byte, CRC, region metadata and non-BMP Unicode without
pickle. JSON is also available; its size admission can reject large textual
exports. Existing ZIP/NPY serialization is shared with ZERO and requalified.

Current admission reserves 320 bytes per input pixel plus 64 MiB, besides the
engine reserve, retained sources and caches. Individual WASM working arrays
remain limited by the current 2 GiB module. Overlapping region output exceeding
one retained cell record per source pixel is rejected with `MEMORY_LIMIT`.
These are current implementation limits, not native or scientific pixel limits.
Segmented sources, storage-backed global sorting and streamed NPZ remain open
under `MEMORY-EXECUTION-CONTRACT.md`; this version does not claim arbitrary sizes.

## Arithmetic and worker optimization

`cpuKernel:'reference'` keeps software FMA in the original order.
`'single'` enables the qualified exact FMA guards in one worker.
`'auto'` starts independent DCT bands immediately from 1 MP. Means/global
extrema stay in the main worker with full source geometry. Each band includes
blockSize−1 halo rows; no region, histogram, search or FFT is independently tiled.
Native/pocketfft threading is disabled. The initial child count is CPU concurrency
minus one, bounded by geometry and the shared memory budget. Every requested
statistics pass executes once; no serial baseline or candidate sweep precedes it.
Real completed task timings can lower concurrency on subsequent work. A recognized
worker/resource failure releases children before one exact serial retry, recorded
in `metrics.scheduling.retry`. Other errors propagate. See `IMMEDIATE-COMPUTE.md`.

0.13 first useful RPC, Chrome154, same 1024² fixture: **2380.4 ms (3×3)** and
**1817.0 ms (8×8)**, ten active workers in both cases; subsequent medians2208.4 /
1726.6ms. Zero preflight executions, one requested execution, native checksums
exact. Source loading and presentation are reported separately in
`noisesniffer-immediate-benchmark.json`. No saved profile or separate warm-up.

### Historical 0.12 measurements — superseded scheduling

The following archived measurements describe the removed runtime calibration.
They are retained for comparison, not the current first-use behavior.

Measured sequential Chrome 154, synthetic 1024×1024, full native output checksums:

| Block | Original CPU RPC median | FMA only | Calibrated workers | Active workers | First auto RPC |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3×3 | 3459.8 ms | 2611.3 ms | 2242.0 ms | 5 | 15422.2 ms |
| 8×8 | 9936.7 ms | 4955.7 ms | 1783.0 ms | 10 | 38801.5 ms |

Auto complete load/RPC/raster medians: 2251.4 and 1790.9 ms. Changing a cached
view takes roughly 2–4 ms RPC. Accounted peaks including calibration workers:
1,080,688,640 and 1,081,868,288 bytes. Main WASM capacities: 50,987,008 and
110,886,912 bytes; accounted worker allowances are separate and are not RSS.
Initial calibration is substantially slower; warm gains must not be advertised
as gains for the first analysis. No GPU path or native Mac speedup is claimed.

Proofs: `noisesniffer-benchmark-original.json`, `noisesniffer-benchmark-fma.json`
and `noisesniffer-pool-benchmark.json`. Native sources were not modified.

## Qualification scope

Synthetic corpus: 36 exact statistic sets, 120 analyses/360 views (including
positive regions), 24 explicit regional-growth cases, 96 unstable-sort cases,
796 binomial-tail probes. Maximum observed log-survival error 9.1e-13 and log10
NFA error 4.6e-13 on this corpus; all selections, cell decisions and pixels exact.
Additional 1 MP recipes validate complete statistic and output checksums for
3×3 and 8×8. A further 90 large binomial probes reach ten million trials; their
test tolerance is 1e-7 absolute plus 1e-13 relative in log-survival units.

Node compares the original and optimized arithmetic explicitly. Chrome, Firefox
and WebKit validate the public lifecycle, 1 MP results, twelve forced real-worker
partition cases and
cancellation after nested DCT workers are dispatched. Tests and all raw proof
files accompany sources. WordPress integration and physical devices remain
separate; no Safari-device or mobile-memory claim follows from WebKit headless.
