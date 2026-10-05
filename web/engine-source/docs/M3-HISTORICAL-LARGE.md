# Historical keypoint operations on large originals

`tampering.copyMove.orb`, `.akaze` and `.brisk` now return the shared
`layout: 'surface'` contract for segmented source/mask executions. The native
whole-image raster drawing is preserved. Its completed RGB output is transferred
to owned segmented storage, so `readPixels`, `exportSurface({format:'png'})`,
`readExport`, `releaseSurface` and source unloading use the established lifecycle.
Data arrays and historical JSON export remain available. Contiguous small-image
executions retain their existing `pixels` result. View changes reuse detection,
matching and grouping; they publish a separately owned surface.

The historical WASM maximum is now 2 GiB, with failed allocations returned to the
caller. Shared-budget admission covers this maximum and the image workspace (gray/mask
2N plus RGB readback 3N, with source leases and variable arrays separately owned);
this is not a new unconditional 2 GiB allocation. The 96 MP ORB run actually grew
past the previous 1 GiB ceiling, despite ORB's small final point population.

BRISK uses stable linear compaction for rejected border points, with identical
native scale and boundary predicates. This replaces repeated vector erasure and
preserves point order. CM2 also performs its existing stable response ranking
before orientation/descriptor computation. It keeps the total valid population
count and only skips descriptors that the existing UI point limit would discard.
Historical BRISK leaves the optional CM2 count limit disabled and retains all
point detections in its response-independent cache. Its native response threshold
is applied before computing selected orientations/descriptors. Eight full-versus-
selected comparisons (response 0/30/90/100, with and without a mask) preserve every
point field and descriptor byte. Changing response reuses the detected points;
its newly selected descriptors are cached under the response value.
The native pyramid, detection, descriptor sampling and angle arithmetic remain
unchanged, including the previously documented portable-libm angle limitation.

Four full/limited, masked/unmasked comparisons with the previous qualified WASM
have identical points, descriptors and counts. Six complete historical BRISK
Chrome/WebGPU cases through segmented sources, cache reuse and release retain
native matches, groups and every RGB byte. The paired historical ORB 96 MP run
keeps the original 12000×8000 noise image with a distant copied half: 501 detections,
500 selected points, 214 matches, 153 groups, native region heuristic 2. It completes
original-sized window reads, a cached hidden-line view, 56,013-byte JSON and
146,438,802-byte PNG. All 288,000,000 RGB bytes match independent native rendering
of the exported arrays. Peak accounted memory is 4,966,052,794 bytes under 6 GiB;
final retained/cache/active bytes are zero. This ORB proof used the older, more
conservative 18N staging reservation; the final 5N admission reduces that bound
without changing allocations or arithmetic. Observed total 125.89 s includes 60.57 s
loading under concurrent development activity, not a controlled benchmark.

Global RGB drawing and the historical source bridge are still admitted contiguous
phases; result paging does not claim a paged detector or arbitrary low-memory
execution. Large AKAZE diffusion requires its own bounded implementation. Historical BRISK
96 MP and learned-attention qualification are tracked separately in M3 state.

CM2 BRISK completed the rich original 96 MP recipe with **9,721,597** valid
candidates and the configured 6,000 retained points: 4,997 matches, two groups,
original windows, cached view, 3,572,145-byte NPZ and 217,497,231-byte PNG. All
288 MB RGB match native rendering of the exported data. Total observed 220.92 s,
including 3.17 s load; peak shared accounting 2,779,150,652 bytes under 6 GiB,
actual native worker heap 1,935,933,440 bytes, one useful extraction, no retry,
zero final active/retained/cache bytes. The earlier all-descriptor dense run was
stopped before completing and is not a qualification result. Timing is not a
controlled speed comparison.

The G2NN paged SIFT path also completed the original 96 MP recipe: 6,000 points,
2,064 matches, one group, 94 useful GPU matching batches, 69.56 s end to end,
4,073,391,878-byte accounted peak, NPZ/PNG and all 288 MB native RGB exact.
The shared sparse pipeline regression covers 22 cases after the BRISK changes;
its cancellation recipe now aborts at actual extraction progress rather than
racing a fixed 10 ms timer against the faster completed calculation.

## Historical BRISK completed with stored JSON (lot33)

The96 MP noise-copy run now completes both views, original-sized windows and
exports with the stored JSON API. All9,721,597 native detections are counted;
the native response30 filter retains14,811 points, producing14,742 matches,
14,726 overlapping groups and region heuristic2. Total observed time1615.873s
includes10.477s loading and1033.09s for the first native drawing. Repeated native
antialiased commands are preserved; overlapping groups can make drawing expensive.
The peak accounted memory is5,409,905,124 bytes under6 GiB; the native heap capacity
is2,032,140,288 bytes. JSON is41,034,317 bytes, PNG97,781,159 bytes. The full native
redraw comparison subsequently completed: all288,000,000 bytes are identical.
Final retained/cache/active memory is zero. The earlier128 MiB JSON-bound failure
was not counted as a successful large qualification.


AKAZE's completed 96 MP historical path uses its global paged nonlinear pyramid,
with native response/matching/overlapping groups preserved. See
[M3-PAGED-AKAZE.md](M3-PAGED-AKAZE.md) for the corrected native post-extraction
admission, completed resource figures and exact full-resolution render proof.
