# Immutable sources and exact pixel windows

The public direct/worker APIs now accept `loadBlob({id,blob},hooks)`. Loading is
transactional: a source and its surface become visible only after decoding and
the original SHA256 finish. Existing `load({id,bytes,pixels?})` remains available.
No Canvas decode, resampling, scientific threshold change or runtime performance
calibration is involved.

The existing full-memory codec path is retained when admitted. JPEG can instead
use libjpeg-turbo 3.0.3 scanlines into bounded RAM chunks or owned temporary
storage. A recognized full-memory allocation failure may try this qualified
alternative once; invalid data and unsupported formats are not resource retries.
OPFS setup can fall back explicitly to IndexedDB before decoding. Quota failure
does not silently select a different analysis. Static PNG and supported TIFF/
BigTIFF layouts are also segmented; see `PNG-STREAM.md` and `TIFF-STREAM.md`.

## Consumer contract

```js
const source = await engine.loadBlob({id: 'source', blob: file}, {signal});
const {surface} = source;
const window = await engine.readPixels({
  surfaceId: surface.id, revision: surface.revision,
  rect: {x: 100, y: 200, width: 256, height: 256}
}, {signal});
// window.origin === [100, 200]; window.pixels is owned contiguous RGB8.
const result = await engine.run({
  id: 'histogram', imageId: 'source', operation: 'inspection.histogram'
}, {signal});
const original = await engine.originalBlob('source');
const part = await engine.readOriginal('source', {offset: 0, length: 65536});
await engine.unload('source');
await engine.dispose();
```

Surface IDs are opaque and separate from source IDs. Revision and integer bounds
are checked, with half-open rectangles in the full, oriented source coordinates.
The eight EXIF orientations are exact index permutations. There is no implicit
interpolation. An unloaded handle fails with `NOT_FOUND`; a wrong revision fails
with `INVALID_INPUT`. `unload`/`dispose` must be awaited when storage is involved.

`readPixels` charges its output, source-row staging and known live WASM heap
capacities before allocation. The segmented histogram also admits known heaps;
scanline decoding accounts for prior JPEG heap capacity and observed heap growth.
An oversized window is rejected before allocation and a smaller retry stays usable. The
worker transfers the owned output buffer; subsequent calls cannot mutate an
earlier window. After transfer, the UI must charge and release its own live
buffers and textures. The engine cannot observe UI ownership or process RSS.
`readOriginal` similarly returns owned exact bytes (default at most 1 MiB).
`originalBlob` returns the immutable original. No edited or recompressed bytes
replace that original. Blob backing is browser-managed and may consume RAM.

`source.availableOperations` describes the loaded layout. Current algorithm and
large-source qualification boundaries are in `M5-LARGE-SOURCE-COVERAGE.md`,
`M3-COVERAGE.md`, `M4-96MP-COVERAGE.md` and `NEURAL-96MP-COVERAGE.md`; the original
0.14 histogram-only scope below is historical. The global histogram visits all
RGB values, including carry bytes across non-pixel-aligned chunks,
and produces native RGB/luminance bins, cumulative counts, unique-color counts and
range summaries. Range changes reuse the complete global analysis. JSON/CSV
exports use the ordinary result API. Unsupported operations fail `UNSUPPORTED_LAYOUT`;
they do not downsample or analyze display tiles. Whole-image `imagePixels` and
typed-array `original` are explicitly rejected for segmented sources.

Result surface handles, streamed raster/scientific exports and the global
FFT/wavelet/matching adapters now have separate delivered contracts and evidence.
A display-window API alone does not qualify these algorithms. Full five-group
automatic cohabitation96MP and the WordPress UI recipe remain pending.

## Bounded progressive JPEG source decode

Integration.13 uses the native libjpeg virtual-array backing-store interface for
segmented progressive JPEGs. All scans and global coefficients are retained, with
an8MiB resident coefficient cache and64MiB imported WASM ceiling. Original input
is read in64KiB windows; decoded RGB is written in complete row chunks up to1MiB.
EXIF orientation remains the exact source-surface coordinate permutation. The
same path also handles baseline encoded inputs too large for the older512MiB
codec; ordinary admitted baseline sources retain their existing decoder.

Coefficients borrow the source's temporary session and release their own files
after decode or failure. Source output ownership is unchanged. Native baseline/
progressive pixels, forced coefficient paging, output failure and cancellation
pass targeted tests. The original96MP progressive/EXIF6/ELA/full-PNG recipe
passes on integration.14 with the oriented cache below, including the independent
`verify-m5-progressive-96mp.py --variant oriented-cache` reader.

