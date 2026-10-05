# Native ELA cell operation

`src/ela-cell-tools.js` ports three native stages independently of the already
available pixel-energy operation. These primitives are now assembled by `ela.biomes` with the real content-matched
reference profiles, described below.

- `coherentCellScores({rows,cols,signed_scores,supported}, hooks)` consumes native
  row/column/quality/descriptor float32 scores (3 qualities × 5 descriptors).
  It preserves the signed median across qualities, zero-outside 3×3 median,
  agreement of signs and cap by the centre's own evidence.
- `segmentElaCells(base,{threshold:2,minimum:3},hooks)` preserves 8-connectivity,
  support, native default component order, and the minimum-size seed requirement.
  Base contains `score`, `signed_scores`, `supported`, and `metadata.block`.
  Optional `legacy_score`, `ghost_score`/`ghost_supported`, `background_score`/
  `background_supported`, and `ela_score` retain their native roles. Returns an
  int32 label grid, native region metadata/bounds and signed profiles. Energy
  regions must still be prepared separately through the existing energy pipeline.
- `aggregateGhostCells({maps,rows,cols,qualities},{rows,cols,block,dx,dy},hooks)`
  registers normalized float64 16px Ghost cells to ELA cells with exact area
  weights. Output `{curves,valid}` excludes incomplete/wrapped evidence rather
  than padding it. Coordinates follow the native positive circular roll.

Hooks are `{signal,account}`; `account(bytes)` connects to the caller's workspace
admission. No full-source pixel allocation is made. Ghost integration keeps one
2D float64 integral plane at a time, instead of an extra integral quality cube.
Cell segmentation has a conservative admission for temporary labels, component
queues/statistics, medians and region metadata. Native preparation increases cell
size until at most 16,384 complete cells; these primitives don't alter that choice.

Reference tests execute the unchanged function ASTs from the native sources,
using real NumPy 1.26.4 / OpenCV 4.11 / SciPy median filter. Four tests pass:
12 cell-segmentation cases (including 257-row native labeling), four coherence
maps, four Ghost registrations including 71 qualities/phase offsets, empty/seed
rules, invalid input and cancellation. Float32 profiles and all float64 Ghost
registration values are exact on these fixtures. Source hashes are in
`tests/data/ela-cell-native.json`.

The standalone stages remain useful independently. The operation below supplies
original-RGB descriptors, robust references, Ghost phase search, caching,
segmentation and JSON/NPZ. Full-format raster views, selection rendering and
combined automatic-analysis assembly remain integration work.

## Content-matched peer scores

`createElaPeerScorer({budget})` in `src/ela-peer-scores.js` now supplies the three
actual scoring stages. Call `score({rows,cols,content,supported,profiles,kind,
qualities},hooks)`; `kind` is `legacy`, `background` or `ghost` (qualities=3 for
legacy/background; 71 probes starting at Q30 for Ghosts). Content is float32,
6 descriptors/cell, up to the native 16,384-cell ceiling. Residual profiles are float32 `[cell,quality,descriptor]`
with 5 or 3 descriptors; Ghost curves are normalized float64 `[cell,quality]`.
All scores and counts preserve native names/dtypes. The returned `release()`
relinquishes output admission; dispose the scorer when its session finishes.
Its nearest-peer heap is admitted under the same shared budget, and JavaScript
workspace/output allocations are checked separately. Queries yield in batches of
128 cells. No preflight or detector substitute is used.

