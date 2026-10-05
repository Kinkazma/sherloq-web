# Automatic analysis in the common runtime

`createEngine` and `createWorkerEngine` expose `analysis.clones` and
`analysis.complete`. The complete operation also computes the real M5 ELA
pipeline. All detectors share the engine Budget. No calibration, substitute
network or additional image resizing is introduced.

```js
await engine.loadBlob({id:'original', blob:file, layout:'auto'});
await engine.loadM3Models({models:{}, language:{data:englishBytes,sha256:englishSha}});
await engine.loadD2prlModel({url:manifestUrl,bytes:manifestBytes,sha256:manifestSha});
await engine.loadAutomaticModels({forgeryscope:{
  assets, runtimes, preparationFactoryUrl, siftFactoryUrl, siftIdentity
}});
const result = await engine.run({
  id:'complete', imageId:'original', operation:'analysis.complete', backend:'auto'
}, {signal, onProgress});
// Inspect every group: missing resources return MODEL_UNAVAILABLE and partial.
const filtered = await engine.updateAutomatic({analysisId:result.analysisId,
  view:[{method:'setD2prlMinimum',value:800},{method:'selectTab',value:'overlay'}],
  filters:{low:10,maximumOverlap:.8}
});
const layer = await engine.renderAutomatic({analysisId:result.analysisId});
const counts = await engine.readPlane({surfaceId:layer.surface.id,revision:1,
  rect:{x:0,y:0,width:512,height:512}});
const archive = await engine.exportAutomatic({analysisId:result.analysisId});
// Read bounded readExport pages, then releaseExport(archive.id).
```

Resources are explicit and verified by the existing engine loaders. Forgeryscope
factory URLs must identify the qualified M2 runtime; `runtimes` supplies its ORT
provider files, and `assets` its pinned graphs/weights. The integration does not
bundle model checkpoints. `loadM3Models` retains a verified English language
payload used by the actual Panels + Text SIFT algorithm. Existing D2PRL manifest
identity remains enforced. Missing resources do not permanently hide operations.

Without `params.selection`, the native panel detector completes first, and only
its successful empty detection invokes the whole-image fallback. With an explicit
`{regions,envelope,disabled}` selection there is no new fallback. All-disabled
selections execute zero detector tasks. Selection coordinates are original pixel
centres. Source SHA, decode provenance, group state, attempt count and progress
remain visible. Automatic mode requests useful jobs immediately; resource failures
from concurrent work lower the concurrency limit and retry after peers settle,
at strictly lower concurrency (eventually alone). Completed groups stay cached.

One automatic session is current because the shared D2PRL adapter owns one raw
analysis identity. Identical run parameters reuse it. A changed source/scope,
model load/unload, standalone D2PRL run or releaseAutomatic invalidates that
session's analysis handle. Filters, source visibility, tabs, relation mode,
opacity, ELA families and Forgeryscope branch do not rerun detectors. D2 minimum
refilters its retained raw grids. Completed scientific archives and published
surfaces keep their separate ownership until released; source unload invalidates
its surfaces. Returned entries are copies; worker transfer never detaches caches.

`renderAutomatic` publishes a full-resolution numeric surface for context counts.
A count is a distinct detector × search-context vote, never a probability; D2PRL
contributes at most one, ELA none. `layer:'ela-preview'` publishes retained RGB;
`energy-low`/`energy-high` publish native scores when the background energy
calculation was enabled. Read these through readPixels/readPlane. Views preserve
entry identity and colour. Entries also supply polygon/mask layers in the result.

`exportAutomatic` includes all completed raw scientific detector outputs, selected
entries, view state, missing-group errors, native BGR source digest and full count
maps. It uses the same archive ownership and readExport/releaseExport API as
neural/ZERO/energy exports. `exportResult(...,{format:'npz'})` directs callers to
this operation rather than exporting only the visible view.

## Qualification and remaining source-size work

