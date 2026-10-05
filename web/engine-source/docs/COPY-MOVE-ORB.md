# Historical copy/move: explicit ORB

Qualification for0.25. The separate `tampering.copyMove.orb` operation
chooses ORB explicitly. BRISK is the historical panel default and remains
unavailable; AKAZE is also unavailable. Neither is silently substituted.
The complete50-panel port and WordPress integration remain unfinished.

## Scientific contract

The unchanged reference is `core/cloning.py`, SHA256
`161d3b3589383740fafd97cd9871f531c7ee2313db55ac5620a8c9770637db27`, with
NumPy1.26.4 and OpenCV4.11.0. Source RGB8 becomes gray through the native integer
conversion. A loaded detection mask must have the same dimensions and is converted
RGB→gray→strictly-positive **1**, otherwise0. ORB's pyramid treats binary1 and255
masks differently; the native loader's rule is preserved. Original JPEG/PNG/TIFF
bytes, decode policy and optional mask provenance remain separate from the pixels.
Canvas is used only for example presentation, never analysis input conversion.

Response normalization uses100×(1/range), not100/range; fused conversion can put
extrema slightly outside0–100. No clamp is added. Hamming radius is
matching/100×255, including self matches in the distance-only sort before removing
them. Equal-distance order affects later groups. Pinned libc++15 partition,
insertion and heap helpers preserve it. Displacement uses the native separate
squared terms; near-boundary proximity uses the native fused scalar norm.

Groups overlap and retain their ordered indices. `minimum` filters the displayed
groups without recomputing geometry. Drawing keeps integer endpoint truncation,
ties-to-even radius rounding, HSV colors and repeated antialiased circles/lines.
Repeated draws cannot be deduplicated without changing their pixel blends.
Region count retains seed0,10 attempts and the native kmeans thresholds. Its
float32 standard deviation follows NumPy's8-lane pairwise128 reduction inside8192
element blocks. This directional heuristic is not a count of proven forgeries.
No binary authenticity mask or automatic scientific threshold is invented.

Owned outputs are point rows7×binary64, match rows3×binary64, Uint32 group lengths
and concatenated match indices, statistics, and full-resolution RGB8 presentation.
JSON retains these arrays and source/mask provenance. Its default32MiB bound can
refuse large outputs; the caller may explicitly request more under the budget.
See CONTRACT.md for parameter ranges, semantics and errors.

## Arithmetic qualification and rejected candidates

The stock portable OpenCV build preserves point counts in all144 small detector
cases, but changes descriptors in6 BRISK,18 ORB and22 AKAZE cases. Restoring67
BRISK fused contractions leaves two descriptor cases different and does not fix
point/response/angle differences. AKAZE changes include materially displaced points.
These candidates are rejected. Full aggregates and records are in
`cloning-detector-rejections.json`; no learned weights are involved.

OpenCV4.11 selects a different atan2 implementation under `__EMSCRIPTEN__`.
The generated ORB translation unit restores the native scalar fast-angle polynomial
and102 explicit fused contractions. Original upstream/native files are unchanged.
This is a portable arithmetic contract, never a hardware-brand switch.

The corrected prototype passes64 detections,256 response selections,104 ordered
matching cases and190 complete pipelines, including76 at1031×1024, in Chrome154,
Firefox155 and Playwright WebKit26.6. Point fields, descriptor bytes, selected
indices, match/group order, float32 angles, region counts and RGB bytes agree
exactly on that corpus. Rounding checks add10000 norms,80 standard deviations and
90 boundary geometries. Product tests run the boundaries through both direct norms
and the exact point-pair cache. Prototype proofs identify their separate WASM hash;
they alone do not establish product lifecycle or UI integration.

The product corpus comprises162 small API paths plus76 valid1MP paths and four
expected native resource refusals. It includes52 original-file paths: progressive
JPEG, EXIF orientation, RGB/gray16-bit TIFF and alpha, with textured images that
produce real features. Fixtures are generated and publicable; none is a private
photograph. Small vectors are deduplicated in fixtures/cloning; large vectors are
recreated from the same generators. The three per-browser product recipes pass all238 outputs and four expected
refusals. Their proofs record actual code hashes, CPU mode, memory and lifecycle
results. Node regression:149 tests pass with zero failures/skips. The pool also
passes a two-worker resource limit, cancellation and injected resource failure.

## Memory, workers and caches

The lazy ORB WASM module grows from32MiB to at most1GiB in16MiB increments.
The full-image admission bound is192×pixels+160MiB for its working heap, plus
separate source, JS intermediates, cache and result-copy reservations. This limits
which images fit even on machines with more RAM; there is no segmented adapter.
The native caps remain30000 selected points,256MiB of match triples and128MiB of
logical int64 group indices. Portable Uint32 storage does not raise that group cap.
Resource refusals never alter resolution, thresholds, precision or feature settings.
Accounted working memory is an estimate of live ownership, not browser process RSS.

