# JPEG quality evidence and optional local regression

The CPU operation `jpeg.quality` preserves the native separation of three pieces
of evidence. The normalized gray recompression curve covers qualities1–100.
Its minimum examines the first95 entries, remapping95 to100. Original JPEG
quantization tables supply the separate table estimate. Only a non-JPEG signature
can use the learned estimate of a previous JPEG quality, when the user explicitly
loads a local model. None is an authenticity probability or detection mask.

The existing native `jpeg_qf.mdl` is278168 bytes, SHA256
`4b3a90e3b22ec4436b4a4e2bee7abd5055e7c541d2d3ae9b541dc890656424d4`.
The offline converter checks this exact identity before native deserialization,
requires XGBoost2.0.3 and exports JSON without training. The result is426637 bytes,
SHA256 `bc0c961a9ac7bf0fbabb0316eb5cb34665d7987b678fb8b64b487f10908f04f2`.
Neither original nor converted checkpoint is bundled; redistribution is not
cleared by successful reuse. The browser only parses JSON numeric trees.

The qualified layout has100 features,140 scalar trees,6948 nodes,
`reg:squarederror`, base score0.5, and one output. Feature conversion, comparisons,
missing directions and each tree addition follow the native float32 predictor.
The base score is added **before** the first tree. No sigmoid or clipping applies.
The reader rejects categorical, vector-leaf, multi-output and unsupported layouts,
invalid graphs and nonfinite scores. Its general saved-file caps are64MiB,
10000 trees, one million nodes and depth64; these are admission limits, not
quantization or model simplification. The existing forest retains104780 bytes;
JSON parsing reserves14700960 bytes in addition to original bytes/resident heaps.

Native cv.normalize binary64 arithmetic contains fused multiply/add rounding.
Pure JavaScript multiply then add changed five of600 reference values, although
those six model scores stayed equal. A fixed128KiB WASM/musl fma module now keeps
all declared values exact, including tiny signed values at the curve minimum.
It does not force values into0–1 before the model cast.

Public synthetic fixtures include six source JPEGs and eleven non-JPEG inputs:
re-encoded source pixels, flat color, seeded random RGB,16-bit gray PNG,16-bit RGB
TIFF and a1024×1024 PNG. Across Chrome154, Firefox155 and WebKit26.6, all native
decoded RGB identities,1100 raw means,1100 normalized binary64 values, minima,
eleven float32 predictions and native one-decimal labels match. Another600 JPEG
curve values and quantization-table estimates match. These tests cover cache
ownership, model provenance in JSON, CSV, table priority, absent models,
cancellation during useful recompressions, explicit reload and complete cleanup.
The1MP case uses useful codec workers without preflight tasks. Headless WebKit
does not establish physical Safari/mobile qualification; WordPress wiring is B's
separate work. Decoder modes outside the existing qualified subset stay blocked.

A separate523-row native arithmetic experiment covers six image curves, five
constant/monotonic inputs and512 seeded inputs at/around real root splits and
missing values. Scores and one-decimal labels all match. Split-derived vectors
stay in excluded `.build`; only aggregate evidence is shipped. Exact agreement
on this corpus does not establish scientific estimation accuracy on all images.

The CPU implementation is selected. WebGPU and ONNX are not qualified for this
operation; no acceleration is asserted for them. CPU preserves the existing
JPEG codec semantics and avoids a new tensor/model conversion for140 trees.
The full-memory source/curve path remains bounded and refuses unsupported
segmented layouts instead of shrinking images. Shared cross-engine/page resource
coordination and additional physical machines remain unfinished.

Reproduce from the engine directory with the pinned native Python environment:

```sh
python scripts/export-quality-model.py
python scripts/generate-quality-model-reference.py
python scripts/generate-quality-arithmetic.py
node scripts/verify-quality-arithmetic.mjs
node --test tests/quality*.test.mjs
node scripts/browser-test.mjs --quality-model-test --quality-model=.build/quality-model/quality.json
node scripts/browser-test.mjs --quality-model-benchmark --quality-model=.build/quality-model/quality.json
```

Repeat the functional recipe with `--browser=firefox` and `--browser=webkit`.
The conversion refuses to overwrite its output. Native wrapper compatibility
warnings are recorded privately; actual prediction parity above is required,
not inferred from the absence of a loader error. The explicitly requested model
route belongs only to the loopback development test harness, not the runtime.

## Isolated browser measurements

Chrome154 on the development10-core/64GiB machine, three alternating runs on
one synthetic1MP PNG, maximum profile with a1GiB engine budget:

| Phase (median milliseconds) | Single | Ten useful workers |
| --- | ---: | ---: |
| Cold complete calculation RPC |1190.3|263.5|
| Warm useful calculation (new image task) |1171.4|263.0|
| Model + image + calculation + example display |1274.5|346.9|
| Initial model RPC |38.9|40.9|
| PNG decode/load RPC |40.9|46.9|
| Example curve/label display |0.3|0.2|
| RPC minus engine time (transport/scheduling envelope) |0.6|0.6|
| Model reload alone |4.1|4.5|
| Calculation reusing curve after model reload |0.3|0.3|

The calculation gain is4.52×; the measured complete-chain gain is3.67×.
Accounted peak is81451190/504825208 bytes, not physical process RAM. All samples
retain exact native curves/minima/scores. Cold means a new worker/module instance,
not a flushed browser/OS cache. Phase clocks include cooperative scheduling;
transport is not isolated from event-loop delay. Display is the harness chart,
not WordPress paint or compositor latency. No GPU or native Mac gain is inferred.
