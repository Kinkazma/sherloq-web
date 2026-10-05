# Native reuse assessment: compact illuminant histograms

The segmented browser implementation processes one row of cell histograms, emits
local unit vectors/counts/areas/validity, and accumulates the full768bin histogram
with exact integer additions. Angles and colors follow only after the complete
source global estimate is available. This retains the original sum domain and
NumPy-compatible float64 pairwise order inside each256bin estimate.

On the declared12000×8000image with32pixel cells, histogram workspace becomes
1152000bytes instead of288000000bytes. Compact returned cell data is3843774bytes.
The complete native rendering and cell statistics were compared in
`segmented-illuminant-chrome-proof.json`; existing1e-12 scalar tolerance is retained,
with exact integer data and RGB output hashes. These are browser observations.

No native Mac source was changed or benchmarked. The native module already has a
bounded execution implementation; any reuse should first compare that existing
path. Compact estimates can be reused across display modes. Retaining all cell
histograms is useful only if changes of estimator/transfer need that cache and
its memory is admitted. A native adoption must preserve partial cells, exclusion,
global bins and arithmetic order, and measure its own complete path.
