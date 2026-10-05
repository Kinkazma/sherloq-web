> Scheduling update in 0.13: runtime calibration below describes historical
> measurements only. Current CPU/GPU calls start useful work immediately;
> see `IMMEDIATE-COMPUTE.md`. No native Mac change is implied.

# Additional portable engines and decode boundaries

These are callable CPU implementations, with synthetic native references. UI
availability is separate: WordPress must integrate the controls, graphs and
exports before its corresponding panel can be called complete. The 50-panel
migration remains in progress.

| Operation | Native controls and returned evidence | Reference / limitations |
| --- | --- | --- |
| `colors.space` | `space`: rgb/cmyk/gray/hsv/hls/ycrcb/xyz/lab/luv; channel 0–2, or 0–3 for CMYK/gray | 290 exact outputs; gray modes preserve native arithmetic |
| `noise.separation` | mode 0 median, 1 Gaussian, 2 box, 3 bilateral, 4 NLM; radius 1–10, sigma 1–200; grayscale, denoised, levels 0–255 | 1680 exact outputs; residual/equalization order preserved |
| `detail.gradient` | intensity 0–100, mode 0–3, invert/equalize | 640 exact outputs; default 95/2/false/false |
| `detail.echo` | radius 1–15, contrast 0–100, grayscale | 900 exact outputs; default 2/85/false; native float32 convolution intermediates retained |
| `inspection.adjust` | brightness/saturation ±255, hue 0–180, gamma tenths 1–50, shadows/highlights ±100, sweep/width 0–255, sharpen 0–100, threshold 0–255, equalize 0–5, invert | 510 exact outputs; default identity; threshold 0 means Otsu; equalize 1 histogram and 2–5 CLAHE |
| `inspection.magnifier` | mode equalize/contrast; percent 0–100; channel; nullable half-open bounds | 440 exact cases; default equalize/20/false/full image; clipped and empty ROI; output layer carries source origin |
| `various.illuminant` | blocks 32/64/128/256, method 0 Gray World/1 Shades of Gray p=6/2 White Patch, linear/exclude, mode color/angle/valid fraction | 1440 exact renders/counts/valid flags; unit RGB and angles ≤1e-12 absolute error; default 128/1/true/true/0 |
| `jpeg.quality` | original quantization tables and estimate; 100 grayscale recompression losses; normalized curve and minimum | From0.23:1700 raw/normalized values exact; optional explicitly local learned predictor qualified on eleven images; see JPEG-QUALITY.md |
| `file.digest` | 10 original-byte cryptographic digests and six image hashes | 30 independent cryptographic cases; 36 native perceptual outputs exact; Color moments/Marr-Hildreth now exact on11-image declared corpus; see DIGEST-PERCEPTUAL.md; native filename hints and supplied File properties available |
| `file.hex` | offset/length in original bytes; default 0/256, maximum window 65536 | Defensive byte copy; read-only, no external hex editor |
| `metadata.structure` | marker/chunk structure and supported numeric TIFF/EXIF tags | Bounded parser; this is a structural subset, not full ExifTool output |
| `metadata.location` | EXIF GPS rational coordinates, or null | Synthetic GPS independently checked; no inferred place, map request or composite ExifTool fallback |
| `metadata.thumbnail` | original embedded JPEG bytes, decoded image, Lanczos4 resized image and absolute difference | Exact native synthetic thumbnail comparison; unavailable thumbnail returns data.available=false |

For all operations use `capabilities().operations` and `src/index.d.ts` for defaults
and accepted parameters. Unknown parameters are rejected. Except for the calibrated
JPEG quality pool described below, these operations use one compute worker.
No GPU speedup is claimed. `totalMs` measures
the engine call, browser proof RPC totals also include transport; these are
correctness-run durations under host load, not calibrated performance results.

## Portable numerical reference

OpenCV and opencv_contrib are pinned to 4.11.0. The WASM build is single threaded,
without OpenCL, SIMD, IPP, LAPACK or host-specific libraries. Specific numerical
rules from the native oracle are expressed in portable C++: explicit float32/FMA
reductions, CLAHE interpolation, 16-pixel HSV output prefixes and 8-pixel Carotene
HSV conversion prefixes. Finite reciprocal tables and the 50 gamma LUTs are
committed constants; their build-time oracle generators are in scripts/.
Runtime dispatch does not inspect the machine's vendor. These preserve the
particular documented native reference; they do not assert all OpenCV builds
produce identical bytes. `fixtures/opencv-reference.json` records native source
hashes. No tolerance hides a one-byte display difference in these five kernels.

## File-to-pixel contract

JPEG retains EXIF/XMP/ICC bytes. Eight EXIF orientations and both TIFF byte orders
are tested. ICC is retained but not applied, matching native loading. CMYK remains
unsupported. Controlled JPEG recompression still uses libjpeg-turbo 3.0.3/ISLOW.

