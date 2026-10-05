# Qualification 0.16.0

Scope: segmented `noise.planes` with all native channels/bits/display filters,
explicit raw-mask surfaces and the additive `readMask` API. There are still32
ordinary operations; only histogram, channel ranks and bit planes currently have
qualified segmented algorithm adapters. Other functions reject this source layout.

- Final Node regression:108 tests,108 passes, zero failures, skips or cancellations,
  167127.038125 ms, concurrency2. This includes all existing scientific families.
- 3240 native bit-plane cases check complete display and mask hashes across three
  band sizes. Eight EXIF orientations and cancellation in raw-mask/render phases
  pass. RGB surface refactoring retains the existing native pixel corpus.
- Chrome154.0.8037.58, Firefox155.0 and WebKit26.6 pass the real worker on96MP:
  nine settings, four native RGB and raw-mask windows per setting, and complete
  luminance/bit0/Gaussian RGB plus mask checksums. Separate RGB/mask lifetime,
  stale handles, unload, partial-render cancellation and disposal are checked.
- The96 MB raw mask stays in admitted RAM; the288 MB RGB result uses local
  storage, alongside the288 MB source RGB store. Accounted peaks207,935,488 bytes
  OPFS and210,032,640 bytes IndexedDB remain under256 MiB; the86,050,184-byte Blob
  is separately browser-managed. These are not RSS or available-device-RAM values.
- Functional cancellation observations:35.1 ms Chrome,58 ms Firefox,60 ms WebKit;
  all use cooperative storage closure before worker termination, zero artifacts.
  These runs are not isolated benchmarks. No GPU/multicore/native speedup is claimed.

The raw mask has values0/1 for the selected bit; filtering modifies presentation
only. Median replicate and Gaussian reflect101 image borders remain native.
No arbitrary tiling of global algorithms is introduced. Per-source JPEG module,
temporary-session, quota, crash-recovery and shared-engine limitations remain as
documented in SEGMENTED-PLANES.md and earlier memory contracts. WordPress controls,
physical-device qualification, other algorithms and model ports remain open.

Native sources, WordPress and production were not modified. Only synthetic
publicable inputs are used; no model weights or private photographs enter delivery.

The extracted0.16 runtime passes all32 ordinary-operation smoke checks and the
96MP source, channel-rank and bit-plane sequences under Chrome. Manifests/SHA and
archive readback are checked; previous versioned archives remain unchanged.