## Lossless transposed source cache

Integration.14 prepares a second temporary RGB store for segmented JPEG/PNG
sources of at least64MiB whose EXIF orientation is5–8. It builds exact oriented
rows with at most32MiB output windows, then serves repeated window reads from
contiguous rows. The original encoded-order store remains intact for detectors;
surface IDs, revision, metadata and original coordinate transforms stay unchanged.
There is no interpolation or change to scientific input. A96MP source uses an
additional288,000,000 temporary bytes, reported in source metrics.

The cache borrows the source session and is disposed with the source. A memory,
quota or unavailable-storage failure removes the partial cache and reports an
explicit fallback to the existing exact surface. Cancellation and other I/O
errors propagate. Targeted tests cover all four orientations, cropped windows,
raw-store preservation, disposal (including an immediate error from either owner),
cancellation and resource fallback. Seven targeted source/cache tests pass. The96MP
progressive/EXIF6 replay passes in46.739s under256MiB, peak69,271,552B, full
RGB/ELA and PNG pixel parity, final ownership0 and temporary cleanup. Its
uncached comparison also passes in2179.584s with identical PNG bytes and the
same accounted peak; see `M5-LARGE-SOURCE-COVERAGE.md` for the46.63× functional
comparison, additional temporary storage and shared-load measurement limits.

## Cancellation and storage ownership

The parent allocates a unique temporary-session ID before launching a source
load. Cancellation of storage-owning work first signals the worker. Bounded
control checkpoints let it abort, close handles and remove its own session before
termination. Normal work still begins immediately; checkpoints perform no probe.
The worker is recreated and all sources must be reloaded after cancellation.

A one-second watchdog forces termination if cooperative closure fails. The
parent then attempts bounded cleanup of only its known owned session and reports
`temporaryCleanupFailures` if removal fails. Browser crashes and forced worker
termination are not guaranteed to release OPFS locks promptly. This limitation
was observed during the large-image cancellation investigation; the normal
qualified path requires `storage-closed-before-worker-termination`. Orphan recovery
after application/browser crashes remains open. No entire origin is deleted.

## Original0.14 evidence and scope

`scripts/generate-large-jpeg.py` constructs a deterministic noisy 12000×8000
JPEG and independently decodes/analyzes it with native OpenCV/SHERLOQ. Generated
large files stay in the excluded `.build` directory. This is publicable synthetic
data, unrelated to private photographs.

- Original: 86,050,184 bytes, SHA256
  `f0b7febc57f625bf078dfeb746f5775f4c6efa7379e0f1c469a9330eb094f254`.
- Complete native RGB: 288,000,000 bytes, SHA256
  `b81c6d46e9e683461ac230c2593f44dff70a3e547c98ce7e5fb8043c34222f6e`.
- Four native pixel windows, all four histogram channels, unique colors
  1,637,956 and native rounded ratio 1.71% are exact through the public worker.
- Chrome154 and Firefox155 use OPFS; WebKit26.6 uses IndexedDB. Normal unload,
  cancellation/reload, stale handles and disposal leave no owned artifacts.
- Under a 256 MiB work budget, accounted peak is 129,005,192 bytes for OPFS and
  130,053,768 for IndexedDB. Observed JPEG WASM capacity is 103,546,880 bytes.
  The 86 MB original Blob is separately reported; these figures are not RSS.
- This historical recipe used the contiguous encoded-stream decoder. Its512MiB
  module limit is unchanged; the newer external progressive decoder above is
  separately qualified. Neither path promises arbitrary source or storage size.

Proofs: `jpeg-rows-*-proof.json` (complete RGB checksum), `source-api-*-proof.json`
(public worker and cleanup). These are functional, non-isolated timings, not an
optimization benchmark or WordPress/physical-device qualification.
`jpeg-rows.test.mjs` covers 25 JPEG fixtures with three scanline group sizes;
`source-surface.test.mjs` covers all orientations and exact window seams;
`segmented-histogram.test.mjs` checks 144 native histogram cases with 113-byte
storage chunks. `source-api.test.mjs` covers ownership, admission and bounded retry.

The native application already has its own memory adapters. Browser OPFS,
IndexedDB and cooperative worker shutdown are not drop-in Mac optimizations;
no new native speedup is claimed or applied by this tranche.