Detection, response selection, matching, geometry and count have separate caches.
Changing style reuses analysis; changing minimum reuses geometry. A replacement
mask invalidates its dependent results. Returned arrays are owned copies. The
codec/detection/count calls are synchronous inside the main compute worker;
hard cancellation terminates it and requires original image and mask reload.
Direct matching, grouping and drawing also yield between useful bounded batches.

For at least1024 filtered matches and at most2048 selected points, a budgeted
boolean table stores the exact proximity decisions. At4096 filtered matches,
`cpuKernel:'auto'` can share independent16-row grouping batches across the useful
worker count admitted by the common engine budget. Each receives exact-sized
copies of points' proximity decisions, matches and displacements; no codec,
detector, model or WASM heap is duplicated. Batches concatenate in original row
order, despite out-of-order completion. Native limits are checked across batches.
Workers, input staging, temporary group bounds and owned outputs share admission.

Small jobs and `cpuKernel:'single'` stay serial. Resource errors release failed
worker outputs before an explicitly reported serial retry. Cancellation terminates
active workers and releases charges. Cache reuse reports zero grouping executions.
There is no runtime calibration, discarded warm-up, eager preload or persisted
performance profile. GPU grouping/detection is unqualified and not selected.

## Isolated measurements

M1 Max,10 CPU cores,64GiB RAM, Chrome154; three alternating useful trials. The
portable behavior is capability based; these measurements are not device promises.

- Direct Hamming is1.66–3.25× faster than the prototype BFMatcher plus native-order
  restoration on477–500 points. This is a local candidate comparison, not a claim
  against the optimized native Mac implementation.
- The exact point-pair cache improves dense serial grouping by about1.5×. It is
  not selected for small lots where its preparation can lose.
- On the dense generated shape case, grouping alone is363.5/105.3ms for serial/
  ten workers:3.45×, including worker construction and transfers. A1242-match
  case slows4.7→26.6ms, and3504 matches show no useful gain48.3→48.6ms; both stay serial.
- Full dense API measurements separate preparation, detection, selection, matching,
  grouping, count, drawing, transport envelope and illustrative Canvas submission.
  Final measurements give404.4/117.2ms grouping but13585.9/13296.4ms whole calculation:
  the local gain is real, while count/drawing dominate the whole path. A1MP less
  dense case retains one worker and shows no meaningful change221.8/220.7ms.
  Dense full-chain gain is1.02×; source load and example display are included
  separately in the JSON. Accounted dense peaks are268037456/298180904 bytes,
  while the1MP case peaks at462894426 bytes under the1GiB engine budget.
  One useful warm repeat per mode measures13325/12935.7ms dense and177.3/180.6ms
  on1MP. Style changes reuse analysis (8258/8157ms dense;28.2/28.5ms on1MP)
  but still redraw every required primitive. Minimum changes reuse geometry,
  while the seeded count and presentation are recalculated.

See `cloning-kernel-chrome-benchmark.json` and `cloning-chrome-benchmark.json` for
all samples, cold/warm runs, cache changes and accounted memory. These are offline
development benchmarks, not startup code. Mac reuse candidates are recorded
separately in MAC-REUSE.md, with no native change or native speedup claimed.

## Reproduction

Use the unchanged native NumPy1.26.4/OpenCV4.11.0 environment and Emscripten4.0.15.
Build the pinned base libraries with scripts/build-opencv.sh first; set EMSDK as
for the other WASM builds. Then:

```sh
python scripts/generate-cloning-study.py --large
python scripts/generate-cloning-matches-study.py
python scripts/generate-cloning-primitives-study.py
python scripts/generate-cloning-pipeline-study.py
python scripts/generate-cloning-pipeline-study.py --binary-mask
python scripts/generate-cloning-original-reference.py
python scripts/package-cloning-fixtures.py
python scripts/build-cloning-math.py
node --test tests/cloning.test.mjs
node scripts/browser-test.mjs --cloning-study
node scripts/browser-test.mjs --cloning --cloning-parallel --cloning-pool
node scripts/browser-test.mjs --cloning-large --cloning-parallel
node scripts/browser-test.mjs --cloning-kernel-benchmark
node scripts/browser-test.mjs --cloning-benchmark
```

Repeat correctness recipes with `--browser=firefox` and `--browser=webkit`.
Omit `--cloning-parallel` for the retained serial product path. The study build
supports stock/no flag and `--native-brisk` rejection candidates; run the matching
check scripts and summarize-cloning-detectors.py to reproduce their evidence.
Benchmarks require an isolated slot. Generated vectors, build logs and SDK files
remain in .build and are excluded from delivery. Runtime/source manifests retain
OpenCV, ORB, LLVM and musl notices and pin the generated module's identity.
Physical Safari, mobile and non-Apple hardware, BRISK/AKAZE, segmented sources,
Copy-Move2/combined workflows, and WordPress integration remain unqualified.
