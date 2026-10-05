# Header inspection before decoding

`engine.inspectHeaders({blob, name?, mime?, lastModified?}, {signal,onProgress})`
and the same worker method return `{header,file,metrics,semantics}`. The existing
bounded JPEG/PNG/classic-TIFF/BigTIFF structural parser produces `header`, with the same
numeric EXIF directories/offsets as `metadata.structure`. The method does not decode
pixels, load a codec, register a source/surface, compute a whole-file SHA, or create
an analysis result. B can inspect metadata before choosing to load an image.

JPEG reads marker bytes and the prefix through the first scan marker; entropy-coded
image data is not read. PNG reads its33-byte signature/IHDR, eight bytes per later
chunk, and eXIf payloads only. It skips IDAT, compressed ICC and other payloads,
including chunks before late EXIF. Returned directory/entry/thumbnail offsets
still identify the original PNG, with EXIF orientation applied to dimensions.
`metrics.encodedReadMode` is `png-chunk-ranges`; `encodedReadBytes`,
`encodedReadCalls` and `maxEncodedReadBytes` describe actual encoded reads.
No skipped chunk is decompressed or copied. PNG inspection needs the4MiB metadata
allowance plus known heaps, one admitted payload and a conservative32×eXIf length
allowance for its parsed tree; unusually large EXIF can be refused explicitly.
TIFF/BigTIFF preloads directory tables and exposed scalar/array/string values by
original offset. It skips strip/tile pixels, undefined-type payloads (including
ICC), values already omitted by the structural parser, and JPEG thumbnail bytes.
`encodedReadMode` is `tiff-metadata-ranges`, with the same three read metrics.
Each retained encoded metadata range and its parser overhead is admitted at33×
its byte length before reading, in addition to4MiB and resident heaps. A large
metadata tree can therefore be refused despite a small encoded file. The final
parse uses the same accessor-based TIFF parser as contiguous images, preserving
numeric values, exact large integer strings, directory kinds and original offsets.
These are accounted bounds, not measured browser RSS.

The parser retains its format/depth restrictions, checked classic/BigTIFF fields and explicit
malformed/cyclic metadata errors. Structural inspection does not establish that pixel
data decodes, CRCs are valid, EXIF is complete or provenance is signed. Notably a TIFF
orientation may be inspectable even when the qualified pixel decoder rejects it.
The File/caller fields are supplied metadata, distinct from filesystem facts. No source
identity/hash is invented. A caller wanting analysis provenance must subsequently load
its source normally. No inspection result cache is retained.

Progress sends completion with id `header-inspection`; cancellation and budget errors
release reservations, allowing another inspection. The existing worker hard-abort
contract applies. Node verifies equal headers for JPEG, PNG eXIf and TIFF, forbids the
full JPEG read and any pixel decode, tests cancellation/malformed data/memory refusal,
and checks no retained registration. Chrome verifies4 mixed-format cases and the34-case PNG corpus under8MiB, browser
File metadata, no source registration and zero requested codec WASM assets. A
synthetic32MiB IDAT is skipped while late EXIF remains intact; Node additionally
skips32MiB IDAT plus16MiB ICC payloads and checks malformed chunk ranges, duplicate
EXIF, metadata admission and cancellation. These sparse structural fixtures are
not claimed to contain decodable pixels or valid CRCs. See
`header-inspection-chrome-proof.json`. Full ExifTool dump and native HTML header output use the separate adapter
described in EXIFTOOL.md.

Standalone BigTIFF headers now use checked 64-bit fields and exact large scalar strings; see BIGTIFF.md. TIFF/BigTIFF now use sparse metadata reads. Node verifies50 existing TIFF cases,
both byte orders, late IFDs, GPS/thumbnail links, duplicate-pointer semantics,
corrupted/wide fields, cycles, admission refusal and recovery. A virtual source
with IFD beyond2^32 verifies address arithmetic only. Chrome compares the same
50 TIFF cases and inspects a33,561,071-byte padded BigTIFF using408 encoded bytes
(maximum read348), under8MiB, with no codec WASM requests. A direct comparison
against the pre-accessor parser covers101 JPEG/PNG/TIFF headers unchanged; see
`tiff-accessor-regression-proof.json`. These tests do not qualify real multi-gigabyte
Blobs, decoded large TIFF images or progressive TIFF pixel storage.
