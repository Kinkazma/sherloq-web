# Capability architecture and remaining work

The engine uses portable ES modules and a controlled WASM codec inside a persistent
worker. It does not load Python, Qt, Metal, Accelerate, dylibs, native OpenCV or a
macOS app inside the browser. Selection is based on API/adapter limits and measured
benefit, never the Apple brand. CPU remains the default and an explicit reference
kernel is available with `createEngine({cpuKernel:'reference'})`.

## Decode before arithmetic

libjpeg-turbo 3.0.3, Emscripten 4.0.15, slow integer DCT, RGB8, full resolution,
4:2:0 baseline recompression at the requested quality. No ICC conversion or
implicit resizing. EXIF-oriented JPEG plus verified PNG/TIFF subsets now use
controlled local codecs; original bytes remain intact. Orientation, alpha discard,
RGB8 depth conversion and first-frame policy are recorded explicitly. See
EXTENDED-ENGINES.md for accepted modes, native loader failures and 35 successful
new decode references. Painting a file in Canvas is not decoder validation.
Externally supplied RGB8 retains caller provenance.

Inputs/original bytes, codec round-trip pixels, float32 bases, tone LUT, grayscale
and final RGB hashes are distinct reference boundaries. RGB/BGR conversion is only
channel permutation. No GPU precision downgrade or resized detection input.

## Compute scheduling

Current aggressive profile: one persistent controller worker, single-thread WASM codec and
bounded per-image caches. M3 adds admitted ROI workers and isolated ORT threading
with staged CPU/WebGPU inference; see M3-SPARSE-DELIVERY.md. This has no N×N internal pool. Lookup-table arithmetic
is selected at ≥262,144 pixels after measured improvement; small inputs retain
the reference path. `scheduler.yield()` is used by ordinary kernels where supported. Storage-owning
paths use bounded control checkpoints so cancellation messages can run and handles
can close before worker termination. Neither mechanism performs preflight work.

Budget is shared by retained data, reservations and LRU caches within **one engine
instance**. B must share that instance. A multi-engine page-wide broker and overlap of independent model/ELA branches
remain to implement. Large ELA/JPEG quality/Ghost/ZERO/Noisesniffer tasks start
requested work directly on single-thread workers admitted by the shared budget.
Real completed task timings and resource failures adjust session-only decisions;
there is no synthetic probe, benchmark or saved performance profile at first use.
Runtime WASM capacity and browser-owned memory are not a measured device RAM total.
Oversized jobs still need separately qualified segmented adapters; no implicit
resize or precision reduction is allowed. See `IMMEDIATE-COMPUTE.md`.

For independent regions/models, retain global scope and divide native/ORT thread
quotas to avoid N×N pools. Keep one GPU queue and limit resident model sessions.
Never preload all weights or run a preflight computation to pick a profile.

## GPU experiment

`experiments/ela-lut.js` uses an integer WGSL lookup table populated by the exact
CPU float32/tone reference. Its shader avoids approximate GPU square roots and
matches RGB8 output including fixed-point grayscale. All 40 native ELA expectations
pass on the measured adapter. Metrics include packing, transfer preparation,
dispatch plus readback, unpacking and total. Dispatch time is NOT reported as a
pure GPU kernel timestamp; GPU timestamp-query instrumentation remains pending.

After improving CPU scheduling and lookup arithmetic, GPU was slower than the
CPU lookup path on the measured 512² and 1024² frames. It is retained as an
experiment, rejected for automatic/default selection. It is not advertised as an
available production backend and is not silently substituted for CPU. No mask or
detector is inferred from this visualization; mask decision parity is not applicable
to classic ELA and remains mandatory for later detection engines.

## Added CPU operations

Callable operations include the additions below and the model-required D2PRL development API;
M3 adds historical BRISK, sparse CM2 and three research families. New color/filter/adjustment functions share
portable OpenCV WASM; illuminant and ROI enhancement use explicit reference
arithmetic. All 50 panels remain enumerated separately, with unavailable branches
preserved. See EXTENDED-ENGINES.md for counts, controls and limitations.

## Models and native dependencies

