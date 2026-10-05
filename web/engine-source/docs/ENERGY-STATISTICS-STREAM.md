# Bounded exact energy panel statistics

Internal `summarizeEnergyValues(store,count,quantiles,{budget,signal,onProgress})`
accepts a compact row-major stream of the selected valid float32 panel values.
The caller owns selection and the store. It returns the same q10/q90, central,
low and high mean/variance fields as native energy preparation. Public segmented
ELA energy still requires panel detection, score preparation and region integration;
this primitive is not exposed as a complete energy analysis.

Two radix-selection passes replace the full sorted array: high16-bit counts
identify prefixes containing the four needed order statistics, then low16-bit
counts identify exact float32 endpoints. Interpolation uses the existing qualified
energyQuantile arithmetic. The input ordering is never changed. Mean and variance
filter values in source order into8192-value buffers and reuse the existing NumPy
pairwise reduction. The native float32 casts, inclusive tail/central comparisons
and empty-central fallback remain exact; no approximate histogram quantile or
online variance substitute is introduced.

The shared-budget reservation is at most2MiB, independent of panel size. It covers
at most65536 source floats per read, the high histogram and at most four suffix
histograms, three8192-value reduction buffers and small bookkeeping; ordered reductions use512KiB after rank workspace is released. Input storage
is admitted independently. Count must be positive and below2^31, with exactly
4*count store bytes; every value must be finite and in[0,255]. Progress phases are
energy-quantile-prefix/suffix and energy-panel-mean/variance. Abort, refusal and
consumer exceptions release workspace while leaving the caller-owned store intact.

All216 panel/probe summaries in84 existing native preparation cases match exactly.
This includes empty panel detections, small/odd inputs, histogram bounds, panels
and reductions crossing8192 values. Independent NumPy1.26.4 oracle cases with
1000019 ordered values and two quantile pairs match every statistic exactly;
source data is generated deterministically rather than committed as a large file.
Endpoints, empty central selection, invalid domain, admission and cancellation pass.

The separate Chrome proof uses OPFS under3MiB for a4000076-byte value stream,
checks both full native summaries and cancels during mean preparation. No runtime
calibration is performed: the deterministic data and native oracle are development
test inputs only. See energy-statistics-stream-chrome-proof.json. IndexedDB and
complete segmented energy analysis are not qualified by this stage test.

Reproduce with tests/energy-statistics-stream.test.mjs,
scripts/test-m5-browser.mjs --energy-statistics-stream, and the owned oracle script
scripts/generate-energy-statistics-reference.py. Shared/native fixtures remain
read-only. The only change to existing preparation is exporting its exact pairwise
reducer for this adapter; its implementation and numerical rules are unchanged.
