# Adaptive paged dense caches

The global paged matcher used at most4096 cache pages per descriptor plane
(16MiB with4096-byte pages), even when its admitted workspace had room for more.
The new planner sizes every cache from the remaining shared memory budget and
the actual plane lengths. It includes page metadata, resident candidate pools,
optional resident SIFT bounds, and initialization batches. The existing WASM
module's1GiB heap remains respected, with24MiB left for allocator/stack/module
bookkeeping. This is a workspace constraint, not an image-size or time cutoff.

Automatic propagation caches use65% of the remaining workspace. Initialization
first uses smaller caches and the original large sorted batch; after that batch
is released, dirty pages are flushed and caches grow for propagation. The peak
is the maximum of those two phases, not their sum. Small planes stop growing once they
fit. Explicit diagnostic cache/batch arguments remain supported and checked.
Available memory means the engine's shared budget less retained sources/results
and active peer reservations; it is not a claim to read exact OS free RAM.
No calibration, trial inference, rescaling, descriptor approximation, iteration
reduction, tile-local matching or candidate pruning is introduced. The native
traversal and arithmetic remain unchanged; the rebuilt WASM adds cache resizing
after initialization and preserves dirty pages through their owned stores. Optional external SIFT
bounds are unnecessary when the target histograms fit in the cache.

## Validation and scope

`node --test tests/dense-page-memory.test.mjs` exercises shared-budget pressure,
explicit settings and workspace admission up to the existing int32 index range.
Those size-only planner tests do not constitute image execution.

`node scripts/check-m5-dense-cache-browser.mjs` runs the real Chrome/OPFS matcher:
synthetic Zernike descriptors1024×768 with a distant duplicate, one complete
forward/reverse iteration and16,427,193 comparisons. Full targets/distances match
the retained baseline hashes. It also checks native-exact compact SIFT fields,
coherence, masks and comparison counts, including mirror, scale8→10 and quarter
turn, with automatic cache planning. Accounted memory returns to zero.

Preceding controlled development trials used4096 and16384 pages in both orders:
34.329s versus8.227s, then7.215s versus36.141s. Reads fell239,989→20,628;
logical bytes1,471,811,584→573,308,928. Reservations68,931,656→113,315,912 bytes.
The automatic planner selects9216 pages on this case because that fits the full
planes, and obtains the same outputs. These are local kernel timings under
shared machine load, not a measured4–5× whole-application or96MP improvement.

## Actual96MP qualification

The separate immutable recipe is
`node scripts/check-m5-dense-cache-96mp-browser.mjs`, followed by
`python scripts/check-m5-dense-cache-96mp-reader.py` in the project environment.
It uses the original rich12000×8000 JPEG with SHA256
`26b0892c49a53583fe01b15bc2407844a216f00bc14dd4a6faebbe9467c65c36`,
two full global fields, the same patch3/one-iteration settings as the acquired
M4 qualification, geometry, views, cached refilter and complete ZIP64 export.
The reader checks every full plane against the retained96MP baseline hashes,
all CRCs and the complete archive SHA after releasing the source and engine.
The fixed recipe is only for qualification: product defaults remain eleven
Extended passes with eight iterations. No new successful96MP result is claimed
until its proof and independent reader complete.

The already-running five-group96MP experiment remains frozen onb364e4c;
it does not execute this optimization. Existing release bundles keep their
own bindings. The candidate changes only paged matcher memory planning.


## Initialization/propagation refinement

The first candidate `f9af08c` exposed an important96MP tradeoff: fitting a large
cache and initialization batch simultaneously reduced the SIFT batch from
1,045,506 to301,454 positions. More sorted batches reread their banks more often.
The refined planner reuses that workspace between phases, retaining the large
initialization batch. Its tests explicitly exercise dirty-cache migration and
native-exact SIFT mirror/scale fields on1024×768 inputs.

The original f9af08c experiment is retained with its own runtime binding. The
refinement has separate outputs and is run with
`M5_DENSE_CACHE_VARIANT=phase node scripts/check-m5-dense-cache-96mp-browser.mjs`,
then the same environment variable on the independent Python reader. Both use
the original96MP source; neither changes the default automatic analysis profile.
A phase-qualified result must not be confused with the first candidate's result.

The phase implementation also charges actual imported WASM-memory growth before
allocation. Cache migration may leave allocator holes, so live-vector estimates
alone can undercount the linear-memory capacity. Additional growth reserves the
difference through the shared budget; refusal leaves VM capacity unchanged, and
all additional reservations are released on success or failure. The original
1 GiB module maximum is retained. Three focused tests cover real VM growth, peer
pressure and rejection without leaking reservations.

The completed phase checks retain16,427,193 Zernike comparisons and exact full
field hashes (8.965s on the controlled kernel case under shared load). The two
1024×768 SIFT variants retain24,006,671 and22,445,304 comparisons, with exact
full fields/coherence/masks. Actual additional heap capacity is charged: the
Zernike case plans100,208,712 bytes and admits117,506,048 bytes after growth.
A real Chrome peer-pressure case returns MEMORY_LIMIT before exceeding its
512MiB shared budget and releases all reservations; peak528,482,304 bytes.
These results qualify cache migration and accounting, not its96MP latency.


