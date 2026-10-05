# Stored DCT evidence and JPEG Ghost maps

These are separate operations. Neither returns a probability of manipulation nor
recovers an image's complete compression history. ELA energy/biomes and their
Ghost support are separate integrated paths; their current qualification is
described in `M5-LARGE-SOURCE-COVERAGE.md`.

## Aligned double-JPEG evidence — `jpeg.multiple`

No parameters. Original JPEG bytes are required; caller-supplied RGB pixels cannot
substitute for stored coefficients. Libjpeg reads the luminance DCT coefficients,
quantization table and dimensions directly. The detector examines nine low AC
frequencies, absolute-coefficient bins 0–255, and complete 8×8 source blocks only.
Edge padding is excluded and out-of-range counts are reported as `ignored_tail`.
Source EXIF orientation does not rotate this encoded-domain analysis. Progressive
JPEG is supported; malformed/truncated input fails explicitly.

`data` contains `version:'aligned-lattice-v1'`, `verdict`, `reason`, supporting /
eligible / tested frequency counts, threshold 0.8, minimum three supporting
frequencies, original SHA256, encoded dimensions, complete-block count, progressive
flag, codec identity, nine records and scientific limitations. Each record includes
frequency, histogram, current quantization step, candidate step/lattice when
eligible, score, expected/observed gap fractions, samples and ignored tail count.
Verdicts are `compatible_traces` or `inconclusive`; no unsupported authenticity
verdict is substituted. There is no primary raster. JSON export preserves data;
the frontend can plot the histograms and lattices independently.

Candidate testing reproduces the native aligned-lattice algorithm, including the
q2<3 neighboring-bin allowance, minimum 1000 samples / 12 occupied bins, expected
gap fraction >=0.25, candidate bounds and deterministic tie selection. Float64
Gaussian coefficients are pinned from SciPy 1.17.1 and NumPy 1.26.4. The portable
C smoothing kernel preserves the native separate multiply/add vector prefix and
fused scalar remainder; the sums preserve NumPy's pairwise order.

Thirteen synthetic JPEG fixtures cover single/double/triple compression, equal
qualities, coarser last compression, progressive, gray, flat, tiny, odd-size,
large coefficient tails and orientation. Stored counts/steps/tails/dimensions are
exact, and file scores are exact across Chrome, Firefox and WebKit. Another 335
controlled histograms have identical candidates/eligibility/decisions and maximum
score error 3.34e-16. See `double-jpeg-*-proof.json` and
`double-jpeg-parity-experiment.json`. Cache ownership, JSON, cancellation, reload,
non-JPEG refusal and truncated input are tested. No isolated speedup is claimed.

Aligned grids and sufficiently separated quantization steps are prerequisites for
useful evidence. Equal qualities, coarse final compression, crop/resampling, small
or smooth images may hide traces; periodic content may imitate them. The memory
admission uses **encoded** dimensions even when explicit RGB dimensions differ.

The segmented-source adapter and oversized contiguous JPEGs now use libjpeg's
native global virtual coefficient arrays with external backing storage. The
same entropy decoder visits all scans, including progressive refinements;
histograms still cover every complete luminance block in encoded coordinates.
An8MiB coefficient cache and64MiB imported WASM ceiling replace the large
resident coefficient allocation. Original encoded input is read in64KiB windows.
OPFS or IndexedDB stores use the shared temporary-storage session and are deleted
after computation, including cancellation or errors. No decoded RGB staging,
recompression, image reduction or independent-tile approximation is introduced.
Small contiguous JPEGs retain their existing path.

The thirteen native coefficient cases remain exact when backing storage is
forced with a64KiB cache. The335 existing lattice cases still pass unchanged.
Injected I/O failure, cancellation, truncated input and early memory refusal
release stores and reservations. The public adapter retains owned cache and
JSON exports. The original96MP recipe in `scripts/test-m5-dct-96mp.mjs` passes
on engine716c106: nine complete histograms, every native score and decision
are exact, with cache and full JSON after unload. Real OPFS and IndexedDB
progressive backing-store cases also pass. See `m5-dct-96mp-proof.json` and
`M5-LARGE-SOURCE-COVERAGE.md` for memory, timing and lifecycle evidence.

