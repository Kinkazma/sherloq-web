> Scheduling update in 0.13: runtime calibration below describes historical
> measurements only. Current CPU/GPU calls start useful work immediately;
> see `IMMEDIATE-COMPUTE.md`. No native Mac change is implied.

# Separately reusable native improvements

AKAZE (0.26 study): the new float32 filter, pyramid-tail and 61-byte Hamming
fixtures can help detect changes when upgrading native OpenCV. The browser FMA
shortcut was slower than its existing software FMA and was rejected. It is not
a Mac speedup proposal; native arm64 already uses hardware fused arithmetic.
Very dense AKAZE copy/move inputs expose the quadratic native grouping cost;
an exact spatial candidate index is a future optimization to qualify separately.
No native source was changed.

Median detector (0.22): the browser avoids the full padded gray allocation by
reading exact64×64 black-padded blocks and avoids the enlarged padded RGB image
by reproducing the native fixed-point interpolation directly into its final crop.
Native border semantics, score filtering and decisions remain separately tested.
These are possible native memory optimizations; none is applied to the Mac code
and no Mac speedup is claimed. Keep the forest shared across feature jobs and
coordinate its thread count with the feature pool instead of multiplying pools.

No native source was changed by this browser work.

1. **Exact byte-pair lookup:** the normalized float32 square-root ELA transform
   cannot simplify to `sqrt(abs(a-b)/255)` without changing rounding. A 256×256
   table indexed by the original and recompressed bytes preserves each intermediate
   rounding step. A tone-specific uint8 table can fuse transform, gain and LUT;
   grayscale remains the same fixed-point operation. Web fixtures validate all
   byte pairs and 40 native outputs. A native NumPy/C++ implementation still needs
   its own memory/time comparison against optimized OpenCV before adoption.
2. **Worker tuning including transfers:** a larger core count only wins if table
   propagation, copies and output assembly are measured too. Native multiprocessing
   has analogous overhead. Share a budget with OpenCV/Torch pools to avoid N×N.
3. **Reference-first codec selection:** the MozJPEG default optimizations and the
   TurboJPEG fast-DCT wrapper produced different decoded recompressions despite
   identical nominal quality. Preserve libjpeg-turbo slow integer DCT defaults
   if native round-trip equivalence is required; original-byte and pixel hashes
   are different checks.
4. **Yield scheduling:** the browser's clamped timer issue is browser-specific;
   it is not a reason to change Qt scheduling. Reuse the measured principle
   (bounded cancellation granularity), not the JavaScript API.

These are candidates with public fixtures, not claims of a Mac performance gain.

5. **Finite native tone tables:** the 50 supported gamma positions can be
   represented by 12,800 bytes, preserving the reference scalar power rounding
   and avoiding repeated power evaluation. The native application already caches
   its LUTs; a native cold-start gain still needs measurement.
6. **Numerical fingerprints:** the synthetic texture exposed native Carotene HSV
   reciprocal rounding and vector-prefix behavior that a generic OpenCV WASM
   build did not reproduce. Preserve small regression images across native
   OpenCV upgrades; matching version numbers alone does not prove pixel identity.
7. **Regional illuminant data:** explicit uint32 histograms and validity flags
   separate scientific values from view rendering and CSV. The portable code
   mirrors the native design; no additional Mac speedup is asserted.

8. **Frequency normalization fingerprints:** native parallel HAL stripe tails
   can change a constant or nearly constant reconstruction after min/max scaling.
   Include odd DFT sizes spanning several 64K stripes in native upgrade tests.
   The portable Gaussian GPU path has exact recorded masks and a useful browser
   full-path gain. A native Metal implementation still requires its own precision,
   scheduling, transfer and UI measurements; no native change was made here.

Ghost maps: cache raw 16×16 error planes by quality and phase, separately from
quality-range normalization and presentation. Gray/viridis/original visibility
changes need no JPEG re-encoding. Only copy the original when explicitly shown.
The browser shares one immediately dispatched codec pool across quality curves and Ghosts;
Ghost calibration includes fresh worker startup because workers are released after
each job. These are native reuse candidates, not measurements of native speedup.
The double-JPEG port also shows that replacing native SciPy reduction order can
change a candidate in a tie: preserve arithmetic before optimizing it.

