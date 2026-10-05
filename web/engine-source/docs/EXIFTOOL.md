# ExifTool 13.55 in the browser — M5 contract

`engine.inspectMetadata({blob, mode='dump', name?, mime?, lastModified?}, hooks)`
works before pixel decoding and source registration, including files the pixel
codec refuses. `createWorkerEngine` exposes the same method. A loaded contiguous
or segmented image also supports `run({id,imageId,operation:'metadata.exiftool',
params:{mode}})`. Both inspect the original bytes; they never edit the original.
The inexpensive structural `inspectHeaders` remains available separately.

## Modes and results

- `dump`: actual native `-G -n -j`. `data.metadata` contains the complete grouped,
  numeric JSON object returned for the input, except virtual file identity/stat
  fields moved to `data.virtualFile`. `data.rows` preserves native filtering,
  tag order, groups and repeated-group headings, with **typed** `value` fields.
  It does not apply Python `str()` formatting to lists, booleans or floats; B can
  present/search these typed values. No tag whitelist substitutes for ExifTool.
- `location`: actual native `-G -n -j -Composite:GPSLatitude
  -Composite:GPSLongitude`, then the native presence/number/range policy.
  `data.coordinates` is `{latitude,longitude}` or null; zero is retained. Invalid
  present coordinates fail explicitly. `data.mapUrl` is the historical URL,
  never requested by the engine. XMP-only direct GPS tags do **not** automatically
  become composite coordinates: the reference native panel also returns none.
- `headers`: actual native `-htmldump0`. `data.html` preserves its native hierarchy,
  offsets, navigation and inline scripts; `data.untrustedHtml=true`. Export as
  text/html, or render only in an isolated sandbox without same-origin access,
  external navigation or network access. The engine does not render it. Its path
  identifies `/input/source`, never an inferred original disk path.
- `thumbnail`: actual native `-b -ThumbnailImage`. `data.bytes` is a Uint8Array of
  exact original embedded bytes; `data.available=false` if there are none. This
  mode does not resize/decode the thumbnail or compute a pixel difference. The
  existing `metadata.thumbnail` operation preserves its contiguous result contract
  and now connects this exact extraction to segmented full-resolution comparison
  and RGB/PNG outputs; see THUMBNAIL-API.md. Native rejection of non-JPEG payloads
  in an EXIF JPEG-thumbnail slot is preserved.

All results contain `warnings`, `metrics`, and `semantics`. Standalone inspection
also returns caller `file` and `mode`; it computes no fictitious SHA256. Loaded
operation provenance contains original SHA256 and caller file metadata. Its JSON
export uses the normal engine `exportResult`. Standalone results can be saved
with normal JSON serialization; use `data.bytes` directly for binary thumbnails.

`SourceFile`, filename, directory, timestamps and permissions from the virtual
filesystem are isolated in `virtualFile`, explicitly labelled as runtime
placeholders. Actual extracted file size/type/MIME and ExifTool version remain in
`metadata`; caller-provided file information is separate. Do not use virtual
fields as forensic evidence about the user's filesystem.

## Execution, accounting and cancellation

Each request runs an isolated disposable worker with Perl/ExifTool, no network or
host filesystem imports, no caller-supplied command/config/Perl code, and fixed
arguments with `-config ''`. Only local pinned assets are fetched before execution.
The input is immutable Blob storage, served to WASI by requested byte ranges.
Stdout is binary end to end (including split UTF-8); stderr is decoded at the end.

Admission reserves 128 MiB for the enforced WASM ceiling, 160 MiB for assets,
module compilation and staging, 256 MiB for output/report parsing, objects and
transport, plus twice min(input bytes,128 MiB) for source read staging. Uint8Array
sources additionally reserve a full immutable Blob copy. Existing engine heaps
are charged separately. This is conservative accounting, not process RSS or an
asserted browser Blob-backing measurement. Peak observed interpreter heap in the
seven-file corpus is about 43.2 MB; the reservation is intentionally larger.

Stdout is capped at 8 MiB, stderr at 64 KiB, and elapsed runtime at 60 seconds.
Oversized reports/interpreter allocation failures fail rather than return partial
metadata or downgrade extraction. No cache, synthetic runtime benchmark or
calibration. Progress reports start, interpreter-ready and completion phases,
not a fabricated percentage of ExifTool's internal traversal. One interpreter
worker per request avoids unbudgeted concurrent module copies.

Direct cancellation terminates the worker and preserves loaded sources. Worker
client hard cancellation retains its existing images-cleared/reload contract.
Success, error and cancellation release reservations. Returned report memory is
caller-owned after completion, like other engine results.

## Dependencies and proof

`vendor/exiftool` contains ZeroPerl-TS 1.0.10 (Apache-2.0 wrapper), its embedded
Perl 5.42 runtime / ZeroPerl (MIT), and the complete official ExifTool 13.55 library
pack (Perl Artistic terms). Included upstream third-party notices cover Perl,
ExifTool, zlib, bzip2, musl and LLVM. `scripts/vendor-exiftool.py` pins archive
hashes/integrity and reproduces the assets without npm install or host execution
of downloaded programs. All 224 official ExifTool .pm modules compare byte-for-byte
with the native installation. The interpreter also contains upstream bundled
13.42 modules; the mounted complete 13.55 `/lib` takes priority.

Changes to the wrapper are limited to explicit asset fetch in module workers and
upstream binary stdout mode. WASM's memory-section maximum is 128 MiB; other
sections are unchanged. Native CLI signal handlers are omitted in WASI because
cancellation terminates its worker. No metadata extraction code is modified.
Runtime assets total roughly 45 MB uncompressed, loaded only when requested.

`tests/exiftool.test.mjs` and `exiftool-browser.js` compare seven authored cases:
JPEG EXIF/IPTC/XMP/Unicode/list values, PNG eXIf after IDAT, compressed PNG zTXt,
oriented TIFF, no thumbnail, XMP-only GPS absence, and zero coordinates. Every
numeric metadata object and explicit location result matches native 13.55;
HTML hashes match after virtual-path normalization; binary thumbnail hashes match.
Browser tests cover predecode inspection, the loaded operation, export, cancellation,
recovery, refused budgets, refusal/recovery for a 9 MiB metadata value exceeding
the output cap, no external network and a 32 MiB Blob with 8 KiB reads.
See `docs/exiftool-chrome-proof.json` for measured results.

Full extraction is bounded by this runtime. The virtual input uses a generic filename, so extension-dependent format detection,
RAW/HEIF/video/vendor MakerNotes,
optional Perl extension modules, malformed-input breadth, sources over 2 GiB and
large HTML reports are not comprehensively qualified. There is no claim that all
ExifTool formats or optional native modules now have blanket parity. B still owns
panel rendering/search/export integration; native HTML does not yet have a separate
structured JavaScript tree API.
