# Segmented illuminant maps — M1 0.30.0-m1.13

`various.illuminant` accepts segmented JPEG sources through the common worker.
Its three estimators, four cell sizes32/64/128/256, optional inverse-sRGB transfer,
dark/clipped exclusion and three views preserve the native definitions. Results
have `layout:'surface'` and an owned RGB surface at oriented source resolution.
`readPixels` reads windows; `releaseSurface` releases a result and its retained
cell data; unloading the source invalidates its results and private cache.

```js
const loaded = await engine.loadBlob({id: 'photo', blob: file});
const result = await engine.run({id: 'light', imageId: loaded.id,
  operation: 'various.illuminant', params: {
    block: 128, method: 1, linear: true, exclude: true, mode: 0
  }});
const preview = await engine.readPixels({surfaceId: result.surface.id,
  revision: result.surface.revision, rect: {x: 0, y: 0, width: 512, height: 512}});
const csv = await engine.exportResult(result, {format: 'csv'});
await engine.releaseSurface(result.surface.id);
```

The existing `data` contract remains: `rows`, `cols`, `block`, float64`rgb`,
uint32`counts`/`areas`, uint8`valid`, float64`globalRGB` and float64`angles`.
Cell arrays are row-major, positions are full-resolution oriented coordinates,
and partial edge cells keep their actual area. The CSV uses the surface dimensions
when no contiguous raster exists, preserving partial edge widths/heights.
JSON/CSV remain bounded in-memory exports; no unlimited streamed export is claimed.
These estimates also depend on surface colors. They are not light directions,
calibrated forgery probabilities or an authenticity verdict.

## Global statistics with bounded local storage

Only one row of cell histograms is live. Exact integer histogram counts accumulate
into the global768bins. Each local estimate uses the existing NumPy-compatible
float64 pairwise summation and normalization. The global estimate is computed
from the complete source histogram before angles and display colors. No per-band
normalization, resized analysis, changed threshold or independent tile decision
is introduced. RGB repetitions render the cell grid without stretching edge cells.

For the declared12000×8000image and32pixel cells, local histogram workspace is
1152000bytes instead of288000000bytes for all93750cells. This is an allocation
comparison, not a whole-process RAM measurement or an isolated speed benchmark.
Compact cell data uses41bytes/cell plus24bytes for the global vector. Private cache,
returned cell arrays, row staging, codec heaps and I/O are admitted together.
One oriented row and compact cell metadata must fit; otherwise `MEMORY_LIMIT` is
explicit. RGB output uses admitted RAM or owned temporary storage.

A cache keyed by source/block/method/linear/exclude reuses estimates across views.
It is evictable under pressure, while published output surfaces remain owned.
Returned arrays are copies; caller mutation or RPC transfer cannot corrupt it.
`metrics.analysisCacheHit` and `sourceReads` expose the reuse. Cancellation discards
unpublished data. The public worker closes temporary storage before termination,
reports `imagesCleared:true` and requires reloading the source.

## Evidence and current limits

- 1440 native renders have exact pixel hashes and integer cell arrays; existing
 float64 tolerance≤1e-12 is retained. Eight orientations, small row groups, partial
 cells, cache isolation, cancellation/retry and refusal before reads pass.
- The previous contiguous illuminant path passes its1440reference outputs after
 extracting shared arithmetic helpers. Its observed max numeric error remains
 1.123e-14 on that corpus.
- Chrome154 common worker, public96MP JPEG, budget256MiB: three complete native
 RGB hashes and all cell data agree; maximum scalar error8.882e-16. Four windows
 each, independent old results, private cache after returned-array mutation,
 CSV272659bytes with partial edge geometry, cancellation/reload and zero final
 retained/cache/active bytes or temporary artifacts pass. Maximum recorded
 completed-task accounting is129005192bytes. This excludes browser process/Blob
 overhead and unreported aborted intervals.
- Functional RPC observations for the three variants were11.81/10.18/9.68s. A cached
 repetition read zero source windows and took3.13s including rendering/storage.
 They are not isolated speed comparisons. One CPU worker is currently used;
 no GPU or multiworker benefit is claimed. Transposed large sources can be I/O-heavy.
- The exact copied runtime is replayed separately. WordPress wiring and the later
 PNG/TIFF source integration belong to their owners; this increment claims JPEG.

Reproduce public input with `scripts/generate-large-jpeg.py`, native reference
with `scripts/generate-large-illuminant.py`, and the actual worker recipe with
`scripts/study-segmented-illuminant.mjs`. Native arrays stay under`.build`; only
public recipe/proof metadata enters delivery. No native Mac source was modified.
The reusable memory idea is one row of histograms plus exact global bins; native
adoption and its own complete-path measurements are separate work.
