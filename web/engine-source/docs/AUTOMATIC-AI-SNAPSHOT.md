# Automatic AI scientific snapshots

`automaticAiSnapshot(kind, result, {raw})` in `src/automatic-ai-snapshot.js`
normalizes actual projected detector data for `streamAutomaticNpz` or
`exportAutomaticAnalysis`. `kind` is `forgeryscope` or `d2prl`.

It borrows data: retain the provider's raw-result lease until export settles.
For D2PRL also acquire `provider.readRaw(value)` and pass its `value.result` as
`raw`; release that additional owner after export. The adapter can close after
these leases are acquired. An evicted raw cache remains an explicit `CACHE_MISS`;
export never reruns inference.

All projected fields have native `[height,width]` shapes. Map/source/target are
float32, and mask/candidates/analyzed/Forgeryscope branch fields are uint8.
D2PRL grids become native `raw_probabilities` float32 `[zones,3,448,448]` in
analysis order, with virtual concatenation and bounded archive chunks. No full
stack allocation is made. Analysis identity, ordered box bounds, raw shape and
field types are checked. Different result revisions of the same analysis are
allowed: refiltering retains the same raw scores. The original result's metadata
and original component minimum remain unchanged in the scientific snapshot.

Unknown top-level scientific fields fail explicitly. Width/height, release,
metrics and provenance are infrastructure, excluded from native result fields;
include actual provider metrics/provenance in the archive's browser provenance
record. Metadata is borrowed verbatim; no native device, timings or weights are
fabricated. Additional plain browser metadata is intentionally preserved.

Validation: `generate-automatic-ai-snapshot-reference.py` calls the real native
automatic exporter with deterministic projected fields and two full raw grids.
`automatic-ai-snapshot.test.mjs` verifies 15 native arrays and metadata exactly,
cross-grid chunks, independent completed archive, invalid identities/order/types,
and cancellation with zero remaining budget. This is archive-contract validation,
not detector inference qualification. `d2prl-owned.test.mjs`, run with Node 22
`--experimental-test-module-mocks`, additionally exercises real adapter/session
ownership and export after adapter disposal with explicit inference/projection
protocol doubles. Existing M2 geometry/entry parity limitations remain unchanged.
