# Native Farneback with stored global matrices

`stereoFlowStage` retains the existing resident worker when admitted. If its
whole-image estimate exceeds the shared budget or WASM capacity, it calls
`stereoPagedFlow`. `segmentedStereogram` reserves the selected execution plan
before allocating its output. No user setting or calibration is required.

The new path retains OpenCV 4.11.0's complete pyramid, Gaussian, resize,
polynomial expansion, remapping, matrix updates, five iterations and their
in-place stripe order. Complete matrices live in logical RAM/OPFS/IndexedDB
stores; a matrix caches at most96 complete rows. Global displacements access
any row in the second polynomial image. Nothing clips motion to a local tile.
The 96-row stencil capacity covers the largest native Gaussian and all
simultaneous flow pointers. Existing explicit native float32/64 contractions
and the reference arithmetic choice (`original:true`) are preserved.

Workspace reservation is20MiB + width×min(96,height)×80 + width×32. Stores,
source windows and results remain under the same budget. Temporary matrices
are discarded after their last dependency, including on failure/cancellation.
Original Blobs are browser-managed; budget accounting is not a claim of RSS.
CPU work starts immediately; row checkpoints expose phase/level/iteration.
The sequential in-place updates remain sequential. The acquired resident path
remains preferable when it fits, avoiding external I/O on ordinary images.

`stereoPagedFlow(image,offset,plane,{budget,signal,onProgress,original,storage})`
borrows the source and float32 output plane. It returns global min/max,
heap size, I/O and peak logical scratch storage. Public stereo results retain
all four views, full displacement table, cropped-pair coordinates and cache
leases. `flowPaged` and `flowMetrics` identify the executed storage path.

Validation:25 native cases, including dimensions smaller than a stencil,
odd dimensions and1MP, produce identical full float32 field hashes, max/mean
error0. Chrome integrated worker under64MiB loads the JPEG original, searches
its period, computes all four views and the full flow, reuses its cache and
cleans storage. Every view and the complete field match native hashes.
Peak accounted64,882,988B; native heap9,437,184B; logical scratch74,711,040B.
Paged disparity stage59.54s in a concurrent development run (1,024² input),
107,200 reads/53,352 writes,1.14GB combined logical I/O. This is a memory
extension with a real I/O cost, not a speed claim.96MP remains to qualify.

Proofs: `stereo-paged-proof.json`, `stereo-paged-browser-proof.json`.
Build: `scripts/build-stereo-paged.py`; adapted OpenCV source and license in
`vendor/stereo-paged-source`. The build rewrites LLVM contraction intrinsics to
the same existing portable fused arithmetic used by the resident reference.

Injected source failure and cancellation retain their codes and return owned
memory to zero. Asyncify callbacks return status to native before throwing in
C++, so cancellation does not escape as an unhandled JavaScript rejection.
A native-exact small field was rechecked after this error-path correction.

## Exact Gaussian SIMD

Long grayscale Gaussian rows now use four-lane WASM SIMD. Binary32 inputs are
promoted to binary64 for exact products, then added and rounded to binary32.
When the binary64 result lands on a binary32 midpoint, the scalar fused
reference resolves the rare double-rounding case. Gaussian operands are finite,
nonnegative and bounded, excluding underflow; `original:true` retains scalar
reference arithmetic. Full1MP and odd-sized fields remain native-exact.

Observed1MP time19.05→9.12s. The concurrent odd-sized run was slower2.87→6.53s;
these are not isolated performance measurements or a universal speed claim.
The96MP attempt with the previous scalar Gaussian was recorded as interrupted
and is restarted with the new kernel. See `stereo-paged-simd-proof.json` and
`stereo-96mp-first-attempt.json`. No preflight is added to user execution.