ZERO: the separable float64 transform with conservative threshold guard and
original-order FMA fallback can avoid expensive direct DCTs while preserving
zero-count decisions. Browser qualification covers all 64 phases and real mask
outputs, plus threshold fallback cases; remeasure separately on the Mac before
changing its implementation. Direct RGB8 luminance preparation removes large
float64 RGB planes and matches the native rounding of all 16.8 million RGB colors.
The native regularized and raw masks can also be cached together across views.

Contrast/stereogram: preserve native histogram padding and separate numerical
maps from views. For stereo, tiny pyramid arithmetic differences can change
normalized depth displays. The portable implementation explicitly pins Gaussian
and resize tails. Its contiguous Gaussian loops avoid repeated border work;
this is a browser-port optimization, not a measured gain over native OpenCV,
which already uses optimized separable filters. Keep the new synthetic pyramid
and FMA boundary fixtures when upgrading native OpenCV.

PRNU: retain the new direct/FFT, 8192-buffer reduction, NCC threshold/rounding,
Unicode HDF5 ordering and 8 MP residual checks when upgrading NumPy/SciPy/HDF5.
The browser's guarded FMA gives a measured 2.56x improvement over WASM software
FMA. Native arm64 already has hardware FMA; that browser improvement must not be
advertised as a Mac speedup or used to replace native FMA without a separate
measurement. Ordered streaming JPEG ingestion and image-only residual caching
mirror the native design. The frozen FFT seeds are a portability adapter, not
a proposed change to native science. No native implementation was modified.

## Noisesniffer browser DCT partitions

Independent block DCTs can be distributed while retaining full-image mean-filter
geometry and the global extrema, unstable sorts and region growth. Browser halos
and output ordering are qualified separately from native multiprocessing. Exact
software-FMA guards target the WASM execution cost; they do not establish a gain
on a Mac with hardware FMA. Native threading/BLAS pools and mapped-array lifetime
must be coordinated before reusing this idea. No native source change or native
speedup is claimed by the browser's measured 1.54×/5.57× warm end-to-end gains.

## Segmented JPEG sources and source windows

Version0.14 retains exact full-resolution source windows over the native decoder's
RGB rows. Global histogram/unique-color accumulation is invariant to EXIF pixel
permutations, so it needs no full oriented copy. This is independently qualified
in the browser; the native memory-adaptive contract already has its own adapters.
OPFS/IndexedDB and cooperative worker closure are browser-specific. No new Mac
speedup is claimed and no native source was changed.

Channel-rank surfaces in0.15 preserve the native red/green/blue tie precedence in
independent batches. Native StatsEngine already offers its own bounded adapter
and rank cache; no browser timing is evidence of a Mac speedup. Reuse the seam
fixtures when changing either implementation, not the browser storage APIs.

Bit-plane0.16 retains raw0/1 evidence independently of filtered presentation and
uses exact one-row halos. These browser fixtures exercise median replicate and
Gaussian reflect101 borders and all eight orientations; keep them when changing
the native bounded adapter. Native PlanesEngine already has a halo adapter; no
new Mac speedup is inferred from this browser memory qualification.

Extrema0.17 counts density cells in oriented coordinates and performs both global
normalizations on compact grids before expanding the final RGB. Native
minmax_bounded.py already normalizes compact scalar cells, but still expands each
density before the final RGB normalization. Combining colored cells before this
last expansion is a candidate for reducing native intermediate writes. Browser
parity is evidence for the algebra only; native memory, OpenCV rounding and
full-path speed still need independent tests. No native edit or speedup claim.

Deferred result storage0.18 reuses a source-owned session after RAM admission
changes as live results accumulate. The Mac TemporaryArrays manager already has
its own allocation policy; the transferable principle is preserving ownership
and counting simultaneous live results, not browser OPFS/IndexedDB APIs. No
native modification or measured native performance improvement is claimed.

