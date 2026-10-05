# Paged Sewar and SSIMULACRA

`segmentedComparison` now automatically pages Sewar (MS-SSIM, RASE, SCC, UQI,
VIFP) and SSIMULACRA when the resident global stage exceeds the budget/module
or former axis guard. The source, coordinates, metric names, undefined-dimension
behavior, cached stages and result surfaces remain unchanged. Butteraugli still
needs its own global storage adaptation; this does not qualify all20metrics96MP.

Each complete logical float64/float32 plane has two32-row cache blocks. These
hold full-width data and preserve neighbors across blocks; they are not independent
image tiles. Dirty blocks flush on replacement, sources survive and owned scratch
is released after its last dependency. Fewer larger transfers replace individual
row I/O, with measured additional read bytes but fewer asynchronous operations.
Shared workspace reservations include64rows ×20planes, temporary buffers and
module headroom. Module cap512MiB; very wide complete row stencils still undergo
real admission. Large arrays live in shared temporary storage without a full heap.

Sewar preserves the SciPy complete-axis running uniform filters, reflected/zero
boundaries, valid convolution and small-image kernel swaps, five/four global
pyramid levels, grayscale, complex MS-SSIM power and NumPy pairwise reductions.
The default `separated` SIMD convolution rounds multiplication/addition separately
inside the same four-product SciPy groups. The measured33-case corpus differs
only by tiny continuous-score rounding. `original:true` (public engine
`cpuKernel:'reference'`) keeps scalar fused CPU arithmetic; technical
`profile.sewarArithmetic:'native'` uses the previous exact compensated SIMD FMA.
There are no binary masks, labels or detection decisions in these five outputs.
No tolerance is applied to undefined dimension/error behavior.

SSIMULACRA preserves the native grayscale path, six area pyramids,11-tap fused
Gaussian passes, Carotene reciprocal iterations, continuous/row/column mean
orders, complete-image2nd-percentile grid penalties, worst4×4 blocks and final
8-decimal formatting. Gaussian SIMD uses the previously qualified exact midpoint
correction, with scalar reference retained. Its33 native formatted scores are
identical, including small/odd dimensions and1MP.

Direct helpers: `comparisonPagedSewar` and `comparisonPagedSsimulacra`, borrowed
segmented image pairs, Budget/signal/onProgress, optional shared temporary session.
Results contain `values` plus workspace/heap/I/O/temporary peak/arithmetic metrics.
Progress prefixes `comparison-sewar-*` and `comparison-ssimulacra-*`. Cancellation
and source/storage errors propagate their original codes; six injected cancel,
read and write cases leave zero budget and stores. Technical forced paging flags
`profile.pagedSewar` / `profile.pagedSsimulacra` support development comparisons;
there is no startup calibration in product code.

Native reference evidence:33cases each in
`comparison-paged-sewar-native-proof.json`,
`comparison-paged-sewar-separated-corpus-proof.json`,
`comparison-paged-ssimulacra-corpus-proof.json`. Node own file-backed storage.
Sewar1MP max native score error1.1368683772161603e-13 (RASE in its native units),
remaining scores<=3.34e-16. Observed21.36s exact→8.41s separated, then6.99s with
block I/O. Counts167342reads/115016writes→8982/3604; read volume1.096→1.867GB,
write volume~749MB. These are concurrent development observations, not a universal
speed guarantee. The RAM workspace rises37.81→44.37MB for1MP; heap remains8MiB.
Full browser evidence is recorded separately after completion of its recipes.

Chrome1MP compressed-JPEG pairs with64MiB budget: Sewar both arithmetic paths
pass native score checks, peak50665472B/final0,8MiB heap. Exact86.94s and
separated87.87s show no speed gain in this I/O-heavy browser run; CPU savings
do not remove external storage cost. SSIMULACRA formatted score exact in20.62s,
peak48416355B/final0. Individual-row browser attempts were stopped after at
least480s/342s without claiming success, once the block implementation was ready.

Integrated segmented Comparison under512MiB checks all20native metrics and two
complete RGB views; histograms/Sewar/SSIMULACRA are explicitly paged. First
view152.63s; changing to difference reuses all five stages/basic scores in0.54s.
Both RGB hashes exact, peak438042624B/final0, no startup probes.
`comparison-paged-integration-proof.json`, `comparison-sewar-blocks-proof.json`,
`comparison-ssimulacra-blocks-proof.json`. The current paged metric stages run
one at a time; independent-stage worker admission remains a performance task.
