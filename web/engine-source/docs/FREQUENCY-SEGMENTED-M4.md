# Frequency Split with segmented global transforms

`detail.frequency` accepts segmented JPEG sources, including explicit
`loadBlob({id,blob,layout:'segmented'})`. Parameters remain `split`, `smooth`,
`threshold` in0..100 and `filter` in0..15. Original source coordinates/resolution
are retained. The contiguous engine and its existing GPU mask path are unchanged.

The new path pads to OpenCV's optimal DFT size, transforms complete float32 axes
using the pinned native FMA kernel and performs Hermitian completion globally.
Inverse scale uses full padded dimensions. Circular shifts are read views rather
than full image copies. Magnitude/phase extrema and mask thresholds are global.
Reconstruction retains the native64K stripe magnitude arithmetic and its scalar
odd tails. Low-frequency normalization uses the source crop; high-frequency
normalization uses the padded reconstruction before cropping. Display Gaussian
filtering reads the true image halo. No independent tile FFTs, resizing or
approximate transform replacement are used.

`result.surface` is the low-frequency RGB view. `result.rgbSurfaces.high`,
`.magnitude` and `.phase` are independently owned RGB surfaces. Low/high use
original dimensions; magnitude/phase use `data.frequencyDimensions`. Read all
through `readPixels`, release each with `releaseSurface`.
`tables.mask` is a paged table with columns `frequency_y,frequency_x,weight`.
Weights are the native float32 values represented exactly as Float64 in table
pages; cast the third column to Float32 when exporting a binary native mask.
Use `readTable`/`readTableCsv` and `releaseTable`. Mask values are frequency-domain
low-pass weights, not a manipulation verdict. `data.zeroPercent` follows the
native threshold policy (zero when threshold is disabled).

The source owns a DFT/polar cache and one unthresholded smoothed mask, reused
across threshold/filter changes. Returned views/mask have independent lifetimes.
`unload` releases cache, views, mask tables and temporary storage. Progress covers
source preparation, full DFT axes, polar normalization, mask axes and rendering;
AbortSignal is checked between strips and I/O. A worker can be terminated during
a synchronous strip. RAM/OPFS/IndexedDB storage uses the shared Budget; complete
axes and filter halos must fit the bounded workspace. Encoded JPEG constraints
remain those of the segmented loader. No calibration or canary execution.

Validation: complete-axis forward/inverse tests include odd dimensions and
single rows/columns. All ten existing native frequency bases and40 circle/mask
settings match exactly. Fifty native settings across those ten sources give200
exact RGB views, including filter15, padding, flat data and threshold extremes.
Cancellation at six stages cleans intermediate/finished views and preserves an
existing cache after a failed subsequent task. Chrome public API on1600x1100 under64MiB matches eight native full-view
SHA256 and two native float32 mask SHA256, reuses DFT/mask cache, releases every
RGB/table handle and leaves no OPFS files. Peak accounted memory61.23MB. See
`frequency-stream-browser-proof.json`.

The segmented path now runs independent complete-axis DFT and CPU mask strips
in budgeted workers, with adaptive strip width and concurrency from useful work.
No preflight runs occur. It also accepts `backend:'cpu'|'auto'|'webgpu'` for the
existing qualified WebGPU mask shader. The source-circle/kernel preparation uses
the small frequency module, avoiding an extra full OpenCV codec heap. GPU device,
buffers, full CPU input/readback and strip workspace share the same Budget.
Explicit WebGPU failures are reported; auto can use CPU when admission/device
availability requires it. Cache keys distinguish requested backends and returned
provenance records the backend actually used. The DFT itself remains native CPU.

Chrome512MiB/four-worker CPU and WebGPU-mask paths preserve the eight native
view hashes and two mask hashes. An explicit CPU override does not reuse a GPU
mask. The64MiB automatic path refuses GPU admission and remains exact on CPU,
with OPFS cleanup. See `frequency-parallel-browser-proof.json` and
`frequency-segmented-gpu-browser-proof.json`. GPU qualification is offline and
adapter-specific, as for the established contiguous path; no runtime calibration
is performed. Wider strips and disk-backed outputs leave useful workspace free.

One analysis cache retains low/high, unfiltered magnitude/phase and thresholded
mask. One additional cache retains the latest filtered magnitude/phase pair.
Changing only `filter` runs two Gaussian renders, without inverse DFTs, source
reads or mask generation. Repeating it returns immediately with `workers:0`;
`analysisCached` and `displayCached` report those two levels. Independent result
leases share storage without cloning whole images and remain readable after
cache replacement. Release every returned handle as usual. A cancelled filter
render leaves the previous analysis/display available. The cache remains bounded
to one analysis and one filtered pair, apart from handles still held by callers.

Additional validation checks filter-only progress, zero-work repeat, cancellation
and leases surviving cache eviction. Chrome512MiB also matches four native view
hashes and mask weights for filter7, then repeats that setting from cache. The64MiB OPFS path also passes: filter-only
render562.5ms and cached repeat0.1ms in this development run, without a universal
speed guarantee; temporary storage is empty after release/unload.
The table release API also now accepts Float64 tables, fixing the previous
Wavelet Blocking table-release mismatch.

Common integration: index routing/capabilities/layers/table release, segmented
result bundles now accept additional RGB surfaces, image-source cache cleanup,
Float32/Float64 plane storage and general numeric table columns. B owns UI and
export presentation. No website or publishing changes.
