# ELA classic on full-resolution segmented sources

`ela.classic` now accepts loaded segmented JPEG, PNG and TIFF/BigTIFF sources.
Quality1–100, scale1–100, contrast0–100, linear/nonlinear and grayscale controls
keep the native meaning. One global baseline4:2:0 JPEG is encoded at the requested
quality using libjpeg-turbo3.0.3, ISLOW, native defaults. Source row-band boundaries
do not restart the codec or create independent JPEG blocks.

The encoder writes its encoded bytes through awaited callbacks into bounded
segmented storage. The decoder reads that same complete JPEG through bounded
callbacks and yields RGB rows. Exact original windows are compared with those
rows using the existing fully qualified65536-entry tone lookup. The nonlinear
path retains separate float32 operand normalization, absolute difference, square
root and scale rounding; the linear path retains absolute byte differences.
Grayscale is applied after the tone lookup with native RGB2GRAY coefficients.
No downsampling, per-strip JPEG approximation or output normalization is added.

## B contract and cache

Call the existing `run({id,imageId,operation:'ela.classic',params},hooks)`.
Segmented results return `layout:'surface'`, a full-resolution RGB surface and
an RGB layer referring to that surface ID. They do not contain a complete pixels
array. Read windows with readPixels, export with exportSurface (RASTER-EXPORT.md),
and release with releaseSurface. Live outputs survive subsequent ELA calls until
released or their source is unloaded. Each call publishes independently owned
output; result cache is reported false.

Two completed encoded qualities per source are retained in an LRU cache. Changing
scale, contrast, linear or grayscale controls reuses the same encoded JPEG.
It decodes/render rows again without encoding again; metrics expose
cache.recompressed, recompressions0/1, sourcePasses1/2, encoded byte length and
capacity, encodedStorage, cacheEntries and codec/source-window capacities.
Tone tables use the existing bounded cache. Completed useful cache entries can
survive direct-engine render cancellation; no partial JPEG or result is cached.
Source unload/engine disposal also remove cached encoded storage. The two-entry
limit is explicit; this is not a promise to retain every visited quality.

Progress phases are jpeg-encode (on cache miss), jpeg-render and complete.
Fractions are phase-local. Worker cancellation closes storage before termination
and clears images; direct-engine cancellation keeps the source and completed
quality cache for retry. Raster surfaces preserve original oriented coordinates;
no additional EXIF flip is required by B. Existing arbitrary-ROI/WebGPU requests
remain unsupported. This residual visualization is not an authenticity verdict.

## Memory and storage

The encoder/decoder module is isolated from the existing shared full-memory JPEG
module. WASM starts at16MiB; its imported maximum rounds
`8MiB +48*(3*width)` upward to16MiB, under a64MiB module ceiling. Both dimensions
are explicitly bounded to1–65500. The shared reservation adds8MiB overhead and a
256KiB encoded write buffer. Source/result bands, tone-table preparation, resident
other-codec heaps and temporary I/O staging are admitted separately.

Encoded capacity follows libjpeg-turbo's conservative TJBUFSIZE bound:
`6*ceil(width/16)*16*ceil(height/16)*16 +2048`. Pixels/results and encoded JPEGs
use RAM segments when admitted, otherwise the source's owned temporary session.
Encoded cache retains its conservative capacity, rather than claiming only its
compressed length in the memory account. Storage quota failures are explicit;
no source resolution, quality or algorithm parameter changes to fit memory.
These are shared accounted capacities, not process-RSS or immediate-GC claims.
The current implementation runs one useful native JPEG stream at a time, with
bounded cooperative row/I/O checkpoints and no calibration or synthetic probe.

## Evidence and limits

The new external-byte RGB codec matches all56 recompressed RGB hashes in the
seven-file native OpenCV4.11 corpus, covering qualities1/25/50/75/95/96/99/100,
small/odd dimensions and varied source encodings. ELA tests compare18 native
results from odd JPEG, EXIF-oriented JPEG and a531×517 PNG across controls, plus
two native4103×5401 TIFF-derived results. The existing40 tone-reference outputs
still pass. Cache hits/eviction, source-read/memory failure, cancellation/retry,
owned result windows and unload cleanup are tested.

In a real Chrome worker under64MiB, the22MP TIFF input, cached JPEG and result
surface use OPFS. Both complete ELA RGB SHA256 values match native ElaEngine.
The shared loading/analysis peak is43,780,736 accounted bytes. The native heap is
16MiB maximum; largest source window393,888 bytes. Encoded JPEG length4,709,345;
reserved disk capacity133,428,224. Changing render controls at the same quality
performs zero new recompressions and one source pass. Worker cancellation,
reload/native hash and final storage cleanup pass. See segmented-ela-chrome-proof.json.

Large-image qualification here covers OPFS, not a new ELA-specific IndexedDB
qualification or every extreme-size source. Ghost maps now use the same RGB adapter (SEGMENTED-GHOST.md). ELA energy/biomes
and ZERO still need their separate segmented adapters; this change does not mark
those algorithms complete. Existing contiguous ELA paths remain in place.
Reproduce with scripts/build-jpeg-rgb-stream.py, generate-segmented-ela-reference.py,
tests/jpeg-rgb-stream.test.mjs, tests/segmented-ela*.mjs and the --segmented-ela
browser runner. Libraries, sources, binaries and notices are pinned locally.

Completed encoded RAM entries can be reclaimed by the shared budget when idle;
the current decoder pins its JPEG until completion. This permits larger scientific
stages to start without retaining unused conservative-capacity RGB JPEG buffers.

The shared RGB adapter additionally supports explicit4:4:4 for ZERO JPEG99.
Sampling is part of its encoded cache identity; ELA and Ghost retain4:2:0.