Original-byte engines0.19 update ten cryptographic states while visiting encoded
bytes once; byte and perceptual hashes stay separate. This bounded streaming
pattern can be compared with the native digest reader, but browser timings do
not establish a Mac gain. JSON admission now depends on a conservative output
bound rather than its configured maximum; any native export change still needs
its own allocation/encoding measurement. Native code remains unchanged.


IndexedDB page reuse0.20 avoids repeatedly cloning the same page for adjacent
row fragments. Two retained pages match the tested I/O reduction of a larger
cache while using less shared RAM. This is browser-specific storage behavior;
macOS mapped files already use the OS page cache. Transfer only the discipline
of measuring useful reuse, explicit cache ownership and eviction under a common
budget. No native performance improvement or native code change is claimed.

Defect candidates0.21 keep raw flags separate from RGB presentation and sort
only the derived coordinate table after orientation. Exact-sized table allocation
and bounded radix partitions are candidates for large native CSV workflows, but
native NumPy/nonzero/export behavior already differs from browser IndexedDB I/O.
The early-negative classifier preserves the same inequalities; native erosion
and dilation are already optimized. Browser parity and memory tests establish no
native speedup. Native source/model files remain unchanged.

## JPEG-quality model and curve cache (0.23)

The100 native recompressions depend only on the image, not on a replacement
quality model. Retaining that curve separately permits model changes without
re-encoding. Browser measurements on one1MP PNG: cached calculation0.3ms after
separately measured local model reload4.1–4.5ms. This is a candidate for native
cache architecture review, not a measured Mac gain or a native code change.
Native float64 normalization uses fused rounding; preserve it before float32
model inputs. Exporting the verified historical wrapper into plain model JSON
avoids executable deserialization in the browser; it does not clear redistribution
rights or qualify new checkpoints. No native files or model weights were modified.

## Resampling Fourier — browser evidence, native reuse still separate

The native core already has separate gray/window/spectrum/magnitude/render caches;
the browser adapter preserves these dependencies and does not establish a new
native cache speedup. NumPy pocketfft and OpenCV float64 pyrUp arithmetic order
are reusable reference adapters, with explicit FMA and contraction policy.
Parallel row-group gamma/gray-LUT presentation is bit exact to serial browser
output and measured3.53× on2048², including worker startup; the complete example
chain improves1.42×. This suggests a native presentation optimization candidate,
but native NumPy rendering is a different implementation: no Mac source changed,
no native performance benefit inferred or claimed. Full-array and exact LUT
fixtures can test a separate native proposal without private photographs.


## Historical ORB — exact grouping reuse (0.25)

The point-pair proximity decision depends only on selected point coordinates and
the unchanged distance threshold. A bounded boolean table avoids repeated norms
for overlapping groups, preserving the native fused boundary check. Independent
group rows can be computed in parallel and concatenated in original order.
Browser measurements include worker startup:363.5/105.3ms for serial/ten workers
on the dense generated shape case. Small lots lose and stay serial. This is a
candidate for a separate native implementation/benchmark, not a claimed Mac gain.

The direct Hamming loop avoids the prototype's BFMatcher matrix plus restoration
of equal-distance order. Native OpenCV has different SIMD/threading, so the
browser's1.66–3.25× result does not imply native acceleration. Preserve the original
ordering of equal matches and self-match removal: they change geometric groups.
Geometry and region-count caches are independent of drawing; minimum changes reuse
geometry. The native core already has some of these caches. Do not deduplicate
repeated antialiased drawings: repeated blends affect the final pixels. No native
files, native thread-pool settings, models or scientific parameters were changed.

## 0.27 — panel geometry

The generated 144-case auto-zones corpus can serve as a native regression oracle,
including palette ties, row order and original JPEG/TIFF decoding. Browser work
arrays reuse the same mask/queue across colour candidates. No native change or
Mac speedup has been implemented or measured; browser timings do not establish one.


## 0.28 — ELA energy reference and scheduling

No native code was changed. Residual luminance needs separate SIMD-prefix and
scalar-tail FMA orders; percentile membership uses float32 comparisons, and NumPy
reductions use8192-value chunks. These findings support cross-platform numerical
regressions; they are not native speed improvements. The fixed sparse logarithm
corrections reproduce the native function rather than improve its performance.

