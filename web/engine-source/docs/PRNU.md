# PRNU Wiener/NCC — 0.11.0

`noise.prnu` reproduces the native historical Wiener-residual/NCC workflow.
Its score is neither a calibrated probability nor an authenticity verdict.
The full-resolution CPU path remains float64; no image resizing, precision change,
threshold adjustment, external service or learned model is used.

## Public worker API

```js
await engine.load({id:'query', bytes:queryBytes});
await engine.loadPrnuDatabase({id:'database', bytes:hdf5Bytes});
const result = await engine.run({id:'match', imageId:'query',
  operation:'noise.prnu', params:{databaseId:'database'}}, {signal});
const csv = await engine.exportResult(result, {format:'csv'});

// Explicitly construct and load a NEW snapshot. Files retain the supplied order.
// File objects can be passed directly; {name, blob} also accepts immutable Blob.
await engine.buildPrnuDatabase({id:'new-database', queryImageId:'query',
  files:[...selectedFiles], singleCamera:'Optional camera label'}, {signal});
const exported = await engine.exportPrnuDatabase('new-database');
// exported = {mime:'application/x-hdf5', bytes:Uint8Array}; caller owns the bytes.
```

Omit `singleCamera` to use native filename grouping: remove the extension and,
when the stem contains at least three underscore-separated components, remove
the final component. Non-JPEG names and groups with fewer than two selected JPEGs
are ignored. A valid group must still contain at least two readable images after
query exclusion. The original bytes are hashed before decoding; the query's hash
is excluded even if its training filename differs. Corrupt JPEGs are recorded in
`skippedImages`; an unsupported codec, memory failure or cancellation aborts.
The JPEG codec's declared limitations apply; no Canvas decode is substituted.

Files are immutable Blob/File objects and only one JPEG is decoded at a time.
The mean uses the native input order, incremental update and top-left common crop.
The builder closes a complete HDF5 snapshot before publishing its new engine ID.
An existing ID is rejected; failed builds publish no partial source. This API
creates an in-memory snapshot, not a disk overwrite or automatic folder watcher.

Database and image IDs share one namespace but retain distinct kinds. `original`
and `unload` accept either kind; `imagePixels` rejects a database. Returned bytes,
arrays, manifests and results are owned copies. Database hashes appear in
`provenance.references`. Unloading either source invalidates matching results;
image-only residuals remain reusable when changing just the database. Unloading
the query removes its residual. Worker cancellation destroys both loaded sources
and all module heaps; reload both before retrying.

## Data and decisions

`data.scores` is stably ranked by descending raw NCC, with `rank`, `camera`,
`score`, `scoreText` and `gapText`. Ties retain HDF5 key order. Text reproduces
native five-decimal ties-to-even formatting; it never feeds a decision.
`gapText` appears only for the first row when at least two cameras exist.
`threshold` is exactly 0.005, and `reachesExperimentalThreshold` uses raw `>=`.
`highestCandidate` is null below that threshold. `scoreGap` is top minus second
(zero if a second score is absent); `gapAboveHistoricalDisplayCutoff` preserves
the native strictly-greater-than-0.01 display condition. These historical cutoffs
are uncalibrated. No primary raster is returned.

`legacy`, `trainingMembershipVerified`, `residualMethod` and `noisePower` make the
reference and database state explicit. Schema `sherloq-wiener-ncc-1` requires
complete=true and nonempty finite float64 2-D fingerprints. Legacy files without
a schema remain readable but their completeness/membership stay unverified.
Missing or insufficient manifests likewise cannot verify training membership.
The flag describes checks against supplied manifests, not authentication of the
database or proof that its declared training history is truthful.
Any query hash found in any camera manifest rejects the entire identification.
Undefined NCC from an extreme fingerprint numeric range raises `NUMERIC_RANGE`;
no finite score is invented. JSON/CSV contain the raw scores and provenance.

## Arithmetic and qualification

- OpenCV native RGB-to-gray uint8, then float64 division by 255.
- SciPy 1.17.1's direct/FFT selection, Wiener 3x3, zero padding, nan/inf-to-zero
  residual policy and one-pixel border crop.
- Actual SciPy pocketfft commit and fused binary64 arithmetic, including NumPy's
  complex product. Native sin/cos seeds are frozen for all 582 2/3/5-smooth
  lengths through 2^21. The 5,916,728-byte local table loads only for PRNU and
  is SHA256-checked before use. It contains no image-dependent data.
