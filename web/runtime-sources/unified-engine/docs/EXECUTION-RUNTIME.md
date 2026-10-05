# Browser execution runtime

This revision changes execution and storage, while preserving the analysis domain,
original pixels, hypothesis order, numerical reductions and scientific thresholds.
The target is elapsed time to a complete result, including preparation and output
materialization. No startup benchmark, memory canary, synthetic GPU dispatch or
saved cookie is used to select resources.

## Resource coordination

`createEngine` creates one `ExecutionScheduler` for its shared `Budget`. Worker
calls in the JPEG, ZERO, noise, median, transform-strip, dense, sparse/OCR and
neural paths use this coordinator. CPU quotas include the requested internal ORT
threads when those workers support shared-memory threads. GPU work admitted here
uses one GPU lane, allowing separate CPU jobs to proceed concurrently. The
coordinator is per engine instance; separate browser tabs cannot share it.

Jobs waiting for execution can be cancelled before a worker receives their input.
A malleable job declares its minimum/maximum CPU width and the workspace needed
for each width. The scheduler admits the widest configuration that currently fits.
SIFT/Zernike preparation, dense eligibility and transform strips can add workers
while useful work is running. JPEG/ELA streams redistribute resources between
completed quality batches. ORT CPU sessions acquire their actual thread grant
before initialization and can reconfigure when more cores become available.
There is no arbitrary 32-worker ELA ceiling.

Reusable Wasm heaps remain charged until their worker is terminated; freeing a
native pointer does not shrink a Wasm memory. Idle workers can be reclaimed.
Preparation, I/O and waiting for child jobs do not retain unused CPU grants.
Explicit GPU phases return their CPU lane while keeping independent CPU kernels
running. Opaque ORT WebGPU calls retain one CPU lane because their internal Wasm
fallback can execute CPU operators. Some indivisible native/learned stages still
keep their declared workspace throughout execution; they cannot resize halfway
through an operator. Width changes occur at safe useful-work boundaries.

`engine.capabilities().execution` (also available through the worker client)
reports capacity, current use, completed jobs, peak concurrency, queued jobs and
accumulated wait time. Its `preflightExecutions` remains zero. These are admitted
resources, not an OS measurement of physical memory or GPU occupancy.

## Memory ownership and storage

Segmented banks can use `SharedArrayBuffer` from their first allocation. Read-only
exports pin their backing until the worker releases it; they do not copy a full
bank per worker. RAM and temporary-storage banks can be migrated at an idle stage
boundary. A failed or cancelled migration preserves a complete authoritative backing.
The useful data is copied once; this is not a capacity test.

Sparse stage caches transfer ownership between an active reservation and an
evictable cache entry. They no longer charge the same output repeatedly as work,
cache and a second work reservation. Public result copies retain separate leases.
IndexedDB writes of complete pages avoid reading their previous contents first.
OPFS remains preferred where available, with IndexedDB as the temporary-storage
fallback. Sealed OPFS stores allow independent read-only handles in workers.
When shared memory or direct file access is unavailable, bounded MessagePort
reads preserve parallel work without copying entire descriptor banks.

Completed scientific fields, including their eligibility masks, become cold
storage candidates immediately. An asynchronous reclaimer migrates them before
admitting new work or planning hot descriptor residency. Reservations are released
only after the copy and ownership hand-off complete. Export retains all results. A shared, accounted I/O window (up to 2 MiB)
allows IndexedDB migrations even when the data budget is full; broker windows
are also funded before expanding native worker heaps.
A shared read cache grows from actual misses and reclaimed RAM; published cache
banks remain charged until every reader acknowledges retirement. This cache is
for external stores, not an additional copy of already resident descriptor banks.

Automatic SIFT and OCR read original row windows instead of materializing a second
full RGB image. OCR normalization/filtering keeps the original pixel arithmetic.

Neural workers initialize lazily and wait for common execution admission.
CFA Conv/Slice/Concat/Gather/LeakyRelu chains retain intermediate tensors on the
GPU; explicit native Softplus, pooling and normalization boundaries preserve the
existing arithmetic. GPU weights and activation arenas are reused. Idle
sessions are reclaimed only as needed, favoring cheaper initialization cost per
reclaimed byte, measured on previous useful work in the current session. Owned ORT
outputs are transferred; aliases and partial/shared views are copied when needed
for correct ownership. Noiseprint++ retains its weights, alternates two activation
arenas and submits bounded command batches while preserving operation order.

