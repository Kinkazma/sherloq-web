# SHERLOQ browser engine contract — 0.2.0

Owner: C. Portable ES modules, no WordPress, network service or platform-brand test.
Status: validated CPU ELA slice with aggressive resource profiles; other operations remain unavailable.

## Entry point (stable for B)

`import { createEngine, DEFAULT_ELA_PARAMS } from './src/index.js'`.
`const engine = createEngine({memoryBudgetBytes: 256 * 1024 ** 2})`.
`await engine.load({id, bytes, mime, pixels?, provenance?}, {signal})` returns an
image descriptor. `bytes` is the untouched original `Uint8Array`; never use a
Canvas JPEG as the original. Engine copies input and retains bytes until unload.
`pixels`, when supplied, is `{width,height,data:Uint8Array,format:'rgb8'}`,
top-left origin, contiguous rows, RGB, no alpha, no implicit orientation/ICC or
resizing. Provenance must state decoder, orientation, ICC, depth and alpha policy.
Unknown provenance remains explicitly unverified, never promoted to native parity.
Only formats enumerated by `engine.capabilities()` are available.

`await engine.run({id, imageId, operation:'ela.classic', params, backend:'cpu',
regions:[]}, {signal,onProgress})` resolves result; failures throw EngineError
with `code`. Result: `{id,imageId,operation,status:'ok',pixels,provenance,metrics}`.
Pixels have the same RGB descriptor. Consumers own returned buffers and may
transfer them. Engine caches remain private. `engine.original(imageId)` returns
a defensive copy of original bytes. `engine.unload(imageId)` clears its caches;
`engine.dispose()` clears all. Job ids identify UI revisions; B discards stale
completions. AbortSignal cancellation rejects with `CANCELLED`; progress uses
`{id,phase,fraction}`. Latest-wins scheduling belongs to B's UI; one engine job
at a time initially, `BUSY` otherwise. Worker wrapper follows the same lifecycle.

Default classic parameters: quality 75 (1–100), scale 50 (1–100), contrast 20
(0–100), linear false, grayscale false. These are classic native controls.
Separate energy analysis profile is **Conservateur**: percentile 1/99, deviations
5/5, adaptive false. Energy, biomes and Ghosts are unavailable until ported;
classic ELA must not masquerade as those panels or a detection mask.

## Scientific boundaries

Regions use source pixel coordinates; rectangles are half-open `[x0,y0,x1,y1)`;
polygons require a named rasterization rule. This slice accepts only no regions
(full frame); other requests fail `UNSUPPORTED_REGION`, never silently ignored.
Future masks include semantic label, value range, threshold, interpolation,
source coordinate transform and decision metrics. No automatic resampling.

Kernel and codec parity are independent. Results must expose both. JPEG codec
identity/options and original SHA256 enter provenance; source RGB/recompressed
RGB hashes are reference evidence. Canvas is for display/export of a derived
visualization only. No TIFF/high-depth/ICC/alpha support may be claimed merely
because the browser paints the file. Unsupported input fails explicitly.

CPU bit equality preferred. GPU maximum absolute error ≤1e-4 in declared units
and mask/decision agreement must be measured; a similar-looking rendering is
insufficient. GPU request must never silently fall back; auto backend records
chosen backend/reason. CPU remains selectable. No hidden FP16 or size changes.

## Budget, export and error surface

One global memory budget includes retained source, cache, active scratch and
worker reservations. Caches are bounded LRU. Job admission rejects `MEMORY_LIMIT`
before known large allocations. Browser/codec runtime overhead must be reported
separately; no claim that JS can measure total device RAM. Intensive means the
largest admitted concurrency within budget, adapting from useful work, not cores × internal pools.
No model preloading. Warm cache should avoid recompression on display changes.

Errors: INVALID_INPUT, UNSUPPORTED_FORMAT, UNSUPPORTED_OPERATION,
UNSUPPORTED_REGION, UNSUPPORTED_BACKEND, CODEC_UNAVAILABLE, MEMORY_LIMIT,
CANCELLED, BUSY, NOT_FOUND, DISPOSED. Public messages contain no local file paths.
Timings in milliseconds: preparation, codec, kernel, transfer, display and total
where actually measurable; absent fields are unmeasured, never zero guesses.
B owns display and download dialogs. Export RGB as a derived PNG plus JSON
provenance/parameters; keep original byte download separate. Do not put original
filenames or EXIF into public test reports.

Changes to these names require a contract version and coordination with B.

