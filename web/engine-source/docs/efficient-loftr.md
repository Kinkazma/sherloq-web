# EfficientLoFTR: implementation and qualification

The browser module runs the authors' **full FP32 EfficientLoFTR outdoor model**. It compares two explicit image regions and publishes sparse correspondences using SHERLOQ's existing biome grouping, OpenCV geometric verification and BGR palette. Matching confidence is evidence of correspondence, **not a calibrated probability of forgery**.

Sources: [EfficientLoFTR](https://github.com/zju3dv/EfficientLoFTR/tree/ffd4a4644064354468eb1f0c7a3e732233cb732f), [CVPR 2024 paper](https://arxiv.org/abs/2403.04765). Code is pinned to `ffd4a4644064354468eb1f0c7a3e732233cb732f`, under its [Apache-2.0 license](https://github.com/zju3dv/EfficientLoFTR/blob/ffd4a4644064354468eb1f0c7a3e732233cb732f/LICENSE), reproduced alongside this document. The upstream September 2026 HEAD changed to a Project Registration License; this implementation uses the preceding Apache-licensed revision, not that HEAD. The original `eloftr_outdoor.ckpt` comes from the authors' Drive link in the pinned README; its SHA-256 is `0af6291141c736e75e94b7f8aae4399b77c7731b3f08758212b2cfe370188878`.

The standard ONNX file remains reusable outside SHERLOQ: `efficient-loftr-full-fp32.onnx`, 61,657,027 bytes, SHA-256 `b52b3838bb961767a7f8b8789b8f03af355aa41a2195e501418606304e6dcb42`. It accepts grayscale FP32 `image0`/`image1` shaped `[1,1,H,W]` and a scalar FP32 `threshold`, and returns FP32 `keypoints0`, `keypoints1`, `confidence`. Both image dimensions are dynamic multiples of 32; the match count is dynamic, including zero.

## Exact portable changes

- RepVGG is reparameterized using the authors' required function. No weights are trained, replaced or quantized.
- Architectural stride 8 and dynamic tensor match counts replace trace-time Python decisions. Boolean reduction is expressed through its exact 0/1 uint8 representation, and three-dimensional Einsum uses standard Transpose/MatMul.
- An ONNX If reproduces the native empty-match branch; empty arrays never enter an ambiguous `[0,-1]` reshape.
- Rotary coefficients are stored per axis and expanded only for the actual image shape. Every stored coefficient and its four-lane ordering are checked bit for bit against the original 256×256 tables. This reduces the graph from 128.37 MB to 61.66 MB without changing rotation embeddings.
- The fine FPN gathers the **selected** 8×8 and 10×10 windows instead of materializing an unfold of every image position. Arbitrary window values and all padded boundaries are checked bit for bit against native `F.unfold`.
- The local regression computes the **nine** eight-term dot products actually consumed for each match instead of an entire `[M,64,100]` tensor. The primary fine double-softmax and argmax remain unchanged. Negative target coordinates wrap separately on each axis, exactly as PyTorch's advanced indexing does.
- Initializer Identity aliases are resolved in nested If/Loop captures. This prevents ORT's implicit-input rename warnings and duplicated initializer references.

- The native two-cell border is expressed with Slice/Pad. Equivalent boolean broadcast shapes passed CPU but produced incorrect WebGPU selection on the tested ORT 1.30 runtime; Slice/Pad is qualified on both providers. The eight full-size ScatterND updates are unnecessary.
- Nonterminal-axis Softmax is expressed as transpose, flatten, last-axis Softmax and restore. This preserves its normalization and removes ORT's two hidden dense scratch tensors ([CPU kernel source](https://github.com/microsoft/onnxruntime/blob/v1.23.2/onnxruntime/core/providers/cpu/math/softmax.cc)).
- An ONNX Loop refines independent rows in blocks of 512 after a single FPN preparation. No correspondence is discarded; row order and original argmax are preserved.

This is an exact algebraic/storage port, with normal FP32 implementation differences measured separately. The original model remains the numerical reference. It does not replace EfficientLoFTR with SIFT, a coarse approximation, a learned-feature detector or an identity shortcut.

## Input and coordinates

The browser interprets polygon vertices as inclusive pixel centres, consistently with the UI and native masks; a rectangle ending at pixel 319 includes that pixel and spans 320 pixels. It reads only rows intersecting the two region bounds, converts RGB8 to grayscale with OpenCV's 14-bit integer coefficients, downsizes with explicit half-pixel bilinear interpolation of grayscale values, and zero-pads right/bottom to multiples of 32. `longSide` defaults to 832; the image is never enlarged. The authors' demo uses different resize conventions, so the UI preparation is qualified separately by feeding its exact tensor bytes to the original native model.

Right-angle rotations and optional horizontal reflection apply to the **target content before padding**. Returned coordinates undo those transforms and the resize, then map into the original image's pixel centres. Points outside the two polygons, exclusions, padding or the requested minimum displacement are filtered. A `limit` chosen by the user selects the strongest eligible confidences across transformations, with deterministic ties by variant/match order. This publication filter is identified in result metadata and does not change native inference.

Different transformation contexts stay distinct during biome grouping. Geometry uses original coordinates. Overlapping regions additionally use existing self-copy rejection; identical region bounds are rejected before reading or downloading anything.

## Resources and recovery

The model is fetched and verified inside the common `NeuralGraphPool` worker, using its pinned URL/length/SHA. The parent does not load or copy the weights first. Existing M3 ORT 1.30 CPU/GPU vendors are reused through two small owned factory bridges; their **admitted** WASM ceiling is passed explicitly, up to 2 GiB. The imported Memory.maximum, Emscripten heap maximum and speculative-growth clamp all use that same admission, including in pthreads. There is no test allocation, timing canary, preflight inference or remembered machine calibration.

Activation admission derives competing coarse, FPN and fine lifetime peaks from actual padded shapes and the native source-border bound on match count. GPU control nodes can use CPU/WASM fallback, so their host allowance does not pretend that all tensors stay on GPU. The shared broker assigns CPU thread teams and GPU jobs; its admission counters are not measurements of physical utilization.

Transformation jobs may reach common admission concurrently. On failure siblings are cancelled and fully drained before their inputs are released. Finished neural contexts are disposed before geometry admission; the returned scientific arrays retain their own idempotent lease. Cancellation, input/transport failures, empty matches, malformed/nonfinite outputs, and publication filtering have tests that require accounting to return to zero. No catch replaces the original error with an unrelated fallback message.

Small raw FP32 matching outputs are cached per image/crop, model SHA, input size, transformation, confidence threshold, backend and runtime identity. Changing exclusions, minimum displacement, publication limit, grouping or geometry reuses them and runs no CNN or preparation. Cache bytes and backing ownership remain in the shared Budget; eviction or engine/image disposal retires them. Finished ORT heaps are not cached with them. The full-class CPU/GPU witnesses re-filter to 17 matches in roughly 1 ms, with `inferenceExecutions: 0` and every variant hitting its raw cache.

## Numerical evidence and limits

Five original-native vs ONNX/ORT 1.23 CPU cases have exact match counts: 784, 1296, 0, 780 and 145. Source coordinates are exact; maximum target-coordinate difference is 3.052×10⁻⁵ pixels and confidence difference is 1.061×10⁻⁵. The earlier monolithic export's larger subpixel error is not the bound for this graph.

Chromium 153 with the actual common worker/M3 ORT 1.30 was tested with 1 and 4 admitted CPU threads on all five cases. Match counts, source tensor bytes and zero-match behavior agree; disposal returns Budget and the broker to zero. There are no JS errors or ORT warnings in the CPU receipts. WebGPU emits its standard warning about control nodes placed on CPU; it is a hybrid provider, with actual GPU queue submissions recorded. One native fine argmax has a near tie: scores 0.8567236066 and 0.8567103148 (margin 1.329×10⁻⁵) correspond to neighboring source pixels `[154.5,196.5]` and `[154.5,197.5]`. The browser picks the second. Consequently that case has a 1-pixel source/1.127-pixel target maximum difference, with mean target difference 0.00073 pixels; other tested cases retain subpixel numerical agreement. The tolerance is stated honestly rather than altering or rounding the native argmax. A match close to the user's geometric threshold can therefore cross that threshold between FP32 providers.

The full browser class was also compared to the original native model using the exact JS-prepared tensor bytes for translated, rotated and reflected region pairs. Each has 192 matches; source coordinates are exact, target maximum difference 7.63×10⁻⁶ pixels, confidence 7.16×10⁻⁷. This proves preparation/transform inversion for these witnesses, not every photograph or a universal forensic detection accuracy.

WebGPU passes all five cases with identical counts, biome membership and geometric inlier indices. Convex hull overlap is 1; maximum affine matrix difference is 1.35×10⁻⁴. Near-equal fine peaks can move both anchors by up to four pixels in these cases, but the difference of their displacement stays below 0.216 pixels. Captured WGSL MatMul/Softmax arithmetic uses f32. The four f16 shaders only slice/expand/concatenate/cast the originally half-stored RoPE lookup coefficients; no new reduced-precision arithmetic mode is enabled.

The actual native 832×832 dense witness has 9,818 matches on CPU (ten admitted threads) and WebGPU (691 real queue submissions). Registered ownership, Budget reservations/caches and broker leases return to zero. CPU heap is approximately 1.803 GB; WebGPU host heap approximately 0.647 GB, while its separate GPU allocation policy is also admitted. Native/browser biome and inlier membership agree, hull overlap is 1, maximum affine matrix difference is 7.75×10⁻⁶ and pair-displacement difference is below 0.054 pixels. Fine near-ties shift jointly by up to three CPU/five GPU pixels; maximum confidence differences are 2.051×10⁻⁵ and 3.434×10⁻⁵, with means below 8.45×10⁻⁷. The large witness explicitly checks FP32 confidence with `atol=1e-5, rtol=4e-5`; it does not pretend a small-case absolute bound is universal. This controlled identity pair verifies genuine model execution and dense memory behavior; the application still requires two distinct ROIs and has no identity shortcut.

The final user UI journey has a separate receipt. These are development witnesses, not a universal guarantee of identical FP32 threshold decisions, forensic accuracy, cross-browser equivalence or runtime speed. Do not infer physical GPU execution merely from an ORT provider label.

## Reproduction

Use a compatible local Torch/numpy/OpenCV/kornia/onnx/onnxruntime environment. Supply a directory containing the pinned upstream source in `upstream/efficientloftr`, the original checkpoint in `weights/eloftr_outdoor.ckpt` and any isolated Python dependency directory in `python-dependencies`. A public textured photograph is required for tracing and witnesses; no image is embedded in the model.

1. Run `scripts/export-efficient-loftr.py --resources-root "$RESOURCES" --reference-image "$PHOTO"`.
2. Run `scripts/generate-efficient-loftr-reference.py --export-root "$RESOURCES/export" --reference-image "$PHOTO"`.
3. Run `node scripts/prepare-efficient-loftr-reference.mjs "$RESOURCES/export/engine-reference"`, then `scripts/qualify-efficient-loftr-native.py --resources-root "$RESOURCES" --large`.
4. Serve the module/vendors and reference HTML fixtures in an isolated local preview with COOP/COEP. Run `scripts/qualify-efficient-loftr-browser.mjs` against that preview with CPU team sizes 1/4 and the separate WebGPU mode. Run `scripts/qualify-efficient-loftr-large-browser.mjs` for the 832 witness with CPU ten threads and separately WebGPU; the latter requires a Chromium executable exposing its actual WebGPU adapter. No existing user tabs or server need to be changed.

The browser/reference HTML templates are versioned beside these scripts and generated into the local qualification artifacts; numerical receipts remain local; large weights, source archives and image fixtures are not copied into the lightweight startup bundle. Browser tests are development evidence and never run automatically before users' useful jobs.
