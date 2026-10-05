# Dense PatchMatch — M4, lot 1

Current delivery: all six dense profiles, native ROI/provenance, global matching,
coherence, paired geometry/detail and presentation are implemented through
`DenseCopyEngine`. SIFT has a lossless compact provider; Zernike has bounded tile
preparation and resident descriptors. B's registry/UI hookup and M3's geometry
module integration remain coordinator-owned. See the latest sections below for
current contracts and measured limits; earlier lot sections are historical.

## Ready contract

`createDenseMath()` in `src/dense-math.js` owns one WASM instance. Run synchronous
methods inside an admitted worker, never on the UI thread. Its current heap is
reported by `heapBytes`. Calls must not overlap on an instance.

- `denseGray(rgb8)`: native RGB/BGR channel sum / sqrt(float32(3)); channel order
  is immaterial for this sum. Source pixels are not resized.
- `features(gray, width, height, {method, patch, reflection, normalize})`: native
  IPOL Zernike (`method:0`, 12 components) or VLFeat dense SIFT (`method:1`, 128).
  Returns float32 `first`, `second`, descriptor `width/height/dimensions`, and
  center `shift` in original crop pixels. Without reflection both arrays alias.
  With reflection the target descriptors already map back to source coordinates.
  SIFT grid is `(height-3*patch, width-3*patch)` and shift is `1.5*patch`.
- `field(first, second, mask, width, height, options)`: deterministic native
  zero/first-order bounded PatchMatch. `mask` is uint8 bits 1/2 for the two
  comparison zones, 0 for excluded pixels. Search, compare, minimum/radius,
  iteration count, seed, gap and compact float32 x/y axes are supported. Returns
  int32 `targets` (flat target index, -1 absent), float32 `distancesSquared`
  (Infinity absent), and exact BigInt `comparisons`. Export comparisons as a
  decimal string for JSON. Distances are descriptor distances, not probabilities.
  Default bounded rank/select avoids full integer candidate lists while keeping
  exactly the same candidate ordering. This is not a spatially tiled search.
- `canonicalDenseSift(values)` canonicalizes in place and returns uint8 orientation
  diversity on the canonical field. Quarter turns and equal-parity source/target
  bins are additional hypotheses, not interpolation or arbitrary rotation claims.
- `densePassPlan(profile,{patch,width,height,flip})` describes all six native
  profiles and required supplemental verification. Default extended mirror duo
  has 11 passes, including unchanged normal duo, four additional SIFT frames,
  Zernike/SIFT reflections and three additional reflected scale hypotheses.
- `denseSearchContexts(regions,compare)` snapshots polygons and gives distinct
  identities to independent ROI searches, even when their polygons are equal.
  `pairSearchRegion` is ROI index for Search, -1 for Compare (native convention).
  Global/envelope selection is supplied explicitly by the caller.

`signal` is checked before/after synchronous native calls. Mid-call cancellation
requires terminating the owning worker; cooperative chunking is not delivered in
this lot. Native allocations are released in `finally`, including failed calls.
Descriptor heap estimate is exposed, but complete shared-budget admission,
retained output ownership, cache and worker pool are still integration work.
The 2 GiB WASM address-space ceiling is explicit; no claim of segmented descriptor
storage, WebGPU acceleration or arbitrary-size support is made.

## Fidelity evidence

`docs/dense-native-proof.json`: five deterministic source cases, Zernike patches
3/8 and SIFT 3/4/8, reflected target descriptors, 20 field cases covering search,
comparison, overlap, exclusion, distance gap, compact axes and empty results.
Native vs WASM descriptor maximum absolute error: 1.52e-6. Native normalization
and quarter-turn vectors are exact on common inputs. Candidate traversal,
comparison counts, squared distances and targets are exact on common descriptors.
End-to-end WASM descriptors produce the same target indices on these fixtures.
This is primitive fidelity evidence, not a scientific detector-quality corpus.

