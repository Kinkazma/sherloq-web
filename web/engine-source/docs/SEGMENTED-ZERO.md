# ZERO on segmented sources

`run({imageId,operation:'jpeg.zero',params:{missing:true,view:0}})` accepts the
qualified segmented JPEG/PNG/TIFF RGB surface path. Source coordinates and
parameters remain unchanged. The original-order `cpuKernel:'reference'` override
is honored; other modes use the native threshold-filter/fallback kernel. Vote
bands use adaptive useful workers under the shared budget in automatic CPU mode;
single/reference modes remain serial. See ZERO-STREAM-POOL.md. The contiguous
ZERO pool is unchanged.
There is no runtime calibration or synthetic probe.

The result has `layout:'surface'`, an owned RGB `surface`, four owned
`maskSurfaces` (mask_f, mask_f_reg, mask_m, mask_m_reg), full-resolution layers,
metadata/regions, the64 float64 grid scores, palette, provenance and metrics.
Mask windows contain binary0/1; scientific mask arrays retain native int32 0/255.
Bounds are inclusive xyxy. Grid NFA is evidence, not a manipulation probability.
Use readPixels/readMask with surface id/revision and a full-resolution rect.

Views match the native choices:0 regions on luminance,1 source votes,2 masked
JPEG99 votes,3 foreign regularized mask,4 missing regularized mask. Unknown votes
are black. Native empty-region brightness, foreign/missing precedence and JPEG99
4:4:4 are preserved. If missing analysis is disabled or no global main grid is
found, unused scientific luminance/masks are zeros and companion votes are-1.

The source keeps one completed analysis keyed by missing. View changes reuse it
without votes, components or JPEG recomputation. A changed missing setting releases
the cache ownership; earlier result surfaces keep their own references and remain
readable. Each returned RGB/mask handle is released separately with releaseSurface;
source unload releases every associated result and cached analysis. Direct public
metadata is copied, so caller changes cannot modify cached scientific arrays.
Output surfaces render windows lazily from compact scalar planes; no complete RGB
view is retained. Scientific arrays live behind the RGB result handle.

For PNG use exportSurface on any RGB/mask handle. For complete scientific export:

```js
const file = await engine.exportSurface({
  surfaceId: result.surface.id,
  revision: result.surface.revision,
  format: 'npz',
  storage: 'auto' // optional: auto, memory, temporary
});
await pipeRasterExport(engine, file, callerProvidedWritableStream);
```

NPZ is a stored ZIP32 containing NPY1.0 entries: luminance/luminance_jpeg float64,
votes/votes_jpeg/mask_f/mask_f_reg/mask_m/mask_m_reg int32, grid_log10_nfa float64,
plus Unicode scalar metadata_json/browser_provenance_json. There is no pickle.
Every scientific matrix is written in chunks of at most65536 scalars. CRC32,
central directory and final SHA256 are generated over exact output bytes. Output
capacity is roughly40 bytes/pixel plus headers/metadata, independent of the compact
analysis storage. Explicit maxBytes or the ZIP32 4GiB boundary gives EXPORT_LIMIT.
Memory refusal is explicit. Auto selects RAM or temporary storage under the shared
budget; temporary can be requested directly. readExport returns up to4MiB owned
pages; releaseExport removes the artifact. Completed exports survive source unload.
The historical exportResult NPZ method explicitly directs segmented callers to
this paged API. JSON export describes the result; it does not expand scalar planes.

Progress: zero-luminance, zero-votes, zero-regions, zero-regions-component,
zero-closing, jpeg-encode/render, complete; export uses zero-npz with array name.
Fractions are local to the phase. Cancellation removes unpublished state; hard
worker cancellation clears images and live results, so reload before another task.

Qualification builds on the76 native vote/region cases documented separately.
Three representative native sources, both missing settings and all five views
match exact native hashes. Scientific arrays extracted from each NPZ match native
hashes; NFA stays within the existing1e-10 bound. Independent ZIP CRC parsing and
NumPy load with allow_pickle=False verify types, shapes and Unicode metadata.
Limits, cancellation, ownership after cache release and the reference override
are tested. Six shared raster export regressions remain passing.

Chrome154 public worker test at96MiB:1024² native reference, five full-resolution
views and four binary masks exact; source/view cache copies isolated; missing
parameter changes preserve earlier surfaces. NPZ41950734 bytes in OPFS is checked
matrix-by-matrix after source unload and has the expected file SHA256. PNG output,
hard cancellation, reload and final storage/budget cleanup pass. Peak accounted
memory92727296 bytes with two useful vote workers. To force loadBlob's segmented path on this small native
reference, the test appends16MiB legal trailing JPEG padding; analysis pixels are
unchanged. It does not claim a22MP public ZERO qualification. Original Blob and
browser/VM overhead are outside accounted working memory. IndexedDB scientific
export, ZIP64 and extreme multi-megapixel ZERO remain unqualified. A smaller budget
can reject the simultaneous JPEG/vote heaps even when the source loaded.

See segmented-zero-chrome-proof.json, ZERO-STREAM.md and ZERO-REGION-STREAM.md.
Run tests/segmented-zero.test.mjs and scripts/test-m5-browser.mjs --segmented-zero.