Chrome 154, public worker API, 96×96 repeated random texture: real extended
PatchMatch and ELA complete; six visible regions, context counts reach two,
identities/colours survive tab changes, native ELA preview is readable, cached
runs do not repeat jobs, scientific archive survives source unload. A second
public run loads the real English OCR asset and completes actual SIFT Panels +
Text with PatchMatch. Exports preserve int32 display-row evidence encountered
in the real dense output. Retained/cache/active memory return to zero. See
`automatic-runtime-chrome-proof.json` for group states and peaks. Node covers
all-disabled scope, invalid configuration, cancellation and archive lifetimes.
These are interaction proofs, not a complete neural accuracy requalification.

Automatic PatchMatch now consumes original segmented surfaces directly, including
its Extended detail/guides and all scientific fields. The common NPZ snapshot reads
those stores with native dtypes/shapes; it awaits asynchronous dense cleanup.
D2 now consumes segmented original sources, retains owned raw grids across shared
cache eviction, and builds native components/contours/IDs through bounded store
reads. Its automatic snapshots preserve all segmented scientific fields.
Forgeryscope now assembles all eight global fields in segmented stores, translating
original crop coordinates and applying exclusions without an extra M5 RGB copy.
These integrations pass focused geometry, ownership and archive tests. D2 also
passes its real automatic96MP provider recipe on a rich positive original: six
complete fields, contours and IDs exact, 7 initial and 36 refiltered entries,
2.239GB archive fully read after unload, 3GiB budget and final ownership zero.
Raw GPU grid maximum error is5.961e-7; projected maps and all decisions are exact.
See `m5-d2-auto-96mp-proof.json`. Forgeryscope actual positive automatic source validation is qualified below;
the five-group96MP composition remains pending.
SIFT Panels+Text still admits full-resolution RGB. Forgeryscope source preparation
also admits one crop RGB in its M2 analyzer; segmented output assembly alone does
not qualify its complete large-source working set.
The >=94 MP composition target is NOT qualified by this delivery. Each unavailable
large working set remains an explicit memory failure; no cropped substitute is
selected. The former real-source M2 polygon/score discrepancy is corrected and measured
below; other degenerate cases retain the M2 numerical limits.


Integration.6 consumes M4 e95a389 and M3 93d2782. Classical sparse methods outside
Panels/XFeat use M3 original-image rows through their public adapter; automatic
SIFT still selects the native Panels+Text profile. Runtime interaction qualification
compares contiguous and explicitly segmented copies of the same positive source,
including complete dense scientific arrays, cache/view identities, OCR/SIFT,
corroboration and archive lifetime. This small interaction test does not replace
the full>=94MP multi-engine composition qualification.


Automatic ELA energy contours use a padded byte-plane scanner preserving native
RETR_EXTERNAL/CHAIN_APPROX_SIMPLE behavior, including holes, nested islands and
reverse scan order. This removes the generic32-byte-per-pixel WASM reservation
that exceeded2GiB for a96MP mask. Cropped display masks remain admitted and owned;
output vertices are admitted progressively and failure/cancellation frees scratch.
161 small topology cases and the native complete ELA selection corpus are exact.
A generated12000×8000 mask with distant rectangles and a nested island uses
192,105,540B including the caller's mask under256MiB, final ownership0. This is a
contour helper proof, not a real full ELA96MP provider qualification.

The complete recipe `scripts/test-m5-complete-96mp.mjs` is prepared for all five
actual groups on M2's pinned rich96MP original under6GiB. It checks views, cache,
D2 refilter, full scientific arrays and a complete archive surviving source/model
unload, with bounded local delivery for `scripts/verify-m5-complete-96mp.py`.
Preparation of these recipes is not a passed five-group test.


Integration.9 consumes M2 4324b5d, M3 b7974f6 and M4 a67c0a1 on engine44b2237.
The real positive Forgeryscope automatic provider passes on the2008×1444 public
original: seven complete native raster fields exact, one accepted region,
272inliers, polygon max6.10352e-5px and score absolute error1.72854e-6. IDs persist
across views. The46,458,112B archive is read and hashed after source/analyzer/model
disposal. Budget4GiB, peak4,277,611,091B, final retained/cache/active0 and temporary
inventory restored. Total137.262s under shared load, analysis134.597s;
`m5-forge-auto-source-proof.json`. This validates M2's model/generation corrections
through the common segmented assembly, not all five groups or a96MP composition.


