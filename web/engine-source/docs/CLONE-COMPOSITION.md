# Clone composition primitives — native v2

This increment implements relations, exact corroboration, pair deduplication and
presentation state. It does **not** implement or announce `analysis.complete`
or automatic clone detection. Classical detector adapters and their real end-to-end
assembly remain pending. Test entries are reference data, not detector inference.

## API for engine/UI integration

`src/clone-relations.js`: `annotateRelations(entries, {regions, envelope, width,
height})`, `pairRelations({points,pairs,regions})`, `visibleCloneEntries(entries,
options)`, and `biomePaintOrder(entries)`. Regions/polygons use original pixel-centre
coordinates (inclusive corners); these are not the half-open rectangles of D2PRL.
Pass all known anatomical regions plus the explicit envelope for annotation.
Relations describe endpoint ownership independently of detector search provenance.

Each entry has `{id, source, polygons, search_context, provenance}`. Preserve the
full native source names from `CLONE_SOURCES`. `provenance.search_region` is optional;
an explicit `search_context` is authoritative. Browser-generated fallback contexts
use canonical rounded coordinates rather than native SHA strings. Keep native
identities when importing evidence; don't mix regenerated IDs with existing hidden
states. Non-attributable classical evidence remains available in `all`.

An exact segmentation entry instead includes `pixel_mask: {width,height,
data:Uint8Array}` and `origin:[x,y]`; mask values must be 0/1. Descriptive polygons
never replace that mask. D2PRL entries must use the already filtered/projected union
from the D2PRL adapter: this module does not repeat native-grid component filtering.
All D2PRL contexts are counted as one, even when callers retain individual pass IDs.

`createCloneCorroboration({budget})` takes the **existing shared engine Budget**.
Do not create a parallel engine budget to evade admission. It exposes:

- `counts({width,height,entries,excluded,byContext:true}, {signal,onProgress})`:
  owned `{width,height,values:Uint32Array,release}`. Release ownership when done.
- `stripes(request, async strip => …, hooks)`: writes progressive uint32 row bands;
  `strip` is `{width,height,top,values}`. The consumer must finish with a band before
  resolving or reserve its own memory to retain it. Partial output after cancellation
  must be discarded by the caller. `stripRows` is 1–256 (default 256).
- `uniqueEnvelopes(entries,{threshold:.9,signal})`: display representatives only,
  with `member_ids`/`corroborating_sources`; never use these to compute counts.
- `dispose()`: release the kernel and its heap admission after all jobs finish.

One active call per instance. Progress reports completed source rows. AbortSignal
is checked between useful raster batches; callback failures and cancellation release
workspaces. No preflight computation, worker tuning or synthetic runtime probes.
Memory: the small WASM module has a 16 MiB initial heap with 64 MiB maximum admitted
for its lifetime. Mask workspaces use at most 256 source rows. JS output stripe
height adapts to remaining budget; full `counts` additionally reserves 4×W×H bytes.
Input evidence ownership stays with the caller. This module doesn't own or evict it.

The kernel preserves OpenCV's **native 256-row raster bands**, even when emitted
stripes are smaller. Arbitrarily changing raster bands changes clipped diagonal
edge pixels. No raster approximation, convexification of masks, count weighting,
uint8 truncation or cap at six. `byContext:false` supplies distinct-method counts.
ELA and unknown sources never vote. `colorizeCounts` returns RGB8 map/overlay,
fixed absolute colors 1 through 6+; data values remain exact. Optional biome boundary
strokes and picking belong to the renderer; use exact masks/cells and paint small
biomes after large ones. Colorization allocation is caller-owned/admitted.

`createAutomaticAnalysisView({complete,width,height})` stores choices separately per
tab and per Biomes/Corroboration mode. Default overlay: corroboration on image,
within, 70%; first isolated method: Biomes, all. Map/overlay share a relation filter.
ELA settings survive temporary hiding in corroboration. D2PRL filter range is
0–5000/default 500 and returns `update:'refilter-d2prl-raw-grids'`; the caller must
invoke the existing D2PRL cache refilter then rebuild counts. View operations schedule
no inference. `frameKey` and `preserveViewport` indicate dimensions unchanged; B
keeps the actual camera/zoom. ELA controls and data remain independently owned.

## Validation and remaining work

`node --test tests/clone-composition.test.mjs`: native OpenCV/NumPy-v2 fixture checks
relations, exact uint32 counts, holes, exclusions, band boundaries and small delivery
stripes; also 301 votes, D2PRL union, AI separation, cancellation/budget release and
per-tab restoration. `node scripts/test-m5-browser.mjs` loads the real WASM in Chrome
and compares 11,970 native count pixels. No model is involved in these checks.

Generate fixtures in this worktree with `SHERLOQ_NATIVE_CORE=/path/to/core python
scripts/generate-composition-reference.py`. Rebuild with `EMSDK=/path/to/4.0.15
OPENCV_BUILD_ROOT=/path/to/existing/.build python scripts/build-composition.py`.
The compiler cache is frozen; OpenCV inputs are read-only. Outputs stay here.

Pending: runtime worker RPC and session cache integration, actual detector result
adapters and progressive groups, full UI rendering/exports, large-source evidence
storage and ELA legacy/Ghost preparation. No inference completeness is inferred
from the availability of these composition primitives.
