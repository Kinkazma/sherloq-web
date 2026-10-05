# Explicit AKAZE copy/move — 0.26 qualification

The 0.26 API adds `tampering.copyMove.akaze`; the frozen 0.25 archives
are unchanged. This is an explicit detector choice. The historical BRISK default
remains unavailable and is never silently replaced. WordPress integration and
physical Safari/mobile/non-Apple hardware are not qualified by these tests.

## Reference and arithmetic

Reference: NumPy 1.26.4, OpenCV 4.11.0, native `core/cloning.py` SHA256
`161d3b3589383740fafd97cd9871f531c7ee2313db55ac5620a8c9770637db27`.
Only generated public fields and existing synthetic codec fixtures are used.
No model, training, private photograph, remote service or native macOS library
is loaded by the browser.

The default native AKAZE settings, nonlinear diffusion, octave/sublevel order
and 61-byte MLDB descriptors are preserved. Porting requires the reference
float32 accumulation order in Gaussian/Scharr filters, multiscale separable
derivatives, fractional INTER_AREA and exact half downsampling. Vector-prefix
and scalar-tail operations are distinguished; changing only the nominal kernel
does not reproduce the native arithmetic. Orientation uses OpenCV's own
polynomial, with its existing license. None of the BRISK APSL experiment is used.

The generated LLVM has 100 FMA symbol references across the three AKAZE files:
97 call sites plus three declarations. The original study's counts 79/13/8
included those declarations; actual call-site counts are 78/12/7. The arithmetic
is unchanged by this counting clarification.

## Evidence acquired

- 429 float32 primitive cases are exact, including odd widths and filter tails:
  `akaze-primitives-study.json`.
- 128 expanded detector cases match all 78,626 keypoints (including mask cases),
  all seven fields and all descriptor bytes: `akaze-detector-study.json`.
- 114 primitive complete pipelines match native points, ordered matches,
  overlapping groups, directional counts and RGB drawing. Masks are normalized
  to binary 1 before detection, as in the native loader.
- 22 independent native Hamming cases cover both 32- and 61-byte descriptors,
  the final descriptor byte, distance boundaries, ties and 64-query batches.
- 223 product cases (162 small and 61 large) pass in Chrome 154, Firefox 155 and Playwright WebKit 26.6.
  They include PNG masks, JPEG progressive/EXIF orientation, RGB/gray 16-bit TIFF
  and alpha-bearing TIFF. All compared scientific arrays, counts and RGB bytes
  are exact. Proofs are `akaze-parallel-*-proof.json`, with runtime hashes checked
  before and after the run. Functional timings include verification and are not
  performance benchmarks.
- Cache ownership, style/minimum reuse, ORB/AKAZE cache separation, mask identity,
  JSON provenance, budget failures and cancellation/reload have product tests.

The large corpus includes 1 MP noise, translated/rotated copies and original
JPEG input. Peak accounted memory is 564,089,521 bytes under a 1 GiB budget.
Actual heap capacity is checked against its admission bound. Final regression:
153 tests pass, without failures or skips; ORB's 162 small cases and grouping-pool
lifecycle also pass in the three browsers after the shared module change.

The 1 MP dense checker has 20,934 native AKAZE points. Its broad native parameter
sweep was stopped after prolonged quadratic grouping work without a completed
successful render. Its detector is qualified in the 128-case corpus, but its
successful full pipeline is explicitly **unqualified**. The regular large corpus excludes that stress
image and retains full-size noise, translated copies and rotated copies. This
exclusion changes test coverage only, never the detector's thresholds or inputs.
The default all-image configuration was then checked separately: native selects
11,864 points and refuses the 256 MiB match-result cap; Chrome returns the same
explicit budget refusal and releases its reservations. See
`akaze-stress-native-proof.json` and `akaze-stress-chrome-proof.json`. This one
resource-boundary agreement does not qualify the other dense settings.

## Inputs, outputs and limits

Parameters and result layout are the ORB contract. The historical Matching
radius is still `matching/100*255`; a 61-byte descriptor does not silently change
that scale. The image is decoded using the qualified original-byte path, then
converted from RGB to gray using the native integer conversion. Mask gray > 0
becomes 1. Original bytes and decoding provenance remain available.

Results are geometric evidence, not a binary authenticity mask. Groups overlap,
and `regions` is a directional clustering heuristic rather than a count of proven
forgeries. Repeated antialiased drawing commands are retained.

