# Noisesniffer — M4 segmented extension

Statistics are available through `segmentedNoisesnifferStatistics(image, blockSize,
{budget, signal, onProgress, profile, storage})`. The image supplies an oriented
RGB surface and optional temporary session. This internal stage also backs the complete public operation described below.

The full source supplies channel extrema. Valid blocks strictly exclude these
extrema. Native DCT-II, axis order, binary64 FMA and binary32 energy reductions
are retained; strips carry the complete block footprint. For 8×8 means, the
original OpenCV correlation tile grid, optimal FFT sizes, reflected global
borders and valid-output crop are retained. Filtering independent image strips
would change floating-point means and the downstream unstable global sort.

Returned validity bytes, interleaved binary64 RGB means and channel-planar
binary32 variances use shared-budget segmented RAM or temporary storage. The
caller owns `dispose()`. Complete useful strips start immediately with as many
workers as the budget admits. No calibration or synthetic startup work. A full
image row plus the DCT block footprint must fit; the explicit maximum patch ID
is uint32. The future sort workspace can be protected with `reserveAfter`.

The dedicated WASM starts at 8 MiB and is capped at 128 MiB. It includes the
existing pinned native binomial-tail primitive for later region growth. The
build uses read-only OpenCV archives, vendored pinned PocketFFT/Boost.Math and
local intermediates. Licenses remain in `vendor/opencv`, `vendor/pocketfft`, and
`vendor/boost-math`; no model weights are introduced.

Validation: `node --test tests/noisesniffer-stream.test.mjs` checks all statistics
bit for bit on 36 native fixtures, then the existing 1024×1024 synthetic oracle
(blocks 3 and 8, including FFT tile junctions). Cancellation after extrema, DCT
and mean FFT releases the stores and reservations. Browser workers and OPFS are checked separately through the complete public
operation below; this Node test alone does not qualify them.

## Complete operation and UI contract

`noise.noisesniffer` now routes segmented JPEG sources through the complete
pipeline. Its existing parameters are unchanged: blockSize 3/5/7/8, cellSize,
samplesPerBin, lowFrequencyFraction, lowNoiseFraction and the three views
`regions`, `mask`, `distribution`. Input and output coordinates are the oriented
full-resolution source coordinates. A non-result is explicitly inconclusive;
no inferred authenticity verdict is introduced.

Selection visits the complete means and variance planes. A faithful NumPy
1.26.4 unstable argsort orders all valid blocks per channel; bins retain native
boundaries and ties. Spatially batched RGB reads evaluate native block standard
deviations while preserving the selection order. Uint32 IDs are stored in their
native channel/bin order, including duplicates. Cell counts and the original
ordered region-growth code remain global. The pre-existing 1e-9 significance
guard remains unchanged. Rectangle unions for the distribution view use rolling
row counts over the global selected-block flags.

The result contains `layout: "surface"`, an owned RGB surface, and small
metadata/numerics. Read windows with `readPixels` and release with
`releaseSurface`. Statistics are cached by block size; selection/regions by
all parameters except view. A view change reuses analysis. Published surfaces
pin their original analysis even after cache replacement. Source unload closes
results before caches and temporary sessions. Direct cooperative cancellation
keeps the old published view; the worker client retains its documented hard
cancellation behavior (`imagesCleared: true`, reload sources).

The complete native NPZ is exported using
`readNpz({surfaceId, revision, offset, length}, {signal,onProgress})`, with pages
of at most 1 MiB. First use calculates actual archive CRCs in bounded reads.
Concatenate page bytes until `done`; `nextOffset` and `totalBytes` describe the
file. Array names/dtypes/shapes, BGR distribution, int64 IDs, metadata and
provenance match the existing archive. A small fixture's entire archive matches
byte for byte, including unaligned 997-byte pages. ZIP32 limits archives to
4 GiB; this is an explicit export limit, not silent truncation. Synchronous
`exportResult(...,{format:'npz'})` remains for contiguous results; segmented
JSON exports describe metadata and surface handles.

Progress phases are extrema, DCT, FFT means for block8, global sort, selection,
regions, distribution/render, and requested NPZ CRC. CPU strips begin useful
work immediately; no runtime benchmark or calibration. The preserved DCT and
FFT path currently uses CPU, not an unqualified GPU replacement.

## Memory and remaining bounds

Statistics and selection arrays use segmented RAM or source-owned temporary
storage. Collective selection admission leaves room for rendering and later
parameter changes; it does not fill RAM with one partial cache at a time.
Fitting jobs retain the in-memory unstable sort. Larger jobs use the exact
external NumPy sort, bounded bin buffers, packed memberships when admitted and
stored output lists described in [NOISESNIFFER-PAGED-M4](NOISESNIFFER-PAGED-M4.md).
Selection remains global; it does not rank tiles independently. Retained region-cell
objects are admitted before allocation. One complete row plus block footprint
must fit; patch IDs remain uint32. Browser Blob residency and allocator/RSS
are not claimed to be measured by the shared logical budget.

Checks: 360 native rendered views and native selections/counts/ordered region
cells pass, with cache changes, phase cancellation and independent published
lifetimes. Existing source/result API checks (10) pass. The browser JPEG oracle
is generated only under this worktree's `.build/noisesniffer-stream`; shared
fixtures are read-only. See `docs/noisesniffer-stream-browser-proof.json` for
worker, memory, native hashes, NPZ pages and cleanup measurements.

Chrome worker result: 1024×1024 JPEG, block8, 775320 selected and 387660 low-noise
blocks, five native regions; all three native view hashes and the 13512640-byte
NPZ are identical under both budgets. At 512 MiB: four statistics workers,
57 useful strip jobs, 291473150-byte accounted peak, 10.9 s development run.
At 128 MiB: one statistics worker, OPFS, 107543514-byte peak, 15.9 s. View changes
reuse analysis (statistics worker counters describe the cached statistics).
The NPZ takes 52 deliberately unaligned pages. Worker cancellation, source
reload and temporary session cleanup pass with zero remaining sessions. These
are local development measurements, not timing guarantees or runtime probes.

The later full96MP path is qualified in `noisesniffer-96mp-proof.json`: native-exact
complete scientific arrays and two PNGs, independent readers after release,
256MiB budget and zero final accounted bytes. See `M4-96MP-COVERAGE.md` for its
nonempty selections, empty native region result, cache checks and runtime scope.
