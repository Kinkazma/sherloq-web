# Qualification 0.14.0

Scope: additive immutable Blob input, exact full-resolution source windows,
bounded original-byte reads, JPEG scanline storage and the global histogram.
The engine retains 32 operations. Only the histogram has a qualified segmented
algorithm adapter; other operations explicitly refuse this layout.

- Final global Node regression: 102 tests, 102 passes, zero failures, skips or
  cancellations, 124838.92725 ms with concurrency2. This includes all existing
  numerical families and the new source/codec/histogram/ownership tests.
- Twenty-five JPEG fixtures with three row group sizes compare native pixels;
  baseline, progressive, gray, ICC and EXIF cases are included. All eight surface
  orientations and nonaligned storage seams are tested. 144 segmented histogram
  cases preserve native counts, unique colors and rounded range summaries.
- Chrome154.0.8037.58, Firefox155.0 and WebKit26.6 pass the real public worker API
  on a synthetic 12000×8000 JPEG. Four exact windows, complete global histogram,
  original bytes/SHA, cached range view, CSV, stale handles, cancellation/reload
  and disposal are checked. Oversized window admission includes known live WASM
  heaps; failure leaves later reads usable. No owned storage artifacts remain.
- The complete 288 MB RGB checksum is independently checked in the lower-level
  scanline browser test against native OpenCV. Public API histogram checks include
  all four channels, 1,637,956 distinct colors and rounded 1.71% ratio.
- Accounted peak: 129,005,192 bytes OPFS (Chrome/Firefox), 130,053,768 IndexedDB
  (WebKit), under a 256 MiB work budget. JPEG heap capacity: 103,546,880 bytes.
  Original Blob: 86,050,184 bytes, browser-managed separately. These are not RSS.
- Cooperative cancellation closes storage before terminating the worker. The
  final functional runs measured 34.5/30/32 ms. These timings are non-isolated
  observations, not benchmark comparisons. The 1s forced-stop watchdog reports
  cleanup failure if an OPFS lock persists; crash orphan recovery is still open.
- The 64 MiB temporary-storage regression passes in all three browsers, including
  forced IndexedDB, admission races, overlapping writes, lifecycle and cleanup.
  Logical quota rejection is tested; actual origin-quota exhaustion is not.

The extracted0.14 runtime also passes all32 operation smoke checks and the96MP
source API under Chrome. Inventory refreshed:145 native modules,83 present weight
paths,three historically missing groups still blocked; presence is not conversion.

Reproduction and provenance are in SEGMENTED-SOURCES.md and the linked tests,
generators and JSON proofs. The 96 MP input is synthetic and generated locally;
large .build data is excluded from the source delivery. No private photographs,
native dependencies masquerading as browser libraries, or remote compute service
are introduced. JPEG encoded bytes and progressive coefficients still require
contiguous codec memory, with a real 512 MiB module limit. Segmented PNG/TIFF,
result handles, streamed raster exports, other algorithm adapters, multi-engine
resource arbitration, physical devices and WordPress integration remain open.

Use the immutable 0.14 runtime archive and matching manifest for integration.
The source archive also contains the extracted-runtime smoke/source-API proofs.
Earlier archives remain unchanged. No native or WordPress source was modified.
