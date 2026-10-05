# Wavelet Blocking segmented contract

The existing `noise.blocking` operation now accepts segmented JPEG sources.
Parameter `block` is an integer 1..100, no larger than either db8 detail dimension.
The ordinary contiguous path remains unchanged. The original JPEG is decoded as
ISLOW grayscale with EXIF orientation; the RGB loading result is not substituted.
The internal adapter also accepts an explicitly loaded RGB surface, using native
grayscale conversion only when no encoded source exists.

Full float64 db8 axes run in bounded strips, with symmetric boundaries only at
the real image edges. The diagonal detail cache survives block changes. Each
median covers a complete native block; incomplete edge blocks are discarded.
Noise is median(abs(detail)) / 0.6745. Global extrema precede native CV_8U/FMA
normalization and nearest-neighbor rendering. RAM/temporary storage choice uses
the available shared budget. One complete axis and one block must fit workspace.
JPEG encoded bytes and progressive coefficient arrays still require contiguous
codec memory and are admitted explicitly; the pixel destination is segmented.

Public result `layout:'surface'` supplies RGB `surface` and `tables.noise`.
Read pixels using `readPixels`; noise uses `readTable` or `readTableCsv` and is
released with `releaseTable`. The noise table format is `float64-table`, columns
`block_row,block_col,noise`, row-major over the db8 detail block grid. This avoids
materializing a full JSON noise grid in RAM. JSON consumers can iterate pages;
CSV pages are directly exportable. The contiguous result still has `data.noise`.
Release both table and RGB surface when finished; unloading the source releases
its cache and every remaining result. B owns controls and download presentation.

`data` preserves source mode/dimensions, detail dimensions, block and noise grid
rows/columns. Progress phases are file-gray, gray-plane, db8-axis-0/1,
noise-blocks, render. Abort checks occur between scanlines/strips/blocks; worker
termination also uses the existing temporary-session cleanup protocol. No user
calibration or synthetic execution. Useful CPU strip concurrency is described below.

Validation: 12 exact native cases, oriented/progressive JPEG, block sizes1/2/8/32
(including noise grids smaller than8 samples), exact values and pixels. Loaded
RGB fallback matches the qualified contiguous implementation; cancellation at
five stages releases every store. Chrome public API,1600x1100/64MiB: two complete
native pixel SHA256 and two float64 noise SHA256 match; detail cache reused,
paged CSV works, OPFS fully removed on unload/dispose. See
`blocking-stream-browser-proof.json`.

Common integration files: index.js (routing/table format/capabilities),
image-sources.js (cache cleanup), wavelet-stream math/asset (noise and global
normalization primitives), runtime manifest. `vendor/jpeg-gray` is a separate
small libjpeg scanline module; existing RGB decoder assets are untouched.

## Parallel strips and block medians

The follow-up strip pool now executes independent full-axis db8 bands and
complete block medians concurrently. Extrema remain a global reduction; all
pixels and borders are unchanged. Workers admit their own WASM heap/staging in
the same Budget, terminate on failure/cancel, and never read a partial tile as an
independent image. Capacity is adjusted using useful completed work only.
`loadBlob(...,layout:'segmented')` allows this path to be selected explicitly.

Chrome proof with four workers/256MiB preserves both full pixel SHA256 and noise
SHA256, including cache reuse. The 64MiB public test also passes with adaptive
one/two-worker stages. Source/results/cache disposal removes all temporary data.
See `wavelet-parallel-browser-proof.json` and `blocking-stream-browser-proof.json`.
