# Automatic AI selections and real Forgeryscope composition

`automatic-ai-regions.js` adapts native polygons to the existing AI contracts.
`automaticAiBoxes` follows `clone_detectors.boxes_for`: exactly four axis-aligned
corners, floor(min), ceil(max)+1, clipping and minimum 8 × 8 after clipping.
Empty standalone regions yield the full source; `automaticAiSelection` rejects
empty explicit selections before that fallback. Bounds are **[left, top, right,
bottom)**, never [x,y,width,height]. Native ordered equality and D2 deduplication
happen in the preceding plan.

`automaticD2prlRequest(plan,{id,imageId})` returns the existing D2PRL adapter
request, or null for a disabled job. It supplies rectangles, component minimum
and output exclusions. It never alters RGB: D2PRL exclusions apply after
inference on intact crops. Model/layout/size limits remain those of D2PRL;
this lot does not change or requalify the model.

`readAutomaticForgeryscopeCrop` reads an owned full ROI from a segmented surface
or contiguous RGB8. It blackens intersecting exclusions without changing the
original. Local exclusion boxes also reach M2, which rejects touching panels
before feature comparisons. This difference from D2PRL is native behavior.

```js
const output = await analyzeAutomaticForgeryscope(image, plan, {
  analyzer: realM2ForgeryscopeAnalyzer, budget: sharedBudget, signal, onProgress
});
// mask/map/candidates/geometric/branch_* and analyzed use full source dimensions.
// metadata.zones[i] keeps local geometry and its explicit source origin.
output.release();
```

The integrating runtime supplies M2's actual analyzer and verified model assets.
Independent crops, maximum score merging, bitwise mask merging, exclusions and
native status aggregation are preserved. Disabled jobs do no work. M2 owns its
model/result cache; repeated calls reuse it and return independently owned
composition arrays. Cancellation, inference failure, invalid output and consumer
errors release partial work. The caller separately owns/disposes the analyzer.

Crops are admitted full RGB arrays. The eight composed arrays consume 11 bytes
per source pixel plus metadata, accounted before allocation. They currently use
RAM; this wrapper promises neither unbounded sources nor segmented model
execution. M2's CPU/GPU adaptation and shared budget remain active, without a
benchmark. `cpu:true` requests CPU; otherwise M2 receives `auto`. Progress gives
completed-zone fraction and current model phase fraction as `stageFraction`,
because phase percentages restart.

Seven native ROI cases qualify fractional/clipped/reordered/touching rectangles,
invalid rotation, minimum size, blackened crop hashes and original immutability.
Node tests also verify D2 request semantics and partial-work cleanup.

`study-automatic-forgeryscope.mjs` reads the actual M2 worktree and external
assets; it writes only M5's Chrome proof. A native positive 2008 × 1444 image is
embedded at (23,31) in a segmented 2068 × 1514 source. Actual CPU/WASM inference
produces eight panels and 78,640 mask pixels. All seven scientific fields equal
the native reference at the offset; pixels outside the ROI are zero. A cache
call retains independent arrays. Shared budget 3 GiB, observed peak
3,162,205,370 bytes, final zero. M2 revision:
`e80889b8c719ad6530ca896167d489a99df05463`.
The network test's exclusion is outside the ROI; intersecting RGB exclusions
are covered by native crop hashes, not an additional end-to-end model claim.

The extended entry test now makes that proof strictly `passed:false` while
preserving `arrayParity:true`: actual M2 polygons/scores differ from native and
therefore produce a different entry ID/color. See `AUTOMATIC-AI-ENTRIES.md` and
the proof's full `entryParity` records. Exact raster arrays do not qualify all
geometric metadata. No tolerance was enlarged.

This remains internal. Full public orchestration, classical/D2 region entries
and complete scientific exports remain separate integration work; no full
automatic operation is advertised here.

## Segmented Forgeryscope assembly

For a segmented original, `analyzeAutomaticForgeryscope` now passes M2 a translated
crop surface. Its full crop read remains explicitly admitted by M2; intersecting
exclusions are blackened before inference, in addition to native panel rejection
and output exclusion. The original surface stays unchanged. No resize or tile-local
search is introduced. The source-coordinate scientific fields are composed into
segmented stores, using bounded byte windows and the original max/OR rules.

M2 fields distinguish typed `readInto` element offsets from `readBytes` byte
offsets. The assembly uses the latter and preserves the float32 map exactly.
It adds the original-coordinate analyzed mask, retains crop origins/metadata,
and borrows all eight stores for full automatic NPZ export. Source removal clears
the automatic session and the internal Forgeryscope result/model cache; configured
model identities remain available for a subsequent requested analysis.

Nine targeted selection/snapshot/assembly tests pass, including native black-crop
hashes, overlapping zones, full field and scientific-array byte equality, and
read/inference/release/cancellation cleanup. Analyzer doubles in these tests are
protocol fixtures, not neural qualification. The real-model integration recipe is
`scripts/test-m5-forge-auto-source.mjs`; its 2008×1444 case and the separate 96MP
five-engine composition must be reported independently.
