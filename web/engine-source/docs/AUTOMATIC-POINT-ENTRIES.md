# Automatic PatchMatch and SIFT entries

`automaticPointEntries(result,options)` adapts actual M3/M4 packed results to
native automatic display entries. It returns owned `{entries,release}` without
rerunning a detector. `points` is float32/float64 N×7, `pairs` float64 N×4,
groups hold pair row indices, and `pair_search_regions` keeps independent search
owners. M3 supplies its actual `biomeSides` and `pairedBiomes` functions through
`options.geometry`; no fallback grouping is selected when they are missing.

```js
const entries = await automaticPointEntries(denseResult, {
  budget, geometry: {biomeSides, pairedBiomes}, split: true,
  low: 10, high: Infinity, maximumOverlap: .8, signal
});
// For SIFT use split:false and source:'SIFT + G2NN + RANSAC + Panels + Text'.
entries.release();
```

The adapter separates search owner and anatomical endpoint relation before
constructing hulls. Dense groups split with native paired-endpoint grouping,
except groups whose model preserves a source-panel relation. Three distinct
rounded spatial witnesses are required on both endpoints; repeated keypoint
orientations do not manufacture support. Native display-distance filtering and
self-match overlap policy are preserved, followed by the display overlap limit.
The unfiltered subset supplies stable ID/color even when the selected subset
has fewer pairs; SIFT retains its supplied palette. Partition provenance,
source/region indices, part numbering and labels survive.

M3 params objects and M4 geometry objects supply tolerance; native positional
params are also accepted. Native rings produce exact `roi:ring2:...` and
`compare:ring2:...:ring2:...` contexts. Invalid owner indices use the native
whole-image/unspecified fallback. Colors remain native BGR.

`clone-relations.polygonRing` now uses Booth's minimal cyclic rotation in both
directions after native float64 rounding and adjacent-duplicate removal. This
preserves concave edges instead of sorting away their topology. Browser equality
uses that ring directly; the entry kernel hashes Python JSON to reproduce the
native ring2 identity. Explicit detector contexts still take precedence.

The caller owns input detector results. The adapter admits packed membership,
pair/context workspaces and M3 grouping work under the shared budget; native
hull capacity is admitted from the largest group. No image/model memory is
allocated. Its returned entry leases are independent of the input lifetime.
Cancellation after grouping releases workspaces, geometry and partial entries.

Qualification: ten native `automatic_clones.point_entries` cases cover dense
splitting, partial filtering with stable IDs, SIFT palette, preserved panel
groups, compare/unknown/missing owners, self-match policy, empty groups and both
point dtypes. All entries match exactly using the actual M3 grouping and side
orientation functions at `938fe74cc0ff165d6cae268243681e0c07f70264`.
Nine native ring keys cover reversed/shifted/closed/repeated vertices,
topologically different concave polygons and fractional/negative-zero rounding.
Cancellation cleanup passes; seven existing composition/view tests pass.
`study-automatic-points.mjs` reads M3 through `M5_M3_ROOT` (default sibling
worktree) and writes only this worktree's proof. These are postprocessing
fixtures; they do not qualify another complete detector inference.

Full public automatic scheduling, ELA entry composition and scientific export
integration remain separate. The real M2 network-to-entry discrepancy recorded
in `AUTOMATIC-AI-ENTRIES.md` remains open and is not hidden by this delivery.
