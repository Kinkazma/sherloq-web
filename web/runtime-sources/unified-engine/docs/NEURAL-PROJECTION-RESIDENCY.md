# Release idle hybrid sessions before large projections

M1.43 extends the existing CPU session-retirement rule to generic ONNX hybrid
workers, including the two-session MGCF base/ST route. Independent CPU zone
concurrency and ownership of a reclaimable session are separate capabilities.
An idle hybrid session must not force source-coordinate result planes to disk.

Before a segmented projection, the controller compares available admitted RAM
with the full result size plus the existing96MiB staging margin. It retires its
own idle ONNX workers until that plan fits or no such worker remains. If the
plan already fits, sessions stay warm. Active work is not interrupted, raw grids
stay protected, and previous result handles remain valid. Later useful inference
recreates a retired session; this can add model-load cost after a large result.
This rule does not reserve RAM indefinitely or change numerical work, thresholds,
model mirrors, CPU/GPU selection or the shared budget.

Specialized CMSeg/TNT/VIG engines do not expose this generic `releaseIdle` method
and retain their existing lifetime rules. CPU independent-zone behavior is
unchanged. Explicit CPU and GPU choices remain available; no calibration is added.

## Same actual96MP ST source and outputs

The new rich12000×8000 ST hybrid recipe executes the same two large ROI and full
envelope as M1.42, with three real inferences and two retained six-plane views.
All twelve complete output SHA256 values equal M1.42, including float32 map and
target/source planes. Both views retain3370950 native-exact mask pixels. Native
map max/mean error remains1.1444092e-5/1.1170483e-7 on the first view.

| Observation | M1.42 | M1.43 |
| --- | ---: | ---: |
| Load, s | 1.2696 | 1.2268 |
| Analysis including projection, s | 29.4794 | 28.2599 |
| Projection within analysis, s | 11.9190 | 11.4164 |
| Cached second view, s | 9.2045 | 5.6719 |
| NPZ preparation, s | 36.7979 | 30.7088 |
| Peak accounted bytes | 3205063469 | 3191856000 |
| First projection session bytes released | 0 | 1355716525 |
| Second-view planes in RAM / temporary storage | 0 / 6 | 5 / 1 |

Both runs use3GiB, identical source/weights/parameters and one hybrid lane. The
staging-margin decision retires the candidate's session before its first large
projection. First-view planes remain in RAM in both runs; the second candidate
view keeps only `candidates` in temporary storage. Model initialization for any
subsequent new inference would be paid again. Cached projection performs no new
inference. Source and retained planes are not discarded to obtain these numbers.

These are observations on a shared host, not a universal speed claim. The stable
gain is the eliminated idle reservation and its measured storage consequence;
individual timing differences include normal host load. Accounted peaks represent
admitted memory capacities, not browser/driver RSS. NPZ time is archive preparation,
not full paged transfer. Both complete archives were independently read by NumPy.

The new1440014924-byte export has SHA256
`cd4a45f3ffae97fcaec5b8029782a198a960483331d490a2732f86ba46f63946`.
Array bytes are identical; archive metadata records the new version/lifetime
provenance. Final owned memory is zero. See [browser evidence](neural-segmented-mgcfdn-st-large-rich-webgpu-m1-43-candidate-proof.json)
and [complete NPZ verification](neural-segmented-mgcfdn-st-large-rich-webgpu-m1-43-candidate-npz-proof.json).
The larger ST assets and six planes cover the shared generic hybrid memory path;
other variants reuse this adapter evidence, not newly executed96MP networks.

The exact delivery binding checks unchanged model workers and recipe sources,
all full-plane hashes against M1.42, and a fresh copied common API/NPZ/cancel/reload
recipe. A targeted lifecycle test verifies retained sessions when space permits,
retirement for a cached large view, preserved raw grids and prior results, then
session recreation on new useful work. Existing scheduler/ownership/export tests
remain applicable. WordPress cohabitation and other devices remain separate.

The independent [three-zone cost comparison](MGCF-ZONE-COSTS.md) shows that ST
CPU concurrency can outperform one hybrid lane at3GiB. That selection question
is separate from this memory change; no automatic policy is changed in M1.43.
Native code is unchanged. Releasing inactive accelerator sessions before large
output allocations is a reusable native idea requiring its own measurement.
