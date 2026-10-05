# Reclaimable ONNX sessions — M1.37

The downstream ONNX workers of GPU VIG, TNT and CMSeg generalization remain warm
between useful inference requests if the shared budget leaves enough room.
Their existing single-threaded512MiB heap limit and pinned model bytes remain
unchanged. No new session starts until actual requested work reaches that stage.

An explicit lease protects each worker during its RPCs. CMSeg keeps that lease
through the correlations needed by its decoder. During the independent GPU
backbone the old downstream worker is idle: the shared-budget reclaimer can
terminate it before evicting parameter bytes or result grids. If reclaimed, the
next dependent stage creates and verifies it again. Construction failures undo
their reservation; failed inference retires the worker. Disposal remains complete.
CPU VIG/TNT and native-backbone CMSeg preserve their existing policy of releasing
the old downstream worker before admitting useful CPU backbone workers. The
addnoise CPU path preserves its existing reuse. No CPU threads are multiplied.

This increment keeps M1.36 parameter caching in both baseline and candidate.
Only idle-session lifetime changes. Precision, source/model geometry, thresholds,
ordered GPU kernels, global graph/correlation behavior and CPU choice are unchanged.
The session helper reserves the same conservative heap/model capacity as before;
retaining that capacity may increase the peak when it overlaps the next backbone.
The budget can reclaim it during real work, without calibration or inference probes.

## Qualification protocol

`study-session-reuse.mjs` runs three actual production GPU inferences against the
same pinned positive RGB and declared2GiB budget, first using immutable M1.36,
then the candidate. No analysis/raw-grid cache supplies the output. HTTP counters
separately count parameters and ONNX assets. A fourth candidate run follows an
actual idle-budget shrink to6MiB and restoration. Fresh Chrome154 browser per
condition; OS/driver caches are not flushed and workstation load is shared.
Every output is checked against the native probabilities/mask and other runs.
A separate1GiB VIG run exercises natural session eviction during useful work.

The six2GiB component reports and one1GiB report preserve timings, source hashes,
requests, capacity and output hashes. The delivery binding verifies their exact
source relationship to the copied runtime. Whole-source96MP qualification uses
VIG, the largest retained parameter cache, on the existing rich12000×8000 JPEG,
two large ROI and the full source envelope, then a cached view and four-plane NPZ.
Earlier distinct TNT/CMSeg96MP paths remain valid for their unchanged arithmetic,
source projection and export; the shared session admission/lifetime is exercised
with their actual component inferences and pressure, not inferred from VIG alone.

## Actual2GiB observations

| GPU model | Warm ONNX requests / bytes before → after | Warm model-load time before → after | Peak accounted bytes before → after |
| --- | --- | --- | --- |
| VIG |1 /28,780,877B →0 /0B |237.7–251.4ms →2.2ms |972,715,985 →1,183,749,073 |
| TNT |1 /28,780,560B →0 /0B |237.1–247.8ms →1.9–2.4ms |889,713,244 →1,088,214,620 |
| CMSeg generalization |2 /12,010,557B →0 /0B |317.9–329.9ms →0.9ms |1,346,857,604 →1,346,857,604 |

The measured model-load field includes already-warm parameter reads; it is not a
pure ONNX compiler timer. All probability SHA remain identical to M1.36 and
within the same native errors documented for M1.36. Native foreground masks are
exact (VIG7,256, TNT8,009, CMSeg2,611). CMSeg retains ten correlation workers under
this2GiB budget. GPU transfer bytes and arithmetic are unchanged.

Warm total observations: VIG4.6929/5.8920s →4.4799/5.6041s; TNT6.3248/8.5261s
→6.0862/7.9632s; CMSeg10.2713/10.0775s →13.8118/10.0208s. In the slower CMSeg
sample, correlation takes12.0042s versus7.6796s baseline despite identical ten
workers and output. Shared-load timing variation is retained openly: the local
initialization/read saving is measured, but this is not a claim that every full
inference is faster. No cold-start gain is claimed. After6MiB idle pressure all
three recreate their model worker, produce the same probabilities, and release
all ownership on disposal. VIG/TNT temporarily overlap the old ONNX heap with
backbone memory; CMSeg's existing correlation peak already dominates that overlap.

At1GiB VIG naturally evicts its inactive session once during each warm backbone,
then recreates it for the tail. It preserves all511 cached parameters (zero HTTP
parameter requests), identical output SHA and exact native masks. The accounted
peak is1,039,169,489B below1GiB; final ownership is zero. This is an actual useful
inference pressure response, not just an artificial idle-budget shrink.

## API

`execution.sessionCache` adds current-operation `creations`, `reuses` and
`pressureEvictions`, plus `enabled:true`, to execution/provenance/NPZ metadata.
These count model-worker lifetime events, not individual CMSeg decoder/bypass
ONNX graphs. The HTTP evidence lists those two assets separately. Duplicate ROI
and raw-grid cached jobs do not inflate the counts. Cache-only reproject reports
zero new session work. Evictions before an operation are not counted in it.

Unit tests cover lazy acquisition, retained identity, active-RPC protection,
idle reclamation before result grids, failed construction, explicit CPU-style
retirement, final ownership, and zero-work cached-view telemetry. Real copied
API qualification includes GPU cancellation and source reload; NumPy reads every
exported plane, CRC, SHA, dtype, source coordinate and cache metadata independently.
All budget figures are explicitly accounted capacity, not browser-process RSS or
GPU-driver residency. These proofs do not certify shared WordPress cohabitation
or other physical devices.

The native Mac code is untouched. A reusable idea is to protect a downstream
session only while its dependent computation needs it and otherwise make its
retained capacity reclaimable. Any native session/parameter caching change needs
a separate Mac measurement; browser initialization savings do not prove one.
