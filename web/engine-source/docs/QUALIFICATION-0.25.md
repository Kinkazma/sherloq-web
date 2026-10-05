# Qualification0.25 — ORB copy/move and explicit EM rejection

Source regression: **149/149 tests pass**, no failures/skips,296117.807625ms with
concurrency2. No native application or WordPress files were changed. The complete
50-panel mission remains unfinished; this is one qualified additional variant.

`tampering.copyMove.orb` is an explicit choice. BRISK remains the historical panel
default and is not replaced. BRISK/AKAZE portable candidates have equal feature
counts but different coordinates/responses/descriptors and remain unavailable.
Their rejection records are retained, rather than treating count equality as
scientific parity. Detailed behavior and limits are in COPY-MOVE-ORB.md.

Corrected ORB preserves the native angle polynomial, fused contractions and
pinned equal-distance ordering. Prototype qualification covers64 detections,
256 selections,104 ordered matching cases and190 complete pipelines. Additional
checks cover10000 scalar norms,80 float32 standard deviations and90 boundary
geometries. Product API tests in Chrome154, Firefox155 and Playwright WebKit26.6
cover238 exact full outputs plus four native group-budget refusals, including76
valid1MP paths. All tested point fields, match/group order, statistics and RGB
bytes agree with the unchanged native reference.

The corpus includes real loading of generated PNG/masks and52 original-file
paths: progressive JPEG, EXIF orientation, RGB/gray16-bit TIFF and alpha. Textured
codec cases produce features, not just empty detections. Original bytes and mask
provenance remain intact. Caches, owned results, minimum/style dependencies,
bounded JSON refusal/explicit larger export, hard cancellation/reload and memory
cleanup pass. The worker pool is also reduced to two under a10989292-byte budget;
339844 ordered group indices stay exact and injected failure releases allocations
before an explicit serial retry. Accounted memory is not process RSS.

The exact pair-decision cache and16-row worker batches retain all thresholds and
ordering. Automatic workers begin at4096 filtered matches under the common budget;
small workloads and the CPU single override remain serial. Each worker receives
bounded input copies and no codec or ORB heap. Native maximum point/match/group
limits are preserved. No calibration, warm-up probe, persistent performance profile,
resolution change, remote fallback or eager preload enters the product.

Independent benchmark samples distinguish kernel gains from the full chain;
see cloning-kernel-chrome-benchmark.json and cloning-chrome-benchmark.json. Dense
grouping benefits substantially, while seeded kmeans and repeated antialiased
drawing still dominate total time. Small worker jobs are rejected after including
startup. No native Mac speedup or GPU equivalence is inferred.

The resampling probability EM study also ships in source. Both candidates are
rejected on190 cases: the OpenCV pivot cutoff causes six false refusals, and an
exact-zero cutoff introduces changed outcomes/iterations and large map errors.
Standalone Fourier remains qualified independently. No EM operation or fake map
is activated; see RESAMPLING-EM-STUDY.md. The three historically missing weight
groups remain blocked, with191 native model/component paths present. There is no
training or redistribution of private weights.

The register has36 partial panels and14 unavailable, with35 callable operations.
Memory coverage is8 qualified segmented subsets,28 full-memory panels and14
unavailable. Physical Safari/mobile/non-Apple hardware, BRISK/AKAZE, the wider
Copy-Move2/automatic workflows, segmentation and WordPress integration remain open.


The product JS/WASM module rebuilds byte-identically with the pinned local source
and Emscripten4.0.15 toolchain; see cloning-build-proof.json. This is an actual
rebuild comparison, not a claim about untested compiler/toolchain versions.


The immutable extracted runtime passes all35 operations plus162 small ORB paths,
76 valid1MP paths and four expected native resource refusals in Chrome. All164
runtime file hashes match. Budget-reduced grouping, injected failure, cancellation,
reload, original-byte provenance and bounded JSON repeat successfully. See
extracted-runtime-0.25-proof.json. Archive8406083 bytes, SHA256
`8b8935e67fca713e19ee5838ad2366caeb412a8ab25caeff9ce586d3ea404d21`.