## Dense execution

A segmented source no longer forces every small image through the paged engine.
Direct routing is admitted against the complete plan, including materialization,
worker heaps, outputs and postprocessing. Larger sources retain the paged path.
Hot descriptor residency is planned separately from cold retained raw fields.
Storing outputs temporarily no longer forces all repeated descriptor reads onto
external storage.

The paged matcher parallelizes inside each hypothesis. A dedicated coordinator
runs no native matching kernel: independent workers execute initialization and
safe propagation segments. A wavefront ordered by `x + 2*y` preserves west, north,
northwest and northeast dependencies, including reverse traversal. Reverse
proposals run in parallel in bounded windows and commit in the original ascending
order. Strict comparisons, per-pixel random sequences, masks, iterations and
scientific thresholds remain unchanged. Symmetric fields reuse an already known
reciprocal distance only when both descriptor views are identical.

CPU width is reacquired at phase boundaries, so concurrent jobs can use released
cores and a remaining field can expand. Worker/cache capacity follows the granted
width and actual available workspace. Shared RAM banks, read-only OPFS handles or
bounded broker reads provide input access. Without shared memory, independent
hypotheses still run in workers; the within-field shared wavefront falls back to
the exact serial kernel. This is a browser capability boundary, not a reduced
analysis domain.

The optional dense GPU kernel produces exact integer lower bounds. It rejects
only candidates proven unable to improve the result; native arithmetic refines
all remaining candidates. Device buffers and transferable staging copies are
admitted separately before allocation. This path remains opt-in because measured
packing/transfers did not improve total cold time. The automatic route uses the
parallel CPU matcher while other qualified GPU stages remain enabled.
Zernike convolution additionally uses exact four-pixel SIMD, with a scalar
fallback selected by compilation of the real requested module. See
[DENSE-SIMD.md](DENSE-SIMD.md) for operation order and separate qualification.

## Recovery during useful work

The first 96 MP run of integration.20 failed during Zernike descriptor preparation:
a real 4 MiB segmented allocation was refused below the global policy budget.
Its final cancellation was secondary; the preserved
[failure record](runtime-v2-96mp-allocation-failure.json) is not a completed result.
Device RAM hints do not promise that every browser allocator can supply that
amount. No capacity probe is used to infer a new fixed limit.

A failed bank allocation now triggers a local storage transaction. The existing
banks and pending write remain owned while the funded I/O window copies them to
temporary storage. Concurrent writers await that transaction. Only after the
copy, pending write and flush succeed does the store publish its new backing and
release RAM. Copy failure or cancellation leaves the previous backing intact.
Descriptor computation does not restart. Direct shared buffers already published
to readers cannot move; a mutable broker can change its owner's backing safely.
The store reports the recovery cause, preserved bank bytes and completion.

Optional caches retain their previous contents when growth is refused. Shared
cache growth waits for an external release large enough for the failed bank; its
own reserve/release notifications and small transient I/O scopes cannot trigger
a retry loop. This is a local growth gate, not a lasting global RAM or CPU cap.
All scientific parameters and the maximum worker policy remain unchanged.

Native cache replacement is transactional too. An unready kernel allocation
failure can reclaim real memory and retry only that kernel, retaining descriptor
banks and completed fields. Unmaterialized worker allowances are returned while
existing heaps stay accounted. A recovery epoch permits the same cache growth
request after sufficient external memory is released; returning its own unused
allowance never counts as such a release.

The integration.21 96 MP attempt exercised this transaction successfully: a real
4 MiB refusal preserved 4,483,710,976 descriptor bytes and PatchMatch continued
into the dense field. A later D2PRL allocation failure escaped recovery because
it was classified as `COMPUTE_FAILED`. Last D2PRL progress was internal
PatchMatch iteration 7, evaluation 40 of 198. The public error had lost its
original allocating stack, so that exact allocation site cannot be inferred
from the log. See [the recorded failure](runtime-v2-d2prl-allocation-failure.json).

Repeated recovery now uses a common resource-error classifier and obstruction
controller. Allocator-specific evidence, including errors crossing worker
boundaries, retains its stack, cause and allocation details. Invalid arguments,
numerical faults and programming errors are not reclassified as memory pressure.
A recovered operation has no lifetime incident limit. Five consecutive resource
failures stop only when operation, useful checkpoint and memory conditions
remain similar. Phase labels remain diagnostic: alternating worker startup and
compute failures cannot disguise a stalled tile. Memory comparisons tolerate 10% or 1 MiB of variation; attempt
numbers, timestamps and replayed progress cannot manufacture advancement. A
terminal local obstruction propagates without restarting its counter in an
outer provider.

