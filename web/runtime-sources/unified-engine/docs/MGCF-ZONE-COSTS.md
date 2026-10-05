# MGCF: actual three-zone CPU/hybrid costs

This development comparison uses immutable M1.42 and the production common
worker, with CPU and hybrid conditions at the same2GiB or3GiB budget. Each
condition executes three native zones on one cold and two warm tasks:36 actual
inferences per variant. Warm synthetic PNGs change one RGB component outside
every crop, so model sessions stay reusable while the analysis cache is
legitimately invalidated. Crop pixels, model dimensions and thresholds remain
identical; native array oracles are reused and checked. No cache-disable option
or calibration is added to the product.

Chrome154, fresh context per condition, shared host and OS/driver caches. These
are individual functional observations, not a universal device ranking. The
521×389 source isolates useful inference/concurrency; it is not96MP qualification.

| Variant | Budget GiB | Backend / observed lanes | Cold / warm / warm analysis, ms | Peak accounted bytes |
| --- | ---: | --- | ---: | ---: |
| Base | 2 | CPU / 2 | 3397.0 / 2744.1 / 2771.7 | 1654660729 |
| Base | 2 | Hybrid / 1 | 1790.3 / 623.1 / 618.9 | 1935073991 |
| Base | 3 | CPU / 3 | 2152.4 / 1461.6 / 1445.6 | 2993655946 |
| Base | 3 | Hybrid / 1 | 1475.3 / 493.5 / 492.5 | 1935073991 |
| ST | 2 | CPU / 2 | 4080.9 / 3009.5 / 3086.7 | 1665436421 |
| ST | 2 | Hybrid / 1 | 4687.8 / 2872.9 / 2828.7 | 1947467373 |
| ST | 3 | CPU / 3 | 2759.6 / 1540.6 / 1722.2 | 3008696732 |
| ST | 3 | Hybrid / 1 | 5598.0 / 3423.4 / 3334.4 | 1947467373 |

The base hybrid route is useful under both budgets. ST's one hybrid lane has a
small warm advantage over two CPU lanes in the2GiB observation; three CPU lanes
win at3GiB, with more reserved memory. Thus the single-inference warm gain in
M1.42 does not establish an advantage for every multi-zone task. M1.43 leaves
selection unchanged to isolate its separate projection-memory improvement.

Every task reports exactly three inferences and zero raw cache hits. Hybrid
reads one manifest and two graphs on the cold task, then zero model bytes on
both warm tasks. CPU2GiB reads three graphs cold and one per warm task;
CPU3GiB reads four cold and none warm. Reclamation/initialization costs are
included, not removed from the measurements. Every final owned reservation is
zero. These peaks are admitted capacities, not process or driver RSS.

Base has14454 and ST7226 native-exact mask pixels on all runs. Complete mask,
analyzed and candidate arrays are exact. Base hybrid raw max error1.3643503e-4,
projected map1.1983514e-4, within its separately declared1e-3 continuous tolerance.
ST hybrid raw max1.6152859e-5, map1.0669231e-5; target/source also pass1e-4.
Binary masks never use a float tolerance. Repeated hashes are recorded for every
plane and raw grid. Full load→analysis→headless Canvas→raw read→NPZ times are
reported separately from analysis; rendering is not physical-display/WordPress
latency. Oracle comparisons occur outside the measured chain.

Reproduction: `generate-mgcf-zone-warm.py`, then
`benchmark-mgcf-zones.mjs mgcfdn` and `benchmark-mgcf-zones.mjs mgcfdn-st`,
sequentially. Inputs are generated in the excluded build directory; reports
contain only public identities, errors, costs and source hashes.
See [base results](mgcf-mgcfdn-zones-m1-42-proof.json) and
[ST results](mgcf-mgcfdn-st-zones-m1-42-proof.json). No native code was changed;
native ROI scheduling would require its own measured comparison.