Reproduce using the scripts `generate-dense-reference.py` (explicit native dylib),
`check-dense-reference.mjs`, and `node --test tests/dense.test.mjs`. Reference output
is worktree-local `.build/dense-reference`, never the shared fixtures directory.
The build uses Emscripten 4.0.15, an explicit private `EM_CACHE`, and verifies the
SHA-256 of vendored source files. Platform adaptations only replace dispatch with
a worker-local pixel loop and enable the VLFeat constructor under Emscripten;
threads/SSE/AVX are disabled. Float contraction is disabled. No user calibration.

## Next integration work

Paired-support alignment, full-field coherence, exact display link sampling,
source/ROI/texture/guide handling, workers under the common budget, field caches,
and retained maps. Then M3's regional geometry and biomes, transformed-group and
mirror detail checks, coalescing/provenance, exports and the common engine API.
The planner's `require*` flags describe work still required, not work already
performed. Transform panels in the M4 mission remain queued separately.

## Licenses

IPOL/SHERLOQ bridge GPL-3.0-or-later; VLFeat BSD (see
`vendor/dense-source/src/vlfeat/COPYING`). The runtime folder includes GPL and
upstream notices; retain the VLFeat notice with redistributed runtime assets.

## Lot 2 — fields, coherence and worker ownership

`DenseFieldPool` (`src/dense-pool.js`) now runs actual field jobs using the shared
`Budget`. Each job supplies immutable float32 `gray`, crop `width/height`, one
planned `pass`, a uint8 eligibility `mask` on the larger-support grid, `context`,
PatchMatch `options`, and optional `coherence` settings. Original source storage
is owned/admitted by the caller. Crop masks/texture/guides must already be prepared;
the pool does not silently replace native ROI or texture semantics.

The pool aligns paired-support SIFT without interpolation, canonicalizes the
supplementary frames, applies their diversity gate, then runs global PatchMatch.
`coherence` uses complete disks (radii 1..6), binary64 affine residuals, the native
4-connected area filter, and retains a float32 error map plus uint8 selection.
Threshold defaults to `options.threshold` (0.3 absent); minimum component is 6.
Returned `targets` and `distancesSquared` remain the raw full field.

`run(jobs,{signal,onProgress})` returns `{results,release,metrics}` in stable job
order. Each result keeps its exact `pass` and `context` and includes grid size,
center shift, field, selected map, optional errors and comparison count. Explicit
`release()` relinquishes the output reservation after the caller stops using it.
Native work is off the UI thread; abort/dispose terminate workers. Siblings settle
before reservations are released after failure. Progress reports completed useful
stages and completed jobs, not invented per-kernel percentages. Every worker is
terminated after its job so its WASM heap has a bounded lifetime. Future run
concurrency adapts using completed useful work and resource failures; there is no
synthetic calibration or hidden retry of a completed field.

Admission includes worker source/mask clones, WASM heaps, simultaneous descriptor
arrays and alignment buffers, and retained outputs. Concurrent jobs start at the
capacity/memory limit. Raw fields are still RAM arrays; segmented descriptors and
GPU kernels remain future work. This pool is internal and is not yet wired into
the common registry/index. It does not expose a complete CM2 detection result.

`sampleDenseLinks` preserves native reciprocal deduplication (distance then source
index tie), source ordering and linspace display selection. It never edits the
raw fields or the full selection. `alignDenseSupports` exposes the same grid
alignment independently for cache reuse.

Validation: 7 Node tests, 24 native coherent-mask/error/link cases (translation,
reflection, affine displacement and random fields; radii 2/6; error thresholds
0/.3/3), exact on these cases. Real Chrome worker run covers all 11 hypotheses,
ordered provenance, borrowed input preservation, output release, mid-job abort,
prelaunch/workspace memory refusal and sibling cleanup after worker input error.
See `dense-post-native-proof.json` and `dense-browser-proof.json`. Browser elapsed
numbers are a development trace, not a performance promise or user preflight.

Remaining dense chain: native source/ROI/texture and compact-guide preparation;
result caching/refilter API; regional grouping and geometry (M3), transformed-group
and detail checks/coalescing, pair/biome export, and public engine/UI integration.
No implementation of those steps is implied by the completed raw-field jobs.

## Lot 3 — source preparation and cached field controller

