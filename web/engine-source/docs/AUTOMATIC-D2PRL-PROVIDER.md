# Owned D2PRL automatic provider

The existing loaded D2PRL adapter now offers `runOwned(task,image,hooks)` and
`readRawOwned({imageId,resultId})`. Both return their usual envelope plus an
idempotent `release()`. The projected result/raw-copy reservations are transferred
to the caller, and envelope provenance/metadata has an additional admission.
These outputs survive adapter disposal. Existing public `run` and `readRaw`
retain their previous delivery behavior; no model, preprocessing, projection,
threshold or cache algorithm is changed.

`createAutomaticD2prlProvider({adapter,image,imageId,wasmBinary?})` connects that
actual adapter to createAutomaticAnalysisSession. It creates the native ordered
zone request, uses the chosen CPU/auto backend and keeps source RGB/exclusion
policy unchanged. Its raw value is `{result,provenance,metrics}`. Preparation
calls d2prlEntries, using the native OpenCV kernel for contiguous masks or the
global paged traversal described below for segmented masks. A new minimum uses
runOwned with the stable analysisId and refilterOf, then releases its temporary
projected output after independent entries have been produced. No fresh model
inference is requested by an entry filter.

`provider.readRaw(value)` returns an owned `{value,release}` scientific-grid copy
using the most recent refilter result identity. The adapter and image belong to
the integrating runtime; one provider belongs to one automatic session/source.
Using that adapter for unrelated analyses can invalidate the current identity.
Ordinary public D2PRL analyses retain their existing evictable cache and explicit
CACHE_MISS behavior. Owned analyses retain the actual raw grids under a separate
budget lease until a new analysis or adapter disposal, including when another
engine evicts the shared cache. Refiltering an ordinary result through runOwned
upgrades that raw-grid lifetime. No path silently reruns inference. Original
source geometry remains unchanged.

Focused validation invokes the real adapter and analysis/session controllers
with explicit protocol doubles for neural inference/projection, then uses the
real native entry geometry kernel and automatic session. It verifies public
reservation compatibility, transferred output/raw owners, one initial inference
per analysis, zero new inference on refilter, stable component identity, current
raw-grid export after refilter, independent frames after session/adapter disposal,
and final zero shared budget. This is ownership/control validation, not a new
neural or projection parity claim. Existing manifest-admission and cache-miss
checks also pass. Run the ownership test with:

```
node --experimental-test-module-mocks --test tests/d2prl-owned.test.mjs
```

The normal test glob explicitly skips this isolated module-mock test when that
Node flag is absent. No test doubles ship in the runtime. Numerical qualification
and the known M2 polygon discrepancy remain as previously documented.

## Segmented automatic consumption

The owned segmented adapter envelope includes `layout: 'segmented'` and the six
borrowed byte stores (`map`, `mask`, `candidates`, `analyzed`, `source`, `target`).
The ordinary public envelope still publishes surfaces. The automatic runtime
passes the original segmented image directly to D2PRL. It no longer acquires a
full RGB window for that provider.

`d2prl-regions-stream.js` copies the mask into temporary storage and traverses
its global 8-connected horizontal runs with bounded page caches. Regions are
ordered by the first 2×2 block, matching the native default connected-component
label order. Each retained component keeps its exact cropped byte mask, count,
origin and external CHAIN_APPROX_SIMPLE contour. The identifier hashes the same
cropped bytes and Python bbox string. Holes remain in the mask. This traversal
requires no image-sized label array or 32-bytes-per-source-pixel OpenCV heap.
Cropped output masks and polygon objects still require explicit RAM admission;
overlapping large component bounding boxes can exhaust the shared budget.

The provider awaits temporary refilter output disposal, including error paths.
The scientific snapshot borrows the exact typed stores through complete NPZ
assembly, retaining original dimensions and float32 role arrays. Mixed layouts,
missing fields and incorrect byte lengths are rejected. The entry filter still
changes only display entries; the archive preserves initial scientific fields,
current display entries/minimum and the immutable raw grids, as in the native
contract.

Development checks compare all existing native mask fixtures, 32 deterministic
random topologies against OpenCV, and complete contiguous/segmented NPZ bytes.
They cover cancellation, read/consumer failures and asynchronous refilter cleanup.
The 96MP browser recipe is `scripts/test-m5-d2-auto-96mp.mjs`; its recorded proof
must pass before this large-image path is described as qualified.


Shared-pressure checks explicitly evict every cache entry after an owned result.
Refilter and full raw-grid export still succeed without new inference, including
an owned refilter of an initially public result. The retained three-zone grids
require 7,225,344 accounted bytes; cache storage may temporarily account those
same arrays conservatively until eviction. Disposal releases every lease. This
changes ownership only; model arithmetic, thresholds and ordinary cache behavior
are unchanged.
