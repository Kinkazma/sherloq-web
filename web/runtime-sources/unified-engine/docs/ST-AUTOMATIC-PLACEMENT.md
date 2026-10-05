# Source/target placement uses useful independent zones

M1.44 gives MGCF ST a measured automatic CPU preference when at least three
distinct requested rectangles can run on three independent CPU lanes under the
shared budget and available logical processors. ST's hybrid head still runs on
one CPU thread; its single-inference advantage does not automatically beat
parallel whole-graph CPU work. [The independent comparison](MGCF-ZONE-COSTS.md)
measured this effect with the previous fixed runtime at2GiB and3GiB.

The preference is model-specific (`preferCpuAtConcurrentZones:3`), not a device
brand test or a universal performance prediction. Explicit `cpu` and `webgpu`
requests take precedence. When three CPU lanes do not fit, existing GPU
capability/budget selection applies. One rectangle, two rectangles and duplicated
bounds do not trigger this preference. Base MGCF and other models keep their
existing selection. Cache-only reprojection preserves its original backend.

The selector and actual CPU scheduler share the same capacity calculation:
single-thread512MiB ONNX ceiling, pinned asset staging, source/crop copies,
native-grid pins, current owners and useful zone count. Source and unrelated
active allocations remain protected. Only the controller's own idle inference
reservations are treated as reclaimable. Thus already-warm CPU sessions do not
artificially make their own three-lane plan appear too large on the next task.
All real allocations still use the shared budget, with the existing pressure
backoff. No inference, benchmark, calibration, persistent device profile or
unbounded preload runs before useful work.

The decision is exposed through the existing result/NPZ `backendSelection`
reason `parallel-cpu-zones-fit-preference`. Execution metadata reports the actual
CPU lanes and backend; it never presents CPU work as GPU. The same original CPU
model or separately verified GPU mirror is used. No graph, weight, numerical
threshold, precision, resolution, region or mask semantics change.

## Actual automatic selection

The development recipe configures both pinned mirrors and uses the same public
three-zone inputs/native oracles as the explicit CPU/GPU comparison. Each budget
runs one cold and two warm tasks, every task performing three new inferences.
Only a source pixel outside all zones changes between tasks. Model reuse is
therefore real, while raw-grid cache hits remain zero.

| Budget | Automatic route / lanes | Cold / warm / warm analysis, ms | Model requests |
| --- | --- | ---: | --- |
| 2GiB | Hybrid / 1 | 4941.2 / 3099.9 / 2924.3 | 3 / 0 / 0 |
| 3GiB | CPU / 3 | 3562.7 / 1779.4 / 1716.2 | 4 / 0 / 0 |

All18 actual inferences pass native continuous tolerances and exact mask checks;
all output and raw hashes stay stable within each backend. Every task has7226
native-positive mask pixels. These are shared-host observations, not a new
universal speed ranking; the earlier explicit comparison remains intact. The
three-lane choice spends more memory to exploit useful CPU concurrency.

[The automatic recipe](mgcf-st-auto-placement-m1-44-candidate-proof.json) records
complete timings, memory, actual lanes, selection reason and model reads. Its
runtime execution-source hashes are bound to the delivered copy. A fresh copied
JPEG/common-worker recipe separately configures the GPU mirror and verifies
automatic CPU selection with three active lanes, raw/native planes, cache-only
view, independently owned full NPZ, cancellation after two workers start and
source reload. See `st-placement-delivery-binding.json`.

Existing CPU and hybrid96MP memory paths remain qualified separately: CPU ST
M1.32 and hybrid ST M1.43. This change chooses between those paths; it introduces
no new heap, graph, source layout, projection algorithm or export storage. The
binding identifies the unchanged numerical modules and the limited controller
changes explicitly, rather than claiming a new96MP network run. WordPress
cohabitation and other physical devices remain separate integration work.

Tests cover distinct bounds, available cores,2/3GiB, retained source and unrelated
active owners, reclaimable own sessions, explicit choices, other-model isolation,
and existing scheduling/pressure/cancellation. No native code was changed; a
native placement policy would require its own workload measurements.