PNG supports native gray/palette1/2/4/8-bit and gray/RGB/alpha8/16-bit inputs, including Adam7 and PNG EXIF orientations1–8 (see PNG-FORMATS.md). TIFF supports verified
8/16-bit grayscale/RGB, uncompressed/LZW/deflate/PackBits and orientations 1–4.
Native IMREAD_COLOR conversion to RGB8, discarded alpha and first-frame selection
are recorded in provenance. Four transposed TIFF orientations remain unavailable:
the native file loader rejects the synthetic reference while WASM accepts it.
BigTIFF, floating-point/other TIFF photometrics, RAW and other
unqualified encodings fail explicitly. No Canvas decode enters analysis.

The JPEG orientation corpus has 18 cases; the PNG/TIFF corpus has 17 accepted
cases and four explicit native failures. This is a bounded corpus, not universal
codec parity. Tests keep the original bytes separately and verify decoded RGB
hashes against the native file loader before testing kernels.

## Exports and integration

JSON includes arrays, parameters and provenance. Quality CSV has quality/raw
mean/normalized loss. Illuminant CSV preserves native columns, cell geometry,
counts, validity, unit RGB, global vector and angles; float formatting follows
JavaScript and is not claimed byte-identical to Python CSV. Native numerical
agreement is tested separately. Magnifier bounds are source coordinates and its
result may have smaller dimensions, or no pixels for an empty region. UI consumers
must honor `layers[].origin`, optional `pixels` and nested typed data.

## Version 0.5.0: additional families

| Operation | Controls / returned data | Native evidence |
| --- | --- | --- |
| `colors.pca` | component 0–2, mode distance/project/crossprod, invert/equalize; defaults 0/distance/false/false; BGR mean, eigenvectors and eigenvalues | 360 exact views and model values; repeated eigenvalues and one/two-pixel images; shared model cache |
| `colors.plots` | scale null or native legal integer, axes x/y/z 0–5, colored, alpha 0–1, kind 2d/3d/classic; defaults null/3/4/5/false/1/2d | 1674 views: normalized RGB/HSV, positions and colors exact; null scale uses native initial min(1, floor(log2(min dimension))); no hidden sampling |
| `detail.wavelets` | db1–20, sym2–20, coif1–5 and all 15 native bior choices; threshold 0–100; level null/0–30; soft/hard/garrote/greater/less; defaults db1/0/null/soft | 3380 exact reconstructions; native blue channel and float64 symmetric extension; null level uses native image-dependent initial value; zero threshold/level still reconstructs before truncation |
| `noise.blocking` | block 1–100 bounded by detail dimensions, default 8; raw float64 noise map with rows/cols and source mode | 1094 exact maps/displays; original-file grayscale decode and db8 diagonal coefficients verified independently; median absolute detail / 0.6745 |

PyWavelets is pinned to the native 1.5.0. Its portable C filters/convolutions are
compiled without float contraction. The wrapper preserves decomposition/reconstruction
axis order, threshold arithmetic, padded-edge cropping and uint8 truncation.
Wavelet analysis is cached per family/order. PCA caches the native model; point
plots cache RGB/HSV analysis per sampling level; noise blocking caches db8 detail.
These caches are bounded, accounted, privately owned and cleared on image unload.
View changes still compute their requested output. They do not repeat the cached
analysis and never mutate it.

Noise blocking reads grayscale directly from qualified JPEG/PNG/TIFF bytes. This
preserves codec grayscale behavior, orientation and depth handling; it does not
substitute RGB luminance. Explicit raw RGB inputs use the native loaded-image
fallback with `data.sourceMode='loaded image grayscale'`. Unsupported encoded
variants are rejected. Normalization also preserves native scalar lrint-to-int32
behavior on nearly constant maps; an idealized rescaling would change pixels.

All 43 Node tests and the full extended worker corpus pass on Chrome 154.0.8037.58,
Firefox 155.0 and Playwright WebKit 26.6. WebKit is not a physical Safari/device
validation. Version 0.5 adds eight independently computed native 1 MP cases for
interactive benchmarks, beyond the smaller parameter corpus above.

`docs/interactive-benchmark.json` records load, RPC, raster conversion/upload and
memory separately. On its one generated 1024² JPEG, parameter changes with reused
analysis measured 54.7 ms for wavelets, 156.3 ms for PCA, 15.3 ms for RGB/HSV points
and 3.3 ms for blocking (median of three cached samples). Corresponding fresh
analysis calls measured 123.6, 365.6, 54.2 and 68.9 ms (one sample each). All native
pixel/model/point/noise hashes matched. These limited observations support cache
reuse; they do not establish universal speedups. Graph drawing, compositor paint,
WordPress and mobile hardware are outside this measurement.

JPEG quality uses useful codec workers immediately at >=1MP, with no calibration
from0.13 onward. The serial path remains selectable. The0.23 learned-model chain
measures1190.3/263.5ms serial/10workers for a1MP PNG (three alternating samples),
with exact native curves and predictions. The earlier quality-pool-benchmark.json
contains historical calibration timings and is not a current first-use result.
See JPEG-QUALITY.md and quality-model-chrome-benchmark.json for current evidence.