`DenseImageEngine(rgb8, sharedBudget, profile).analyze(params,hooks)` now accepts
an immutable original RGB source and all six dense profiles. It prepares each
independent crop with the native 3×support halo, rasterizes ROI/exclusion polygons
with OpenCV fillPoly and ties-to-even rounding, applies the float32 native box
texture gate, and preserves auto/compact distance rules. This preparation runs in
workers. Equal overlapping searches retain distinct `roi:N` contexts.

Parameters are exported by `denseImageParams`: profile, patch, iterations, flip,
texture, radius/minimum, auto/compact, regions/excluded/guides, compare, threshold,
coherence/errorThreshold/minimumComponent and display limit. Coordinates remain
original-source pixels; each field gives crop origin and descriptor center shift.

The returned status is deliberately `raw-dense-evidence`. Raw field/allowed mask,
selected mask/errors, sampled display rows, full search contexts and settings are
available. Geometry, mirrored model validation/detail corroboration and biomes
are not yet represented as verified detections. M3 owns the common geometry and
its current delivery does not supply that dependency.

Changing only threshold, coherence settings or display limit reuses the cached
field; no descriptors or PatchMatch rerun. Results are read-only leased arrays:
call `release()` when finished. Results survive cache replacement and controller
disposal until their own lease is released. `clear()` invalidates generations and
cancels active workers. This controller currently accepts contiguous RGB8 only.

Evidence: 45 native masks exact, including float32 texture gates, half-integer
polygon coordinates and paired SIFT supports; compact axes exact. Chrome runs 22
fields (11 hypotheses in two coincident searches), then refilters without a
single descriptor stage, retains original fields and releases all leases.
`dense-regions-native-proof.json` and `dense-browser-proof.json` capture this.
The OpenCV helper build reads an explicit `OPENCV_BUILD_ROOT`; writes stay local.

## Lot 8 — complete hypotheses, detail and native presentation

`DenseCopyEngine` in `src/dense-copy.js` now wraps the field controller with
native packing, regional paired biomes, geometry, extended transform acceptance,
mirrored guide coalescing, high-pass detail corroboration and palette. Instantiate
with `{geometry:{pairedBiomes,verifyCopyGeometry,createGeometryKernel,copyPalette},
profile:{maxWorkers}}`; the geometry functions are M3's delivery `4046116`.
The coordinator must integrate those modules and their WASM asset. They are
injected explicitly: no geometry substitute, dynamic external URL, or dependency
on another worktree occurs in production. B owns the UI and common registration.

The existing field parameters apply. Additional parameters: `model` defaults to
`Similarity` (`None`, `Affine`, `Homography` are also native options), `tolerance`
50, `geometricThreshold` 3, `geometricMinimum` 6. Analysis should run in a worker;
individual synchronous WASM kernels are interruptible by terminating that worker.
`clear()`/`dispose()` cancel active work; hooks accept `signal` and `onProgress`.
Field-only changes reuse the existing caches. Geometry/detail are recalculated.
No user calibration, probes or automatic substitute algorithms are run.

Results have Float32 `points` (x,y,size,angle,response,octave,class_id), Float64
`pairs` (source point,target point,descriptor distance,spatial distance), groups of
pair indices, native models and corroboration scores, BGR `colors`/`bases`,
`pair_search_regions`, algorithm/frame/variant provenance, dense counts and raw
maps. Coordinates refer to the original source. `candidate_comparisons` is BigInt;
serialize explicitly as a decimal string in JSON. Result arrays are borrowed
until `release()`; they survive engine clear/disposal. No authenticity verdict.

`renderDenseCopy(image,result,style,{budget,signal})` in `src/dense-view.js` applies
inclusive `low`/`high` spatial distance, `minimum` distinct-centre support,
`chosen`/`hidden` zero-based groups, and `circles`/`lines`/`points`/`areas` switches.
The mirror hull overlap gate is applied at display time exactly as in native CM2.
It returns RGB8 pixels, `visible`, `legend`, selected pair rows and a `release()`
lease. Hidden groups remain in the legend. Rendering never reruns descriptors or
geometry. B can feed RGB8 into its existing PNG/export path and export selected
pair/model arrays with the original coordinate system.

