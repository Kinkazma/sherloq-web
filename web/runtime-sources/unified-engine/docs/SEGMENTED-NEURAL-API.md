> M1.32 adds independent MGCF CPU zone jobs under the same budget and releases
> idle sessions when large output planes need their memory. See
> [scheduling, metrics and coverage](NEURAL-INDEPENDENT-ZONES.md).

# Segmented neural API — M1.27, CMSeg repair M1.28

This increment connects the qualified row preparation and native-coordinate
projection helpers to the actual D2PRL and segmentation analysis controllers.
The public path supports D2PRL, six MGCF variants and both CMSeg variants.
CMSeg generalization requires the repaired v2 bundle; its former bundle remains
rejected. See [numerical repair](CMSEG-BACKBONE-REPAIR.md) and the preserved
[historical counterexample](CMSEG-JPEG-NUMERICAL-LIMIT.md). TNT uses the repaired native-order bundle from M1.30; see
[TNT qualification](TNT-NUMERICAL-REPAIR.md). VIG uses its repaired M1.31 bundle; see [VIG qualification](VIG-NUMERICAL-REPAIR.md). Weights must still be configured explicitly.

## Source and execution

The immutable common-engine RGB surface supplies oriented half-open rectangles.
The cache identity hashes every oriented decoded RGB byte incrementally. It does
not substitute the original compressed-file SHA. Completed hashes can be reused
because caller windows never expose writable source storage. Raw-grid cache keys
also include source dimensions, model identity, backend where applicable and
rectangle bounds. A partially hashed or cancelled source is never memoized.

The two controllers accept the internal producer without allocating a full RGB
snapshot or full crop. D2PRL still prepares TorchAA448,40 PatchMatch iterations and
seed22. CMSeg/MGCF retain Pillow512/256 and their existing model arithmetic. These
fixed native input sizes are scientific parameters, not new hidden downsampling.
Model execution admission and explicit CPU selection remain in effect. No startup
calibration, preloading of unrelated weights or remote calculation is introduced.

All source rows and projection workspaces use the same budget as model heaps,
parameters, internal workers, raw caches and owned results. Source, output and
export stores can be RAM or temporary according to their actual admission.
There is no claim that a model fits every budget simply because its pixels stream.
The retained immutable source can still consume RAM; failure to admit a neural
model is explicit. The numerical-plane helpers accept axes through131072; the
installed source codecs impose their own smaller format limits.

## Result and ownership

A segmented analysis returns `layout:'surface'`, `surface` (the primary float32
probability map), `planeSurfaces` (`map`, and `target`/`source` when applicable),
`maskSurfaces` (`mask`, `analyzed`, `candidates`), layers and small JSON metadata.
`data` contains dimensions and metadata, not complete scientific arrays.
`readPlane({surfaceId,revision,rect})` returns an owned float32/int32 `plane`;
`readMask` retains its mask8 contract. Coordinates remain full resolution.
Window type, revision and bounds are validated; there is no Canvas conversion.

D2PRL target/source float32 planes contain binary residual-sign roles, not class
probabilities. MGCF-ST target/source contain class probabilities and its union
mask uses target>=0.5 OR source>=0.5. It does not threshold their sum. Exclusions
remain D2PRL output-only; CMSeg/MGCF still reject exclusions and Compare.

Each returned plane has a separately releasable handle. Siblings share ownership
of their analysis stores; releasing one cannot invalidate the other planes.
Later analyses, cache eviction and cache-only views cannot overwrite prior results.
Source unload releases its live result handles. Model unload does not substitute
for result release. D2PRL refilter and segmentation reproject remain inference-free
and explicitly fail on a missing raw cache.

## Scientific export

The public names and lifecycle follow M5/8d4ce76:

```js
const output = await engine.exportSurface({
  surfaceId: result.surface.id, revision: result.surface.revision, format: 'npz'
});
let offset = 0;
while (offset < output.byteLength) {
  const page = await engine.readExport({
    exportId: output.id, revision: output.revision, offset
  });
  await writable.write(page.bytes);
  offset = page.nextOffset;
}
await engine.releaseExport(output.id);
```

