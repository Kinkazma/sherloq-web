# Global histograms under a shared budget

`comparisonPagedHistograms([image, reference], options)` reads segmented RGB
surfaces into exact uint32 counters for all 256³ BGR bins. A source may have up
to INT32_MAX pixels. Each count is rounded to float32 only where the historical
OpenCV formula requires it. If any count reaches 2²⁴, the native corrected
integer-count path and NumPy pairwise reductions apply, including the full-bin
correlation divisor. No independent image-tile metric is averaged.

The default uses 128 MiB of resident counters when the available budget admits
168 MiB. Otherwise two external 64 MiB arrays use bounded page caches. Counts
within an input window are grouped by bin before external updates, without
changing any integer sums. Source windows are bounded even for wide images.
No calibration or canary runs. The current histogram stage is one worker;
external random-bin traffic remains costly under very small budgets.

`segmentedComparison` selects this path when the previous global stage cannot
fit its budget/module or axes. Existing metric names, corrected/historical
correlation provenance and cached metric stages are preserved. Technical
profile overrides are `pagedHistograms`, `histogramResident`,
`histogramCachePages`. Metrics report native heap, workspace, I/O and source
pixels. Progress phases are `comparison-histogram-counts` and
`comparison-histogram-metrics`. Borrowed sources survive; temporary counters
and reservation are always released. Asyncify errors retain their original code.

Five native pairs × resident/external paths produce zero error in all six
metrics: tiny, brightness, random, rare-count and disjoint-count 4097² sources.
The last two exercise counts beyond 2²⁴. Node file-backed tests use only own
`.build` files. Chrome full 1024² JPEG pair also has zero error, both at 192 MiB
and 64 MiB. Accounted peaks are 166464512 B and 55294848 B; native heaps
136380416 B and 26214400 B. Observed stages were 6.45 s and 267.47 s respectively
under concurrent development load: the low-memory path is substantially slower,
not a free substitute for resident counters. Final memory and temporary files
are zero. Cancellation, read and write failures preserve errors and clean up.

Proofs: `comparison-paged-histograms-proof.json`, `comparison-hist-paged-proof.json`.
Commands: `check-comparison-paged-histograms.mjs`,
`check-comparison-hist-paged-browser.mjs`, `check-comparison-hist-errors.mjs`.
This does not yet qualify all Comparison metrics at 96 MP: Sewar, Butteraugli
and SSIMULACRA global workspaces/pyramids are the next implementation work.
