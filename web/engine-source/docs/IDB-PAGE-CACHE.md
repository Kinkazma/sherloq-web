# Budgeted IndexedDB page reuse — 0.20

Partial or rotated image windows often read several short row fragments from
one IndexedDB page. Previously every fragment opened a transaction and cloned
that 1 MiB page again. The storage layer now retains the last two requested pages
per array in the engine's existing shared LRU budget. It does not prefetch pages.
Each array's page cap and the global memory limit both apply; an incoming read
may also need one transient page while it replaces an older cache entry.

Cached bytes are copied into the caller's owned window. A write invalidates its
page before transaction/admission, including when that write fails. Array disposal
clears its pages after queued work; session disposal clears all its pages after
the queue drains, including if database removal fails. Implicit zero pages obey
the same rules. The cache cannot change the original bytes or pixel geometry.

Recomputable cache pages are excluded when choosing whether a live source/result
can fit RAM: the existing Budget then evicts them as necessary. This prevents a
page cache from forcing an otherwise admissible owned result into storage. Live
sources and results are still protected from eviction. No new worker pool, GPU
path, reduced precision, sampling, preflight or saved performance profile is used.

The internal storage snapshot reports read transactions, page-cache hits and
requested bytes. The development benchmark can disable caching or remove the
per-array page cap; the shared budget always remains active. Product defaults
retain two pages. This bounded choice targets adjacent-row reuse without filling
the budget with a whole sequentially scanned image.

## Measurement

The benchmark forces IndexedDB for all paths, on identical 4096×4096 synthetic RGB
stores. Five samples alternate cache-disabled, two-page and uncapped-per-array
paths. Every measured read starts with an empty engine page cache. Each output
is checked against an independent coordinate/byte oracle. Window allocation,
storage reads and yields are timed; initial filling, hashes, UI transfer and
display are excluded. Browser/OS storage caches are not flushed. No benchmark
runs in the product. See `idb-page-cache-*-benchmark.json` for all observations.

Development host: Apple M1 Max, 10 physical/logical CPU cores, 64 GiB RAM. The worker
budget is 32 MiB; IndexedDB may itself use browser-managed RAM. Browser qualification
does not imply physical-phone or native Safari qualification. Hardware identity
is measurement context, never a runtime backend-selection rule.

In the Chrome154 observation, the rotated4096×32 window drops from4096 read
transactions to48 with either cache. Two pages retain2 MiB and peak at3,539,040
accounted bytes for that read; the uncapped path retains32,505,856 bytes and peaks
at32,899,168. Median times are2330.2 ms without cache,31.3 ms with two pages and
30.1 ms uncapped. Keeping the additional pages does not reduce transaction count.
The upright256² tile drops256→4 transactions (134.9→2.6 ms). Whole upright row
groups still require the same six transactions (5→4 ms); this small timing change
is not evidence of a general speedup. These are read-stage gains, not decode,
analysis, full UI or native-Mac speedups.

## Correctness and remaining work

The real storage recipe exercises64 MiB arrays, page seams, implicit holes,
overlapping writes after cached reads, real staging-admission failure followed by
successful reread, cache eviction, cancellation and disposal. Node admission
tests ensure cached pages cannot block an otherwise fitting retained result.
The image adapters keep their independent native pixel/mask reference corpora.

Reproduce with `scripts/browser-test.mjs --temporary-storage` and the development
flag `--idb-page-cache-benchmark`, selecting chrome/firefox/webkit as needed.
Complete qualification and image-lifecycle evidence belong in QUALIFICATION-0.20.md.
Physical quota exhaustion, arbitrary process crashes, new array types/algorithms,
WordPress integration and physical-device tests remain separate work.

Firefox155 confirms the same transaction counts. The rotated-window median
falls14977→205 ms with two pages (uncapped211 ms). Upright full rows show no
transaction reduction; all raw samples are retained, including regressions/noise.

WebKit26.6 also keeps the same transaction reductions: the rotated read changes
from2433 to35 ms, and the tile from151 to2 ms. Its uncapped rotated median is
also35 ms. Firefox tile medians are938/16/16 ms. Whole-row medians are23/23/23 ms
in Firefox and5/5/4 ms in WebKit. The two-page default is retained because extra
pages provide no extra transaction reduction in these cases. Every variant has
the same output hash; cleanup leaves zero accounted live/cache bytes.
