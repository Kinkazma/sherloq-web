# Native automatic AI entries

`forgeryscopeEntries(result,{budget,low=10,high=Infinity,maximumOverlap=.8})`
consumes real composed M2 metadata. It preserves supported versus similarity
evidence, branch labels, lane display polygons, source offsets, centroid-distance
and rounded-hull overlap filters. Duplicate IDs replace their previous entry
without moving insertion order. The return is `{entries,release}`.

Entry hulls/moments/intersections use unchanged OpenCV4.11. Stable IDs reproduce
native SHA256 of Python JSON after float32 rounding to three decimals, including
negative zero, promoted float32 decimals and Unicode escaping. Native colors
are **BGR**, as in the native entry contract; a RGB renderer must convert them.
The hull identity excludes display distance limits and mutable hidden states.
The common geometry helper will also serve classical entries.

`d2prlEntries(result,{budget,minimum,refilter,signal,onProgress})` consumes an
original-coordinate union mask. It performs native 8-connected components and
external simplified contours, retaining the exact per-component pixel mask
including holes. `pixel_mask` is `{width,height,data:Uint8Array}` with `origin`
in source coordinates, ready for existing clone corroboration. IDs, colors,
counts, provenance and component order match native `d2prl_regions.regions`.
Every entry uses `d2prl-selected-zones`: overlapping passes count once.

Changing minimum requires `refilter(minimum,{signal})` to return the actual
result rebuilt from retained native 448×448 grids, with the requested minimum
and unchanged source dimensions. No raw-grid threshold approximation is used.
The helper releases that temporary refilter result after extracting independently
owned entries. Without a callback, a changed minimum is rejected. This callback
does not trigger any classical or Forgeryscope rerun.

The bounded native heap is reserved before construction: 64 MiB for polygon
geometry; for connected components, add 32 bytes per source pixel and round up
to 16 MiB, capped at 2 GiB. Outputs and metadata are additionally admitted; an
image containing many large overlapping component bounding boxes may therefore
require more memory and is rejected explicitly if it cannot fit. Arrays are
contiguous. Cancellation yields between components and hash chunks; during a
synchronous native component pass, the containing worker provides hard abort.
No calibration, preliminary inference or model change is introduced. Source
coordinates are bounded to ±2**30. The default 65,536 input vertices can be
raised through `maxVertices`, admitting 64 extra native bytes per extra vertex;
JS hull/identity working storage is also reserved before allocation.

Qualification: 36 native hull/ID/color examples (including float32 rounding
neighborhoods and Unicode), six small union masks (holes, diagonal connectivity,
sparse single pixels, borders, full and empty), five Forgeryscope filter cases
including actual native positive M2 metadata. Four Node tests verify equality,
refilter dependency and cleanup after cancellation/consumer errors.
Chrome additionally qualifies a 1003×1031 mask with four regions: exact mask
SHA256, IDs, contours and provenance. Corroboration checks all 1,034,093 pixels
with entries duplicated: holes remain zero and D2PRL stays one vote. The same
browser checks the native positive Forge entry. Peak accounted memory
105,030,728 bytes under 192 MiB; final zero.

Extending the actual M2 network test beyond arrays exposed a **remaining
end-to-end geometry discrepancy**. All seven array fields still match exactly,
but the real web network's accepted polygon differs by up to about .0453 px;
mean match score is .758003830909729 versus native .7565723061561584. The resulting
entry ID is `9e3d03eeb5c34b31015b4f38` versus native `e19917d7dc8626deb5c36fc4`,
so its derived BGR color differs too. Both retain 280 inliers, the same decision
and 78,640 mask pixels. `automatic-forgeryscope-chrome-proof.json` now records
`arrayParity:true`, `entryParity.passed:false`, and strict `passed:false`, with
both complete entries. No rounding snap, identity substitution or tolerance
relaxation is applied. The entry algorithm is exact on native inputs; complete
network-to-entry native parity remains unresolved at M2 revision `e80889b`.

Build inputs, library hashes and OpenCV license accompany
`vendor/clone-entries`; no prior composition kernel is replaced. These are
internal components. Full public automatic orchestration and classical entry
adaptation remain integration work.