Recovery temporarily holds a shared budget token across reclaim and useful
retry. Optional shared-cache growth waits during that interval, so it cannot
immediately reclaim the RAM freed for useful work. Cache reads remain available,
and the final token release allows growth again. The RAM policy and maximum CPU
capacity remain unchanged. This reacts to a refused useful allocation; it adds
no startup capacity probe or persisted tuning.

Preparation workers recover independently at a useful tile boundary. Completed
tiles are not repeated. A failed compute worker is replaced and only its detached
input is prepared again. A completed tile whose publication fails stays owned;
publication can retry only for callers explicitly declaring idempotent writes
(Zernike/SIFT output ranges and texture-mask conjunction).

D2PRL keeps preparation, descriptors, committed candidate pairs and graph inputs
while retrying a failed operator or evaluator tile. Candidate generation restores
the exact RNG state if its unpublished attempt fails. Native/GPU result copying
can retry while keeping the already computed output alive. Recovery controllers
belong to individual suspended operations, so concurrent tiles neither share
failure counts nor reset each other's stalls. Ready evaluator workers survive an
optional worker-allocation refusal; additional workers can be admitted again
after a sufficient real external release. This changes resource handling, not
model weights, iteration counts, dimensions or arithmetic.

The integration.22 cold run then reached D2PRL iteration 11, evaluation 56/198,
before five similar candidate allocations failed in 188 ms. The detached runner
stopped on that terminal detector error. Its [failure record](runtime-v2-backing-recovery-failure.json)
supersedes any interpretation of the earlier startup observation as completion.
The recovery callbacks had worked, but ordinary reclamation could be satisfied
by unrelated idle Wasm reservations while the shared read cache stayed resident.
Published cache descriptors also retained aliases after bank retirement.

Allocation recovery now distinguishes a real ArrayBuffer/SAB, Wasm or GPU
refusal from a logical budget admission failure. Owners of the failing backing
domain are reclaimed first. A refused ArrayBuffer allocation can discard the
optional shared read cache before reclaiming unrelated idle heaps. Retiring banks
are omitted from new connections immediately; parent, relay and receiver
publication aliases are cleared, and accounting stays charged until existing
readers acknowledge retirement. Dropping every reference makes backing eligible
for browser collection; it does not force a synchronous garbage collection.
Reclamation diagnostics report requested bytes, the ownership bytes retired in
the requested domain, and unrelated accounting separately. They do not count as
new recovery attempts or useful scientific progress.

D2PRL candidate generation reuses two exclusively owned planes. Capacity grows
only when the current useful transformation requires it. Candidate generation
and in-place coordinate wrapping form one unpublished retry boundary, with the
same RNG restoration and numerical operation order. The previous committed
offsets remain valid until evaluation finishes. Partial workspace growth remains
owned during a retry and is released when the operation exits. This removes
repeated large candidate/wrap allocations without reducing iterations, precision,
worker capacity, the RAM policy or the five-similar-failure guard.

Completed dense hypotheses and their descriptor inputs stay owned while a failed
field restarts from its original algorithm state. A completed field whose cold
storage fails retries storage without rerunning the search. This is an explicit
ownership boundary, not continuation from an arbitrarily interrupted native
instruction. The test runner keeps the original detector error and emits each
resource-recovery event rather than hiding it behind progress throttling.

## Browser configuration

Use `createWorkerEngine` to keep orchestration off the UI thread. The existing
`computeProfile: 'maximum'` selects the larger policy budget; an explicit
`memoryBudgetBytes` remains supported. Neither option preallocates that amount.
The aggressive and maximum policies use 65% and 80% of the reported device RAM,
respectively, and expose all reported logical CPU cores to admission. The global
budget is no longer clamped to one JavaScript isolate's heap limit. Independent
worker/Wasm heaps and shared byte banks are accounted together, with separate
per-allocation limits. Unknown RAM uses a bounded fallback (1/2 GiB). These are
policy budgets, not measurements of physically free RAM; no allocation test is
performed. More reserved memory or more workers need not reduce time.

