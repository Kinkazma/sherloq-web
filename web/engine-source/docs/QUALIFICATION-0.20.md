# Qualification 0.20.0

Scope: shared-budget IndexedDB read-page reuse and cache-aware RAM admission.
No scientific algorithm, threshold, resolution, output layout, operation count
or segmented operation availability changes. The complete 50-panel mission
remains unfinished; WordPress has not integrated this release.

- Global Node regression:117/117 tests, zero failures/skips/cancellations,
  218638.143166 ms with concurrency2. Retained-array admission evicts recomputable
  cache rather than needlessly selecting temporary storage.
- Real64 MiB storage tests in Chrome154.0.8037.58 Firefox155.0 and WebKit26.6 pass cache
  reuse, overlapping-write invalidation, failed-write invalidation, budget
  eviction, implicit holes, queued writes, cancellation and owned cleanup.
- Isolated IndexedDB development benchmark, five alternating samples per path,
  gives identical output hashes and transaction counts across all three browsers.
  Rotated4096×32 read:4096→48 transactions; median2330.2→31.3 ms in Chrome,
  14977→205 ms in Firefox and2433→35 ms in WebKit26.6. Tile256²:256→4 transactions.
  Full upright row groups keep six transactions; no general speedup is claimed.
- Two cached pages retain2 MiB. The rotated read's accounted peak is3,539,040
  bytes, versus32,899,168 with the uncapped-per-array comparator, with no additional
  transaction reduction from the larger cache. Global budget remains enforced.
  Browser/OS caches and process RSS are not measured; original data remains exact.

See IDB-PAGE-CACHE.md, idb-page-cache-*-benchmark.json and the public storage/image
proofs. Benchmarks exclude initial filling, hash verification, UI transfer and
display; they are not native-Mac or full-analysis speedup claims. No runtime
probe, calibration, saved profile or new pool is introduced. Physical quotas,
process crashes, other segmented kernels, models, WordPress and physical-device
qualification remain open. Native and production files were not changed.


The WebKit IndexedDB run also passes the complete96MP source/histogram, channel
ranks, bit planes, extrema and original-byte suites, plus the RAM-to-temporary
result transition. Native window and full-result hashes remain exact; unload,
cooperative cancellation and disposal leave no storage artifacts. Extrema's
accounted peak is231,874,784 bytes under256 MiB, with the86,050,184-byte browser
Blob tracked separately. Cache pages explain the changed accounted peak; no
scientific pixel/mask change or process-RSS claim is made.

The extracted0.20 runtime passes all32 ordinary operations and the64 MiB storage
suite under Chrome. Manifests, archive SHA256, readback and absence of host paths
are checked. Previous versioned archives are preserved unchanged.
