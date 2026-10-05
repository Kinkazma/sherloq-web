# Full-resolution lossless PNG exports

`exportSurface` encodes any live RGB8, mask8 or RGB-flags8 surface into a PNG,
including segmented JPEG/PNG/TIFF sources and stored analysis result surfaces.
It reads exact full-width bands of at most32 rows and uses the pinned native
libpng1.6.43 writer. The export keeps source dimensions and pixel values; it does
not use Canvas, an approximate preview or a complete intermediate RGB image.
Masks and flags retain their raw byte values, including labels0/1/2. They are not
silently recolored or normalized for display.

The new file contains IHDR, IDAT and IEND only. Original EXIF, ICC, alpha and
signed provenance assertions are not copied. Surface orientation is already
applied through exact window reads. Original source bytes remain independently
available through `originalBlob`; the exported file is a derived PNG, with its
own SHA256 and explicit provenance. Other raster formats remain unavailable.

## API and ownership

```js
const artifact = await engine.exportSurface({
  surfaceId: surface.id,
  revision: surface.revision,
  format: 'png',       // default
  compression: 6,      // integer 0–9, lossless at every level
  // maxBytes: optional hard output cap
}, { signal, onProgress });

await pipeRasterExport(engine, artifact, destinationWritableStream, {
  signal, onProgress,
});
```

`pipeRasterExport` is exported by src/index.js. The caller chooses and provides
the destination WritableStream (for example a file stream already obtained by
B). The helper awaits each write before requesting the next1MiB page, closes on
success, aborts the destination on failure, and releases the artifact in either
case. `release:false` keeps the artifact for another consumer. It does not create
a full encoded Blob or open a picker. No automatic download or publication occurs.

The lower-level page APIs work in the direct and worker engines:

- `readExport({exportId,revision,offset?,length?},hooks)` returns owned bytes,
  totalBytes, nextOffset, done and MIME. Default page1MiB, maximum4MiB.
- `releaseExport(id)` deletes its owned storage. Later reads return NOT_FOUND;
  an incorrect live revision returns INVALID_INPUT.

A completed export is immutable and independently owned: it survives unloading
its source or releasing a result surface. `dispose` and worker cancellation
remove all owned exports. It remains the caller's responsibility to release a
completed artifact after use. Nothing is placed in the result cache.

The descriptor includes id/revision, imageId, sourceSurfaceId/revision,
width/height, sourceFormat, byteLength, SHA256, original source SHA256 and raw-mask
semantics where applicable. Progress phases are encode-png and complete; the
stream helper reports write-export. Cancellation/failure publishes no partial
artifact. A caller-specified output cap produces EXPORT_LIMIT if exceeded.
Worker cancellation follows storage-close/termination semantics and clears
loaded images; B reloads before another analysis.

## Memory and storage

The imported encoder WASM heap starts at16MiB. Its maximum rounds
`8MiB +40*rowBytes +512KiB` upward to16MiB, capped at64MiB; width/height are bounded
to1–65500. The shared working reservation adds8MiB overhead and a256KiB encoded
buffer. Source-window bytes/scratch and resident other-codec heaps are admitted
separately. Each native output callback waits for storage writes before resuming.

Storage capacity uses the zlib compressBound expression for filtered row bytes,
plus conservative PNG chunk/framing allowance. A lower requested maxBytes caps
that capacity. If the capacity plus working/source-window allowances fits, output
uses segmented RAM; otherwise it uses an owned OPFS session, with the existing
IndexedDB fallback. RAM accounting reserves the complete conservative capacity
until release even if compression uses fewer bytes. Disk capacity is a logical
reservation; actual quota errors remain authoritative. Returned metrics expose
output capacity, heap capacity/maximum, storage backend, encoded write count,
maximum source window and shared memory snapshot. These are accounted capacities,
not process RSS, browser Blob residency or a guarantee of immediate garbage collection.

Each output has its own tracked storage session, registered before a worker can
create it. Source unload does not remove export storage; forced worker shutdown
can clean the exact owned session IDs without touching other jobs.

## Qualification

Node uses an independent PNG chunk/CRC, zlib and row-filter decoder to compare
all bytes for RGB, masks and flags over all eight orientations and compression
levels0/6/9. Tests cover odd dimensions across row-band boundaries, original-byte
preservation, stale/range/lifetime errors, memory/output-cap refusal, source read
failure, cancellation, multipage backpressure, failed destinations and disposal.

A real Chrome worker qualifies a4103×5401 BigTIFF source and its derived PNG under
48MiB. The compressed export is decoded again and its entire RGB SHA256 compared
to the native source reference. An uncompressed PNG larger than the RAM budget
is stored in OPFS and consumed in1MiB pages after source unload, with exact encoded
SHA256. The shared load/export peak is43,780,736 accounted bytes, with a16MiB
encoder heap and393,888-byte largest source window. Worker cancellation, reload
and storage cleanup are verified. A separate
isolated worker with OPFS disabled checks a1600×2200 export through IndexedDB
under32MiB (peak27,525,120 accounted bytes).
See raster-export-chrome-proof.json for measured capacities and results.

Only the stated file sizes/backends are qualified; arbitrary multi-gigabyte
raster outputs and JPEG/TIFF/BMP encoding are not claimed. Reproduce with
scripts/build-png-export.py, tests/raster-export.test.mjs and
scripts/test-m5-browser.mjs --raster-export. Build inputs, binaries and licenses
are pinned in vendor/png-export. There is no runtime calibration or synthetic probe.
