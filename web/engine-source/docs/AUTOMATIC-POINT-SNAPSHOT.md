# Automatic classical scientific snapshots

`automaticPointSnapshot(value, {nativeParams})` accepts a borrowed real M3 sparse
or M4 dense result and the corresponding `plan.native.sift` or
`plan.native.patchmatch` tuple. Hold its provider result lease until archive
export settles. No detector, feature, geometric or palette computation occurs.

Native arrays are explicit: points `[N,7]` retain their float32/float64 dtype;
pairs `[M,4]` are float64; colors `[M,3]` uint8; search owners `[M]` int32;
pair algorithm IDs uint8. Packed uint32 biome index lists stream as native int64
without materializing a second copy of all groups. Empty matrix shapes survive.

M4 full fields become native dense maps: `consistent_mask` bool,
`coherence_error` float32 or null, `targets` int32 (flat destination indices),
and `distances_squared` float32, all `[field.height,field.width]`. Source origin,
shift, search zone, algorithm, reflection and extended descriptor frame/bin
metadata retain native meanings. Compare has native zone index zero.

`params` contains the supplied native tuple. `browser_details` separately retains
the effective browser parameters, status, metrics, geometry, provenance and
semantics, plus dense auxiliary evidence: allowed bitmask uint8, sampled display
rows uint32, comparisons (exact BigInt), pass/context and storage metadata. This
adds explicitly named arrays to the archive; it does not discard browser evidence
or present browser implementation metadata as native measurements. Other native
records, models, group variants and frames remain in the result. Unknown direct
typed fields fail; nested unsupported values also fail in the archive encoder.

Validation uses saved native classical results, the real native palette and real
automatic exporter, plus deterministic dense fields including a reflection pass,
optional coherence and chunk boundaries. The Node test verifies 18 native array
names/shapes/dtypes/hashes and native metadata, four additional browser arrays,
empty results and invalid inputs. Final budget is zero. This qualifies snapshot
conversion, not new M3/M4 inference or unresolved arithmetic differences.
