# M3 elongated sources — delivery35

This targeted continuation fixes the residual16384-per-axis rejection found after
`dfa11b8`. The original18 large-source records and delivered algorithms remain
acquired; this change does not reopen their qualification or claim deployment.

## Actual dimension constraints

Historical admission, the full-resolution source/mask bridge, CM2 extraction and
the two native detector entry points previously compared each axis with16384.
That number was not a constraint of the CPU OpenCV detectors, global paged fields,
source reader or PNG encoder. Removing only historical admission would still
fail in the source bridge and native/CM2 entry points.

`m3ImageShape` now checks positive integer dimensions and signed-int32 linear
pixel indices, with the existing minimum7 for historical detection. The native
helper multiplies in int64 before comparing with INT_MAX. This protects the
actual `int` image/offset arithmetic without an arbitrary independent axis cap.
The check is not a memory reservation: RGB arrays, pyramid buffers, native heaps,
workers, masks, matches, surfaces and exports retain their existing shared-budget
admission and real allocation failures. The2 GiB native heap limit is unchanged.

Inspected pinned OpenCV4.11 paths use `cv::Mat` integer dimensions and full global
pyramids. ORB packs octave rectangles in a byte pyramid with signed-int offsets;
BRISK/AKAZE retain their native scale spaces. The apparent `short offset` AGAST
implementations belong to its x86-specific branch, not the WASM or ARM64 branch
used here; the active path uses integer offsets. Native antialiased drawing uses
`Point2l`/`Size2l` and64-bit fixed-point coordinates. Historical command endpoints
and CM2 polygon vertices remain int32, exported point fields retain their existing
float64/float32 provenance. No descriptor sampling, sorting, masking, coordinate
origin, thresholds or image reduction changes.

The owned `native/cloning.cpp` and `native/sparse-extract.cpp` wrappers were rebuilt
using the same pinned, read-only detector objects. Only this worktree's runtime,
identities and manifests change; shared OpenCV, native Python and fixtures remain
untouched. No new CPU/GPU calibration or synthetic runtime probe is introduced.

## Completed positive24000×4000 browser run

[m3-historical-96mp-akaze-wide-webgpu-proof.json](m3-historical-96mp-akaze-wide-webgpu-proof.json)
records Chrome154/ARM64, AKAZE global paged extraction with two useful CPU workers,
WebGPU Hamming,6 GiB shared budget. The original is deterministic full-resolution
RGB noise, reshaped without resizing to24000×4000, with an entire12000×4000 half
copied at dx12000, then JPEG90 encoded. SHA256:
`82d5846bbfcd9aa7db64bf1f8c3089e79cab711072fbdd9d4f2407eccd0e162b`.

177254 detected points are all described before the native response30 filter.
102 selected points yield102 matches,2 overlapping groups and native directional
region heuristic2, with matching20/distance40/minimum5. All102 match distances
are11999.9990–12000.0010 original pixels;35 selected points have x>16384. The
full global search and coordinates across the old boundary are therefore exercised.

End to end60.779s including2.417s load and35.875s extraction,1885 useful jobs,
zero retries, maximum actual worker heap138674176 bytes. Peak accounted memory
6440583271 bytes under6442450944, with RAM/OPFS fields and one384000000-byte
pressure-driven transfer taking0.413s. These are observations on a shared machine,
not a controlled speed comparison with the differently shaped12000×8000 fixture.

Original-sized windows (including the far edge), cached hidden-line view,
17527-byte JSON and283139352-byte PNG complete and hash correctly. Final
retained/cache/active counts are zero. Independent native rendering of the
exported arrays agrees on all288000000 RGB bytes:
[m3-96mp-historical-export-akaze-wide-proof.json](m3-96mp-historical-export-akaze-wide-proof.json).
This compares drawing/exports, not a second native96 MP detector execution.

## Targeted small-area controls

The native oracle generator and browser checker use24000×64 and64×24000 textures
with distant copied halves. Historical ORB/AKAZE/BRISK, masked AKAZE, CM2 ORB and
the inverted-axis global paged AKAZE are compared with native OpenCV. These retain
original global coordinates, including points beyond16384; no crop or tile is
substituted for the source. Exact per-field maximum/mean errors, counts, descriptor
comparisons and lifecycle totals are recorded in `m3-elongated-chrome-proof.json`.
All11 comparisons pass. ORB/AKAZE, CM2 ORB and paged masked AKAZE preserve all
point fields and every descriptor byte. BRISK preserves all fields except its
already documented portable-libm angle: maximum3.05176e-5 degrees, mean1.10529e-6
(wide) /1.08509e-6 (tall), with78655/78635 points and every descriptor byte exact.
Final test reservations/retained/cache are zero. No new floating tolerance was
introduced in the product and no tolerance is applied to identities or bytes.

Thirteen Node tests cover equal-area12000×8000/24000×4000/4000×24000 admissions,
integer overflow refusal, source orientation, byte preservation, release after
success/failure and the existing source lifecycle cases. A48000×2000 admission
check additionally prevents replacing16384 with another convenient texture cap;
it is not presented as a complete48000×2000 extraction qualification.

Reproduction uses `generate-m3-96mp-wide-copy.py`, then
`check-m3-historical-96mp.mjs --algorithm=AKAZE --backend=webgpu --fixture=m3-96mp-wide-copy --suffix=wide`,
and `verify-m3-96mp-historical-export.py akaze-wide m3-96mp-wide-copy.jpg`.
Small controls use `generate-m3-elongated-reference.py` and
`check-m3-elongated-browser.mjs`; all fixtures/outputs are private to `.build/m3`.
The exact budget/storage constraints still apply. Integration remains M5-owned;
no combined-engine/WordPress claim is inferred from these direct worker proofs.
