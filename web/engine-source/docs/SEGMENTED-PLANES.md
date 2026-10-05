# Exact segmented bit planes — 0.16

`noise.planes` accepts segmented JPEG sources with all five native channel modes,
eight bits and three display filters. Channel0 is native integer luminance,1–3
are red/green/blue, and4 is truncated RGB norm modulo256. Bit0 stays least
significant. Filter0 is the direct display,1 the3×3 median and2 the3×3 Gaussian.

The raw mask contains0/1 values representing the selected bit. It is neither a
probability nor a thresholded version of the filtered display. Changing the
display filter does not change this evidence. Source resolution and parameters
remain unchanged, and original bytes remain available separately.

```js
const result = await engine.run({
  id: 'plane', imageId: 'source', operation: 'noise.planes',
  params: {channel: 4, bit: 3, filter: 2}
}, {signal});
const descriptor = result.maskSurfaces.plane;
const {mask} = await engine.readMask({
  surfaceId: descriptor.id, revision: descriptor.revision,
  rect: {x: 100, y: 200, width: 256, height: 256}
}, {signal});
// mask.format === 'mask8'; mask.range === [0,1]; owned Uint8Array mask.data.
// Read the filtered RGB surface with readPixels(result.surface ...).
for (const surface of [result.surface, ...Object.values(result.maskSurfaces)]) {
  await engine.releaseSurface(surface.id);
}
```

Calls on one engine are serialized. `readPixels` rejects mask handles and
`readMask` rejects RGB handles, both with `INVALID_INPUT`. The mask descriptor
includes exact dimensions, orientation, format, range and semantics. Coordinates
are in the full oriented image. Releasing the RGB surface leaves a separately
owned mask usable until that mask is released. Source unload, engine disposal and
cancellation invalidate all dependent handles. Cancellation requires source reload.
JSON result export is metadata, including transient handles; it is not a raster
or mask archive. Contiguous input retains the existing typed-array result API.

## Exact computation and admission

The first pass writes the raw bit plane in bounded RGB batches. The second reads
full-width bands with one halo row and renders only the interior. Global image
borders retain replicate (median) or reflect101 (Gaussian) semantics. Temporary
band borders never replace global borders. These isotropic filters commute with
the lossless EXIF permutation; all eight orientations are tested independently.
The same integer renderer is shared with the existing full-memory operation.

Retained mask/RGB storage is selected under the shared budget while reserving
bounded useful scratch. On the96MP/256 MiB test, the96 MB raw mask stays in RAM and
the288 MB RGB result uses the source's temporary session. Source RGB itself uses
another288 MB of local storage. This is useful retained data, not preloading or a
synthetic calibration. Actual heap capacities and temporary staging are admitted.
One worker performs this adapter today; no GPU/multicore speedup is claimed.

The same limits as SEGMENTED-SOURCES.md and SEGMENTED-RESULTS.md apply. In
particular, segmented PNG/TIFF remain unavailable, and no arbitrary-size or
universal-device promise follows from these tests. Other mask algorithms still
need their own adapters; a byte-mask handle alone does not qualify them.

## Evidence

- 3240 native cases:9 source images ×5 channels ×8 bits ×3 filters ×3 band sizes.
  Both complete RGB output and raw-mask checksums agree. Cases include one-pixel
  dimensions, constants, ties, odd geometry and non-pixel-aligned storage chunks.
- Orientation and two-stage cancellation tests verify owned arrays are released.
  Direct API tests verify format guards, RGB/mask lifetimes and stale handles.
- Chrome154, Firefox155 and WebKit26.6 pass the actual worker on the public noisy
  12000×8000 JPEG. Nine selected settings compare four native RGB and mask windows
  each, including band seams and image edges. Luminance/bit0/Gaussian also compares
  the entire288 MB RGB and96 MB mask checksums to the independent native engine.
- Source unload with live RGB/mask results, partial-render cancellation and engine
  disposal leave no owned storage artifacts. Accounted peak207,935,488 bytes for
  OPFS Chrome/Firefox,210,032,640 for IndexedDB WebKit; original Blob86,050,184 bytes
  is separately browser-managed. These are not process RSS measurements.

Reproduce native data with `scripts/generate-large-planes.py` after the existing
synthetic JPEG recipe. Run `tests/segmented-planes.test.mjs` and
`scripts/browser-test.mjs --segmented-planes --browser=chrome` (or firefox/webkit).
Raw public browser evidence is `segmented-planes-*-proof.json`. Functional timings
are non-isolated and do not establish an optimization gain. WordPress integration
and physical-device qualification are pending. Native code was not modified.

Since0.18, RAM-backed segmented sources create a temporary session lazily when
owned results no longer fit; see LAZY-RESULT-STORAGE.md for lifecycle evidence.