Serve the application over HTTPS (or localhost during development). To enable
shared descriptor banks and shared-memory worker threads, configure the document
and worker responses with:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Cross-origin model/runtime assets must also satisfy the appropriate CORS/CORP
requirements. Check `crossOriginIsolated` in the executing worker. Without
isolation, the bounded ordinary-memory/storage path remains available. No
production server configuration is changed by this library revision.

## Limits

The budget is an ownership/accounting limit. It cannot reserve physical RAM from
the OS, predict another application's allocations or catch a renderer process
being killed. RAM, driver memory and external UI-owned copies are not one
observable browser budget. Completion is protected by bounded working sets,
admission, storage fallback and recoverable errors; it cannot be guaranteed for
arbitrary inputs or arbitrary external memory pressure.

ORT distributions and GPU devices remain owned by their current workers. This
revision coordinates their execution rather than merging incompatible runtime
instances or changing the scientific arithmetic to fit a different GPU kernel.
Large-image speedups must be measured on the actual requested configuration;
small development fixtures do not establish a 96 MP performance result.

## Validation

These development checks never execute before a user's analysis:

```sh
npm test
node tests/dense-parallel-browser.mjs
BROWSER=firefox node tests/dense-parallel-browser.mjs
BROWSER=webkit node tests/dense-parallel-browser.mjs
node tests/dense-runtime-browser.mjs
node tests/dense-parallel-cold-benchmark.mjs
node tests/portable-dense-browser.mjs
node tests/elastic-quality-browser.mjs --regressions
node scripts/check-neural-cpu-threads-browser.mjs
node scripts/test-automatic-runtime.mjs
```

The wavefront corpus covers 12/128-dimensional fields, masks, transformed axes,
ties, overflow, temporary storage, bounded reverse windows, sorted initialization,
dynamic CPU grants and cancellation. Complete field hashes and comparison counts
match the serial reference. JPEG/ELA tests release an actual concurrent CPU/RAM
reservation and observe all four pools grow from one to four workers; every
quality remains exact and is computed once.

A cold Chromium development measurement includes worker creation, module loading,
descriptor preparation, two complete iterations, result hashing and cleanup.
The 512 × 512 synthetic fields are not a 96 MP throughput qualification. An older
96 MP job was running concurrently, so these are not idle-machine measurements.
Renderer CPU time comes from CDP process counters, independently of lease counts.

| Descriptor dimensions | One kernel | Four kernels | Speedup | Effective renderer cores, 1 → 4 kernels |
| --- | ---: | ---: | ---: | ---: |
| 12 | 1.880 s | 1.036 s | 1.81× | 0.91 → 2.85 |
| 128 | 5.636 s | 2.694 s | 2.09× | 0.84 → 3.37 |

GPU development parity covers 27 CFA cases across three models (bit-exact against
the existing hybrid pipeline) and three Noiseprint++ cases (exact native outputs).
The CFA campaign reduces readbacks from 276.24 MB to 191.88 MB. ORT thread grants
change 1 → 4 → 4 in Chromium, Firefox and WebKit with exact outputs and no remaining
reservation. These operator checks do not establish the complete analysis time.
Dense GPU cold measurements, including packing and transfers, were slower or tied
on the tested 512 × 512 fields; automatic routing therefore does not select it.

Machine-readable evidence for this revision is retained in
[execution-runtime-v2-proof.json](execution-runtime-v2-proof.json). The earlier
[execution-runtime-proof.json](execution-runtime-proof.json) belongs to
0.31.0-integration.19 and is kept as historical evidence, not relabelled as a new run.

The integration.20 complete 2008 × 1444 positive-source qualification ran all five groups
with real model assets, eleven dense hypotheses and unchanged patch/iteration
settings. It verified the views and all 748 arrays of the 638,335,702-byte archive,
then released all accounted active/cache/retained memory and temporary storage.
The total was 478.687 seconds, including a D2PRL attempt interrupted during
descriptors by memory pressure and restarted after another group released RAM.
The Node suite ran concurrently, so this is functional evidence, not an idle-machine
throughput benchmark or a 96 MP result. See
[runtime-v2-complete-small-proof.json](runtime-v2-complete-small-proof.json).

The integration.20 source suite passed 863 tests with no failures and three conditional
skips; the skipped D2PRL ownership case also passed separately with experimental
module mocks enabled. Exact commands, skipped prerequisites and log hashes are
recorded in [runtime-v2-final-validation.json](runtime-v2-final-validation.json).

