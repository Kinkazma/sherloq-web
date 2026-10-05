# Embedded thumbnail analysis on segmented sources

`run({id,imageId,operation:'metadata.thumbnail'})` now accepts segmented originals.
The engine invokes the native ExifTool13.55 `-b -ThumbnailImage` selection,
decodes the returned bytes in a disposable worker using the qualified image
codec, then runs the native Lanczos4 comparison from THUMBNAIL-STREAM.md.
The source file and original pixels are immutable. Extracted bytes are not
interpreted as scripts or filenames; all data remains local.

On success, `data.available=true`, `surface` is the resized RGB thumbnail, and
`rgbSurfaces.difference` is the absolute RGB difference. Both share the original's
full-resolution oriented dimensions. Use `readPixels` for windows and
`exportSurface(...format:'png')` for either surface. Two RGB layers reference the
handles. `data.bytes` and `data.embedded` retain owned original thumbnail bytes
and decoded miniature pixels; `data.decode` identifies their decoder. ExifTool
warnings are retained. Absence returns `data.available=false`, no surfaces.

A completed analysis, including absence, is cached per immutable source. Changing
or releasing one view does not recompute extraction or comparison and does not
invalidate other live views. Release each surface separately; unload/dispose
releases source cache and remaining views. Completed PNG exports remain readable
after source unload. Worker cancellation cleans all owned output stores; reload
and recalculation are supported. Progress identifies extraction, native resize
and row comparison. There is no calibration or image resizing for analysis.

The existing contiguous RGB result contract is preserved. Its exact EXIF JPEG
pointer path remains fast; absent/non-JPEG pointers fall back to native ExifTool
selection in the browser engine. In particular, arbitrary PNG/TIFF bytes placed
in an EXIF JPEG-thumbnail slot are *rejected by ExifTool*. They are not silently
promoted into valid thumbnails merely because a decoder can read them. Other
encapsulations are selected by ExifTool; decoder format limits remain explicit.

Extraction retains the already documented ExifTool admission (544MiB plus bounded
source staging and resident heaps), then releases that worker before decoding
and comparison. It is not a192MiB complete extraction pipeline;192MiB qualifies
the22MP comparison primitive separately. A large encoded source or thumbnail may
still be refused explicitly under the shared budget. The full native resized
matrix remains bounded in its disposable WASM heap, with segmented delivery of
the returned results.

`loadBlob({id,blob,layout:'segmented'})` explicitly selects the qualified segmented
JPEG/PNG/TIFF loader. Omitted layout or `'auto'` keeps the existing automatic
choice. This avoids modifying/padding an encoded source when a caller wants
surface access. It does not force all stores to disk or permit unsupported codecs.

Evidence: five native extraction cases cover JPEG/PNG containers, absence, and
rejected PNG/TIFF payloads in JPEG thumbnail slots. The real browser worker matches
availability, original miniature bytes, resized RGB and differences; cache copying,
independent view ownership, PNG export, hard cancellation/reload and cleanup pass.
See `thumbnail-api-chrome-proof.json`. Original contiguous JPEG and PNG eXIf tests
remain exact. The separate large public TIFF proof is
`thumbnail-api-large-chrome-proof.json`; all fixtures/oracles are generated under
the owned tests/data/thumbnail-api directory, without changing shared fixtures.

The public22MP TIFF proof runs complete native extraction, decode, resize and
difference on4103×5401 pixels under640MiB. Its actual IFD1 JPEG bytes and both full
RGB hashes match native. A15011163-byte PNG difference export survives source
unload. Peak accounted637116559 bytes (dominated by conservative ExifTool
admission), with final retained/active memory zero. This public run stores the
RGB outputs in RAM; the separate192MiB primitive proof covers both in OPFS.
The contiguous fallback proof additionally verifies that native ExifTool rejection
is honored without changing the default source-layout choice.
