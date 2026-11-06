# Splicebuster

Splicebuster locates statistical inconsistencies in image residuals and fine
texture. The method is by Davide Cozzolino, Giovanni Poggi and Luisa Verdoliva:
[Splicebuster: A new blind image splicing detector, WIFS 2015](https://doi.org/10.1109/WIFS.2015.7368565).
It needs no pretrained weights: its statistical model is fitted to each image.

The interface places the method under **Noise / Bruit**, after Noisesniffer.
It offers **CPU** and **GPU** execution, an anomaly map and a separate cell-validity
view. Validity records participation in model estimation; it is not a forgery mask.
Higher raw scores indicate stronger statistical anomalies, not a calibrated
probability of forgery. No usable cells produce an explicit abstention.

## Computation and ownership

The CPU path uses a pinned C++/Eigen f64 WASM/SIMD kernel. The GPU path uses exact
WebGPU pooling while CPU workers extract features and fit the global statistical
model. Both use the host's shared Budget and execution scheduler. GPU waits release
CPU admission; readback and live buffers remain financed until retirement.

Source windows use full native dimensions and complete halos. The default method
retains 50 features, 25 components, 30 initializations and 100 maximum EM iterations.
PCA, variance, mixture estimation and winner selection remain global. Memory
planning may reduce simultaneous replicas or select lossless temporary banks;
it does not reduce the image or scientific parameters. Replica admission includes
the posterior for the entire valid population and the host's read windows.

The image source stays owned by the M2 host. Result arrays stay in its worker.
`data.map` is f64 Mahalanobis-squared on `mapShape`; `range0` and `range1` give
native image coordinates. Display windows and sampled display frames are
presentation only. Opaque maps read no original RGB; an explicitly requested
opacity overlay can read native source rows. Unsupported or invalid GPU operations
are distinguished from recoverable resource/device failures. A recoverable GPU
failure repeats the complete affected feature band on CPU without double counting.

## API and scientific export

`createSplicebusterAnalyzer` is exported by the engine. The M2 worker accepts
`splicebuster` through `analyze` and `analyzeBlob`, renders native windows and
sampled frames, and exposes bounded numeric reads. Image formats use the existing
native segmented source policy. The menu operation is `m2.splicebuster`.

The scientific NPZ stream preserves `map` as f64, including NaN payloads, `valid`
as bytes, native coordinates, model parameters, shapes, metadata and provenance.
ZIP32 and ZIP64 framing are supported. An export pins the result through active
reads. Its release is awaitable; M2 waits for that release before retiring the
base result. Neither an entire heatmap nor an entire archive is required in RAM.

## Numerical and performance scope

The available oracle is a modern Python compatibility reference recovered from
the original implementation. Across 13 images/variants, the largest observed absolute
score difference was 1.37e-7; validity and coordinate arrays matched exactly.
This does not certify equality with unavailable historical raw scores and is
not a detection-accuracy measurement.

Measured Chrome 155 execution on already decoded RGB8 with local assets, four CPU
workers requested, median of three executions (one cold, two warm):

| Input | CPU | GPU |
|---|---:|---:|
| 1024×768 | 0.57 s | 0.54 s |
| 1920×1080 | 1.08 s | 0.96 s |

A separate 10000×10000 textured mosaic stress fixture completed through the native
PNG loader and the provider in 169.27 s CPU and 164.33 s GPU, one execution per path.
These totals include native decoding and bounded scientific readback. The image
was not resized; the native score grid was 1234×1234, with 1,522,756 finite scores.
Scores, validity, coordinates and model arrays were bit-identical between paths.
The thirty replicas ran with three simultaneous fits under 512 MiB policy admission.
Accounted peaks were 478.09 MiB CPU and 510.09 MiB GPU. Temporary banks were removed
after release. Policy/backing counts are distinct from browser process RSS;
summed process RSS on that stress fixture was about 1.9–2.0 GiB and may count shared
pages more than once. This constructed fixture does not establish real-image
detection rates or a general 100MP execution-time guarantee.

CPU execution has been exercised in Chromium, Firefox and WebKit; GPU pooling
and the complete path in Chrome and WebKit. Auto mode selects CPU when WebGPU
is unavailable. These statements describe the tested implementations, not every
browser/device combination.

## Reconstruction and notices

Use an external Emscripten 4.0.15 SDK and set `EMSDK` to its root. Run
`python native/splicebuster/build.py` and
`python native/splicebuster/build.py --stream`. The scripts verify generated
source/loader/WASM identities against the included pins before copying outputs
to `src/splicebuster/cpu/`. Compiler caches stay under the engine's ignored
`.build/` directory. Exact Eigen headers and compilation/runtime notices are
retained with the sources; no compiler SDK is distributed.

The original GRIP-UNINA license specifies informational and nonprofit use and
requires retaining notices and crediting the original authors when publishing
results. It is included unchanged. Eigen, SciPy and compilation-runtime notices
remain with their respective components. This document grants no additional
rights and implies no author endorsement.