## Completed first candidate96MP result (f9af08c)

The original adaptive-cache candidate completed in5,554.413s (92.57min),
including4,991.999s of analysis. The acquired M4 baseline took5,350.001s
(89.17min), including4,776.335s of analysis. These shared-host functional
runs show no whole-journey speedup: elapsed time was3.8% higher and analysis
time4.5% higher. They are not an isolated causal benchmark.

All ten complete planes match the baseline hashes exactly, with the same
2,277,504,449 Zernike and2,295,699,212 SIFT comparisons. The independent reader
checks every ZIP CRC and the entire2,687,035,830-byte ZIP64 archive after source
and engine release. Archive SHA256 is
`15063b2cb49766ba087ab64553e2eafd7c3755e063a60ad64f66dfaea47445b4`.
Its metadata differs from the baseline; full scientific plane hashes are equal.
There are12,000 known distant-copy pairs. Peak accounted memory is
1,282,715,812 bytes under1.5GiB, and final owned memory is zero.

SIFT initialization used only301,454 positions per batch; logical reads rose
from the baseline1.359TB to2.142TB despite the enlarged propagation cache.
Zernike reads were0.962TB against1.007TB. These are logical storage counters,
not physical disk traffic. The phase-reuse correction remains separately in
qualification on9f527fd and is not validated by this completed first candidate.
See `m5-dense-cache-96mp-proof.json`.


## Combined current-runtime follow-up

The separate `M5_COMPLETE_VARIANT=small-positive-cache` recipe exercises the
current cache/heap path with all five actual automatic groups and all eleven
default Extended passes on the existing positive2008×1444 original. It reuses
the acquired interaction recipe, with separate runtime binding and output names
so the earlier small-positive evidence is preserved. Its independent archive
reader uses `--variant small-positive-cache`. This targeted
cohabitation qualification after changed dense allocation is now complete; it does not replace
the still-running default96MP recipe or establish96MP default-profile latency.


## Completed phase-reuse96MP result (9f527fd)

The refined recipe completed in5,158.510s (85.98min), with4,608.386s
of analysis. Against the acquired baseline5,350.001s/4,776.335s, the observed
reductions are3.58% whole journey and3.52% analysis. Against the first adaptive
candidate, whole journey is7.13% shorter. These shared-host functional timings
show a modest observed reduction, not an isolated speedup guarantee or a
solution to the complete default-profile latency.

All ten full scientific planes and both comparison counts remain exactly equal
to the acquired96MP baseline. Independent NumPy/zipfile verification checks all
74 entries, every CRC, full archive SHA and12,000 known distant-copy pairs after
source/engine release. Archive size2,687,035,878 bytes; SHA256
`bacbc88ab2b35303cae280f019415baa750446db0d9ac335d293be0c9315d87f`.
The additional metadata changes archive size/hash, not the scientific planes.

SIFT initialization batch is1,045,506 again. Logical Zernike reads are0.943TB
and SIFT reads1.310TB, compared with baseline1.007TB and1.359TB. SIFT's first
adaptive candidate had2.142TB. Peak accounted memory is1,336,575,492 bytes
under1.5GiB, identical to the acquired baseline peak, with zero final ownership.
Actual WASM heaps are668,401,664 and1,021,378,560 bytes, both covered by admitted
workspace. See `m5-dense-cache-phase-96mp-proof.json`. The five-group current
runtime interaction test remains distinct from this two-field96MP result.


## Current-runtime five-group positive qualification (2f89712)

The `small-positive-cache` recipe passes on the same original2008×1444 positive
source as the acquired c6b6954 recipe. All five actual groups complete in one
attempt, including all eleven Extended dense passes with eight iterations.
IDs/colours,574 initial entries,628 after D2 refilter and142 distant paired
entries are preserved. Views, cached reuse,0.671s refilter and complete export
after source/model release pass; final temporary inventory is clean.

Whole journey1,201.293s (20min01s), analysis1,151.228s, versus acquired
2,059.973s (34min20s) and2,002.121s. The observed whole-journey reduction is
41.68% on shared-host functional runs; it is not an isolated cache-only
benchmark or an estimate for96MP. The dense group finishes at1,143.566s versus
1,995.126s previously. All groups use their first attempt. Peak accounted
memory6,410,824,549 bytes under6GiB; final retained/cache/active memory zero.

The639,499,129-byte archive has910 entries, SHA256
`c1db1335859bd2e1b107f2896dfdbecf58003227800ba08f2640cd3b524d3175`.
Independent zipfile/NumPy checks all CRCs, every full payload and the whole hash.
All908 scientific arrays are exactly equal to the independently verified prior
recipe, including604 dense arrays across all11 maps, geometry and detail
planes. Only metadata/provenance arrays differ. This establishes the new
allocation path under actual five-group cohabitation on this source; it does
not replace the still-running default96MP combined qualification on b364e4c.
See `m5-complete-small-positive-cache-proof.json` and its archive-proof companion.
