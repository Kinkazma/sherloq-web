# Segmented scientific ELA energy

`ela.energy` now accepts segmented JPEG, PNG and TIFF sources through the same
validated parameters as contiguous images. The complete native chain is retained:
global RGB JPEG at three qualities, native gray/7×7 energy, native panel geometry,
exact trimmed statistics and profiles, median quality confirmation, global
hysteresis and native region grouping. No resizing or strip-local regions.

## Public contract

Results have `layout:'surface'`, seven scientific `planeSurfaces`, metadata,
panel summaries, regions and colors. `surface` aliases
`planeSurfaces.energy_low_score`; release each distinct id once.

- `energy_low_score`, `energy_high_score`: `float32`, descriptive scores.
- `energy_scope`, `energy_labels`: `int32`, native panel/region ids; zero outside.
- `energy_plane_0`, `_1`, `_2`: `float32`, qualities listed in metadata order.

`readPlane({surfaceId,revision,rect},hooks)` returns
`{plane:{width,height,format,data},origin:[x,y],...}`. Data is an owned Float32Array
or Int32Array transferred by the worker. Rectangles use oriented full-resolution
coordinates and never rescale. The matching read API is required. These scientific
surfaces are not PNG colors: apply the existing energy display controls in the UI.
Layers name low/high scalar maps and region labels through their surface ids.

`exportSurface({surfaceId,revision,format:'npz',storage:'auto'},hooks)` on any live
energy plane exports the entire analysis. The archive contains native Float32
`energy_planes` shaped[3,H,W], low/high[H,W], Int32 scope/labels[H,W], and the same
Unicode JSON metadata/provenance as contiguous NPZ. No pickle. ZIP32 and optional
`maxBytes` limits are explicit. `readExport`/`releaseExport` page and release the
archive; a completed export survives source unload. `exportResult` remains usable
for JSON, and directs surface NPZ callers to the progressive API.

## Ownership, cache and memory

Source caches retain at most three individual qualities, three preparations and
three automatic profile estimates. Quality changes reuse overlapping planes;
threshold/minimum changes reuse scientific preparation; histogram changes reuse
JPEG and energy. Full parameter repeats reuse segmentation. Native panel geometry
is source-specific. Existing shared RGB encoded caches remain reusable by other
JPEG operations. Cache completion is recorded only after an entire stage succeeds.

Each returned plane retains its whole scientific analysis, so older views and
exports remain valid across cache replacement. `releaseSurface` releases one
handle; unload/dispose releases all source handles and cached stores. Small
metadata is defensively copied. Work buffers, stores, page caches and scientific
windows use the shared budget. Large stores may use existing temporary storage;
there is no promise that every budget can hold every requested set of live views.
Progress identifies useful scientific phases and qualities. Worker hard abort
cleans source/results/temporary files; direct cooperative cancellation preserves
completed stages for retry. No runtime probe or calibration is added.

Automatic CPU mode runs missing qualities in parallel when image size and shared
memory allow it; single/reference mode stays serial. See ENERGY-STREAM-POOL.md
for useful-work adaptation, native parity and partial retry. ZERO/Ghost pools
are unchanged.

## Evidence

All51 native complete pipeline references match every energy/score/scope/label
byte and all summaries, profiles and region fields. Tests cover quality-overlap
reuse, cancellation/retry, cache eviction and ownership after cache disposal.
Scientific windows preserve types/bits and coordinates. Progressive NPZ is
byte-identical to contiguous export, including a chunk crossing quality planes,
Unicode metadata and independently checked CRC. Shared ZIP writer ZERO regression
covers native arrays and all five views, limit/cancellation, and reference mode.

Browser proof and observed limits are recorded in
`segmented-energy-chrome-proof.json`. Run `tests/segmented-energy.test.mjs`,
`tests/numeric-surface.test.mjs`, `tests/energy-npz-stream.test.mjs` and
`scripts/test-m5-browser.mjs --segmented-energy`.

Chrome154 proof: original1031×1024 PNG with24MiB trailing padding to force the
segmented decoder without changing pixels,96MiB shared budget. Standard, manual
and conservative profiles match all seven planes, native regions, panel summaries
and automatic metadata. Retained first results survive later profiles. The
29577116-byte NPZ uses OPFS, all five scientific arrays match after source unload.
Hard abort during preparation, exact retry and complete storage cleanup pass.
The automatic CPU proof dispatches three useful quality workers. Its accounted
peak is 95201193 bytes across profiles (95201193 after restart).
The quality pool and later profiles use the source OPFS session; individual
scientific store storage is declared on each surface. This
proof does not establish complete-pipeline behavior for arbitrarily large images
or extremely small budgets. IndexedDB remains unqualified here.
