# Concurrent global comparison stages

Histogram counts, Sewar, SSIMULACRA and Butteraugli now run immediately in
independent dedicated workers when their complete bounded workspaces fit the
shared budget. Admission uses real useful jobs, up to the profile/hardware worker
count. There is no calibration. Native resident stages keep their previous pool;
SSIM retains its complete-row halo pool after these independent stages.

Each worker owns a uniquely named OPFS session and borrows source windows through
RPC. Parent/worker staging and native working sets are admitted before launch.
Histograms pin their selected resident/external plan; smaller worker budgets cannot
silently change it. Output rows are copied before transfer out of WASM. Parent
sources stay immutable and retain ownership. Successful and failed jobs dispose
their sessions; a crashed/terminated worker's exact session is reclaimed separately.
`profile.pagedMetricWorkers:false` retains the sequential fallback. Without Web
Workers the existing direct path remains. All global algorithms are unchanged.

Chrome native97×99 pair: four simultaneous metric workers, all20scores within
1e-10 relative tolerance, complete Butteraugli and reference views exact; second
view reuses all metrics. Peak280224108B/512MiB, final0. Cancellation, injected
source read error and output write error each preserve error codes, leave budget0
and zero owned temporary sessions. Separate acquired1MP all-paged integration
also has20native-valid scores and two exact views; sequential1651.95s first and
0.595s cached second under concurrent development. No speed ratio is inferred
between different sizes/loads. Full96MP journey is in progress.
