# Public image formats — 0.35.0-export.1

The WordPress interface uses this runtime for imports and exports, including ELA,
individual tools, automatic/composed views and the original image. Native analysis
pixels and scientific CSV/NPZ exports are unchanged. All processing remains local.

## Export contract

| Format | Settings and colour |
| --- | --- |
| AVIF | Lossy: PQ10 / BT.2020, SDR content at 203 cd/m² white, no gain map. Lossless: exact RGB8 through full-range GBR identity and AV1 quality 100, 4:4:4. Default quality 90. Source chroma when known, otherwise 4:2:2; 4:4:4 and 4:2:0 available. |
| HEIC | SDR8, exact RGB lossless (GBR identity, 4:4:4) or adjustable quality, source chroma or 4:2:2 / 4:4:4 / 4:2:0. Requires the dedicated cross-origin-isolated app page. |
| WebP | Adjustable lossy quality (4:2:0), or genuinely lossless RGB (4:4:4). Quality 100 is forced internally for lossless, avoiding ImageMagick's near-lossless quality mapping. |
| PNG | Existing lossless RGB/mask row writer, adjustable compression 0–9. |
| TIFF | RGB8 SDR, sRGB profile, lossless Deflate compression 1–9 or uncompressed (0). |

The selected image is exported at its own full resolution, including composited
views. Original-image export delegates to the original's owner, even when its tab
is closed. Numerical images may be rendered using the displayed palette/overlay;
raw scientific exports retain the numerical values. Analysis pixels are SDR8;
AVIF's PQ encoding is an export transformation, not an HDR analysis pipeline.
Exported raster files do not copy source EXIF, ICC, alpha or authenticity claims.

All five formats accept pixel dimensions, preserving aspect ratio (one rounding
pixel tolerated). Only the exported raster changes. The interface links width
and height and remembers the chosen axis. `resize.algorithm` accepts `auto`,
`lanczos3`, `area` or `nearest`. Auto uses the public proxy's SDR Lanczos3 filter
in linear light, switching to exact area coverage for reductions of at least
4× per axis. Masks/flags use nearest-neighbour to retain label values. Horizontal
rows are reused within each output band, including partial-width HEIC cells.
The old MP parameter remains API-compatible but is absent from the interface.
This does not include the private proxy's HDR/gain-map/candidate-selection code.

WebP lossless is the default. Quick export has its own independently saved
preset and uses these same codec and resize paths without an export dialog.
Both presets are included in portable workspace settings. Lossless refers to
the RGB8/mask pixels supplied to the exporter; resizing changes those pixels.

The offline TIFF experiment in `avif-sdr-pq-comparison.json` reproduces a 40.01%
size reduction on one fixture at quality 90. It also measures greater distortion.
A second photograph gives 35.53% at the same quality number; matching fidelity
requires a higher quality and can remove that size advantage. These are measured
examples, not a universal compression promise or a reconstruction of Photoshop's
undocumented export choices. The PQ variant remains the lossy choice; the new lossless choice instead preserves the supplied SDR bytes exactly.

## Memory, isolation and lifetime

PNG consumes at most 32 source rows per request. AVIF converts row bands into
retained YUV10 planes, then encodes cells up to 2048×2048 in a standard AVIF grid.
This avoids AOM's whole-image working set without reducing resolution. HEIC uses
one reusable 2048×2048 pixel cell and assembles a standard primary HEIF grid.
Coded cells are hidden items, so readers open the complete primary image. Native
HEIC bytes are unchanged; static Embind/emval adapters avoid `unsafe-eval`.

Each native codec job has its own worker; completion/error/abort retires its WASM
heap. Active workspace is reserved in the owning engine's existing budget,
including composed exports that read pixels through another worker. Closing one
document releases only its leases. Pending storage replies finish before abort
cleanup; the original failure is retained when cleanup also fails. Output chunks
are acknowledged before the next chunk is sent. Temporary output is paged in
OPFS/IndexedDB and released by its owner.

