# M3 global paged AKAZE

`PagedAkazeFeatureEngine` preserves the native16-level nonlinear scale space,
global contrast histogram, ordered same-scale and cross-scale suppression,
subpixel refinement, orientation and61-byte MLDB descriptors. Finite-support
windows evaluate global evolution fields. They are not independent detectors:
all mutations of the global suppression masks are persisted before dependent
rows/levels are evaluated. Native octave resize phase and float coordinate
rounding are retained, including rounding before translating a descriptor window.

The original-sized global fields use shared-budget segmented RAM or owned OPFS.
Physical storage groups each core contiguously, while all read/write windows retain
global logical raster coordinates. This avoids a separate disk call per scanline.
When refinement, selection or descriptor output needs more memory, an existing RAM
field is copied losslessly to OPFS before the real reservation is retried. The
source field remains valid until that transfer succeeds; metadata records bytes
and elapsed time of each pressure-driven transfer.
Worker admission occurs before stores are allocated. CPU workers start useful
windows immediately, and can reduce concurrency after real pressure while
retaining finished cores. Masks/determinants are released after global refinement;
image/evolution fields are released after descriptors. No global point cap is
introduced. CM2 performs its native rank/mask limit before describing retained
points; the historical method describes the entire native population before its
existing response filter. Historical matching, grouping and drawing stay native.

CM2 selects this path when the full-pyramid estimate exceeds512 MiB or60% of the
shared budget. Historical AKAZE selects it above its512 MiB full-pyramid estimate.
Public operation names, controls, source masks, coordinates, results, cached views
and JSON/NPZ/PNG contracts are unchanged. `cloningPagedExtraction` or sparse
extraction metadata reports stores, workers, phases and actual heap capacities.

## Arithmetic and qualification

The scalar reference is retained in `vendor/akaze-paged/reference.{js,wasm}`.
The fast CPU kernel processes four pixels independently with SIMD for Gaussian,
Scharr and separable derivatives; it retains the exact operation order within each
pixel. The qualified Chromium/ARM64 relaxed SIMD multiply-add is fused. Unsupported
WASM features select the scalar reference using `WebAssembly.validate`, without
executing calibration work. The internal development `reference:true` option can
force that path. This is a measured platform qualification, not a claim that
relaxed SIMD has identical rounding on every future browser/architecture.

An offline1280×1280 useful-window comparison with12000×8000 native configuration
checks initial preparation and levels0,1,7,15:36,044,800 float values are checked, with exact element counts in `m3-akaze-simd-kernels-proof.json`; all values are
identical. Observed preparation is48.2ms versus3489.2ms scalar; evolution pages
26.8–182.2ms versus3926.4–9029.9ms. These local development measurements establish
the improvement; they are not end-to-end96 MP timing or runtime probes.

Four extraction cases retain all point fields, counts, mask memberships and
MLDB bytes exactly. Five full CM2 cases retain pairs, groups, colors, provenance
and every render byte. Historical API fixtures retain points/matches/groups/counts
and every RGB byte. Ordered strip studies use7/13 rows,1971/6378 candidates;
descriptor-window studies check all their native descriptor bytes. Forced OPFS
also retains the exact rich-case result and releases every file/reservation.
A useful-window failure test reduces two workers to one and returns the same data.
All these are smaller native comparisons, separately identified from large-image
qualification. Large historical/CM2 recipes are tracked in the corresponding
96 MP proofs when completed; no incomplete run is presented as a pass.

Build only in this worktree:
`scripts/build-akaze-paged-study.py --runtime --reference`, then
`scripts/build-akaze-paged-study.py --runtime --fast-fma`.
The shared OpenCV source/build and fixtures are read-only dependencies; all
intermediate sources, objects, output images and studies live under `.build/m3`.

## Completed CM2 browser96 MP run

Chrome154/ARM64, two workers,6 GiB:175544 global candidates,6000 retained points,
15867 pairs and2 groups on12000×8000 copied RGB noise. Total107.670s including
3.549s load; peak6440615251 accounted bytes, below the6442450944-byte budget.
The16 evolution levels use both RAM and OPFS. Refinement moved one384000000-byte
field from RAM to OPFS after useful pressure, taking0.866s. No point was discarded
to satisfy memory admission. The largest actual worker heap was138674176 bytes.
Windows, cached hidden-group view,7117491-byte NPZ and221702162-byte PNG complete,
with zero retained/cache/active memory after release. The corresponding native
drawing comparison is exact on all288000000 bytes. The earlier no-spill
run failed at point-page admission and is explicitly not a successful qualification.

## Completed historical browser 96 MP run

The historical path now admits native RGB drawing plus allocator margin, while
paged extraction admits its own workers and fields. It no longer simultaneously
reserves the old 2 GiB monolithic AKAZE pyramid. Native selection/matching bounds
are admitted from the actual point population before allocation; directional
counting retains its separate bound. ORB/BRISK detector admission is unchanged.
The shared OPFS helper is identical to the committed M5 `d9f135f` version, including
physical 1 GiB shards and the allocation-size check. Earlier historical attempts
failed when a 24 MB temporary file was actually zero bytes at 4.17 GB reserved;
they are not qualified runs. Real storage failures remain explicit.

The completed run detects and describes all 175544 native points, then applies
response30/matching20/distance40/minimum5: 72 selected points,72 matches,26
historical overlapping groups and directional region heuristic2. Original source
12000×8000, two extraction workers and WebGPU Hamming, 6 GiB shared budget.
Total116.933s includes6.303s load and all outputs; extraction93.351s, peak6440481767
accounted bytes. One384000000-byte field spills to OPFS in1.208s;2849 useful jobs,
zero retries, maximum worker heap138674176 bytes. Original-sized windows and
cached hidden-line view pass, JSON14568 bytes and PNG145759141 bytes hash correctly.
Final retained/cache/active memory is zero. Independent native drawing of exported
arrays agrees on all288000000 RGB bytes. Small native extraction/matching fixtures
remain the separate arithmetic oracle; this is not a second96 MP native extraction.

Four targeted historical API fixtures were rerun after admission changes: native
points/matches/groups/count/RGB and cached views remain exact, all resources release.
The isolated RAM→OPFS field test checks110342 float values, including odd edge
cores and crossing windows, and leaves no file/reservation. Its staging, like
field windows, belongs to the caller scratch admission (64 MiB plus strips in
the extraction controller).