The WASM heap grows from 32 MiB up to 1 GiB. AKAZE admission reserves
`256*width*height + 160 MiB`, plus the existing JavaScript preparation/result
budget. This deliberately exceeds ORB's 192-byte image multiplier: AKAZE retains
four float planes per evolution level, up to four sublevels in four octaves,
keypoint vectors and longer descriptors. Strict 3×3 maxima limit candidates to
one per 2×2 cell per level. The multiplier covers coexistence and vector growth;
the fixed allowance includes the bounded matching batch and allocator growth.
Actual heap capacity is reported separately; accounted memory is not RSS.

Full-memory images only; insufficient budget fails explicitly. There is no crop,
downsample, reduced precision, threshold change or segmented AKAZE substitute.
The native caps remain 30,000 selected points, 256 MiB match triples and 128 MiB
logical int64 group indices. CPU single execution remains available. Independent
group rows use the existing shared-budget worker pool only when useful; the
detector currently runs in the main computation worker. GPU is unavailable.
No runtime calibration, probe image, warm-up or stored performance profile exists.

## Complete-pipeline measurements

Isolated Chrome 154 on the development M1 Max: three alternating cold useful
runs per mode, with worker startup retained. Every rendered RGB matches native.
No preflight or discarded warm-up is used. See `akaze-chrome-benchmark.json`.

| Image | Single pipeline median | Auto pipeline median | Auto load / RPC / display medians | Peak accounted bytes |
| --- | --- | --- | --- | --- |
| 512×384 copied region | 6928.8 ms | 6860.4 ms | 79.4 / 6777.6 / 1.6 ms | 290,394,677 |
| 1 MP copied region | 31599.9 ms | 31555.9 ms | 101.0 / 31450.4 / 4.7 ms | 532,720,231 |

Both modes retained one grouping worker because the actual match sets are small;
these differences are timing variation, not evidence of a parallel speedup.
Detection dominates. Preparation took 1.3–8.9 ms in the retained first runs;
median RPC minus engine time was 0.7–0.8 ms. The first 1 MP single run took
37775.1 ms end to end and is preserved in the report, not discarded.

One source unload/reload per mode measures a warm engine with fresh analysis:
load 6.1–6.5 ms and RPC 6697.8–6697.9 ms for 512×384; load 24.1–28.5 ms and
RPC 30271.4–37405.5 ms for 1 MP. These are individual observations, not medians
or a promised speedup. Cache-only style/minimum changes took 0.4–0.6 ms and
3.4–5.4 ms respectively for the two image sizes. Unloading releases source,
cache and active reservations; lazy WASM capacity remains until engine disposal.

Canvas submission is illustrative display time, not physical paint or WordPress.
Memory is admitted/accounted storage, not process RSS. GPU remains unqualified.

## Reproduce

Use the pinned native environment and Emscripten 4.0.15. The existing synthetic
cloning reference must first be generated with its large cases.

```sh
python scripts/build-cloning-math.py
python scripts/generate-akaze-pipeline-study.py --large --exclude-large-checker
python scripts/generate-cloning-original-reference.py --algorithm akaze
python scripts/package-cloning-fixtures.py --algorithm akaze
python scripts/generate-cloning-descriptor-reference.py
node --test tests/akaze.test.mjs tests/cloning-descriptors.test.mjs
node scripts/browser-test.mjs --akaze
node scripts/browser-test.mjs --akaze --browser=firefox
node scripts/browser-test.mjs --akaze --browser=webkit
node scripts/browser-test.mjs --akaze-large
```

The separate guarded-FMA candidate is built by `build-cloning-fast-study.py`
and checked by `check-cloning-fast-study.mjs [--expanded]`. Its 48 initial
detector cases and 2,021,297 arithmetic probes pass. It was **rejected for speed**:
three alternating measurements in isolated Chrome against the unchanged runtime
gave 2572.9/2615.9 ms (reference/candidate) for shapes, 2678.4/2717.8 ms for
320×256 noise and 34913.3/35643.4 ms for 1 MP noise. All measured outputs were
exact; the candidate was about 1.5–2% slower. Its expanded test was stopped after
this rejection and is not claimed complete. See `akaze-fma-chrome-benchmark.json`.
The candidate remains under `.build` and is not used by the product.
