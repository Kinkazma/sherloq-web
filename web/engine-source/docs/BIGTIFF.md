# Bounded BigTIFF container support — M5

Standalone classic TIFF and BigTIFF share `imageHeader`, `inspectHeaders`, `load`
and `loadBlob`. BigTIFF adds `header.bigTiff=true` and decoded provenance
`container:'BigTIFF'`; the format/MIME remain tiff/image/tiff. No separate UI or
operation ID is required. The source is never resized or converted to classic TIFF.

The parser implements the official [BigTIFF layout](https://libtiff.gitlab.io/libtiff/specification/bigtiff.html):
version 43, offset size 8, reserved field 0, uint64 first/next IFD offsets, uint64 entry
counts, 20-byte entries, 8-byte inline values, LONG8/SLONG8/IFD8 types. Byte order is
respected. Offset/count conversions must be exact safe JavaScript integers;
unsafe values, truncated spans, invalid reserved fields, excessive counts and
cycles fail before traversal/allocation. Existing limits remain 32 directories,
4096 entries per directory and 65536 materialized scalar values.

Unknown scalar integer metadata outside JavaScript's safe integer range is
preserved as `{integer64:'decimal string'}`. It is never silently rounded or used
as a byte offset. Ordinary safe scalars remain numbers. Large scalar values can
therefore be displayed and JSON-exported losslessly by B. This representation
belongs to structural headers; the full ExifTool report has its own contract.

JPEG/PNG EXIF blocks retain classic TIFF rules. BigTIFF is enabled only for the
standalone TIFF branch, avoiding an unsupported EXIF dialect silently changing
orientation. TIFF decoding uses existing OpenCV for strips and the mapped worker
for tiles, with unchanged admission and pixel algorithms. Metadata-only inspection reads directory/value ranges under the shared budget.

Six authored cases match native full-resolution RGB hashes in Node and Chrome,
and six original-file grayscale hashes in Node: both byte orders, uint64 fields,
RGB8/gray16, tiled RGB8/RGB16, compressed palette and multipage first-frame loading.
The custom scalar corpus checks values above 2^53 and signed values beyond 2^60.
Tests explicitly corrupt offset size, reserved field, first IFD pointer, directory
count and tag-value count, and truncate the header. Shared classic TIFF/PNG EXIF
regressions remain passing. Native Pillow metadata can be narrower than its pixel
loader; comparisons use the native decoded pixel arrays, while actual TIFF fields
determine source depth and layout.

This qualifies the BigTIFF **container**, not multi-gigabyte images. The contiguous decoder retains its full staging and memory limits; loadBlob now
has a bounded segmented strip/tile fallback (TIFF-STREAM.md). Real multi-gigabyte
sources, additional sample/photometric modes and
transposed native orientations remain unqualified. See TIFF-FORMATS.md for these
limits and memory/cancellation behavior.

Reproduction: scripts/generate-bigtiff-reference.py writes only tests/data/bigtiff.
Tests: tests/bigtiff.test.mjs and tests/bigtiff-browser.js.
Browser proof: docs/bigtiff-chrome-proof.json.

Header-only inspection now reads IFD/value ranges without whole-file staging;
see HEADER-INSPECTION.md for read metrics and metadata admission. Pixel loading can use the segmented strip/tile decoder when the existing
contiguous path is not admitted.
