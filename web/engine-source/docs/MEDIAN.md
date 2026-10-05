# Median-filter detector — CPU and local saved model

The portable detector follows `core/median.py`, including its historical feature
ordering and display borders. It is a model score for median-filter traces, not
a calibrated probability that an image is forged. No training, model download,
remote fallback or ONNX conversion is included. WordPress integration is pending.

The existing local `median_b64.json` has SHA256
`5ca6bbd67d3d427c31814ac1813b143bdec94e97a33b9f3c8e311b87638ef9e1`,
27,839,242 bytes, 128 inputs, 3724 trees and 437672 nodes. It was saved in XGBoost 1.6.2
format and compared with installed XGBoost 2.0.3. Weights are **not bundled**;
their redistribution is not cleared by file presence or inference tests.
The hand-authored one-tree `toy-model.json` is exclusively an API test fixture,
never an alternative detector.

The saved JSON reader validates numeric tree topology, field dimensions, missing
directions, limits and format. It rejects categorical/multiclass/multi-output
trees, unknown versions, nonfinite weights, cycles, shared children and orphans.
Float32 inputs and sequential float32 tree sums preserve native traversal and
margins. A margin overflow fails explicitly. No pickle or executable format loads.

All four effective native feature formats are preserved:8=(1 window,1 level),
24=(3,1),96=(3,4),128=(4,4). Every stage compares its preceding image with median
filters 3/5/7/9. MSE, PSNR=-1 when equal, NCC, signed mean/max differences,
structural content, normalized absolute error and SSIM keep the trained contract.
The grayscale formula operates on the decoded analysis RGB8, not a different
JPEG grayscale decode. No Canvas participates in analysis.

`medianBlockFeatures` uses a separate OpenCV 4.11 WASM module with a hard 16MiB heap.
Whole-image padding is represented by exact64×64 blocks; a full padded gray image
is unnecessary. The raw grid includes the native extra padded blocks and zero
row/column. The renderer preserves float32 speckle, variance comparisons and the
OpenCV 11-bit linear 64 interpolation arithmetic while writing only the image crop.
Grid decisions remain separate from interpolated RGB colors.

The public native corpus contains36 blocks and five RGB images plus four crafted
grids. All 9216 model feature inputs match after float32 conversion; variance is
exact. Float64 features are within relative 1e-13 (initial128-format maximum
absolute error 7.11e-15).3252 rendered cases per browser include all 101 UI thresholds,
variance 0/5/100, score/classes, speckle, tiny images and divisible/odd dimensions.
Chrome 154, Firefox 155 and WebKit 26.6 match native RGB, masks, margins and model
scores exactly on this image corpus. The CPU-only button path also passes.
Mean-score summation differs by at most 1.39e-17 on this corpus; it is tested
separately with absolute tolerance 1e-14. These are desktop/headless engine tests, not physical Safari/mobile or WordPress.

Probability arithmetic has a separate limit: a 2084-row development probe near
tree split boundaries has exact margins but four expf-related probability
differences, maximum 3.725290298461914e-9. All 101 UI thresholds give the same decisions
there. This does not guarantee arbitrary-threshold identity on every image.
`generate-median-arithmetic.py` regenerates these vectors into excluded `.build`
from the caller's local checkpoint; `verify-median-arithmetic.mjs` writes only an
aggregate public proof. No split-boundary vectors or weights ship.

Model load reserves 891,904,320 bytes for text, parsed JSON, typed conversion and
validation, in addition to input/hash buffers and known resident heaps. Retained
forest arrays use6,579,976 bytes; the API also retains 27,839,242 original model
bytes. Allowances are conservative bookkeeping, not physical RSS. The caller's
immutable Blob is browser managed. Loads that do not fit fail before parsing.

Only bounded gray blocks and features cross feature workers. One shared forest
stays in the main engine. The pool starts at the maximum fitting useful count,
bounded by 32 current blocks and available resource hints; each worker has one
WASM thread. Timings of completed requested work can reduce future concurrency.
Recognized resource failure permits one explicit serial retry; cancellation or
numeric/validation failure does not. Workers are terminated after analysis.
View changes use cached raw grids. Source pixels and final RGB remain contiguous;
there is no arbitrary-size or segmented-source claim.

## Measured CPU pool gain

An isolated development comparison on a 10-core M1 Max with 64GiB RAM used the
same 577,069-byte synthetic 1024×1024 JPEG and local checkpoint, alternating single
and automatic CPU settings for three samples each. The code uses browser resource
hints, not the Apple brand. All four output views, masks, variances, margins and
scores match the native reference, including warm useful reruns after unloading
the image. See `median-chrome-benchmark.json` (Chrome 154).

| Median timing | Single worker | Ten feature workers |
| --- | ---: | ---: |
| Cold complete calculation RPC | 50,377.9ms | 7,857.4ms |
| Warm complete calculation RPC | 50,531.1ms | 8,224.4ms |
| Model load + image load + calculation + presentation | 51,257.7ms | 8,742.3ms |
| Model load RPC | 799.0ms | 831.5ms |
| JPEG decode/load RPC | 32.9ms | 30.2ms |
| Raster presentation | 7.1ms | 5.0ms |

The cold calculation gain is 6.41×; the full chain gain is 5.86× on this fixture.
Feature preparation/extraction is 49,843.7ms versus 7,609.3ms; prediction stage
278.3ms versus 60.8ms includes cooperative yields and scheduling, not only tree
arithmetic. Cached view RPC medians are 176.0ms and 178.1ms. RPC totals include
transport and result ownership; they are not pure kernel or GPU timings.
The shared budget accounts 269,400,639 bytes at the ten-worker dispatch, including
170,393,600 reserved for workers. The overall 981,137,236-byte high-water allowance
is dominated by JSON model loading in both variants. This is not physical RSS.
No performance calibration, warm-up or repeated candidate run occurs in the
runtime; the repeated measurements belong solely to this explicit development
benchmark. No cross-device or native Mac speedup is inferred.

Tests: `median-{model,features,pipeline,api,pool}.test.mjs`,
`median-{chrome,firefox,webkit}-proof.json`, and the native fixture generators.
To reproduce browser checks, provide the local checkpoint explicitly:

```sh
node scripts/browser-test.mjs --median --median-model=/path/to/median_b64.json
```

The development server binds loopback and exposes this file only when that
argument is supplied. The production runtime never uses that test route.
The [saved-model documentation](https://xgboost.readthedocs.io/en/stable/tutorials/saving_model.html),
[parser example](https://xgboost.readthedocs.io/en/stable/python/examples/model_parser.html),
[pinned CPU predictor](https://github.com/dmlc/xgboost/blob/v2.0.3/src/predictor/cpu_predictor.cc)
and [sigmoid definition](https://github.com/dmlc/xgboost/blob/v2.0.3/src/common/math.h)
describe format/arithmetic; native fixtures establish the actual parity claim.
