# Qualification 0.17.0

Scope: segmented `noise.minmax`, two independent raw-mask surfaces and exact
oriented, globally normalized density displays. The runtime still has32 ordinary
operations. Four algorithm families (histogram, channel ranks, bit planes, extrema)
and source windows have qualified segmented paths; other layouts reject explicitly.

- Final global Node regression:112/112 tests, zero failures/skips/cancellations,
  220499.704292 ms with concurrency2. All existing scientific families included.
- 2754 native full RGB/two-mask comparisons:918 cases ×3 band sizes. Five channels,
  all density filters and native color variants retain exact outputs. An additional
  1200 oriented/small-border comparisons,120 phase cancellations and injected
  temporary-write failure cleanup pass. Public API checks mask ownership, stale
  revisions and preservation of the second mask after releasing other handles.
- Chrome154.0.8037.58, Firefox155.0 and WebKit26.6 pass actual worker96MP tests:
  six settings covering all filters/channels, four native windows each, and full
  filter1 checksums for288 MB RGB and both96 MB masks. The independent native
  source SHA and original JPEG SHA appear in each public proof file.
- Accounted peak226,990,304 bytes for OPFS and229,087,456 for IndexedDB under a
  256 MiB budget. The original86,050,184-byte Blob is browser-managed separately;
  these are not process RSS measurements. The minimum mask uses RAM, maximum mask
  and RGB use storage alongside the source. The largest tested compact density
  grid is1,185,926 cells with19,054,816 bytes of accounted scratch.
- Render-phase cooperative cancellation observations:14.2/34/72 ms. Source unload,
  cancellation and disposal leave no owned temporary artifacts. Stage and RPC
  times are functional, non-isolated measurements; no GPU/multicore gain claimed.

Density cells remain anchored in oriented image coordinates. Cell normalization
uses global extrema twice, exactly as the expanded native fields. Neither bands
nor storage chunks change resolution, numerical precision or analysis parameters.
Raw0/1 masks remain distinct from density presentation. See SEGMENTED-MINMAX.md.

The JPEG module limit, storage/quota/crash handling, additional temporary-session
limit for RAM sources, other algorithm/model ports, WordPress integration and
physical-device qualification remain open as documented. Native code, WordPress
and production were not changed. Only synthetic publicable input is used.

The extracted0.17 runtime passes all32 ordinary operation smoke checks and the
complete96MP extrema worker sequence under Chrome. Manifests, SHA256 and archive
readback are checked. Earlier versioned archives remain unchanged.