Segmented panel detection now queues maximal horizontal runs while preserving
native eight-connectivity, pixel counts, bounding boxes, palette/morphology,
border tests and selection order. The queue remains globally addressable and
bounded by the shared budget/temporary stores; a component may cross every page.
Scanning and growth cooperate on an8ms time slice, avoiding a forced timer for
every8192 pixels. All144 native panel cases and the real automatic ELA provider
corpus pass, including cancellation, progress-consumer failure and final ownership.
The dedicated original96MP recipe is `scripts/test-m5-panels-96mp.mjs`, with
`generate-m5-panels-96mp.py` and its independent native reference. This component
recipe does not replace the five-group composition test.


The committed helper e68cf79 passes Chrome154 on the same12000×8000 rich M2 JPEG
7a6ac1368fd28adbbf841a88b3b897f791695ac6fe265c7ba6c9a93f36d704ca. All14 native
panel polygons and the complete decoded BGR SHA256 are exact. The shared256MiB
budget peaks at204,495,954B, final owned memory0 and temporary inventory restored.
`m5-panels-96mp-proof.json` records exact timings and runtime-manifest binding;
the original96MP full five-group recipe runs concurrently on its prior fixed
commit, so this is not an isolated before/after benchmark.


The first combined96MP attempt on d9f135f was deliberately interrupted when
M4's new qualified synchronous matcher513558d was integrated. Partial evidence
is retained in m5-complete-96mp-first-attempt.json: about82minutes, iteration1
forward traversal37,691,392/96,000,000 pixels,1.064TB logical reads. It did not
finish and does not qualify combined outputs or exports. No hardware
impossibility or isolated performance ratio is inferred.

Each complete recipe freezes its entire runtime catalog plus test modules and
local Forgeryscope preparation/SIFT loaders and WASM in a per-attempt directory.
The lock includes hashes and the engine commit; subsequent checkout edits cannot
alter those served files. Model payloads remain externally pinned by their
verified identities. Logs retain every group state and separate progress clocks.
Failure/interruption retains its events and binding; success still requires the
complete browser archive check and independent Python verification. The same
original,6GiB shared budget, five groups, Extended eight-iteration profile,
full domain, views/refilter and whole archive requirements are retained.


The second combined attempt on fc27217 exposed a common-adapter defect: paged
SIFT received admitted RGB but no source temporary-storage context and failed
with STORAGE_UNAVAILABLE. The original source and native extractor were valid.
The analysis now forwards the lazy source session to SIFT, including reflected
passes; contiguous inputs can create a lazy analysis-owned session. Borrowed
sessions remain source-owned; dedicated sessions close after detector disposal.
Ten lifecycle/protocol tests and the actual Chrome automatic/OCR corpus pass,
with all55 scientific arrays unchanged. This fixes the identified integration
error; the full96MP rerun still has to pass. Terminal failed groups now stop the
qualification harness immediately, while waiting-memory retries remain allowed.
The incomplete evidence is m5-complete-96mp-second-attempt.json.


Temporary automatic-export scratch passes the shared Budget into session creation.
This also permits the real IndexedDB fallback when OPFS is unavailable. A targeted
Chrome regression reproduces the previous missing-budget refusal, then verifies
all10 native scientific arrays, exact nested metadata, the complete82,374-byte
NPZ, both scratch/output sessions, cancellation at corroboration and NPZ stages,
and final memory/storage cleanup. See `automatic-export-indexeddb-chrome-proof.json`.
The OPFS arithmetic/storage path used by the long96MP recipe is unchanged.


Integration .15 includes M4 exact SIFT descriptor bounds and the common adaptive
group scheduler described above. The third96MP attempt, stopped after116.245min,
had Forge/D2/SIFT done but only the first PatchMatch pass's sixth iteration in
progress; ELA was waiting-memory. The fourth was interrupted early (4.686min) to
include the scheduler correction. Both are explicitly incomplete and preserve
bindings/events/log hashes in `m5-complete-96mp-third-attempt.json` and
`m5-complete-96mp-fourth-attempt.json`. The current fifth attempt is frozen at
`b364e4c`, with the same native parameters, original96MP domain and6GiB budget.
The additional small-positive recipe exercises all five groups through full
archive readback but is not a large-source substitute.


