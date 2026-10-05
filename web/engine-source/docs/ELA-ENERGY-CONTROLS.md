# Explicit ELA energy controls

Version0.28 exposes `ela.energy`, its scientific profiles and exact masks on the
qualified corpus; see [ELA-ENERGY-STUDY.md](ELA-ENERGY-STUDY.md).
`createElaEnergyControls()` owns request state; the separate engine performs
analysis. WordPress input wiring remains an independent integration task.

Every snapshot contains four independent integer values:

| Field | Range | Scientific unit | Initial value |
| --- | --- | --- | --- |
| `histogramLow` | 0–500 | quantile = value / 1000 | 10 (1%) |
| `histogramHigh` | 500–1000 | quantile = value / 1000 | 990 (99%) |
| `shadow` | 0–200 | deviation threshold = value / 10 | 50 (5) |
| `highlight` | 0–200 | deviation threshold = value / 10 | 50 (5) |

`edit(patch)` changes only supplied fields and switches to manual ownership. It
never fills omitted fields from a profile or an estimate. Call `beginManualEdit()`
at handled pointer, keyboard or wheel intent **before** numeric change processing,
including an interaction that leaves a slider at its current endpoint. That call
invalidates pending automatic work without changing any of the four values.

`selectProfile(id)` is an explicit user action. `standard` applies the initial
Conservateur quartet, `manual` preserves current values, and the native identifiers
`conservative` (Sensible) / `sensitive` (Agressif) produce an `estimateRequest`
token. No estimator runs implicitly. `adaptive` describes the selected profile;
`estimatePending` separately describes an outstanding one-shot request. Both
remain distinct from the `analysisAvailable:true` field in0.28.

An estimate must return `{revision,profileId,values}` with all four fields.
`acceptAutomatic(answer)` accepts only the still-pending token, once. A different
profile, manual intent or a restored snapshot invalidates it. Acceptance itself
increments the revision because the numerical inputs changed: renders computed
while the estimate was pending are now obsolete too. Start the new analysis from
a fresh `snapshot()`, and check `accepts(answer)` before rendering any asynchronous
analysis result. Finishing an estimate never confers permission to apply it.

`applySnapshot({id,values})` restores four explicit values without estimating
anything. Snapshots own their value objects. Revisions cover this controller
instance; also associate an image identity/generation with actual analysis jobs.

The native reference fix changes input ownership, not numerical formulas. Its
separate shadow/highlight geometry and colour invariance are covered by the
energy segmentation fixture corpus. Changing either histogram bound legitimately
changes their common reference and may affect both masks. Four Node tests cover
field preservation, endpoint intent, stale estimates/renders, duplicate responses,
explicit profile changes and saved values. They are **not** proof of browser mask
parity, DOM input wiring or WordPress integration.
