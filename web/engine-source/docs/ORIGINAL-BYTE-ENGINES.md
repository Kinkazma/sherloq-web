# Original-byte engines over segmented sources — 0.19

`file.hex` reads an exact original-byte window without materializing the complete
encoded file. Its existing parameters and result are unchanged: offset is an
integer from0 through EOF, length1–65536, and a window ending beyond EOF is clipped.
The window at EOF is empty; an offset beyond EOF is invalid. This is a read-only
view of the unchanged source, not a hex editor or a derived re-encoding.

`file.digest` adds an explicit Boolean `imageHashes` parameter, default **true**.
The existing full-memory default still computes ten cryptographic digests and
the six qualified perceptual hashes. With `imageHashes:false`, it computes only
the ten original-byte digests and marks visual hashes as not requested. This
choice omits visual work on both contiguous and segmented sources. The default
also supports all six native visual hashes on segmented RGB; see
[DIGEST-STREAM.md](DIGEST-STREAM.md).

```js
const result = await engine.run({
  id: 'original-digests', imageId: 'source', operation: 'file.digest',
  params: {imageHashes: false}
}, {signal});
// data.hashes: MD5, SHA-1, SHA2-224/256/384/512, SHA3-224/256/384/512.
// data.imageHashes: {}; data.imageHashStatus: explicitly not requested.
const window = await engine.run({
  id: 'hex', imageId: 'source', operation: 'file.hex',
  params: {offset: 65530, length: 777}
}, {signal});
const json = await engine.exportResult(result, {format: 'json'});
```

Segmented load results and capabilities no longer restrict `imageHashes`.
Both byte-only and complete digest results have independent cache keys.
Filename hints and supplied file properties are now available as described below.
No new model is introduced.

## Memory, cache and cancellation

One pass visits original Blob chunks of1 MiB in encoded byte order and updates
the ten hash states. The retained source is never read through Canvas or rebuilt
from decoded pixels. Existing contiguous callers share the same digest arithmetic.
The operation reserves known resident heaps plus a32 MiB working allowance for
the hash states; Blob staging is counted separately. Hex reserves256 KiB for its
bounded source window/result copies. These allowances are accounting, not measured
process RSS. One worker handles these operations; no GPU/multicore gain is claimed.

Results are immutable cached values returned as defensive copies. Cache keys
include byte-view parameters and explicit visual-hash selection; source unload
removes them. A partially cancelled hash is never cached. Progress uses phase
`original-bytes`, and cancellation checks occur between chunks. For segmented
sources the worker closes storage cooperatively before termination; reload the
original source before continuing.

Small JSON exports now reserve their conservative text bound and temporary
representations, plus input payload and known resident heaps, instead of the
configured maximum output size for every result. The same output ceiling and
JSON representation remain enforced. CSV/NPZ keep their existing ceilings and
also account for known resident heaps. This is not a streaming raster exporter.

## Reproduction and limits

`tests/source-byte-operations.test.mjs` compares ten hashes with Node crypto for
empty, short and multi-chunk Blob sources, exact boundary/EOF windows, cancellation,
explicit visual-hash opt-out and low-budget refusal, cache isolation and default JSON export under
52 MiB. Existing native perceptual-hash tests verify the unchanged default path.
`scripts/generate-large-byte-reference.py` uses independent Python/hashlib over
the public synthetic86,050,184-byte JPEG; it never reads private photographs.
Run `scripts/browser-test.mjs --source-byte-operations --browser=chrome` or firefox/
webkit for the actual96MP source worker, all ten digests, five original windows,
JSON, cancellation/reload and owned-storage cleanup.

Only loaded image sources are accepted; arbitrary-file loading is not introduced.
Segmented decoding still has its JPEG/WASM limits. Other formats/algorithms,
physical quota/crash behavior, WordPress controls and physical devices remain
separate work. A digest match proves byte identity, not image authenticity.

Completed byte evidence: Chrome154.0.8037.58, Firefox155.0 and WebKit26.6
match all ten independent digests and five window checks. Accounted peak
138,149,888 bytes plus the separately browser-managed86,050,184-byte Blob.
Cooperative cancellation takes4.7/81/53 ms in these non-isolated runs; zero
owned artifacts remain after unload, cancellation/reload and disposal.


## Supplied file properties and native filename hints

`load({id,bytes,name?,mime?,lastModified?})` accepts optional file properties.
`loadBlob({id,blob,...})` automatically reads `File.name`, `File.type` and
`File.lastModified`; explicit properties override those defaults. Names must be
basenames (no path separators/NUL), at most4096 characters. Modification times
are integer milliseconds since the Unix epoch. Load replies return a defensive
`file` copy. Internal properties are immutable until unload/reload.

