# Immediate useful computation — 0.13

No user request runs a calibration, synthetic canary, serial baseline, repeated
candidate, or separate warm-up before useful work. Fresh worker engines start
without cookies, localStorage, IndexedDB profiles or previous sessions. Temporary
image storage is a separate facility and never stores performance decisions.

CPU arithmetic, analysis parameters, thresholds, dimensions and precision are
unchanged. Existing original-order CPU and optimized serial options remain.
ELA, JPEG quality/Ghost, ZERO and Noisesniffer worker paths were qualified against
native data before being enabled; qualification runs in development tests only.

## Resource decisions

Each pool initially chooses the greatest concurrency admitted by exposed logical
cores, actual task geometry and the shared engine budget. Noisesniffer reserves
one main worker for full-image means/extrema and uses the remaining admitted
workers for independent DCT bands. JPEG quality workers each have one codec
thread. ZERO preserves its seven-row halos, native minimum band height and
global grid phase. Workers are released after each requested task/pass.

`AdaptiveConcurrency` observes elapsed time per actual work unit after a successful
requested task. A >50% slowdown at the same concurrency halves the ceiling for
subsequent compatible work; three healthy completed tasks recover one worker.
A recognized memory/worker resource failure releases the parallel path before one
exact serial retry, and reduces the next ceiling. Algorithm/validation errors do
not become a fallback. This conservative reaction uses no extra computation and
is not a proof that the chosen count is optimal. Intra-task dynamic band dispatch
and a page-wide broker across separate engine instances remain future work.
Only the latest compatible geometry's observations are retained, in session RAM.

`scheduling` reports the initial plan, `priorUsefulSamples`, `taskExecutions`,
`preflightExecutions:0` and `retry` when one was necessary. ZERO reports each
scientifically required source/JPEG99 vote pass separately. Cache hits can skip
work altogether. No image is silently resized or computed at lower precision.
The shared budget no longer has an arbitrary four-GiB ceiling; actual browser
hints, explicit budgets and individual WASM/GPU allocation limits remain distinct.
Unknown memory uses the documented conservative hint fallback, not a claim of
measured free RAM. No eager reservation of that much physical RAM is performed.

## GPU startup

Frequency smoothing creates only the device and compiled pipeline needed by the
requested mask, then dispatches that mask once. The two CPU preparations generate
the circle and coefficients; they do not compute a comparison mask. The six
synthetic rounding probes and timing repetitions were removed from production.
The recorded development adapters pass exact masks, final images and threshold
counts. Other adapters are unverified; API support alone is not universal numeric
parity. CPU override remains independent; explicit GPU errors stay explicit and
automatic resource/device fallback records its reason. ELA GPU remains an
experimental path rejected by the earlier full-path measurements.

## First useful Noisesniffer result

Sequential Chrome154, synthetic1024×1024, fresh engine for each block size,
maximum profile, ten exposed cores. The first request is timed without separate
warm-up or saved profile. Every native array and region is checked outside the
timed sections. Three subsequent uncached tasks provide the later median.

| Block | Previous0.12 first RPC including calibration | 0.13 first useful RPC | Subsequent median | Active workers |
| --- | ---: | ---: | ---: | ---: |
| 3×3 | 15422.2ms | 2380.4ms | 2208.4ms | 10 |
| 8×8 | 38801.5ms | 1817.0ms | 1726.6ms | 10 |

These are local measurements, not physical-device guarantees. They preserve the
FMA optimization and the independent DCT pool. `noisesniffer-immediate-benchmark.json`
includes source load, first RPC, presentation, cache-view time, memory and actual
scheduling. Source loading is separate from the RPC. The first-call reduction is
6.48× /21.35× against the archived measurement, with ordinary timing variability;
it comes mainly from removing duplicated preflight work.

Reproduce with `scripts/browser-test.mjs --immediate-noisesniffer-benchmark`.
`tests/immediate-pools.test.mjs` verifies exactly one requested dispatch in a new
instance of each of the four pools, and device/pipeline-only GPU preparation.
`tests/adaptive-concurrency.test.mjs` checks resource admission, actual-work
adaptation and idempotent reservations. Browser suites separately verify native
parity, real worker partitions, cancellation/reload and GPU lifecycle. Development
benchmarks remain callable explicitly from experiments, outside the product.

## Other first useful calls

Three fresh worker engines per operation, sequential Chrome154, full1MP.
Checks run outside timers. Medians include worker transfers, codec/kernel startup
and result copies, but exclude source loading and presentation. Loading and
load+RPC are reported separately in `immediate-benchmark.json`.

| Operation | Median first useful RPC |
| --- | ---: |
| `ela.classic` | 73.9ms |
| `jpeg.quality` | 360ms |
| `jpeg.ghosts` | 138.8ms |
| `jpeg.zero` | 1216.8ms |
| `detail.frequency` | 394.9ms |

ELA/quality outputs match the retained serial reference; Ghost/ZERO/frequency
match independent native arrays/views/decisions. No preflight execution or retry
occurred. These timings describe this machine, not a universal speedup.