Pages default to1MiB, maximum4MiB. An export owns its completed storage independently
of source/model/result handles. It survives their release, until `releaseExport`
or engine disposal. Worker hard cancellation tracks each temporary export session
before creation and cleans it with the same storage-close protocol as source jobs.
This M1 branch exposes NPZ neural dispatch only. The coordinator can merge
`streamNeuralNpz` into M5's shared scientific export manager; this is not a separate
incompatible format and does not replace M5 PNG/ZERO/energy exports.

The streamed writer preserves legacy array order, shapes, little-endian float32
probabilities/roles and uint8 masks, Unicode metadata, CRC and browser provenance.
It uses stored ZIP32 (no pickle); outputs beyond ZIP32 or a requested byte limit
fail explicitly. `exportResult(...,{format:'npz'})` directs surface results to the
paged API; raw fixed-grid NPZ and small JSON exports retain their existing API.

## Validation and boundaries

Unit tests cover canonical RGB identity in all eight orientations, exact crop
reads by both controllers, cached recomposition, rollback, owned planes and
independent exports. Real-model recipes use JPEGs derived from public synthetic
fixtures and new native inference. All source-coordinate output pixels and raw
model grids are compared. Native tensors enter only the comparator.

The five MGCF CPU variants pass their three-zone JPEG cases with exact masks;
the maximum observed source probability error is1.94907e-5. CMSeg addnoise passes
with raw error8.73804e-5, source-map error7.68006e-5 and exact masks. D2PRL WebGPU
passes three native zones and the cached500→17 refilter, with bit-exact full-image
maps, binary masks and role planes. Its raw floating residuals are compared
separately. Completed functional observations record642.6s for its three-zone
RPC,319.5ms for the refilter and2,337,061,735 accounted bytes under3GiB. This is
not an isolated performance improvement.

The public12000×8000 JPEG also passes actual CPU D2PRL in the immutable runtime
copy: all six full-image arrays are bit-exact, raw residual max1.78814e-7 and
independent NumPy verifies the1,440,011,540-byte NPZ (1374 pages). Load RPC is2.162s,
analysis RPC461.031s, projection7.845s included in analysis, and NPZ preparation
237.553s. Source decode through archive readback is exercised, without a display
latency claim. Peak accounted memory is3,218,800,736 bytes under3GiB; this run's
source and result planes fit RAM, while the independently owned export uses OPFS.
Final retained/reserved/cache bytes are zero. These functional observations are
not a new speedup claim; export throughput remains an optimization opportunity.
The96MP source is a native empty-mask case; positive masks/roles are covered by
the small real-model sources and previous full-size spatial-helper fixtures.

The versioned machine-readable reports are the source of truth for each case:

- `neural-segmented-{variant}-{backend}-proof.json`: development API runs.
- `neural-segmented-{variant}[-large]-{backend}-extracted-proof.json`: copied runtime.
- Corresponding `*-npz-proof.json`: independent NumPy ZIP/arrays/metadata checks.

Recipes check raw grids, every output plane, canonical decoded RGB identity,
window type/revision/mutation, prior-result ownership, inference-free changed
views and an NPZ that survives source/model/result release. Small cases also
cancel during incremental source hashing and reload readable pixels. This does
not qualify arbitrary interruption inside every neural stage; earlier stage
cancellation proofs remain separate. The96MP recipe compares all pixels and
exports all arrays through bounded windows; it is not a small ROI standing in
for the complete image.

Run one heavy recipe at a time. Generate the native reference with the existing
isolated clone-detector Python environment (Torch2.8, OpenCV4.11), then run:

```sh
node scripts/study-neural-segmented.mjs --variant=mgcfdn-st --runtime-root=RUNTIME_DIRECTORY
node scripts/study-neural-segmented.mjs --variant=d2prl --large --runtime-root=RUNTIME_DIRECTORY
python scripts/check-neural-segmented-npz.py d2prl --large --extracted
```

`--gpu` selects the previously qualified D2PRL or MPDN hybrid; CPU remains explicit.
The recorded peak covers admitted application buffers/heaps and completed task
snapshots. Browser-managed Blob residency and process RSS are excluded. Full
96MP maps consume15 bytes/pixel for D2PRL/ST or7 for sigmoid families before
metadata; storage paging does not eliminate storage cost. No WordPress, other
physical device, unrestricted dimensions or universal detector fidelity claim
is made by these recipes. JPEG source limitations and ZIP32 limits still apply.
