# Global Butteraugli with bounded external images

The retained Google Butteraugli source now has an external `Image<T>` backing.
It keeps full logical dimensions and four16-row cache blocks, sufficient for the
largest47-row blur stencil. Source, psycho-images, masks, channel differences
and final map have bounded native residency; maximum disparity/error search and
score reduction cover the complete image. No tile-local Butteraugli score is used.

The two convolution transposes are replaced by horizontal and vertical access
to the same logical coordinates. Each output preserves the native weight/border
normalization and sum order: non-fused four-product prefix, fused scalar tail.
This avoids a random-write matrix transpose in storage. The full `diffs` vector
in Malta becomes an external image plus nine complete rows, padded exactly at
original image boundaries; all directional sums and nonlinear objectives remain.
The original source and copyright notices remain in `vendor/comparison` and the
adapted source. `scripts/adapt-butteraugli-paged.py` applies auditable storage
changes, while the build retains the established LLVM FMA contractions.

`comparisonPagedButteraugli(images, output, options)` borrows two segmented RGB
surfaces and an optional RGB byte store. It returns the native six-decimal score,
heap/workspace/I/O/temporary-peak metrics; the requested complete heatmap streams
to the caller's store. Existing grayscale conversion, linear-light LUT, all
opsin/masking operations, small-image border extension and color heatmap remain.
`original:true` / engine `cpuKernel:'reference'` preserves scalar FMA evaluation.
Temporary arrays are released after their last dependency. Errors retain codes,
with cancellation/read/write injection now spanning80rows to force cache eviction.

`segmentedComparison` selects the paged stage if the former resident module or
shared budget cannot fit it. Technical forcing is `profile.pagedButteraugli`.
The other paged metric stages and common cache/export contracts are unchanged.
The plan reserves32MiB plus72complete64-row float caches and staging, with a
1GiB module ceiling. Real wide-row capacity remains checked. This does not remove
physical memory/quota constraints or claim unlimited image dimensions.

33 native pairs, including odd, narrow, tiny, noisy and1MP cases, have identical
scores and full heatmap hashes. The1MP file-backed test uses52,756,480B workspace,
13,631,488B native heap,213,909,504B logical peak scratch; reads1,207,959,552B and
writes696,778,752B. Observed151.04s under concurrent development load. No startup
probe runs in product. Browser and96MP evidence is recorded after each completes.

Chrome OPFS1MP/64MiB also returns the exact native score7.264762 and complete
heatmap SHA c7a25bc6211ba172a3de24f1904ad87add129f5018318c1f2ebbfa87cb52a050.
Peak accounted59,054,080B; after source disposal the test asserts budget0.
Observed1241.205s under concurrent development: external storage and current
scalar arithmetic have substantial cost, so no speedup is claimed. Complete
20-metric integration and96MP qualification are still running/preparing.
