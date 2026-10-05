# Automatic session lifecycle and view caches

`createAutomaticAnalysisSession({plan, providers, budget, maxConcurrent: 5})`
accepts the native M5 plan and real provider adapters. It does not supply detector
algorithms. Missing enabled providers become ENGINE_UNAVAILABLE failures; disabled
jobs never invoke providers. Source/scope/detector changes require a new session.

Each provider implements:

- `run(job, hooks)` returns owned `{value, release}` for its raw scientific result.
- `prepare(value, filters, hooks)` returns owned
  `{value: {entries, ...optionalScientificFields}, release}`. Entries must use the
  qualified native M5 entry contract. Their lifetime must be independent of raw
  inputs; providers must retain any underlying dependencies they share.

All providers use the supplied shared Budget, honor the signal, and release
partial allocations on failure. Existing M3/M4 engine results already have a
release function; the adapter can wrap their result as value. M5 entry functions
and ELA compose similarly. Forgeryscope uses its actual M2 analyzer. D2PRL uses
createAutomaticD2prlProvider and the adapter's runOwned/readRawOwned bridge (see
AUTOMATIC-D2PRL-PROVIDER.md). Its ordinary public envelope must not be treated as
an owned result. The public analysis.complete operation consumes this session through the common runtime.

`run({signal,onProgress,onState})` starts up to maxConcurrent useful groups immediately
and fills available slots when peers settle. It never calibrates or runs probes.
A MEMORY_LIMIT from concurrent work immediately lowers the concurrency limit.
The failed group may retry after a peer settles, at strictly lower concurrency,
or when it is alone. It does not wait for an unrelated long group to finish.
At most maxConcurrent attempts are possible per group; no timer or retry loop
runs against unchanged contention. Successful groups remain retained, other
errors stay explicit, and a serial memory failure is terminal. Providers may use hook concurrency/attempt for their own execution
policy. This scheduler bounds group concurrency; it does not claim resource
failures can always be recovered or global peak memory reduced below retained
outputs. All current jobs finish/clean before run settles.

`snapshot()` returns states/errors/attempts and completed/running IDs.
`cancel()` stops detector work; completed raw results remain available. Late
outputs from cancelled providers are released. `prepare(filters, hooks)` can
still inspect completed groups after cancellation, has its own optional signal,
and serializes entry preparation. Disposal cancels both work and preparation.
A run signal cancellation rejects run with CANCELLED; group failures otherwise
remain in the returned state. onState/onProgress are synchronous observers.

Entry caches depend only on relevant filters: length/overlap for PM, SIFT and
Forge; d2Minimum for D2PRL; elaThreshold/elaMinimum/energyThresholds for ELA. D2's
prepare adapter must refilter retained native 448 grids, never run inference.
Changing unrelated filters reuses existing entries. UI-only tabs, hidden items,
focus, opacity and display mode belong to the separate automatic-analysis-view
state and do not enter these compute keys. Relation annotations are added after
native entry preparation; ELA stays separate from clone annotations.

`prepare` returns an owned `{entries, filters, groups, release}` frame. Every
call returns a separate lease, even on cache hits. `acquireResults()` returns
owned `{values, release}` raw leases for export. These leases survive cache
replacement and `await session.dispose()`. The caller must release each frame or
raw lease. Disposal is idempotent and awaits pending work, frees session-owned
raw results/caches/control metadata, but never disposes injected provider engines
or the source image. Entry data and acquired raw values are read-only to callers.

Seven focused Node tests exercise actual budget contention, once-only serial
retry, cache scopes, independent owners, disabled/missing providers, cancellation
with late results and disposal during async preparation. Protocol fixtures are
not detector evidence. A further path in the same suite calls the real M5 ELA
composition on a native-reference selection, checks exact entry IDs, reads its
scientific scope after session disposal, and releases every allocation to zero.
No additional complete SIFT/PM/D2/Forge inference parity is claimed. The M2
network-to-polygon discrepancy remains open.

`withSnapshot(filters, visitor, hooks)` holds scientific raw and prepared owners
and excludes concurrent refilters until the consumer settles. It requires settled
detector jobs. Disposal aborts and waits for the consumer. See
`AUTOMATIC-SESSION-EXPORT.md` for the ready archive adapter and lifetime contract.

Integration .15 regression: a gated long group remains running while a failed ELA group resumes after a short peer releases its workspace; an oversized group attempts concurrency 3, 2 and 1 only, with no retries between peer completions. Existing cancellation, late-result ownership, caches and snapshot tests also pass. These injected providers test lifecycle only; actual detector arithmetic remains covered by native and browser proofs.
