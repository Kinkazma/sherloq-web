# Probability EM: current portable candidates rejected

The released standalone Fourier operation remains qualified separately. No
probability EM operation is enabled by this study. All reference images are
generated synthetic fields or existing public fixtures, with no trained weights.

The unchanged native model uses binary64 neighborhoods3×3/5×5, a fixed initial
RandomState0 vector, residual powers, exponential weights, sequential/pairwise
sums, an explicit matrix inverse, a0.01 coefficient-change stopping rule and at
most100 iterations. The operator association and final pre-update weight map
are preserved. These are per-image analysis steps, not model training.

A portable OpenCV4.11 GEMM/LU candidate initially passed90 image/size cases:
72 valid maps,18 refusals, identical iteration counts, no gray pixel differences.
Its musl pow/exp path reached2.62e-7 absolute probability error. Three downstream
Fourier settings per valid map gave216 spectra, scaled error below6.84e-7 and
no RGB byte differences. Near-equal first-argmax positions could still change.
Those results were insufficient to enable it.

Adding100 boundary cases exposed six regions that native NumPy processes but
the candidate rejects. Across190 cases, native returns104 maps and the candidate
98. The common valid maps still have unchanged gray pixels, with maximum raw
error6.94e-5. Full sources and outcomes are in `resampling-em-rejection.json`.

One identified difference is singularity handling: OpenCV's native scalar LU
uses an absolute pivot cutoff of100×DBL_EPSILON. NumPy1.26.4 instead implements
inverse through an identity right-hand side and LAPACK GESV, as its
[source shows](https://raw.githubusercontent.com/numpy/numpy/v1.26.4/numpy/linalg/umath_linalg.cpp).
The [LAPACK factorization](https://www.netlib.org/lapack/double/dgetf2.f)
declares singularity for an exactly zero pivot. This is only part of the issue:
product accumulation and factorization order also affect nearly singular systems.

An **offline experiment only** changed the portable pivot criterion to exact zero.
It still disagreed on five valid/refused outcomes, changed three iteration counts,
and produced probability errors up to0.90909 with eleven changed map pixels.
It also returned maps in two cases where the reference rejects the model. That
variant is rejected, not installed as a threshold adjustment or hidden fallback.

The native BLAS identifies itself as OpenBLAS0.3.23.dev ILP64, armv8 arithmetic,
with10 threads on the reference machine. This is evidence about the oracle,
not a browser dispatch rule. A native-only arithmetic probe reproduces small
Gram products with explicit FMA, but full BLAS factorization/reduction order,
libm rounding, larger matrices, regions/composites, cancellation and budgeted
browser integration are unresolved. No speedup or universal parity is claimed.

Reproduce the rejection from the source package after building pinned OpenCV:

```sh
python scripts/generate-resampling-em-study.py
python scripts/build-resampling-em-study.py
node scripts/check-resampling-em-study.mjs
python scripts/build-resampling-em-study.py --exact-zero
node scripts/check-resampling-em-study.mjs --exact-zero
```

Set `EMSDK` to Emscripten4.0.15 and use the unchanged native Python environment
with NumPy1.26.4, OpenCV4.11.0 and Matplotlib3.8.4. Generated vectors, experimental
WASM and raw outputs stay under `.build`. The code in `experiments/resampling-em`
is not imported by the product, does not enter its runtime manifest and must not
be promoted on the strength of the initial90-case corpus.

## M4: isolated BLAS port and remaining libm boundary

The new development candidate `experiments/resampling-em/portable.cpp` replaces
OpenCV GEMM/LU with the arithmetic of the pinned OpenBLAS ARMV8 reference. It
preserves the 8-row / 4-column kernels, the different serial/parallel K blocking,
left-looking GETF2, GESV's recursive panels, exact-zero singularity, non-contracted
triangular updates, and the eight-lane GEMV reduction. The panel sequence follows
the oracle's ten-thread configuration; it is not a browser worker-count selection.
The implementation is intentionally restricted to EM's 8 and 24 coefficients.
Source hashes and copyright notices accompany this **development-only** port.

The whole candidate compiled locally, including weights, power/exponential,
8192-element NumPy summation chunks and the stopping norm, reproduces all 190
existing cases: 104 accepted maps, 86 refusals, every map value bit-identical and
all iteration counts unchanged. This removes the previously observed BLAS/LU
validity divergence without changing a pivot threshold or regularizing a model.

The same C++ candidate in Emscripten 4.0.15 still differs through its math library:
it accepts `periodic / 5×5` where native reports no valid interpolation weights. For common valid
maps, iterations and gray pixels match, but maximum probability error is
1.049257125518288e-6. Downstream Fourier reaches scaled error
2.6450929111465626e-6, beyond its existing 1e-8 bound. This candidate remains
**unreleased**, with no new tolerance, hidden fallback, or probability operation.
The native-host proof does not qualify browser libm or the future segmented EM.

The original reference generator now writes exclusively inside its own worktree.
Reproduce this stage with the unchanged native Python environment:

```sh
python scripts/generate-resampling-em-study.py
python scripts/prepare-em-blas-study.py
python scripts/build-resampling-em-blas-host.py
python scripts/check-resampling-em-blas-host.py
python scripts/build-resampling-em-study.py --blas
node scripts/check-resampling-em-study.mjs --blas
```

For the older OpenCV studies, `OPENCV_BUILD_ROOT` may point to a read-only existing
build. Every generated output remains in this worktree's `.build`.

## M4 follow-up: compatibility arithmetic and streaming solver

The libm boundary above is resolved on the complete existing corpus by explicit
binary64 range reduction, mandatory FMA and pinned numerical coefficients for
the reference ARM64 power-square and nonpositive exponential paths. These are
mathematical compatibility data, not native machine code or model weights.
`vendor/resampling-em-source/NUMERICAL-DATA.json` identifies their provenance and
hashes. Public Apple ARM exp/pow source files are empty; this implementation is
M4's compatibility work, not an alleged upstream open-source ARM port.

The new bounded solver regenerates 8192 neighborhoods at a time and retains the
global Gram accumulation order, exact inverse, eight GEMV lanes, sequential sigma
numerator and NumPy sum boundaries. No region is fitted independently by tile.
Only grayscale and weights need storage proportional to region area; full F and
inverse-times-F are gone. The worker can be interrupted during a batch.

All 190 existing cases now agree on validity: 104 bit-identical probability maps,
86 refusals and exact iteration counts. Streaming qualification covers 1525
weight pages with an 8 MiB observed module heap. Downstream Fourier scaled error
is at most 1.463e-14, within the existing 1e-8 bound. Separate 100000-value probes
cover residual exponents and negative exponential underflow. These are development
checks, never user calibration. See `resampling-em-stream-native-proof.json`.
The public ROI/composite/Fourier adapter is the next integration step.
