# Global SSIM from bounded convolution bands

SSIM now falls back automatically when the resident comparison workspace does
not fit. Native float64 Gaussian convolutions use five rows of real neighbor
pixels on each side of a band. Only its valid interior is persisted. The entire
raw SSIM plane remains available for global min/max and score reduction, then
native normalization and inversion produce the display. No tile score is
averaged and no per-tile normalization is used.

Independent convolutions use the maximum useful workers admitted by the shared
budget. The acquisition plan reserves native heaps, halo staging and result
pages. The original image/reference remain borrowed; raw storage and workers
are disposed on completion, failure and cancellation. CPU reference arithmetic
remains available. `profile.pagedSsim` forces this storage path for development;
ordinary callers need no additional parameter. `metrics.pagedStages` records
core rows, halo, worker count, heap and raw-plane size. Public comparison result,
coordinates, rendering options and numeric score contract remain unchanged.

132 native views (including1×1, one-row/column, odd edges and1MP), with two-row
cores, remain byte-exact. Score max absolute error5.995204332975845e-15 comes
from the final global reduction order; no visible/binary decision changes.
Chrome worker API1MP/128MiB, two useful convolution workers: plain SSIM2.13s,
equalized gray1.89s; both full native hashes and score tolerance pass. Peak
accounted123336704B; stage reservation34865152B, heap12582912B, scratch8388608B.
Cancellation through the worker API clears the owned image/session state as
already specified by that API. Top-level worker telemetry was subsequently
aggregated from the paged stages; numeric execution was unchanged.

Proofs: `comparison-paged-ssim-proof.json`,
`comparison-paged-ssim-browser-proof.json`. This extends SSIM only. The six
streamed basic measures remain acquired; histograms, Sewar, Butteraugli and
SSIMULACRA retain their existing large-image limits until their own extensions.
No complete20-metric96MP or WordPress UI qualification is claimed here.
