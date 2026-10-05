# Segmented neural result composition and NPZ — M1 .26

This increment composes already computed native grids into owned full-resolution
stores. It does not yet enable public segmented AI inputs: source hashing, real
inference controllers and public surface/export dispatch are the next integration.
No synthetic grid is substituted for a model in product execution.

## Native meanings

`segmentedNeuralProjection` takes explicit D2PRL448 or CMSeg/MGCF256/512 grids,
source dimensions, independent half-open zones and native parameters. It applies
the existing D2PRL native-grid postprocess before nearest mask/role projection;
its continuous union map remains bilinear. Component minimum and role-filter50
retain their native meaning. Exclusions clear only composed outputs, including
analyzed support, and do not alter inference crops or native-grid component decisions.

CMSeg/MGCF uses the existing sigmoid/softmax semantics: target/source masks are
ORed at their own >=0.5 decisions, while union probability is their float32 sum.
It does not threshold the sum to create the mask. Independent projected planes
combine by maximum/OR. Sigmoid uses >0.5. No exclusions or Compare are invented.
D2PRL zone status is native-grid presence; segmentation zone status is projected
mask presence. Final status uses the composed mask after exclusions.

`map`, optional `target/source` use float32 stores; `mask`, `analyzed`, `candidates`
use uint8. The latter remains native zero. Uncovered pixels remain zero. Every
zone uses the global rectangle dimensions in the qualified projection helper;
there is no separately resized band. All outputs remain private until completion.
Failure/cancellation disposes partial stores and leaves earlier results intact.

## Ownership and memory

Stores use the shared RAM/temporary admission. Planning reserves native-grid
postprocess capacity before choosing RAM outputs, so optional resident output
stores cannot steal the next processor's memory. D2PRL still admits its existing
512MiB postprocess worker maximum; this increment does not claim it was reduced.

`neuralResultSurfaces` exposes independent numeric and mask handles backed by a
reference-counted result group. Releasing one handle keeps its siblings and full
scientific export available; the final handle disposes all stores and metadata.
Nothing depends on the lifetime of an evictable raw-grid/model cache. Numeric
windows reuse M5/8d4ce76; mask windows keep the existing0/1 byte API. JSON contains
geometry and metadata, not a silently materialized complete array.

Wide rectangles (at least one quarter of source width) merge whole row spans
under a bounded buffer, preserving values outside the rectangle. Their band
height uses source width. Narrow rectangles keep sparse range I/O. Exclusion
updates also merge row spans. This reduces small temporary-file transactions;
it can read additional untouched pixels, without changing scientific arithmetic.
There is no startup calibration, nested pool or hidden resolution change.

## Scientific export

`streamNeuralNpz` reuses M5/8d4ce76 `scientific-npz-stream.js`. Two integration
changes are explicit: permit1-byte uint8 elements in addition to4/8-byte values,
and pass the shared budget when opening an export's temporary session. NPY1.0
headers, ZIP CRCs, native array names/order/shapes/dtypes and Unicode JSON remain.
NPZ pages stream through bounded chunks; the resulting owned export store has its
own lifecycle. ZIP32/requested byte limits remain explicit, with no partial export
published. Existing contiguous exporters remain unchanged except for exposing the
shared NPY header function.

## Qualification

-32 native D2PRL refilters: full map/mask/target/source/analyzed hashes, overlaps,
 exclusions, empty results and four component minimums are exact.
-14 native CMSeg/MGCF compositions: all seven qualified variants with/without
 envelope have exact complete arrays, including independent source/target decisions.
-Result ownership, cancellation, failure, admission refusal and retry pass.
 Streamed NPZ is byte-identical to both existing contiguous exporters in targeted
 tests; cancellation/limits preserve scientific stores.
-The Chrome recipe uses1027×1021 real OPFS stores, the actual D2PRL postprocess
 worker, source/target MGCF and CMSeg grids. All16 scientific output arrays match
 native hashes. Export pages are reopened with NumPy `allow_pickle=False`: CRCs,
 names/shapes/dtypes, complete array identities and Unicode metadata pass.
-Final accounted bytes and storage artifacts are zero. D2PRL's peak is629706683B
 under640MiB; MGCF/CMSeg peaks80220091/82251707B under128MiB. Browser process/Blob
 residency is excluded. The copied runtime is executed separately.

The row-span change was compared separately on these same useful composition
cases, before and after, with identical budgets and native outputs. Observed
composition times were7823.8→357.5ms (D2PRL),4907.7→105.3ms (MGCF-ST), and
2745.4→49.9ms (CMSeg), with unchanged accounted peaks. These single observations
concern temporary-store composition, not full inference or a universal speedup.
The offline former algorithm is retained as
`experiments/segmentation/projection-rowwise-reference.js` and can be rerun with
`node scripts/study-neural-composition.mjs --rowwise`. It is excluded from runtime
assets. Normal/extracted reports and `neural-composition-npz-proof.json` record
scope and source identities. The96MP preparation/projection proofs are separate;
complete96MP model-to-result qualification remains integration work.

## Native Mac reuse

Bounded source-coordinate composition can avoid simultaneous full resized planes
before maxima/OR updates. The major observed gain here comes from reducing browser
temporary-store calls; it is not a measured Mac gain. Keep native masks, holes,
component rules and output-only exclusions. No native application file was changed.
