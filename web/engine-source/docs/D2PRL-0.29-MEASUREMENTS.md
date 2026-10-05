# D2PRL 0.29 development measurements

Supplement to the immutable0.29 release; these results do not replace either ZIP
or its source manifest. [Machine-readable report](d2prl-worker-chrome-benchmark.json).
The script already shipped in the source ZIP. The runtime was loaded from its
verified extracted archive,233files, SHA256
`3c0be0e94e8206bcd3cd057a808c875be27a1d924ed1b4ea33e598243cf38155`.

Chrome154.0.8037.58, M1Max host,10 reported logical CPUs, high-performance WebGPU
adapter reporting Apple/metal-3. The runtime selects by capabilities, not brand.
Four sequential requested analyses, no calibration or throwaway warm-up. Each
uses the same generated521×389 PNG, fixed448/40/seed22 model, minimum500 and a
shared3GiB budget. Original-file decode, model manifest verification, full worker
analysis, source-mask rendering and NPZ export are real operations.

| Backend | Browser state | Run RPC (s) | Source through display submission (s) | Source through NPZ (s) |
|---|---|---:|---:|---:|
| cpu | New browser context | 445.648 | 445.790 | 445.845 |
| cpu | Warm browser caches; new engine | 441.693 | 441.815 | 441.867 |
| webgpu | New browser context | 237.860 | 238.027 | 238.079 |
| webgpu | Warm browser caches; new engine | 219.719 | 219.829 | 219.883 |

GPU run time is1.87× lower for the paired cold contexts and2.01× lower for the
paired warm-browser/new-engine observations. A warm browser cache does not mean
a retained neural session or a cached scientific result: each row makes one real
inference. These are individual development observations, not statistical estimates
or guarantees on another machine. Desktop applications and concurrent lightweight
development were active; system-wide exclusive load was not established.

All four source maps, binary masks and source/target role masks match the native
reference exactly. Four requested refilters per run (0,17,5000,500) each reuse one
cached raw grid with zero inference; RPC time139.4–169.1ms across the16 calls.
The already delivered raw-role proof separately records residual errors ≤4.77e-7
with no sign changes. This benchmark does not replace that scientific proof.

Peak admission is3,220,575,215bytes for CPU and2,259,084,271bytes for GPU, both
below the same3,221,225,472byte limit. These totals include conservative helper
heap ceilings and owned buffers; they are not resident RAM measurements. The
post-unload snapshots have zero active reservations, retained image bytes and
cache bytes. A known32MiB codec heap is separately reported; worker disposal then
ends its lifetime. NPZ size is3,051,487bytes CPU /3,051,507bytes GPU because execution
metadata differs. Arrays were checked independently by the existing NPZ recipes.

Timing boundaries remain explicit in the JSON: source fetch2.3–4.8ms, source
decode RPC72.1–120.8ms, manifest verification17.5–30.9ms, NPZ RPC51.9–55.1ms.
RPC minus engine time0.7–0.8ms combines dispatch, serialization and transfer; it
is not an isolated PCI/GPU transfer measurement. Progress milestones include
fetch/verification and should not be presented as isolated kernel timings.
The headless Canvas submission and two animation frames are not physical display
latency. No quality, precision, resolution, thresholds or model changed between
CPU and GPU. CPU remains selectable.

This closes the planned measurements for this release. D2PRL integration and its
real WordPress recipe remain B's next step; physical Safari/mobile and non-Apple
hardware are not qualified by these observations. No production action occurred.
