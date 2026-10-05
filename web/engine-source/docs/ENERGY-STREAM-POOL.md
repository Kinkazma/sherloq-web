# Useful parallel energy qualities

Segmented `ela.energy` in automatic CPU mode dispatches up to three missing JPEG
qualities together on images of at least1048576 pixels. Capacity comes from the
existing resource profile and shared budget. Reference/single CPU mode and small
images remain serial. Cached scientific planes or encoded JPEG qualities are
reused before new work is dispatched. No runtime calibration or probe runs.

The parent owns all source, encoded and scientific stores. Workers own independent
global JPEG streams and the already qualified energy row recurrence, including
REFLECT101 boundaries and filter state crossing delivery bands. Each batch reads
the source twice, once for encoding and once for residuals, and broadcasts each
bounded band. Per-worker heap/filter/transfer allowances and shared window/I/O
space are admitted before stores, so outputs spill instead of exhausting the
source window reserve. No whole RGB or energy plane is copied between workers.

The scheduler observes only completed useful work. Memory/worker/storage failure
reduces the future ceiling and retries only unfinished qualities serially. On
close failure, completely closed companions are flushed and published first.
Consumer/progress exceptions and cancellation are not treated as resource failure.
Workers terminate and outstanding parent storage requests drain before temporary
planes or encoded files are deleted. Completed planes remain in source caches.

Chrome154,1031×1024 native PNG,96MiB shared budget: three workers, two source
passes, all three native Float32 plane hashes exact. Two output planes use RAM and
one uses OPFS; peak94674857 accounted bytes. Development-only injected allocation
failure during the second close preserves two companions, retries one, keeps all
three native hashes and lowers the next ceiling to one. Cancellation during
rendering removes unpublished planes and leaves original storage intact. Final
budget and temporary storage are clean. See `energy-stream-pool-chrome-proof.json`.

The public API proof `segmented-energy-chrome-proof.json` now runs automatic CPU
with four hardware threads hinted and requires three useful quality workers on
its first analysis. It verifies scientific outputs, profiles, retained handles,
progressive NPZ, hard abort and exact retry through the worker client. These are
development checks; no injected failure or preflight exists in the runtime.