Integration.21 recovery qualification is recorded in
[runtime-v2-recovery-proof.json](runtime-v2-recovery-proof.json). The integrated
Node suite passed 888 tests, with no failures and three conditional skips; D2PRL
ownership passed separately with module mocks. Browser cases cover Chromium
OPFS/IndexedDB and Firefox/WebKit IndexedDB. A native Zernike case preserves
4 MiB after an injected refusal, submits exactly the same six useful tiles on
four workers and produces identical descriptor banks. Native field/cache/worker
recovery preserves exact targets, distances and comparison counts. These tests
do not establish completion or timing of a full 96 MP analysis. The subsequent
integration.21 full attempt failed as recorded above.

Integration.22 repeated-recovery qualification is recorded in
[runtime-v2-repeat-recovery-proof.json](runtime-v2-repeat-recovery-proof.json).
The assembled source passed 933 Node tests, with no failures and four conditional
skips. Both skipped ownership tests passed separately with module mocks; the
other two skips require locally absent native reference oracles. The Torch/Pillow
row-preparation reference absent from the D2PRL agent worktree passed in the final
assembled suite. Final Chromium native D2PRL checks preserve all eight hashes,
the RNG, 18 evaluations, 144 committed tiles and four descriptor uploads despite
two allocator refusals; native convolution also preserves its output and 16 tiles
through two refusals. Browser/native qualifications establish exact local
recovery, not completion or a speedup of the full 96 MP analysis.


Integration.23 completed all 198 D2PRL PatchMatch evaluations in the full 96 MP
attempt, then failed while duplicating an already mapped 51,380,224-byte GPU
convolution output. The supervisor continued independently of the chat and
recorded a detector failure, not a monitoring-triggered shutdown. Evidence is in
[runtime-v2-gpu-readback-failure.json](runtime-v2-gpu-readback-failure.json).

Integration.24 returns the mapped convolution output with explicit ownership.
It remains valid until its consumer calls release, including after engine disposal;
unmap/destroy and device retirement are delayed accordingly. Unneeded GPU input
and intermediate buffers and the GPU slot are returned before readback recovery.
No shader, iteration count, model weight, precision or global CPU/RAM policy changes.
The dedicated real-browser qualification covers the exact failed output size and
native CPU/Wasm consumption in Chromium and WebKit. Firefox's tested headless
configuration exposes no WebGPU adapter; its CPU route remains available. See
[runtime-v2-d2prl-gpu-owned-output-proof.json](runtime-v2-d2prl-gpu-owned-output-proof.json).

Segmented owners now report materialized banks rather than reserved capacity.
Typed ArrayBuffer reclamation waits for unused encoded JPEG owners to retire.
After insufficient reclamation, an allocation retry may wait for actual backing
retirement or a committed independent phase, but only while an explicitly tagged,
admitted CPU/GPU lease can make progress. The failed owner, other waiting owners,
and dense kernels suspended on memory RPC are excluded. All-waiting and no-peer
situations return to the existing five-similar-failures guard; cancellation still
interrupts waiting. Accounting churn and wait diagnostics are not useful progress.
There is no lifetime retry cap, calibration probe or persistent capacity estimate.
Validation of this assembled revision is recorded in
[runtime-v2-resource-opportunity-proof.json](runtime-v2-resource-opportunity-proof.json).


Integration.25's next 96 MP attempt stopped making useful progress while still
reporting a running process. Nine OCR initialization calls and one Ghost call
retained all ten CPU grants after null message payloads escaped asynchronous
worker callbacks; 22 later requests waited behind them. This was not an observed
memory-admission or descriptor-migration deadlock. The final runner exit came
from a separate inspector-tooling error during diagnosis. Both events are
recorded in [runtime-v2-worker-liveness-failure.json](runtime-v2-worker-liveness-failure.json).

The next revision gives the active OCR, JPEG, SIFT, dense and D2PRL worker paths
a shared message guard: null envelopes, messageerror and rejected async handlers
settle pending calls and return their CPU grants. Unreadable transport has its
own error code and is not evidence of an allocator refusal. Recovery does not
reduce the global worker ceiling or reclaim unrelated RAM for that error. The
failed OCR/SIFT tile, JPEG quality or D2PRL evaluation tile is retried from owned
inputs; transferred inputs are rebuilt and published peer results are retained.
A partially mutated dense native field must be recovered by its field owner,
not replayed as an ambiguous fragment. Five comparable failures at the same
useful checkpoint stop the local recovery loop; there is no lifetime retry cap.