## 0.1.0 implementation notes (C → B, CPU slice ready)

- `engine.imagePixels(imageId)` returns an owned RGB8 copy of the exact analysis
  input. Use this for the original layer. It does not decode via Canvas again.
- `src/worker-client.js` exports `createWorkerEngine(options)` with asynchronous
  counterparts to these methods. It keeps one persistent module worker, uses
  transferables for results, and hard-terminates on AbortSignal (including WASM).
  Cancellation clears loaded images and caches: error `imagesCleared:true`;
  reload original bytes before retrying. B may retain its equivalent transport.
- Default codec is controlled libjpeg-turbo 3.0.3, JDCT_ISLOW, 4:2:0, baseline,
  quality 1–100. Eight synthetic JPEG decode cases and 57 recompressions are
  bit-exact with native OpenCV; 40 ELA render expectations also pass. This is
  bounded evidence, not validation of all JPEG files or hardware.
- First slice rejects APP1/APP2 (EXIF/XMP/ICC), CMYK, TIFF, alpha and high depth.
  Source bytes remain intact. Progressive/grayscale and odd/tiny dimensions have
  explicit fixtures. No orientation, ICC, alpha or depth conversion is hidden.
- Budget is for one engine/session. Use **one shared engine instance per page**;
  independent instances cannot coordinate budgets yet. It reserves 32 MiB runtime
  overhead plus conservative pixel scratch before allocating. WASM heap capacity,
  browser GC, copies owned by B and actual process RSS are not totalled as device
  RAM; these limitations must remain visible in measurement reports.
- Energy deviations are dimensionless log residual-energy scores (LOG_SCALE .2,
  ENERGY_FLOOR .25), separately low/high; they are not pixel gray thresholds.
  Conservateur uses percentile bounds 1/99 and score thresholds 5/5. Adaptive
  Sensible/Agressif and saved profiles remain unavailable operations.
- Runtime file list: `runtime-manifest.json`, SHA256 for every file. Load assets
  locally with JavaScript/WASM MIME types; no CDN. A/B must exclude `.build/`,
  `node_modules/`, and all private coordination files.
- Chrome 154 headless using the installed Chrome binary: native parity, cache,
  gain change without recompression, worker termination and reload passed;
  `docs/browser-proof.json`. Real WordPress recipe remains B's responsibility.


## 0.2.0 — aggressive calculation profiles

Default: `createEngine({computeProfile:'aggressive'})`; optional
`computeProfile:'maximum'`. Resource-only policies; analysis profiles and default
parameters stay identical. Remove obsolete fixed 256 MiB limits in adapters.
`resolveComputeProfile()` can run in the UI and pass `resourceHints` to a worker:
`{deviceMemoryGiB,heapLimitBytes,hardwareConcurrency}`. UI-side heap hints are
not always exposed inside workers. Explicit `memoryBudgetBytes` still overrides.

Aggressive budgets up to 65% of reported RAM and 75% of reported JS heap limit;
Maximum uses 80%/85%. The minimum applicable limit is used, with a 4 GiB accounting
ceiling. Unknown hints use 1/2 GiB respectively. These are browser hints, not
measurements of free system memory; allocations remain lazy. Codec-specific
working-set checks remain separate from the global cache budget. Results report
observed WASM heap capacity where available, not total process RSS.

For at least 1 MP, CPU LUT jobs immediately dispatch useful image chunks to the
maximum admitted number of workers (CPU hint, shared memory budget, available
pixels/API). There is no baseline, warm-up, canary or calibration pass. Only
useful batch timings, allocation/worker failures and exposed heap pressure may
reduce concurrency; failed chunks retry, completed chunks are retained. State
lives only in the current engine instance, never cookies/localStorage/IndexedDB.
The first result reports `calibrationMs:0`, `calibration:null` and `scheduling`
counts; without errors, processed pixels equal input pixels exactly once.
The unchanged LUT construction and JPEG recompression are required computation.
`cpuKernel:'single'` and `cpuKernel:'reference'` remain available for development
comparison. GPU promotion remains a development qualification, not a user gate.
This embedded snapshot carries B scheduling patch `0.2.0-b1`; upstream C and
historical immutable release archives have not been overwritten.

GPU remains unavailable in the public `run` operation because the measured ELA
lookup GPU path loses to CPU lookup after transfers. High-performance WebGPU is
exercised in the reproducible experiment; no hardware-brand conditional. A future
GPU promotion needs per-capability end-to-end measurements and exactness evidence.
