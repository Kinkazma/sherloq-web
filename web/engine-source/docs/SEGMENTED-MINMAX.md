# Exact segmented local extrema — 0.17

`noise.minmax` accepts segmented JPEG sources with the existing five channel
modes, five colors per mask and six display filters. The result contains an RGB
`surface` and two independently owned `maskSurfaces.minimum` / `.maximum`.
Both masks are `mask8`, range0/1: strict comparison with the eight neighbors,
excluding the outside image border. They are evidence, not probabilities.

```js
const result = await engine.run({
  id: 'extrema', imageId: 'source', operation: 'noise.minmax',
  params: {channel: 4, minimum: 1, maximum: 0, filter: 1}
}, {signal});
const surface = result.maskSurfaces.minimum;
const {mask} = await engine.readMask({
  surfaceId: surface.id, revision: surface.revision,
  rect: {x: 100, y: 200, width: 256, height: 256}
}, {signal});
// Read the RGB display through readPixels(result.surface ...).
for (const surface of [result.surface, ...Object.values(result.maskSurfaces)]) {
  await engine.releaseSurface(surface.id);
}
```

Calls on an engine are serialized. Releasing one result leaves the other handles
usable. Source unload/disposal invalidates all of them; worker cancellation closes
storage and requires source reload. Mask/RGB method mismatches and stale revisions
are rejected. JSON export preserves metadata and transient handles, not raster
content. The full-memory input path retains its typed-array result API.

## Exact geometry and arithmetic

The first pass computes strict extrema in raw source bands with a one-row halo;
only interior rows are written. Channel0 uses native integer luminance,1–3 are
RGB channels, and4 compares exact squared RGB norms. Unlike the bit-plane engine,
this operation does not truncate square roots modulo256. Filter0 applies native
mask colors directly; color4 hides a mask without discarding its evidence.

Filters1–5 use density cells of9,11,13,15,17 pixels. These cells are anchored in
the **oriented** image. An exact separable index permutation groups raw mask
counts into those logical cells for all eight EXIF orientations, avoiding a full
transpose. Partial cells follow the native radius rule; outside image borders
and temporary band seams are not interchangeable.

Counts fit Uint16. One Float32 value per cell holds the native binary population
standard deviation. Normalization to127 uses the complete cell grid, with the
same extrema as the repeated full-size field. Colored cells are combined, then
normalized globally to255 and expanded to the result store. There is no per-band
normalization, threshold change, approximation or resolution reduction.

## Memory, stages and limits

Retained masks/output, JPEG heap capacity, temporary I/O and scratch are admitted
together. The compact grid reservation is16 bytes per cell plus4 bytes per source
row/column; bands remain bounded. At96MP/256 MiB the minimum mask stays in96 MB RAM,
the maximum mask uses96 MB local storage and the RGB output uses288 MB storage,
alongside the288 MB source. The original86 MB Blob is browser-managed separately;
accounted peaks are not process RSS or physical free-RAM measurements.

`metrics.stageMs` splits admission, extrema/mask writes, density counts, global
normalization and display writes. These include their relevant storage I/O; the
filter0 display is written during the extrema stage. `totalMs` excludes source
decoding and later UI/window transfers. The browser test additionally records
worker RPC time. There is no product calibration, synthetic probe or preloading.
One worker runs this adapter; GPU/multicore and cached raw masks remain pending.

All limits in SEGMENTED-SOURCES.md and SEGMENTED-RESULTS.md remain: JPEG module
capacity, storage quotas/errors, no segmented PNG/TIFF yet, and no arbitrary
size or physical-device guarantee. A compact grid that cannot be admitted is an
explicit resource error. Unsupported global algorithms are never tiled blindly.

## Reproduction

`tests/segmented-minmax.test.mjs` checks2754 native complete RGB/two-mask cases
(918 parameter/image cases ×3 row groups),1200 oriented/small-border comparisons,
120 phase cancellations and cleanup after an injected temporary write failure.
`tests/source-api.test.mjs` checks independent mask ownership and source lifetime.
Generate the public synthetic JPEG with `scripts/generate-large-jpeg.py`, then
the independent MinMaxEngine CPU reference with `scripts/generate-large-minmax.py`.
Run `scripts/browser-test.mjs --segmented-minmax --browser=chrome` or firefox/webkit.
The large recipe covers all six filters, all five channels and selected hidden/
white/colored mask combinations. Four windows per case include seams and borders;
filter1 compares complete288 MB RGB and both96 MB mask checksums.

See `segmented-minmax-*-proof.json` and QUALIFICATION-0.17.md for completed browser
evidence. Functional timings are not isolated performance-gain measurements.
WordPress integration and physical-device qualification remain separate work.

Completed browser proof: Chrome154.0.8037.58, Firefox155.0 and WebKit26.6 pass
the96MP sequence. Accounted peak226,990,304 bytes for OPFS and229,087,456 bytes
for IndexedDB, plus the original Blob separately. Cooperative render-phase
cancellation takes14.2/34/72 ms in these functional runs; zero owned artifacts
remain after unload, cancellation and disposal. No physical Safari/iPhone claim.

Since0.18, RAM-backed segmented sources create a temporary session lazily when
owned results no longer fit; see LAZY-RESULT-STORAGE.md for lifecycle evidence.
