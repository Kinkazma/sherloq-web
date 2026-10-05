# Verified parameter reuse — M1.36

GPU VIG, TNT and CMSeg generalization retain parameter bytes already fetched and
verified for useful work. The session-local cache uses pinned SHA256 and byte
length, reserves exact payload plus an estimated256-byte entry overhead, and
keeps no persistent data. It neither preloads models nor changes arithmetic.
CPU execution remains lazy without this retention. Tail/bypass ONNX session
lifetime is unchanged in this increment, so its effect is measured separately.

Idle parameter reservations can be evicted before raw analysis grids. A cache
insertion only uses free budget; it never evicts a result. Active readers retain
their existing staging/view reservations independently. CMSeg includes reclaimable
parameter bytes when admitting correlation workers, then frees them if required.
Disposal releases every cache reservation. Cancellation and a verified-transport
failure cannot insert invalid bytes. The budget is accounted ownership, not RSS;
Map/key overhead is estimated, while parameter payload capacity is exact.

## Actual component measurements

`study-parameter-reuse.mjs` executes the production GPU inference component three
times against the same positive source, without a result-grid cache. Baseline
uses the immutable M1.35 runtime; candidate uses this increment. Both have1GiB.
A fourth candidate inference follows an actual idle budget shrink to6MiB, then
restoration. Each condition starts a fresh Chrome154 browser. OS/driver caches
are not flushed and other workstation activity varies substantially.

| GPU model | Parameter requests / payload each baseline inference | Warm candidate | Candidate retained capacity | Baseline / candidate peak accounted bytes |
| --- | ---: | ---: | ---: | ---: |
| VIG |511 /341,539,200B |0 /0B |341,670,016B |631,045,969 /972,715,985 |
| TNT |361 /259,304,320B |0 /0B |259,396,736B |630,316,508 /889,713,244 |
| CMSeg generalization |260 /9,031,936B |0 /0B |9,098,496B |1,055,643,012 /1,064,741,508 |

All repeated baseline/candidate probability hashes are identical. Native masks
remain exact: VIG7,256, TNT8,009 and CMSeg2,611 foreground pixels. Maximum/mean
absolute native probability errors remain respectively7.808209e-6/2.854374e-7,
3.129244e-6/1.226219e-7 and1.639128e-5/6.403390e-8. CMSeg retains six correlation
workers. After pressure,506/358/256 parameter requests refill the evicted VIG/TNT/
CMSeg bytes; outputs remain identical and disposal ends at zero owned bytes.
Per-inference eviction counts exclude evictions completed before that inference.

Warm VIG full inference observations are11.0315/10.2440s baseline versus4.9623/
6.2379s candidate; parameter loading falls from5.8410/3.9136s to3.3/2.9ms.
TNT observations are10.0208/28.5151s versus7.7099/9.3187s; parameter loading from
3.0877/19.2167s to3.4/2.7ms. CMSeg observations are29.9187/38.1658s versus21.1095/
12.3896s, loading11.0663/17.7692s to1.7/0.8ms. The outliers show shared-system
variation; no stable speedup ratio is claimed from these small timing samples.
The directly observed saving is removal of all warm parameter HTTP reads and
repeated verification, with identical outputs and bounded extra residency.
Cold inference still reads every required parameter; no cold gain is claimed.

## API and evidence

`execution.parameterCache` is copied to provenance and scientific metadata. Hits,
misses, hitBytes, fetchBytes and evictions count only the current operation's
actual inference work. Duplicate regions do not multiply the counts. A raw-grid
cache hit or cached-view projection reports zero work; sessionPeakResidentBytes
is explicitly historical. There is no caller switch or calibration step.

The six `parameter-reuse-*-proof.json` files preserve all actual observations and
source hashes. Twenty-one targeted tests cover admission, verified corruption,
pre-abort, lazy CPU behavior, duplicate reads, LRU pressure, lifetime, ordered
zone scheduling and cache-only telemetry. Full API/copy and96MP evidence is
recorded in `parameter-reuse-delivery-binding.json` when delivery is qualified.
The new96MP path uses the largest cache, VIG, and the existing12000×8000 rich
JPEG, two large regions plus the full source envelope. TNT/CMSeg use the same
cache/budget/analysis adapter with smaller payload; their existing distinct
full96MP inference paths remain documented in NEURAL-96MP-COVERAGE.md.

This is browser-engine evidence; shared WordPress cohabitation, other physical
GPUs and remaining engine families are separate work. The native application
has not been edited. Reusable Mac idea: retain only validated parameter storage
between useful requests, prioritize working/result memory, and include cache
bytes in pool admission. Native benefit requires its own baseline measurement;
the browser HTTP savings do not establish a Mac performance gain.
