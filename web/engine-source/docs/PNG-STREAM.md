# Native PNG decoding into segmented storage

The default controlled `loadBlob` loader now falls back to a bounded PNG row
decoder when the contiguous path is not admitted. Source pixels retain their
full dimensions. Supported static PNG colour/depth pairs are gray1/2/4/8/16,
palette1/2/4/8, RGB8/16, gray+alpha8/16 and RGBA8/16, including Adam7 and EXIF1–8.
Analysis pixels are native RGB8; alpha is stripped,16-bit channels use the native
high-byte conversion, and colour profiles/gamma are not applied. APNG animation
chunks cause an explicit segmented-path refusal pending frame-policy qualification.

## Implementation and memory

The isolated `vendor/png-stream` module links the pinned OpenCV build's unchanged
libpng1.6.43 and zlib. Asyncify suspends libpng's input callback for bounded Blob
reads; `png_read_row` retains native filters, palette expansion and interlacing.
Ancillary metadata transformations are disabled; the separate original-byte
header reader obtains orientation. There is no Canvas, rescaling, image-sized
encoded staging or intermediate full RGB allocation in this decoder.

Rows are processed in bands of at most32. Adam7 makes seven native passes over
the same lossless storage; each band is read back before libpng combines the next
pass. A final oriented RGB surface maps reads to source coordinates, as for JPEG.
Storage uses segmented RAM when admitted, otherwise OPFS with the existing
IndexedDB fallback. A failed or cancelled load publishes no source and removes
its owned storage. Original encoded bytes remain an unchanged browser Blob.

Both dimensions currently have the explicit bound1–65500. The initial WASM heap
is16MiB; its per-load imported maximum is the next16MiB multiple above
`16MiB +128*width +3*width*min(32,height)`, capped at64MiB (32MiB on the qualified
shapes). The shared reservation adds one JS band and8MiB overhead. Encoded input
uses a separately admitted256KiB cache. Source/result storage, OPFS/IndexedDB
staging and resident other-codec heaps are admitted independently. Insufficient
memory/storage is an explicit failure, without reducing image dimensions.
These are controlled/accounted capacities, not a browser process-RSS claim.

## Contract for B

`loadBlob` returns the usual surface descriptor with `layout:'segmented-scanlines'`
and decode provenance `format:'png'`, `decoder:libpng-1.6.43/.../scanlines-v1`,
source depth, orientation, interlace and native alpha/ICC policy. Capabilities add
`image/png` to `sourceAccess.segmentedFormats`. Read exact RGB windows with
`readPixels({surfaceId,revision,rect})`; retrieve original bytes via `originalBlob`
or `readOriginal`. Progress has `decode` followed by `original-sha256`, with
Adam7 decode fraction spanning all seven passes. Caller file properties remain
separate from parsed metadata and the source SHA256.

The existing segmented-operation list applies: classic ELA (SEGMENTED-ELA.md), Ghost maps (SEGMENTED-GHOST.md), histogram, colour stats, planes,
extrema, defects, byte views, digest, original-byte C2PA/ExifTool and recompression
curves. Each keeps its own memory admission. In particular, a source load under
42MiB does not imply admission for perceptual hashes. `file.digest` on an admitted
surface returns all six exact native hashes; the non-JPEG `jpeg.quality` path
returns its curve without inventing JPEG quantization tables, with an optional
learned model. Full-memory-only operations still reject segmented layout.

## Qualification

Node and a real Chrome worker match all32 native PNG corpus RGB SHA256 values,
including transparency, packed depths,16-bit channels, Adam7 and orientations.
A new4000×5500 PNG (22MP) is decoded into OPFS under96MiB: full RGB SHA256 and all
six native perceptual hashes match. The peak account across loading and digest
is92,742,688 bytes; the decoder heap peaks at16MiB with32MiB maximum. A1025×769
Adam7 PNG uses OPFS under42MiB, seven passes, exact full RGB, peak42,303,584 bytes.
Worker cancellation during Adam7 closes storage before termination; reload and
final storage cleanup pass. See `png-stream-chrome-proof.json`.

Node also checks unchanged source SHA256, forbids whole-Blob encoded staging on
the22MP path, tests truncated/corrupt input, cancellation inside asynchronous input,
low-memory refusal, partial-load cleanup, and the non-JPEG100-quality curve.
All references are generated in this worktree with native OpenCV4.11; no production
warmup/calibration or synthetic probe is introduced. IndexedDB uses the existing
storage abstraction; PNG-specific large-image qualification here covers OPFS.
TIFF segmented pixels are now covered in TIFF-STREAM.md. Real extreme-size files,
APNG frame semantics remain separate work. Full-size PNG export is described in RASTER-EXPORT.md. The existing contiguous PNG loader is retained.


RGB16 Adam7 now passes the full12000×8000 original-source recipe, including all seven global passes, every native RGB8 pixel and an independently decoded full PNG after unload. Chrome256MiB/OPFS, peak43357184B,32.165s complete. See m5-formats-96mp-proof.json and M5-LARGE-SOURCE-COVERAGE.md.