## Ghost maps — `jpeg.ghosts`

| Parameter | Default | Range |
| --- | --- | --- |
| `low`, `high` | 50, 90 | integer JPEG qualities 0–100, low <= high |
| `step` | 5 | integer 1–20 |
| `x`, `y` | 0, 0 | integer circular shifts 0–7 |
| `grayscale` | true | gray or native viridis palette |
| `includeOriginal` | false | optional separate original RGB layer |

At least 16×16 pixels are required. The engine circularly rolls full-resolution
RGB pixels, recompresses each requested quality, and averages squared RGB errors
over complete 16×16 blocks, using the native float64 reduction order. No image
rescaling or edge padding is hidden. Quality zero retains its label and follows
the native codec's quality clamp. Quality values are `low + i*step <= high`.

`data.raw` and `data.maps` are Float64Array cubes with layout
`row,column,quality`. `qualities`, `rows`, `cols`, `blockSize`, `roll`,
`sourceDimensions` and `completeExtent` describe their geometry. Each map cell is
normalized over the requested qualities; an all-equal cell becomes zero. Therefore
changing the quality range can legitimately change normalized values. Returned
`data.views[i].pixels` are RGB block-grid previews, not full-resolution masks.
`layers` points to each field and records its coordinate system. If requested,
`data.original` is a separate owned copy. No primary `result.pixels` is returned.

Raw block planes are cached by phase and quality. Changing a range reuses its
already-computed qualities; changing gray/viridis or original visibility reuses
the whole analysis. Result arrays do not expose private cache buffers. Native
Matplotlib's 2400×1600 composite, labels and axes are frontend work, not claimed
pixel-identical. JSON exports the numerical results and declared geometry.

368 synthetic cubes, all 64 grid shifts on an odd random image, endpoints up to
all 101 qualities, 4812 gray/viridis preview planes and three distinct 1 MP cases
match native raw values and rendered block pixels exactly. Worker suites cover
cache subsets, cancellation/reload and memory release in Chrome 154, Firefox 155
and WebKit 26.6. These do not prove physical Safari/mobile or WordPress wiring.

At >=1 MP, independent JPEG qualities share one worker pool under the global
memory budget. Each worker has one codec thread. From 0.13 the first requested
qualities are dispatched immediately at the highest admitted concurrency; no
probe qualities, candidate sweep or warm-up precedes them. Workers are released
after every job. Only useful completed task observations remain in session RAM.
`cpuKernel:'single'` or `'reference'` preserves the serial path. The historical
`ghost-benchmark.json` includes the removed calibration and is not a current
first-use result. See `IMMEDIATE-COMPUTE.md`.

Reproduction: run the two `generate-ghost-*-reference.py` scripts and
`generate-double-jpeg-reference.py` with the pinned native environment, then Node
tests and `scripts/browser-test.mjs --double-jpeg --ghost --quality-pool-test`.
Generate lookups with the dedicated pinned palette/weight scripts. All fixture
inputs are generated patterns/noise, not private photographs.

Historical pre-0.13 isolated Chrome 154 run: serial RPC 306.4 / 335.4 / 331.1 ms for
phases (0,0), (1,1), (7,3); auto 3315.4 / 189.0 / 176.0 ms with nine workers
selected. The first auto request includes exhaustive bounded calibration. These
are three distinct jobs, not repeat samples for a single median. Later jobs are
1.77× and 1.88× faster here; cached palette changes are 0.5–3.8 ms. Worker choice
is measurement-dependent, not a fixed promise of nine useful cores everywhere.

The historical 101-quality raw recompression curve is now a separate operation, `jpeg.recompression`; see [JPEG-RECOMPRESSION.md](JPEG-RECOMPRESSION.md).
