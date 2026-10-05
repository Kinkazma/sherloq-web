# Classic TIFF extended formats — M5

The existing `load`, `loadBlob`, original-byte and pixel APIs now admit classic
TIFFs with these combinations, using the same OpenCV 4.11 decoder:

- Bilevel grayscale, including default BitsPerSample=1 when tag258 is absent.
  CCITT modified Huffman, group3 and group4 are admitted for this depth only.
- 8-bit palette, including LZW, Adobe Deflate and PackBits in the native corpus.
- White-is-zero grayscale at 8/16 bits, both byte orders.
- Previously admitted RGB/gray8/16, now additionally qualified for separate
  sample planes and associated/unassociated alpha. Native alpha conversion is
  preserved; the engine does not substitute browser canvas conversion.
- First image of a multipage TIFF; subsequent frames are not exposed as analysis
  images. Orientations1–4 remain native-qualified.

The native corpus has 44 authored files. 43 full-resolution RGB hashes match the
native file loader in Node and the public Chrome worker, including 18 tiled inputs.
All 18 tiled grayscale hashes also match native file decoding. One float32 file
is explicitly refused before decoding. The float file is also
refused by the native analysis loader; TIFF orientations5–8 remain refused because
the existing native file-loader corpus rejects those inputs. No scaling is used.
The prior21 PNG/TIFF fixtures and32 extended PNG fixtures still pass.

`imageHeader` now reports planarConfig, tileWidth and tileHeight when present.
A missing TIFF BitsPerSample tag yields source depth1, correcting the old fallback8.
The native metadata helper's Pillow fallback can label such images8; the TIFF tag
semantics, not that fallback, determine source coding depth. Analysis pixels are
still rgb8, source bytes remain immutable.

## Tiled input adapter

The initial unmapped memory reader failed on valid uncompressed tiles, comparing
rounded allocation size to actual tile byte count (upstream
[libtiff issue505](https://gitlab.com/libtiff/libtiff/-/issues/505)). The separate
mapped adapter makes OpenCV's input-buffer callback report a successful memory
mapping and supplies a no-op unmap callback: the encoded staging remains alive
until the decoder returns. LibTIFF/pixel calculations are unchanged. This follows
the mapped path used by the native file loader, without weakening size checks.

The adapter covers the corpus's clipped edge tiles, gray/RGB8/16, bilevel, palette,
separate planes, associated/unassociated alpha, Deflate, big-endian16 and
orientations1–4. It only loads for tiled TIFF, leaving the existing shared OpenCV
module untouched. Browser decoding uses one disposable worker; RGB/gray output
buffers transfer back, and cancellation terminates the worker. Native module
source and pinned inputs are in native/tiff-mapped.cpp, scripts/build-tiff-mapped.py
and vendor/tiff-mapped/PINNED.json (OpenCV4.11/libtiff4.6/Emscripten4.0.15).

The contiguous path retains pixels and encoded bytes fully in memory. For N encoded bytes and P
pixels, the imported WASM heap is bounded to ceil((32MiB+N+12P)/16MiB)*16MiB, at most
1536MiB. Admission adds3N+6P+8MiB for input/output transport and module allowance,
plus existing resident engine heaps. The heap maximum is real; accounting is
conservative, not RSS. Image loads and original-file grayscale analysis both
reserve this adapter workspace before invoking it. Node uses the same bounded
kernel inline; browser worker disposal releases its entire decoder instance.
There is a 60 s decoder timeout, direct cancellation and hard-abort/reload behavior.

`load`/`loadBlob` report a decode progress phase when the worker is ready, not a
fictional tile completion percentage. Provenance identifies `tiffReader` and
`codecHeapMaximumBytes`. The 44-case Chrome corpus peaks at 92,361,142 accounted
bytes under 128 MiB. Budget refusal/cancellation/reload pass. A low-budget downstream
wavelet analysis correctly refuses the additional grayscale decoder reservation;
with sufficient budget it proceeds using native file grayscale.

BigTIFF containers are separately qualified in BIGTIFF.md. `loadBlob` now has a
segmented strip/tile fallback described in TIFF-STREAM.md. JPEG-compressed TIFF, other depths/photometric modes and orientations5–8 are not
claimed. B uses unchanged RGB surface APIs and improved format/provenance fields.
Metadata-only inspectMetadata/inspectHeaders remain independent of pixel decoding.

Tests: `tests/tiff-formats.test.mjs`, `tests/tiff-formats-browser.js`;
proof: `docs/tiff-formats-chrome-proof.json`.
Reproduce authored sources with `scripts/generate-tiff-formats-reference.py` and
`SHERLOQ_NATIVE_CORE` pointing to the read-only native core directory. It writes
only `tests/data/tiff-formats`, never the shared fixture symlink.