Three JPEG/energy qualities are independent and can be scheduled concurrently.
The browser implements this with three bounded single-thread workers; any reuse
in the Mac engine must separately measure its other profile work, memory and
OpenCV/internal-thread coordination. No Mac speedup or permission to change its
scientific thresholds, cell-grid policy or algorithm has been inferred.

Panel detection depends on the input pixels, not JPEG quality or energy histogram
bounds. The browser now caches these proposals across energy preparations. This
is a separately measurable native reuse candidate if its current cache misses
that stage. Explicit eight-neighbour traversal also reduced browser component
work without changing discovery order; native OpenCV already uses a different
optimized implementation, so copying the JS traversal is not a Mac speed claim.


## D2PRL — portable arithmetic and reusable cached zones (0.29 development)

No native engine was edited. The independent synthetic arithmetic corpus covers
FMA midpoint double rounding, signed zero, subnormal/overflow cases and fixed
convolution reduction domains. The complete CPU browser chain now reproduces
the native masks; it does not establish a Mac speed improvement. ARM native FMA
already executes directly, so its browser emulation should not replace it.

Cached raw448 grids can be refiltered per independent region and reprojected,
then unioned with exclusions preserved. The native implementation already has
this policy. The reusable addition is a controller regression corpus for rapid
slider changes, late obsolete results, envelope deselection and overlapping
region provenance. Applying these tests to Mac is a separate validation task.

Reducing ORT's instantiated ceiling4GiB→512MiB is qualified for the browser role
subgraph only, with identical WASM numerical bytes and outputs. It does not
justify lowering a native PyTorch allocation limit or changing other models.


### D2PRL memory pressure and strict filter identity

The browser CPU path exposed a useful lifecycle rule: compiled worker heaps can
remain idle while the next graph operation requires scratch memory. Reclaiming
these idle workers from the shared allocation budget avoids an artificial refusal
before evicting scientific raw-grid caches. No active convolution is interrupted.
This is a browser change under qualification, not a native speed or RSS result.
A native reuse would need separate allocator/pool ownership tests.

Keep stable analysis identity separate from output/view revision. The browser
slider explicitly refilters cached grids and refuses after eviction; cancellation
racing a completed view does not require model inference to recover. Owned raw
residual export stays separate from source-coordinate postprocessed masks. These
are reusable API/lifecycle rules; no native files were changed here.

## CMSeg global correlation — browser0.30.0-m1.4

The portable kernel evaluates all global pairs twice and retains normalized
features, row summaries and top-k values, instead of retaining a1GiB affinity
matrix at128×128. It can reduce a native implementation's quadratic temporary
storage, but the Mac application has not been changed or benchmarked with it.
Its float32 arithmetic has measured probability errors and exact tested masks;
a native adaptation must repeat the end-to-end decision check, not merely copy
a visually similar heat map.

The two softmax axes have different native summation/division orders. Reusing
one denominator for both axes caused a measurable error despite matrix symmetry;
retaining those orders fixed the tested final probability bound. The native
implementation already follows these rules. The reusable improvement is the
bounded algorithm and its generated positive/ROI/cancellation fixtures, not a
claim that the native softmax needs correction. Likewise, the ONNX global means
needed the existing D2PRL cascade reduction; this fixes browser conversion and
is not a measured Mac speed optimization. No native file was modified.

## Native mean layouts reused by segmentation

The D2PRL cascade mean correction also resolves the measured EffNet and MGCFDN
source/target browser failures, preserving the original checkpoint, thresholds
and input sizes. This is portable parity work, not a proposed modification to
the reference Mac implementation. Source: `rewrite-segmentation-mean.py`; shared
implementation: `rewrite-d2prl-mean.py`. TNT additionally requires a different
outer cascade for channels-last tensors; its primitive matches actual native
means and three synthetic geometries exactly but its full-network mask failure
remains. A backend must preserve native layout-dependent reductions rather than
assuming logically identical means have identical float32 evaluation order.
No native source or application behavior has been changed.
