# Useful parallel ZERO vote bands

The segmented public ZERO path now passes its resolved resource-profile worker
limit to the vote stage. From1048576 source pixels, it starts the largest useful
worker count admitted by the shared budget, capped by remaining64-row bands and
profile capacity. Smaller sources and single/reference CPU modes remain serial.
This threshold is a static scheduling choice, not a calibration input.

The parent writes native luminance once to its compact RAM/temporary plane and
releases its native luminance heap before worker admission. Children receive only
requested luminance bands plus seven-row halos, execute the same qualified ZERO
kernel, and transfer compact selected votes back. The parent restores global grid
phase, writes each band, and then commits its global counts and native tie positions.
Connected regions/closing remain subsequent whole-image calculations.

Per-worker admission is native workingBytes plus twice the maximum byte band and
1MiB messaging allowance. Native heaps remain16–128MiB according to width, and no
full Float64 luminance image or full Int32 vote image is copied to each worker.
The parent terminates workers before allocating its global-significance kernel.
Progress zero-votes is monotone by completed rows despite out-of-order responses.
Metrics include selected workers, scheduling maximum/ceiling/resource reduction,
preflightExecutions:0, child heap capacity and total child heap maximum.

Adaptation observes timings of completed requested work only. Resource failures
reduce the next ceiling; completed vote bands are preserved in the output store.
Only missing bands run through the serial fallback. Global counts commit after a
successful band write, preventing duplicate counts on retry. All worker promises
and source I/O settle before reservations/stores are released. Cancellation stops
the children and removes unpublished planes. No runtime canary, warm-up or probe
is introduced.

Chrome154 development proof:1024² native original and JPEG99 votes are exact with
three workers and128MiB. Global main grid/significance match native. A deliberately
injected MEMORY_LIMIT in the second worker batch preserves the first three bands;
remaining serial work yields the exact original votes and scores, and the next
request uses ceiling1. Cancellation leaves no scalar files. Peak accounted memory
105338880 bytes, three16MiB heaps, final budget0/storage clean. Failure injection
exists only in tests/zero-stream-pool-proof-worker.js, never runtime.

The public segmented-zero browser test uses two workers under96MiB (peak92727296
bytes) and separately exercises adaptive dispatch,
views, masks, NPZ, ownership and hard cancellation. See zero-stream-pool-chrome-proof
and segmented-zero-chrome-proof JSON. Run scripts/test-m5-browser.mjs
--zero-stream-pool. Global region parallelism, arbitrary extreme dimensions and
IndexedDB worker-band performance are not claimed by these tests.
