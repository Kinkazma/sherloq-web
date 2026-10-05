# Owned automatic session export

`exportAutomaticSession(session, options, request, hooks)` joins the real session,
scientific snapshot adapters and corroboration exporter. It returns the existing
owned `{store,byteLength,sha256,dispose}` archive contract. The archive remains
readable after the session/providers/source close. This is an integration API;
the public `analysis.complete` runtime operation is not yet enabled.

Options:

- `image`: original RGB8 image/surface, alive and immutable during export. A
  completed ELA provider supplies its already computed original BGR hash instead.
- `filters`: normal session display filters; preparation caches are reused.
- `view`: snapshot from `createAutomaticAnalysisView().getState()`. Its D2PRL
  minimum determines the refilter; contradictory explicit filters fail.
- `forgeryscopeBranch`: empty string, `microscopy`, `blots`, or `lanes`; inherits
  the view state when omitted.
- `elaEnergy`, `elaLegacy`: visible ELA families, inherited from the view state
  when omitted (true in a fresh view).
- `elaProfile`, `elaSettings`: caller's actual saved UI profile/settings. Missing
  values remain explicit null; raw ELA scientific metadata is still included.
- `provenance`: additional plain browser provenance.

Request accepts the scientific export storage/size options. Hooks use the same
shared `budget`, `signal`, progress and temporary-session notifications. Optional
`wasmBinary` here is the **composition** kernel, not the entry geometry kernel.

The new `session.withSnapshot(filters, visitor, hooks)` serializes the entire
visitor with entry preparation. It supplies `{frame,results,plan,state,signal,
readRaw}` and holds both raw and selected owners until the visitor settles.
Only settled detector jobs can export, including partial failures/cancellation.
Other refilters wait; session disposal aborts the visitor and waits for cleanup.
Visitors must honor the supplied signal and must not await session disposal or
another preparation from inside that same visitor. Injected detector engines
remain exclusive to their session during work; direct outside engine mutations
are not covered by the preparation lock.

D2PRL acquires an additional owned raw-grid copy while locked, then releases it
after archive construction. No hidden inference recovers evicted grids. Scientific
results keep original projections/metadata, whereas selected biomes and display
minimum reflect the requested refilter. ELA results use selected scientific masks
and labels. All current scientific biomes stay in the archive; corroboration uses
only visible clone entries after tab, relation, source, hidden/focused and branch
filters. ELA never contributes a corroboration vote. Actual browser `auto` backend
intent, states, errors, attempts and provider metrics/provenance are preserved;
no native MPS/timings are invented.

Checks: seven session lifecycle cases including real ELA composition, queue
exclusion and cancellation; real D2PRL adapter/session with explicit neural and
projection protocol doubles verifies raw export, one model vote, initial versus
refiltered metadata, no additional inference and cancellation cleanup. A partial
export with unavailable engines keeps four explicit errors and the exact original
BGR hash. Real Chrome ELA provider → session → temporary archive retains all 25
native arrays and seven biomes, exports zero ELA votes, reuses the source hash
without reads, and disposes all storage/reservations. Peak 108,636,390 bytes under
512 MiB, final zero. This does not qualify all detectors together or resolve the
known Forgeryscope geometry/entry differences.
