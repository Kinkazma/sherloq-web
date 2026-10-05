# Qualification 0.15.0

Scope: one additional segmented algorithm adapter (`colors.stats`, all six
variants), owned result surfaces and explicit release; corrected approximate
storage-usage admission; exact grouped reads for upright full-width windows.
The engine retains32 ordinary operations. Other segmented algorithms remain open.

- Final Node regression:105 tests,105 passes, zero failures, skips or cancellations,
  132787.78175 ms, concurrency2. All existing scientific fixtures remain included.
- 162 native channel-rank cases across three storage chunk sizes, including
  two-byte/non-pixel-aligned seams; all eight EXIF orientations, output lifetime,
  cancellation and source/result ownership pass.
- Chrome154.0.8037.58, Firefox155.0, WebKit26.6 pass the complete source/result/
  temporary-storage functional sequence. The synthetic96MP result tests check all
  six variants with four native windows each, and the full288 MB min/strict RGB
  checksum. Live results survive later analysis and are invalidated by release
  or source unload. Disposal with a live result and partial-output cancellation
  leave no owned storage artifacts.
- Final functional cancellation observations:37.5/67/44 ms. These are not isolated
  performance comparisons. Source/result storage each uses288 MB; accounted RAM
  peaks remain129/130 MB with the86 MB original Blob reported separately, not RSS.
- The source API96MP regression and the64 MiB storage regression pass in the same
  browser sessions. Explicit/concurrent logical allowances still reject overflow.
  Injecting an imprecise full-usage estimate no longer rejects a small real write;
  contents and cleanup are verified. Actual origin-quota exhaustion is not tested.
- The isolated, development-only window-read comparison is documented separately
  in WINDOW-READS.md with raw samples and exact byte checksums. It changes I/O
  granularity only, with no source resampling, algorithm changes or runtime probes.

SEGMENTED-RESULTS.md defines the public lifetime contract and remaining limits:
no general typed mask handles or portable streamed raster encoder, no new temporary
session when a RAM source's result cannot fit, no arbitrary-size/global FFT claim,
no multi-engine memory/storage broker, and no crash-orphan recovery. B owns actual
WordPress rendering/export integration. Physical devices remain unqualified.
No native/WordPress/production source was changed and no model weights were added.

The extracted0.15 runtime passes all32 ordinary-operation smoke checks, the96MP
source API and the96MP owned-result sequence under Chrome. Manifest hashes and
archive readback are checked before handoff; previous archives remain immutable.
