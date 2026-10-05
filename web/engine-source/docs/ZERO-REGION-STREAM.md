# Global ZERO regions with bounded storage

Internal `segmentedZeroRegions(votes,width,height,options)` continues the compact
vote stage. Public `jpeg.zero` remains on the existing contiguous path until
rendering and progressive exports are connected. This stage never splits region
connectivity into independent tiles and never resizes the source.

Options require the shared `budget`; accept `signal`, `onProgress`, segmented
storage/session options, `gridToExclude` (default -1), and `gridMax` (default 63).
For the missing-grid pass supply JPEG99 votes, `gridMax:0`, original `excludeVotes`
and source `excludeGrid:main_grid`. Input planes remain immutable.

Eligible compact votes are copied to a mutable paged scratch plane. Region growing
uses the original Chebyshev radius9, whole-image components, bounding rectangles,
minimum size and native log NFA. A paged uint32 queue supports components larger
than RAM. Traversal order within a component does not alter membership, bounds or
significance. Sorting meaningful components by their minimum x-major seed restores
the native output order. Returned region fields are inclusive x0/y0/x1/y1, grid,
and log10_nfa. This score is not a manipulation probability.

Two native closing passes read64 output rows plus9-row halos. They preserve the
original unusual edge rule: only interior centers dilate; only interior zero
centers of the intermediate dilation erase pixels. Generic border-reflected
morphology would produce a different result and is not used.

Results own two compact byte stores, `mask` and `maskReg`, holding native0/255
values, plus a regions array. `dispose()` releases both stores and region metadata.
Scratch working votes, queue and intermediate dilation are deleted before return.
The stages report zero-regions, zero-regions-component and zero-closing progress.
Cancellation, exceptions and memory refusal discard unpublished owned stores.

Pagers reserve at most64×64KiB each for working votes/output mask and4×64KiB
for the queue, plus one extra page per pager. Closing has a separately admitted
native heap rounded to16MiB from8MiB+3×width×min(height,82), plus8MiB allowance
and two band buffers. Initial store admission protects9MiB for the pagers.
Each reported region reserves256 bytes. Five logical temporary planes total
8 bytes/pixel (including the uint32 queue); only the two output byte planes remain.
Sources and vote results are admitted separately. The signed native pixel domain
and maximum width65500 are retained. Explicit memory/storage failures remain
possible; this is not an unlimited-image claim. No runtime calibration is used.

Validation: all76 native ZERO cases match foreign/missing raw and regularized
mask hashes, region bounds/grids/order, and NFA within the existing1e-10 bound.
A separate three-component synthetic case compares directly with retained native
`detect_forgeries`, including left/top edges and band crossings, and explicitly
checks x-major result order. Pager eviction/writeback/hit/refusal/abort tests and
region consumer-error cleanup pass. Browser qualification is recorded separately
in zero-region-stream-chrome-proof.json. Chrome154 under96MiB processes the
1024² native reference with all region planes forced to OPFS: all four masks and
three missing regions match native, with29695 foreign components and37 missing
components. Native closing heap16MiB, whole-test peak76911616 bytes. Both
cancellation points remove scratch files; final memory/storage cleanup passes.
The complete browser test (votes, cancellation attempts and both region passes)
takes6.67 seconds in this development run. This is not a user-side calibration.
IndexedDB and extreme multi-megapixel region workloads are not yet qualified.

Run `node --test tests/byte-pager.test.mjs tests/zero-region-stream.test.mjs` and
`node scripts/test-m5-browser.mjs --zero-region-stream`. Building the existing
ZERO adapter now also exports minimum-size, region NFA and band closing functions;
the original retained ZERO source remains unchanged.

Public integration is now qualified separately in [SEGMENTED-ZERO.md](SEGMENTED-ZERO.md).
Earlier descriptions of pending integration describe this primitive stage alone.