Both pixel and original-byte digest paths return `data.physicalFile`:
`name`, `sizeBytes`, `declaredMimeType`, `signatureMimeType`, `lastModified`,
`metadataOrigin`, `nameBallistics` and an explicit unavailable-stat list. The
signature recognizer covers JPEG/PNG/TIFF and works across small byte chunks;
unknown signatures return null. This is a signature hint, not a general libmagic
dump. Supplied MIME and timestamps remain separately identified caller/browser
properties; they do not override the decoded source or cryptographic digests.

The five native filename patterns match Nikon Coolpix, Nikon digital, Fujifilm,
Canon/iPhone and Olympus naming conventions; other supplied names yield native
`Unknown source or manually renamed`. With no name, `nameBallistics` is null.
These are weak filename conventions, not proof of the device that made an image.
The19-case native oracle covers ASCII, Unicode case folding, exact digit counts,
extension and final-newline boundaries. Node and real Chrome worker tests verify
File transfer, byte-only and visual-hash paths, conflicting declared/signature
MIME, cache ownership and unchanged digests. B can populate the physical-file
table directly from these fields and format the supplied timestamp locally.

Browser inputs do not expose trustworthy parent folder, owner, permissions,
creation/access times or filesystem metadata-change time. These fields remain
explicitly unavailable rather than being inferred from the name or source bytes.

## Derived hex edits (M5)

`deriveOriginal({imageId, patches}, hooks)` is now available on engine and worker.
B owns edit buffers, undo/redo, preview and the download name/dialog. Example:

```js
const derived = await engine.deriveOriginal({imageId: 'source', patches: [
  {offset: 8, deleteCount: 2, bytes: Uint8Array.of(0, 1, 2)},
  {offset: 20, deleteCount: 4, bytes: new Uint8Array()}
]}, {signal, onProgress});
// derived.blob: application/octet-stream, suitable for an explicit download.
```

All offsets refer to the unchanged ORIGINAL encoded bytes. Replacement, insertion
(`deleteCount:0`), deletion (empty bytes) and append (offset=original size) are
supported. Patches must be sorted with strictly increasing offsets, disjoint deleted
ranges, safe integer offsets/counts, and at most65536 entries. Equal-offset edits
must first be combined by the UI. A patch cannot extend beyond EOF; an empty list
returns an unchanged derived Blob, and removing all bytes returns an empty Blob.
No image decoding, re-encoding or file validity claim accompanies these raw edits.

Results include `sizeBytes`, `originalSizeBytes`, and `edits` with original offset,
deleteCount, insertedBytes and outputOffset. Provenance records imageId, source
SHA-256 and original-byte coordinates. It does not claim a derived SHA, valid image,
valid metadata or preserved signature. Source pixels/bytes, digests and cached
analyses continue to refer to the original. The derived Blob survives source unload.

Blob inputs, including segmented JPEGs, use immutable slices; there is no complete
`arrayBuffer()` staging. Byte-array sources require an admitted Blob snapshot of
the original. Patch bytes are copied into immutable Blobs before any await or caller
callback. Known heaps, source snapshot if needed, twice inserted bytes and1024bytes
per patch/control slot are admitted under the shared budget. Browser-managed Blob
backing memory is explicitly unmeasured, never advertised as zero RAM. The returned
Blob belongs to the caller, who must release downloads/object URLs when finished.

Progress phase `derive-original` reports assembly every128 edits and completion.
Cancellation checks run between128-edit batches. Direct engine cancellation releases
reservations and preserves sources; worker hard cancellation follows the existing
reload-required contract. Derived outputs are not cached. File editing remains a
separate API from the read-only `file.hex` window operation.

Five Node tests cover edits/coordinate shifts, immutable snapshots, invalid overlaps,
budget/cancellation, a16MiB Blob assembled within16KiB accounted staging without a
full read, original/cache preservation, a real segmented JPEG under52MiB, and recovery. Real Chrome worker verification
covers exact returned bytes/provenance, original preservation, output survival after
unload, and hard-abort/reload (`docs/derive-original-chrome-proof.json`).

The same immutable-Blob path is also qualified on the original rich96MP source:
all original/derived bytes, hex windows, shifted edit coordinates, output after
unload and cleanup pass. See `m5-derive-96mp-proof.json` and
`M5-LARGE-SOURCE-COVERAGE.md` for full metrics and independent Python reference.