- NumPy reduction uses 8192-element buffered chunks and its eight-lane pairwise
  order. This applies to both cropped means and NCC products.
- Guarded SIMD FMA uses the exact expansion/rounding guard documented in
  `COMPARISON-ARITHMETIC.md`, with independent multipliers in both lanes. Outside
  its proven bounds or near rounding midpoints it calls complete software FMA.
  `cpuKernel:'reference'` selects the original software-FMA path.

The public synthetic corpus contains 30 valid residuals (including 1 MP), three
invalid dimensions, 17 small NCC/threshold probes, eight large/cropped NCC cases,
two JPEG training means and 14 HDF5 cases. These cover negative scores, Unicode
tie ordering, incomplete/unknown schema, dtype/shape/nonfinite rejection, absent
manifests and query contamination. Residual float64 bits, noise power, NCC scores,
rankings, threshold outcomes and display text are checked against native code.
Node additionally checks 30,073,152 scalar and 24,097,152 SIMD FMA outcomes.
See `prnu-{chrome,firefox,webkit}-proof.json`, `prnu-native-readback.json` and
`tests/prnu.test.mjs`. Native source is an unchanged oracle, not shipped Python.

## Memory and performance

The shared aggressive/maximum resource profile applies. Let N be the original
pixel count, R the border-cropped pixel count and W/H the next 2/3/5-smooth FFT
lengths for width+2/height+2. Admission is conservatively
`ceil(1.25*(48*N + 64*W*H + 128*(W+H))) + 48*R + 128 MiB`, plus the engine's
32 MiB runtime reserve, retained sources and caches. This accounts for native
correlation/FFT buffers, line plans, allocation growth and JavaScript NCC arrays.
A calculation must fit the 1900 MiB working cap of the 2 GiB OpenCV module;
FFT lengths above 2^21 are explicitly unavailable. HDF5 checks dataset shape/type
and admits decoded size before reading values; temporary files and reservations
are removed on failure. Heap capacities are distinct from accounted allocations.

An additional 4096x2048 synthetic recipe checks the entire residual against a
native float64 SHA256 in Node and exact ranked scores through a Chrome worker.
The Chrome probe uses an explicit 3 GiB global budget; its accounted peak is
1,938,232,199 bytes and codec/OpenCV heap capacity 838,336,512 bytes. It does not
claim an 8 MP capability on every default browser/device budget. See
`prnu-memory-chrome-proof.json`; no downscaling is performed.

Sequential Chrome measurement on a 1024x1024 synthetic query against two smaller
native fingerprint crops: median RPC 1038.8 ms original / 405.5 ms SIMD (2.56x),
first SIMD call 539.1 ms, full load/RPC/table-presentation median 409 ms. Loading
the HDF5 database takes 122.3 ms separately; result-cache calls take 0.3–0.4 ms.
The initial conservative-admission benchmark accounted for 719,498,161 bytes
(the later geometry-based admission is smaller); observed codec/OpenCV heap
capacity 120,586,240 bytes and HDF5 heap 19,333,120 bytes. This is one worker;
no GPU, extra-worker, WordPress or physical-device speedup is claimed.
`prnu-kernel-benchmark.json` isolates extraction: 1077.2 ms original / 405.3 ms
guarded SIMD, seeds already loaded, every output bit checked outside timing.

## Reproduce

```sh
# Native oracle generators require the declared native Python environment.
python scripts/generate-prnu-reference.py
# Native seed regeneration requires the Darwin arm64 reference; portable builds
# use the checked-in seeds and their hash, never host sin/cos substitutions.
python scripts/generate-prnu-twiddles.py
EMSDK=/path/to/emsdk-4.0.15 bash scripts/link-opencv.sh
node --test tests/prnu.test.mjs
node scripts/check-prnu-hdf5.mjs
python scripts/check-prnu-native-export.py
node scripts/browser-test.mjs --prnu --browser=chrome
node scripts/browser-test.mjs --prnu --browser=firefox
node scripts/browser-test.mjs --prnu --browser=webkit
# Run benchmarks sequentially without other heavy local workloads.
node scripts/browser-test.mjs --prnu-kernel-benchmark
node scripts/browser-test.mjs --prnu-benchmark
```

Keep NIST/HDF5 and pocketfft notices from `NOTICE.md` and both vendor folders.
The original ESM HDF5 distribution is pinned; adapters live in `src/prnu-hdf5.js`.