The actual [SciPy1.17.1 cKDTree implementation](https://github.com/scipy/scipy/tree/v1.17.1/scipy/spatial/ckdtree/src)
is compiled with balanced/compact nodes and leaf size16. The only NumPy header
requirement is a pointer-sized integer type, supplied by a small compatibility
header. The build/query algorithm and priority heaps are unchanged; no approximate
nearest-neighbour search replaces it. Sources, license and hashes are vendored.

Standalone nearest-neighbour checks cover 17–513 samples, identical rows, duplicate
rows and grids: no neighbour index changes; maximum distance deviation 2.22e-16
on random doubles (zero for the tie cases). End-to-end scoring fixtures cover
flat/varied/duplicate/undersupported content: all 23,359 output values, support
counts, legacy signed profiles, background references and Ghost quality choices
match native exactly in Node and Chrome154. Budget refusal, cancellation and
recovery pass. These fixtures validate scoring from prepared descriptors. The original-RGB
path is qualified separately below; operation assembly is described below.


## Original-RGB cell preparation

`createElaCellDescriber({budget})` from `src/ela-cell-describe.js` prepares native
content descriptors, residual profiles, usable cells and background descriptors.
Call `describe(original,recompressed,block,{signal,onProgress})` with matching
RGB8 source-sized images and a multiple-of-eight cell size >=16. Arrays use
row/column/descriptor order; incomplete trailing cells are omitted. The caller
owns/admit both RGB buffers. Return values have `release()`; the session has
`dispose()`. The module admits a 64 MiB heap and 57 bytes per output cell under
one shared budget. Input rows carry an 8px halo; HAL stripe boundaries use each native halo
matrix, as in cv.magnitude. Oversized native workspace is rejected explicitly without resize.
The whole-image segmented JPEG provider is described in SEGMENTED-ELA-BIOMES.md.

The pinned OpenCV 4.11 reference's ARM float contraction, Sobel addition order,
Carotene magnitude estimates, quiet-pixel quantile and NumPy reduction layout are
preserved. Build inputs stay read-only; `scripts/build-ela-describe.py` creates
`vendor/ela-describe`. The native descriptor source and square-root table hashes
are pinned. `scripts/study-ela-describe.py` creates the independent native oracle
and generated texture PNG within M5's own `tests/data`.

Tests run real RGB JPEG recompression, descriptor preparation, native peer scores,
coherence/background and seeded segmentation. Across three images (including odd
473×277 dimensions), three qualities and three cell sizes: 27 preparations,
9 scoring groups and 27 region segmentations, 195,486 compared values. Profiles,
validity, all downstream scores/counts, labels and region metadata are exact.
After the halo-stripe/log1p correction, measured content error on this corpus
is0; the prior3e-7 acceptance bound is unchanged. Universal downstream identity
beyond the measured corpus is not claimed. Node and Chrome 154 pass. Memory refusal, cancellation and reuse
release their admission correctly. No calibration is run on user images.


## Callable engine/worker contract

`operation: 'ela.biomes'` is available through `engine.run` and `createWorkerEngine`.
Parameters and defaults:

| Parameter | Default | Domain |
|---|---:|---|
| quality | 0 | 0 auto tables/fallback75; otherwise1–100 |
| block | 32 | multiples of8 from16–96; grows by8 to meet native16,384-cell ceiling |
| threshold | 2 | finite, >0 and <=50 |
| minimum | 3 | integer1–1000 cells |
| ghost | true | normalized Ghost evidence enabled |
| allGrids | false | all64 phases instead of(0,0); requires ghost |
| background | true | native residual-background deficit evidence |

At least25 complete cells are required. This operation supplies the cell family;
`ela.energy` supplies the independently controlled pixel-energy family. It does
not announce a complete automatic analysis or a combined WordPress panel.

`data.rows/cols` describe row-major cell arrays; `metadata.block` gives actual
source pixels per cell. Cell(x,y) covers `[x*block,(x+1)*block)` by
`[y*block,(y+1)*block)`. `valid_shape` excludes right/bottom incomplete cells.
`labels` is int32, zero outside regions; retain holes and exact cell support.
Region `bbox` uses source pixels, with a native median score and signed profile.
Scalar and label layer descriptors include `pixelSize:[block,block]` and origin0.
The interface can select a region by `labels===id` without rerunning analysis.

Data includes content6, profiles[3,5], signed_scores[3,5], quality_scores3,
legacy/coherent/final score, peer_count and supported. Background adds3-descriptor
references/signed values per quality, counts/support and pre_background_score.
Ghost adds float32 curves71, best deficit score, int16 quality probe, uint8(x,y)
phase, counts/support and the pre-Ghost `ela_score`. The winning phase changes only
for a strictly greater score; phase0 curves/counts are retained for cells without
a positive winner. Wrapped/incomplete support is never fabricated. Probe quality
means maximum curve deficit, not an estimated original JPEG quality.

B can render cell colours with the native HSV formula
`h=(.73+(id-1)*.61803398875)%1, s=.7, v=.95`, rounded RGB×255 using ties-to-even;
native cell boundaries use RGB245. Native mixed display uses45% cell colour.
Energy and full automatic-analysis overlay preferences remain separate contracts.
Graph arrays and region metadata are returned directly; selection, heatmap palette,
full-format contours/render/export PNG and WordPress controls remain B integration.

Cache keys separate cell block/quality preparation, Ghost phases and background.
Threshold/minimum changes only rerun segmentation. Q75→Q80 reuses75/80 and adds85.
Ghost block losses reuse phase/quality data across one/all-grid requests. Cell
preparation dispatches the three actual JPEG+descriptor tasks from100,000 pixels
on the shared adaptive codec pool, subject to its worker memory admission. Ghost
maps retain their existing useful pool. There is no probe, calibration or warmup.
CPU-only is supported; no unqualified GPU dispatch is introduced.

Memory on the contiguous path: source bytes and decoded RGB remain contiguous.
The separate qualified segmented path is described in SEGMENTED-ELA-BIOMES.md. Preparation reserves live arrays independently of
cache eviction. Each descriptor heap is admitted64MiB, each peer heap64MiB; the
serial path disposes descriptor preparation before loading peer scoring. Pool
workers reserve their codec, descriptors and input/output copies together. Large
halo/codec refusals are explicit and never trigger downsampling. Cancellation
releases current admission. Hard worker abort clears sources/caches; reload is
required and partial qualities are not retained across that abort.

Exports: JSON and NPZ. NPZ preserves grid shapes and native numeric dtypes,
including int16 Ghost probe qualities, float32 curves and metadata/provenance JSON.
On the declared composited synthetic input, all four full API combinations
(legacy, background, one-phase Ghost,64-phase Ghost) reproduce native scores,
curves, phase winners, support, labels and region metadata exactly. The64-phase
case has26 different winning offsets and maximum Ghost deficit6.155313; thus it
exercises actual phase selection. NumPy reads back the NPZ arrays exactly.
Chrome154 worker qualification checks two useful cell workers, native results,
threshold cache, overlapping qualities, Ghost support, NPZ and hard-abort recovery.
Ten targeted quality/energy regression tests pass, including51 existing energy
pipelines; the historical101-quality worker curve remains exact.
