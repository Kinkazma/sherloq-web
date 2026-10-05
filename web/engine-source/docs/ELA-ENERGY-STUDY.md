# ELA energy — CPU engine and qualification

Version0.28 exposes `ela.energy` from portable sources
`src/energy-*.js`. Legacy peer biomes, background/Ghost corroboration and complete
analysis remain unavailable. The API has actual original-byte worker qualification on the declared corpus.
Use immutable versioned archives and post-extraction proofs for delivery.

Residual RGB8 differences are converted to float32 luminance with the native
accumulation order. SIMD groups of four and scalar row tails contract different
first products; using one expression for every pixel changes results. Both orders
match all16,777,216 residual colours. The subsequent7×7 reflected box filter uses
the native binary64 rolling accumulators. Sixty generated original/recompression
pairs, including tiny images, odd tails and1MP, match gray and energy bytes exactly.
Three primitive tests cover this evidence, admission and cancellation.

## Bounded logarithm

Direct `Math.fround(Math.log(x))` differed from native float32 log on367 of the
initial million energy-ratio probes. A generated numerical table supplies only
the necessary sparse corrections, plus guards near float32 rounding midpoints.
It is fixed scientific reference data, not a performance profile, OS dispatch,
calibration or runtime image probe.

Every positive float32 bit pattern from2^-11 to2^11 inclusive was compared:
184,549,377 values. The domain contains all ratios of8-bit residual energy with
the native0.25 floor in either direction. Inputs outside this domain are refused,
never clamped. There are10,863 entries:86,904 raw bytes,73,382 gzip bytes, plus a
small bucket index. No native macOS library or proprietary implementation is
loaded in the browser. Native NumPy1.26.4 environment/binary identity and every
chunk hash are recorded in `fixtures/ela-energy/log-domain.json`.

The full domain matches in Node, Chrome154, Firefox155 and WebKit26.6. Public
browser proofs include the exact helper-source hash in `ela-energy-log-*-proof.json`.
These are functional comparisons, not speed claims or physical-device coverage.

## Exact preparation and masks

The public resource-admitted preparation now reproduces84 native cases exactly:
low/high float32 maps, int32 scope, quantiles, central/tail means and variances.
It retains NumPy's8192-value reduction chunks and float32 boundary comparisons.
Cooperative radix sorting keeps cancellation available during percentile work.
The median of three signed scores is clipped once, equivalent to the native
median of separately clipped low/high scores, reducing live typed buffers.

Pixel hysteresis reproduces624 generated native cases, including zero thresholds,
float32 comparison boundaries, eight-connected components, independent allowed
masks, disconnected territories, strong-pixel minimums and region summaries.
512 stable panel/class RGB colours match the native BGR reference after explicit
channel reversal. No hull filling or invented panel-wide mask is performed.

Automatic scientific profiles match51 tail-knee estimates,81 one-sided Otsu cases,
42 profile snapshots and20804 decimal roundings. The UI's **Conservative** profile
id `standard` remains fixed at1/99 percentiles and5/5 deviations. Native ids
`sensitive` and `conservative` label the adaptive Aggressive and Sensitive UI
choices respectively; they must not be confused with the fixed default.

All these public fixtures pass Node, Chrome154, Firefox155 and WebKit26.6.
See `ela-energy-masks-*-proof.json` and `ela-energy-auto-*-proof.json`; preparation
and mask tests also cover admission/cancellation. This is numerical validation
of the constituent functions, not full product or physical-device coverage.

## Complete original-file path

51 native `ElaBiomeEngine.prepare` cases now qualify the complete energy path
through the actual browser-worker API: original RGB bytes, three JPEG probes,
blurred energy, histogram reference, scientific profiles, masks and region summaries.
Inputs include progressive/custom-table JPEG, EXIF rotation, alpha PNG,16-bit TIFF
and a1MP generated panel image. All five arrays are byte-exact in Chrome154,
Firefox155 and WebKit26.6. Original-byte provenance, cache ownership, source
cleanup, useful-work cancellation/reload and exports are exercised.

At1MP, the existing global-budget JPEG pool executes three independent quality
probes with one codec thread per worker, returning native-exact energy planes.
There is no preflight calibration or new quantization. Smaller images and CPU
single mode run serially. The separate offline benchmark records cold/warm,
transfer, display submission, accounted memory and local/full-chain tradeoffs.
Panel geometry is cached independently of JPEG quality and histogram bounds.

JSON and NPZ retain the exact float32 planes/scores and int32 scope/labels. An
actual Node API NPZ was loaded independently by NumPy with `allow_pickle=False`;
all arrays, shapes and metadata matched. See `ela-energy-npz-proof.json` and the
three `ela-energy-pipeline-*-proof.json` reports. The layer contract contains
scalar maps and class labels, with stable colours, not a native composite RGB view.

The final regression passes174/174 tests, with no skips. The three browsers also
execute all38 callable operations in the runtime smoke test; this count is not
full50-panel coverage. Shared-memory refusal and cancellation release resources.
See `ela-energy-release-validation.json`. No WordPress or physical-device
integration is claimed. Legacy
peer biomes and the combined complete-analysis variants remain separate work.
D2PRL retains its pending numerical correction/complete-port work. Forgeryscope
Auto remains queued by user instruction until these existing tasks are finished.

## Offline resource decision

The final isolated Chrome154 run on the development M1 Max (10 CPU cores,
64 GiB RAM) used the maximum compute profile and three alternating useful
fresh-engine trials per mode. All measured results were compared with native
arrays outside the timed interval. Browser/network caches were not purged;
these are engine-cold trials, not a cold operating system. See
`ela-energy-benchmark-chrome-proof.json` for every trial, source hash, stage,
warm reload, transport and cache measurement.

| Generated input | CPU single / automatic | Load ms | Analysis RPC ms | Full chain ms | Peak accounted bytes |
| --- | --- | --- | --- | --- | --- |
| 259×193 | single | 99.3 | 189.4 | 289.4 | 90,485,129 |
| 259×193 | automatic, 1 worker | 99.4 | 190.9 | 293.0 | 90,485,129 |
| 1031×1024 | single | 108.6 | 2138.7 | 2261.0 | 225,621,441 |
| 1031×1024 | automatic, 3 workers | 104.6 | 2172.2 | 2291.5 | 397,882,769 |

Entries are medians of individual measurements; their medians need not add up.
The full chain includes label colourization and Canvas submission, not native
composite rendering, physical paint or WordPress. Memory is budget accounting,
not process RSS or a guarantee about browser GC. The 1MP result-cache RPC medians
are14.5/15.8ms; the first warm-engine reload analysis is1954.5/1928.6ms.

At1MP, JPEG recompression plus energy primitives improve locally from200.2ms
to100.4ms (1.99×). The three useful workers are retained for this measured local
gain, with their additional172,261,328 accounted bytes explicit. End-to-end
superiority is **not established**: preparation dominates and run variability
exceeds the small full-chain difference. No small-image parallel gain is claimed.
Single mode remains available. There are no discarded warmups, user-path probes,
persistent performance profiles, new precision changes or hidden resizes.

An earlier instrumented investigation found panel traversal dominant in score
preparation. Explicit eight-neighbour traversal preserves discovery order, and
panel proposals now have a separate per-image cache. Changed histogram bounds
reuse this geometry; native arrays and all144 panel cases still match. This
cache correctness is tested independently of the timing claims above.