Extended decoding and WebP/TIFF encoding still use a native full-image pixel cache;
row transport does not make these codecs constant-memory decoders. Workspace
admission is explicit. Insufficient memory/storage produces an actionable error
instead of changing analysis resolution. WebP has its format dimension limit;
AVIF's pinned encoder accepts up to 268,435,456 pixels. Browser/process resource
ceilings are still real; successful 100 MP qualification is not a guarantee for
every source and every device. HEIC's pinned encoder uses two threads; AVIF uses
up to the available hardware concurrency (64 maximum), or the single-thread
variant without cross-origin isolation.

## Imports

JPEG/PNG/TIFF retain the existing paths. The additional local codec handles JP2,
J2K, AVIF, WebP, HEIC/HEIF, BMP, GIF, PSD, JPEG XL, ICO, PNM and TGA, plus RAW
coders when supported by the pinned build. RAW coverage is camera-dependent and
has not been qualified across camera models. Animation/multipage inputs select
one image. Orientation and embedded colour profiles are applied for display and
analysis; original bytes and their SHA-256 remain independently available.
JPEG/AVIF/HEIC/WebP sampling is detected from codec structures rather than guessed
from the extension. Unknown or conflicting sampling uses the explicit fallback.

## Reproduction and evidence

`vendor/media/PINNED.json` records source versions, archive hashes, licenses,
local static binding patch and every delivered binary hash. No private proxy PHP,
private binaries or gain-map algorithm is in this runtime.

- `scripts/generate-media-fixtures.py` creates real JP2 and JXL bitstreams,
  including magic-signature assertions; generated fixtures are not committed.
- `scripts/check-media-codecs-browser.mjs` checks 8 codec/chroma/thread/lossless
  cases. `BROWSER=firefox` and `BROWSER=webkit` select other installed browsers.
  `NO_ISOLATION=1` checks AVIF single-thread fallback and explicit HEIC rejection.
  The harness applies the app's script/worker CSP, excluding `unsafe-eval`.
- `scripts/check-media-integration-browser.mjs` checks 11 imports, original bytes,
  100 MP primary-grid import, leases, a composed full-resolution export, actual
  reduction, the settings dialog and GPU loupe sample positions. `--skip-large`
  repeats changed UI/import paths without repeating the large decode.
- `scripts/check-media-large-browser.mjs 10000` produces four 100 MP exports;
  individual formats can follow the dimension to limit reruns.
- `scripts/verify-media-large.py` decodes with independent native decoders and
  compares every pixel, including grid boundaries. PNG is bit exact.
- `scripts/compare-avif-sdr-pq.py` is the requested offline TIFF experiment.
  It is never invoked by the app and performs no runtime canary/calibration.

`media-browser-proof.json` and `media-100mp-proof.json` record qualification.
Chrome 154, Firefox 155 and WebKit 26.6 passed codec roundtrips. Large-image results
refer to a compressible deterministic SDR fixture, not a photo benchmark.
The user retains manual acceptance of the actual application image workflows.

## Lossless and resize verification (5 October 2026)

`lossless-exports-proof.json` records complete RGB comparisons for 25 exports in
Chrome (photographic fixture, gradient, flat graphics, noise, odd-sized grid),
plus all five formats in Firefox and WebKit. Every sample matches the input.
Native Pillow/ImageMagick decoders independently confirm all 15 noise exports;
TIFF tags confirm three 8-bit channels, Deflate and horizontal prediction.
All five formats also accept linked pixel dimensions in each browser. The
existing lossy/PQ single/multithread browser checks remain green, including a
new single-thread exact AVIF roundtrip. Node contracts exercise aspect rejection,
row reuse, partial-width output, cancellation, masks and PNG export lifetimes.

The photographic fixture produces 437,272-byte lossless WebP versus
4,337,838-byte PNG. PNG is 363 bytes smaller on unstructured noise. This is
fixture-specific evidence, not a claim that one format is always smaller. No
production-time format benchmarking or automatic re-encoding is introduced.
The previously recorded 100 MP evidence concerns the earlier encoder recipes;
new TIFF and lossless AVIF/HEIC paths were not requalified at 100 MP here.