`weights-inventory.json` records local presence only, including duplicate paths;
no training and no inference execution was used for this inventory. Native
checkpoint provenance/known checksums remain in their existing native inventories.
D2PRL now has a fixed converted ONNX role subgraph executed by a bounded
ONNX Runtime Web1.30 WASM worker. The complete feature/UNet all-ONNX candidate
was rejected; exact WASM/WebGPU arithmetic supplies those portions instead.
The independent CFA ONNX candidate was also rejected on decision parity.
Generic model import remains unavailable (`onnx` in the legacy capability list
means arbitrary ONNX loading, not the pinned D2PRL role implementation). No
training has been performed. See D2PRL-WEB-STUDY.md and CFA-CONVERSION-STUDY.md.

| Family | Actual native prerequisites | Browser route and unresolved barrier |
| --- | --- | --- |
| Conventional filters, histogram, statistics, channels | OpenCV/NumPy | Exact JS/WASM kernels; border/rounding/interpolation fixtures before GPU |
| FFT, wavelets, PCA, resampling, noise | FFT/OpenCV/PyWavelets/SciPy | PCA, all 59 native threshold wavelets, db8 noise blocking and Lanczos4 and frequency split qualified; remaining resampling/global segmented adapters open |
| PatchMatch Zernike/SIFT | C++ bridge, VLFeat, random search, geometry | Recompile portable C/C++; controlled seeds, descriptor borders, filter ordering, RANSAC and masks; Metal code needs separate WGSL work |
| XFeat/ALIKED/LighterGlue/LightGlue | PyTorch keypoints and learned matchers | Delivered CPU/WebGPU extraction and spatial sparse matching, dynamic attention/top-k and native postprocessing; measured floating limits in M3 delivery |
| D2PRL | Fixed448/40 neural features, iterative PatchMatch, native role filtering | Complete CPU/hybrid WebGPU synthetic corpus, independent ROI and cache/refilter passed; final common-worker delivery and WordPress integration tracked separately |
| CMSeg-Net/MGCFDN | PyTorch correlation/segmentation; CNN/transformer/graph variants | Individual FP32 export and native tensor+decision comparison; ViG neighbor ranking especially sensitive |
| Forgeryscope public | YOLO panels/lanes; ALIKED; four embedding pipelines | Multi-stage YOLO/NMS/crop/matching/reference pipeline; public weights are not the competition ensemble |
| TruFor | Noiseprint++/network/confidence/detection score | FP32 export of all heads and preprocessing; large memory/operator audit |
| CAT-Net | RGB + JPEG DCT/quantization branches | Original JPEG coefficients required; Canvas/RGB-only input cannot replace them |
| SAFIRE | SAM backbone, learned features and clustering | Full CPU/WebGPU network, prompt grid and native clustering delivered; borderline label differences measured |
| FOCAL | HRNet + ViT features and clustering | Staged CPU/WebGPU ViT-L/HRNet, native fusion/clustering delivered; tested labels agree, floating features differ |
| AdaIFL | Dynamic decoder/mixture of experts | Full dynamic CPU/WebGPU network delivered, bounded attention and model lifetimes; one CPU mask difference on recipe |
| Noiseprint splicing | TensorFlow/native inference | Export and residual-statistics equivalence, not swapping to another model |
| ExifTool, c2patool, libmagic, hex app | Perl/Rust/system CLI or desktop process | Browser parsers/crypto and trust semantics separately validated; no shell available |
| PRNU database | Multi-file references, HDF5 and residual statistics | Wiener/NCC and HDF5 import/build/export qualified on native fixtures; arbitrary-size segmented residuals and physical devices remain open |
| Butteraugli/ssimulacra | External binaries | Portable WASM builds and native comparison fixtures qualified; see COMPARISON.md |