Validation: eight exact correspondence-packing fixtures (including equal ROI,
compare gap and compact axes); exact high-pass/remap/detail scores and 160
transform decisions; seven full Chrome/native pipelines covering six profiles
and a true reflected copy. Points, pairs, groups, models, colors, counts and 21
rendered RGB8 views are exact on those recipes. Clear/result leases and geometry
cancellation return accounted memory to zero. Pinned M3 geometry is extracted
into this worktree's `.build` only for that test. SIFT FMA contractions are now
explicit WASM scalar fma operations; all six descriptor fixtures become bit exact.

Limits remain explicit: Zernike descriptor corpus retains tiny float32 numerical
differences despite unchanged targets on existing field fixtures. M3's Homography
has an unresolved numerical qualification boundary; the complete pipeline proof
here is Similarity, not a new Homography tolerance approval. Dense descriptors,
fields and source/detail are still contiguous under admission. Large-image
segmentation and GPU acceleration are not claimed by this delivery.

## M4 compact SIFT under budget

DenseFieldPool automatically chooses the native lossless compact SIFT provider
when full descriptor copies would not fit the common budget or WASM addressing.
No new UI option or numerical tolerance is introduced. The same 128 float32
components are reconstructed from 8-bin histograms, three normalization factors
and the quarter-turn frame. Global candidate order, propagation, random search,
paired supports, mirror mapping, diversity and comparisons remain unchanged.
The 16,384-entry descriptor caches bound reconstruction memory; they do not prune
candidates. Computation begins with the real request, without preflight work.

Results expose `descriptorStorage: 'lossless-compact-sift'`; pool metrics expose
`compactDescriptorJobs`. The existing phases, cancellation, cache/refilter and
output leases still apply. Fields, histograms and preparation remain resident:
this is a large reduction in copies, not an unlimited OPFS matcher. Zernike is
unchanged in this lot. The conservative compact worker heap admission is
32 MiB + 180 bytes per input pixel, plus source preparation, JS gray/mask,
field outputs and worker overhead. Module maximum remains 2 GiB.

Qualification: 20 paired/mirror/quarter cases reconstruct every float32 exactly
and preserve entire fields even with only 47 cache slots. Chrome 512×512,
8→10 support, mirror and canonical frame: native SHA of targets, squared distances
and eligibility mask are exact; 7,153,858 comparisons exact. Under 128 MiB, worker
reservation is 101,121,708 bytes and observed heap 50,331,648 bytes, versus the
previous admission of 1,435,223,444 bytes. Descriptor cancellation releases all
reservations. Existing 11-pass/22-context browser cache and ownership checks pass.
See `dense-compact-browser-proof.json`; timings are development observations only.

## M4 resident Zernike under budget

The low-memory provider now also covers Zernike, automatically selected when the
full-copy job would exceed the budget. Native 128×128 descriptor tiles carry the
native `3×patch+1` halo, including mirrored support and true image edges. Their
normalized float32 descriptors stay in the same WASM worker; the original global
PatchMatch traversal and bounded candidate pools operate directly on them.
There are no tile-local matches or approximation of the convolution.

Results expose `descriptorStorage:'resident-zernike'` and the pool counts
`residentZernikeJobs` separately from `compactDescriptorJobs` for SIFT. Output
fields and refilter/cache lifetime are unchanged. Six cases across seams, odd
sizes, mirrors and patch3/8/32 reproduce every full-provider descriptor and field
bit. Chrome512×384 with mirror/coherence: targets, distances, selected mask, affine
errors and5,010,058 comparisons exactly match the existing whole descriptor path.
It fits96MiB: worker reservation83,411,968 bytes, observed heap33,554,432 bytes,
versus previous admission196,804,608 bytes. Mid-job cancellation frees reservations.
See `dense-resident-browser-proof.json`.

Descriptors and raw global fields still require an admitted resident working set;
source/detail are contiguous. This change removes duplicate full descriptor
copies and bounds preparation, not every possible image-size limit. Zernike's
previously documented native numerical boundary is unchanged; no new tolerance
or Homography qualification is introduced.