The standalone 96 MP runner samples scheduler and memory accounting every thirty
seconds through a read-only capabilities request. This is neither calibration
nor allocation probing, and its heartbeat does not count as useful progress.
Cancelling an overdue diagnostic read leaves the computation running. A broken
public command channel still accepts the separate cooperative storage-close
acknowledgement, and an abnormally exited runner's supervisor cleans up only its
own Chromium profile and descendants. A renderer or process killed by the host
cannot be recovered by code inside that process; local recovery evidence must
not be presented as a guarantee against such termination.

Assembled validation is recorded in
[runtime-v2-worker-liveness-proof.json](runtime-v2-worker-liveness-proof.json).

## Recovery arbitration and reusable preparation buffers

The integration.27 audit reproduced a closed admission cycle: two failed SIFT
allocations each kept their pressure token and each waited behind the other's
pressure, even after matching ArrayBuffer owners had retired. See
[audit evidence](audits/integration27-96mp-20261003/analysis.json). Retirement was
observable; admission never reached another actual allocation attempt.

The coordinator now gives recovery operations a deterministic priority, inherited
by their children. Only matching allocation domains defer new growth. The same
ordering governs recovery-to-retry and scheduler admission, including requests
that cross ArrayBuffer, Wasm and GPU domains. Backing retirement, scoped reuse and
returned admission credit notify the relevant waiters. Normal CPU/GPU scheduling
and malleable worker counts remain in effect. This is not a permanent smaller
worker profile, a startup capacity test or an unbounded herd of allocation retries.

Admission and recovery inspect the same dependency graph. A closed cycle with no
reachable producer settles as RESOURCE_DEPENDENCY_CYCLE, with its operations and
edges preserved. Automatic analysis retains completed products and permits explicit
resume. This structural failure does not masquerade as an OOM or consume five
fictional allocation attempts. Actual repeated refusals retain the existing guard
of five comparable failures without useful progress.

A reusable preparation slot owns its buffer and reservation across worker
transfers. Holding the slot protects it while a task acquires its remaining
resources; an acknowledged return replaces the detached reference without adding
a second owner. After publication the slot becomes reclaimable. Termination
retires inaccessible in-flight input. The next admission subtracts extents already
owned. Pixel windows can fill an admitted destination and row scratch directly;
contiguous full-width reads need no row copy. Constructor failures retain their
native cause, allocation domain and requested extent. Storage, bounds and transport
errors keep their actual cause through the worker broker.

SIFT reads useful windows into these slots, retaining the existing exact pyramid
cache and continuation grouping. Failed admission before dispatch can keep its
input and native pyramid while waiting for the missing credit. It does not discard
and then reacquire its own prerequisites. The Gaussian readback already owns its
GPU mapping and native destination; obtaining its JavaScript mapping view is not
a new Wasm allocation, and no second full readback reservation is invented.
The mapping view follows the [WebGPU buffer contract](https://gpuweb.github.io/gpuweb/#dom-gpubuffer-getmappedrange).

PatchMatch texture eligibility has one authoritative mask and a compact committed
tile bitmap. Replaying an incompletely published tile only clears the same bits;
committed tiles are skipped on resume. No full-mask snapshot is appended after
each tile. Ordinary recovery retries a tile when the relevant resource returns,
even while other fields continue. If preparation exhausts that recovery or fails
terminally, existing fields continue concurrently to useful publication and release
their heaps before the error is returned. The next explicit continuation reuses
those fields and the partial mask. There is no all-field barrier in ordinary
recovery and no dormant native heaps pinned merely for a paused checkpoint.

These are live-engine checkpoints. They do not make a terminated browser's memory
durable, nor reconstruct an ambiguously mutated native field after its own worker
is lost. Published peer fields, completed preparation tiles and earlier stage
products remain separately owned. Native arithmetic, image resolution, hypothesis
order and scientific parameters are unchanged.

Integration.28 qualification is recorded in
[runtime-v2-progress-recovery-proof.json](runtime-v2-progress-recovery-proof.json).
The cold 2.9 MP five-group Chrome run completed and matched all 746 scientific
NPY arrays bit for bit against integration.27. Its total was 366.426 seconds
versus 346.637 seconds previously; this single-run comparison does not establish
a speedup. A later broker-publication failure-path cleanup has its own nine
passing targeted tests. Full 96 MP completion remains a separate qualification.