ONNX Runtime Web distinguishes WASM CPU from GPU providers with different operator
coverage. Model export, operator support, preprocessing and final decisions are
separate gates. See [ORT browser guide](https://onnxruntime.ai/docs/tutorials/web/)
and [thread/session configuration](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html).
These documents establish possible runtimes, not SHERLOQ model compatibility.
A remote service is a proposal requiring an explicit separate decision; no remote
fallback is implemented or configured. No NAS access is part of this work.

## Exports and delivery

Classic ELA: owned RGB8 output, original bytes separately, JSON parameters and
provenance, PNG derivative via B. Pixel tools additionally return explicit bit-plane/extrema/defect masks and
numeric histograms; JSON export preserves their arrays and provenance, and
histogram/defect CSV is available. See PIXEL-ENGINES.md. ZERO NPZ arrays are available with preserved types/shapes. M3 model confidence/source semantics, ROI transforms and JSON/NPZ exports are
implemented with separate view controls; see CONTRACT.md and M3-SPARSE-DELIVERY.md. Public proofs use generated images only.
The manifest includes license notices and exact runtime hashes; `.build`, models,
private reports, credentials and native image collections are excluded.

Resource profiles and their adaptive RAM ceilings are specified in CONTRACT.md (0.2.0 resource-profile section).

## Qualified frequency GPU path (0.6.0)

Gaussian mask smoothing now has a measured GPU path with CPU retained. See
FREQUENCY-ENGINE.md and IMMEDIATE-COMPUTE.md for offline qualification, resource accounting,
explicit-backend behavior, native corpus and end-to-end measurements. This does
not promote the unrelated ELA GPU lookup or qualify untested model operators.

## ZERO CPU and worker path (0.8.0)

The separate AGPL-3.0-or-later ZERO module retains original-order CPU evaluation
and a qualified float64 threshold filter, with original FMA fallback near the
DCT zero boundary. The bounded worker pool partitions luminance with seven-row
halos and restores global phase coordinates. It shares the engine's budget and
never overlaps another internal pool in a running job. The 2 GiB ZERO WASM
ceiling is an upper bound; allocations grow on demand, and the global browser
budget can refuse a job earlier. See ZERO-ENGINE.md for full-memory admission,
NPZ export, original-versus-regularized masks and current proof limitations.

0.9 adds contrast grids and lazy stereogram disparity in the main worker.
Contrast caches block analysis across three views. Stereo separately caches
period search, pattern and full-size cropped optical flow; an absent period
returns no image. Pinned fused arithmetic and contiguous Gaussian passes
preserve all declared native outputs. No stereogram GPU or extra-worker gain
is claimed. See CONTRAST-STEREOGRAM.md for memory admission and measurements.


0.10 adds pairwise comparison with twenty measures and four views. The loaded
reference's lifetime participates in every pair cache. Original bytes and decode
provenance are retained for both inputs. Sewar convolutions use independent
binary64 SIMD lanes with guarded exact rounding and software FMA fallback;
`cpuKernel:'reference'` keeps the original loops and arithmetic. The module
requires WebAssembly SIMD. Historical histogram correlation is explicitly
flagged and a separate correctly dimensioned score is returned. No comparison
GPU or multicore gain is claimed. See COMPARISON.md for scores, views and limits.

## Segmented source and result progress

Version0.14 adds immutable Blob sources, exact JPEG pixel windows and global
histograms on96MP. Version0.15 adds owned channel-rank result surfaces, explicit
release and bounded result windows. Versions0.16/0.17 add raw bit-plane and
local-extrema masks with exact filtered RGB views and global density
normalization. Version0.19 adds original-byte hex and explicit cryptographic-only
digests. Other segmented operations remain unavailable.
SEGMENTED-SOURCES.md and SEGMENTED-RESULTS.md define exact scope, native evidence,
storage ownership, approximate quota handling, known heap accounting and limits.
The browser-managed original Blob is reported separately; accounting is not RSS.


Version0.21 adds segmented isolated-pixel classification, separate RGB flags,
pixel mask and an exact-sized ordered candidate table. Window/page APIs keep
all live results owned. Stable radix ordering preserves native CSV row order
under EXIF, using shared-budget RAM or temporary partitions. See
SEGMENTED-DEFECTS.md for the qualified96MP scope and remaining quotas/formats.
The scalar proof-negative shortcut changes no scientific decisions; no GPU or
native performance gain is implied. Eight panel subsets now have qualified
segmented paths,25 remain full-memory and17 have no browser engine.
