# Native TIFF blocks into segmented RGB storage

The default controlled `loadBlob` loader now uses an isolated libtiff4.6 decoder
when a classic TIFF or BigTIFF is not admitted by the existing contiguous path.
It reads the original Blob by range and writes full-resolution RGB8 to segmented
RAM or temporary OPFS storage, with the existing IndexedDB fallback. No complete
encoded staging or second full RGB buffer is needed. `load(bytes)` retains its
existing contiguous semantics.

The admitted format subset is unchanged: gray1/8/16, RGB8/16, palette8, native
alpha and planar conversion, compression1/2/3/4/5/8/32946/32773 (CCITT only for
bilevel gray), and orientations1–4. Only the first image is decoded. JPEG-in-TIFF,
float samples, other photometric/depth combinations and orientations5–8 remain
explicitly unavailable. Native RGB8 conversion does not apply ICC profiles.

## Block conversion and orientation

The adapter calls native `TIFFReadRGBAStrip` or `TIFFReadRGBATile` on the original
strip/tile grid, converts their RGBA output to RGB8, joins a horizontal band of
tiles and writes that band once. Native libtiff conversion and alpha arithmetic
are unchanged. The unmapped uncompressed-tile allocation bug described in
TIFF-FORMATS.md is corrected locally: its useful-byte guard compares `tif_rawcc`
(actual bytes), instead of rounded allocation capacity `tif_rawdatasize`.
The check is retained; the shared library/source tree is never modified.

Orientation follows the actual native TIFF loader, including its per-tile flips
and vertical block placement. In particular, a generic whole-image EXIF flip can
differ from the native tiled result. The stored RGB already has the native
orientation; the surface has `orientation:1` and provenance retains the original
orientation plus `orientationApplied:true`. B must not flip these pixels again.

## Admission and cancellation

Dimensions are currently bounded to1–65500. With P pixels in one stored source
block, the imported WASM maximum rounds `16MiB+24P` upward to16MiB, capped at256MiB.
The initial heap is16MiB. Shared admission adds one RGB band of
`3*width*min(height,blockHeight)` bytes and8MiB overhead; encoded reads use a
separately admitted256KiB cache. Source storage, known other-codec heaps and disk
staging are admitted separately. LibTIFF also has a maximum single allocation.
These are accounting/capacity guarantees, not a process-RSS measurement.

A source whose single strip/tile exceeds this admission fails with MEMORY_LIMIT;
this implementation does not subdivide native compressed blocks or rescale the
image. Real multi-gigabyte Blobs and extreme dimensions remain unqualified.
The loader checkpoints before each block and encoded range read. A cancelled or
failed load publishes no source and removes owned temporary storage. Worker
cancellation closes storage before termination; the source can then be reloaded.
No calibration or synthetic runtime probe is added.

## Contract for B

Use the existing `loadBlob`, `readPixels({surfaceId,revision,rect})`, `readOriginal`
and `originalBlob` APIs. Capabilities add `image/tiff` to segmentedFormats.
Provenance includes `format:'tiff'`, `layout:'segmented-strips-tiles'`, native
orientation policy, source depth, RGB8 analysis depth and first-image policy;
BigTIFF additionally reports `container:'BigTIFF'`. Progress phases are `decode`
(block completion) then `original-sha256`.

Metrics expose blocks, blockWidth/Height, codecHeapCapacityBytes,
codecHeapMaximumBytes, workingReservationBytes, encodedReadCalls/Bytes, storage
and temporaryBackend. The existing segmented operation list applies, including classic ELA (SEGMENTED-ELA.md), Ghost maps (SEGMENTED-GHOST.md),
six perceptual hashes and the non-JPEG quality curve (no invented JPEG tables).
Each operation still has its own admission. Full-memory-only engines continue
to report UNSUPPORTED_LAYOUT. Full-size PNG export is described in RASTER-EXPORT.md.

## Evidence

Node and a real Chrome worker match all49 positive native classic/BigTIFF corpus
RGB hashes; one float32 source is refused. The corpus includes clipped edge tiles,
packed gray, palette,16-bit conversion, alpha, planar samples and orientations1–4.
Two new4103×5401 sources exercise deflated64-row strips and deflated128×128 BigTIFF
tiles with orientation3. All full-image RGB SHA256 values, original-byte SHA256
and six perceptual hashes match native OpenCV4.11. Node prohibits whole-Blob
arrayBuffer staging on both large paths. Chrome uses OPFS under96MiB, with a92,754,739-byte accounted peak and a16MiB
heap peak under32MiB maximum for each decoder; see
`tiff-stream-chrome-proof.json` for exact capacities and peaks. Cancellation,
reload, cleanup, truncated input, read-callback cancellation and budget refusal
are checked. TIFF-specific large-image qualification covers OPFS, not IndexedDB.

The large reference also exposed Radial variance angle/reduction roundoff;
DIGEST-STREAM.md documents the shared contiguous/segmented correction.
Reproduce with scripts/build-tiff-stream.py, generate-tiff-stream-reference.py,
tests/tiff-stream*.mjs and scripts/test-m5-browser.mjs --tiff-stream. The build
records source, object and binary hashes plus licenses in vendor/tiff-stream.


RGB16 deflate/predictor BigTIFF now passes on a full12000×8000 source with1504 native256×256 tiles and orientation3. All RGB8 pixels and the independently decoded full PNG after unload match native. Chrome256MiB/OPFS, cumulative peak51421184B,23.562s complete. See m5-formats-96mp-proof.json and M5-LARGE-SOURCE-COVERAGE.md.
