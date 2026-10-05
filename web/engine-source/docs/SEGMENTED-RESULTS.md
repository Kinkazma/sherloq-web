# Owned result surfaces — 0.15

`colors.stats` now accepts a segmented JPEG source. Its six min/middle/max,
strict/inclusive variants use bounded, pixel-independent batches. Native tie
precedence stays red, then green, then blue. The transformation commutes with the
lossless EXIF pixel permutation; no full oriented copy or display-tile analysis
is required. Neighborhood/global algorithms do not use this adapter.

```js
const result = await engine.run({
  id: 'rank', imageId: 'source', operation: 'colors.stats',
  params: {mode: 'avg', inclusive: true}
}, {signal});
// For a segmented source: result.layout === 'surface'; no result.pixels copy.
const view = await engine.readPixels({
  surfaceId: result.surface.id, revision: result.surface.revision,
  rect: {x: 0, y: 0, width: 256, height: 256}
}, {signal});
await engine.releaseSurface(result.surface.id);
```

The surface uses the existing exact full-resolution `readPixels` contract. Each
returned window belongs to the caller. A live result remains owned until released
or its source is unloaded; it cannot be evicted as a cache entry or overwritten by
another task. Release invalidates the handle. `releaseSurface` rejects original
source handles: use `unload` for those. Await release/unload/dispose for storage
cleanup. Cancellation destroys all source/result handles and requires reload.

The existing contiguous-input API still returns its ordinary RGB array. A
segmented result may stay in budgeted RAM or in the source's owned temporary
session. Since0.18 an initially RAM-backed segmented source creates its session
only when a result needs storage; see LAZY-RESULT-STORAGE.md. If local storage is
unavailable, `STORAGE_UNAVAILABLE` remains explicit. Dimensions and parameters
never change to fit memory.
Opaque result handles cannot be persisted across engine lifetimes. JSON exports
describe the result and provenance, including its transient surface descriptor;
they do not contain the raster. Consumers can assemble an exact raster export by
reading consecutive full-resolution windows. A portable streamed raster encoder
and general typed mask/result handles remain open.

Whole-width upright windows read contiguous bounded byte spans, avoiding a
separate storage transaction for each image row. Other rectangles/orientations
retain exact source-row reads. Neither path changes interpolation or pixels.
Only the histogram and channel-rank operation currently have segmented adapters.
All other operations retain their explicitly documented layout limits.

## Evidence and limits

`segmented-results.test.mjs` checks 162 native rank outputs across three storage
chunk sizes, including two-byte/non-pixel-aligned segments. All eight orientations,
window ownership, partial-output cancellation and lifetime invalidation are tested.
`source-api.test.mjs` checks that a result survives another analysis, explicit
release leaves the source usable and source unload invalidates outstanding results.

The real worker tests use the same public synthetic 12000×8000 JPEG as0.14. All
six variants compare four windows each with the native StatsEngine. Min/strict
also compares its entire 288,000,000-byte RGB checksum:
`9b1573b4098afe04b64ad6f570067aeed50e3f293993b0d31851691fd0d0ac77`.
No full raster crosses the worker boundary at once. Tests also cover subsequent
histogram work, JSON metadata, release, unload, cancellation and disposal while
a result remains live. `scripts/generate-large-stats.py` produces independent
native references; generated large data remains excluded from distribution.

Chrome154/Firefox155 use OPFS and WebKit26.6 uses IndexedDB. Source/result storage
is 288 MB each while both are live. Accounted RAM peaks are129/130 MB under a256
MiB budget, plus the separately reported86 MB browser-managed original Blob.
WASM heap capacities are admitted for window/result work. These figures are not
RSS. Each rank task currently uses one worker and no result cache; no multicore,
GPU or native Mac speedup is claimed. Functional timings are not isolated
optimization measurements. Physical mobile and WordPress remain unqualified.

## Approximate storage usage

WebKit's free-space estimate caused a reproducible false admission refusal after
several result deletions and source reloads. The same lifecycle completes after
making estimated free space advisory. Logical allocations still obey the explicit
session allowance and total origin quota estimate; actual I/O quota failures are
reported as `STORAGE_QUOTA` and partial work is removed. No other session is deleted
and no persistent-storage permission is requested. A regression injects a full
usage estimate while checking that a small real write/read still succeeds under
an explicit allowance. This is not a test of actual origin-quota exhaustion.

This interpretation matches [StorageManager.estimate()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate),
whose usage/quota figures are approximate. Quota estimates do not reserve space.
Multi-engine storage arbitration and crash-orphan recovery remain open.