Automatic ELA temporary sessions also receive the shared Budget (integration .15
follow-up). Before the correction, actual Chrome with OPFS disabled rejected
selected ELA preparation: IndexedDB requires a shared staging budget. The same
recipe now verifies22 native prepared fields (the existing content-logarithm
bound is retained), selected entries, all25 energy-enabled and14 cell-only
scientific export arrays, caches, cancellation and independent frame/raw owners.
Both provider sessions use real IndexedDB. Chrome512MiB budget, peak109274550B,
final owned0 and temporary inventory restored. See
`automatic-ela-provider-indexeddb-chrome-proof.json`. The new argument is ignored
by OPFS; its path in the active frozen composition runs is unchanged.


## Five actual groups — positive interaction recipe (2.9 MP)

Frozen runtime c6b6954/API.15, original public2008×1444 JPEG SHA256
`43ebe5fbe0c5786280753926ff3fe4f355c791f527ba48fa767df20b01bb0e6d`.
All five real groups finish under one6GiB public worker budget, each in one
attempt: Extended PatchMatch with all11 native passes/eight iterations, SIFT
Panels+Text/reflections, Forgeryscope Auto, D2PRL, ELA Ghost/background. No
provider substitution, crop or algorithm reduction. Peak6388093709B, final
retained/cache/active0; known codec heap16MiB is recorded before worker termination.
Temporary inventory is restored after disposal.

574 initial visible entries,628 after the D2 minimum17 refilter;142 paired entries
span more than500 original pixels, across both dense methods, SIFT and Forge.
Repeated analysis uses the same cache; tab/opacity changes preserve IDs/colours
and attempt counts. Corroboration, ELA preview and low/high energy layers remain
readable. D2 refilter takes0.675s and invokes no detector again.

Total2059.973s (34min20s) under concurrent host load: analysis2002.121s, export
21.556s, complete readback29.188s. These are functional timings, not an isolated
performance comparison. The639493485-byte NPZ survives source/model unload;
all910 fields, every payload and the whole archive are checked in the browser
and independently with Python zipfile/NumPy, including ZIP CRCs and dimensions.
Archive SHA256 `d283af601e94f7834014ccd379acef2c9c4c6900bb1e091a70ec5f82f9255e45`.
See `m5-complete-small-positive-proof.json` and
`m5-complete-small-positive-archive-proof.json`.

This establishes the actual five-group interaction/lifetime/export path on this
positive source. It is not a >=94MP qualification or a new full native inference
oracle. The separately frozen rich96MP run still has to finish. Later IndexedDB,
Composite and M3 guard updates retain their separate scopes in
`m5-complete-runtime-reuse.json`.


## Current-runtime five-group positive qualification (2f89712)

The `small-positive-cache` recipe passes on the same original2008×1444 positive
source as the acquired c6b6954 recipe. All five actual groups complete in one
attempt, including all eleven Extended dense passes with eight iterations.
IDs/colours,574 initial entries,628 after D2 refilter and142 distant paired
entries are preserved. Views, cached reuse,0.671s refilter and complete export
after source/model release pass; final temporary inventory is clean.

Whole journey1,201.293s (20min01s), analysis1,151.228s, versus acquired
2,059.973s (34min20s) and2,002.121s. The observed whole-journey reduction is
41.68% on shared-host functional runs; it is not an isolated cache-only
benchmark or an estimate for96MP. The dense group finishes at1,143.566s versus
1,995.126s previously. All groups use their first attempt. Peak accounted
memory6,410,824,549 bytes under6GiB; final retained/cache/active memory zero.

The639,499,129-byte archive has910 entries, SHA256
`c1db1335859bd2e1b107f2896dfdbecf58003227800ba08f2640cd3b524d3175`.
Independent zipfile/NumPy checks all CRCs, every full payload and the whole hash.
All908 scientific arrays are exactly equal to the independently verified prior
recipe, including604 dense arrays across all11 maps, geometry and detail
planes. Only metadata/provenance arrays differ. This establishes the new
allocation path under actual five-group cohabitation on this source; it does
not replace the still-running default96MP combined qualification on b364e4c.
See `m5-complete-small-positive-cache-proof.json` and its archive-proof companion.
