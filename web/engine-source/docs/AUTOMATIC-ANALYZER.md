# Automatic analyzer integration facade

`createAutomaticAnalyzer` is exported lazily from `src/index.js`, with declarations
in `automatic-analyzer.d.ts`. It assembles real injected engines, native planning,
owned sessions, display controls and scientific export. The facade borrows its supplied engines. The common runtime now loads explicit
resources and exposes `analysis.complete`; see AUTOMATIC-RUNTIME.md.

```js
const automatic = await createAutomaticAnalyzer({
  image, imageId, selection, budget,
  engines: {dense, sparse, geometry, forgeryscope, d2prl},
  complete: true, cpu: false,
  sparseOptions: {language: englishOcrAsset},
  ela: {cellParams: {block: 16, background: true, ghost: true}}
});
await automatic.run({signal, onProgress, onState});
const frame = await automatic.prepare();
const visible = automatic.visible(frame);
automatic.view.setD2prlMinimum(800);
const updated = await automatic.prepare(); // D2 raw-grid refilter, no inference
const archive = await automatic.export(
  {elaProfile: savedProfile, elaSettings: savedSettings},
  {storage: 'auto'}, {signal, onProgress}
);
await frame.release();
await updated.release();
await automatic.dispose();
// archive.store.readInto(...) still works; then await archive.dispose().
```

`selection` supplies `{regions,envelope,disabled}` in original pixel coordinates.
Call `automaticSelection` only after successful panel detection; the facade never
invents that success or repeats a whole-image fallback when all zones are disabled.
Source, selection and compute settings are fixed for the analyzer's lifetime.
An exposed `plan` is a separate copy; editing it cannot alter running work.

Every injected engine must be built for this exact immutable original source and
the same actual `Budget` instance. The caller retains/admit source bytes and
engine/model memory. `dense` is M4 DenseCopyEngine, `sparse` M3 SparseCopyEngine,
`geometry` M3's actual pairedBiomes/biomeSides, `forgeryscope` M2's real analyzer,
and `d2prl` the loaded owned D2PRL adapter. Pass real English OCR in sparseOptions
for the full Panels/Text profile. Geometry is required when classical engines are
present; missing other engines remain per-group ENGINE_UNAVAILABLE failures.
The returned state must be inspected, not interpreted as universal success.

The facade owns its complete-mode ELA provider and session. It borrows qualified
RGB surfaces directly; contiguous `Pixels` or `{pixels}` get an owned surface
wrapper whose row/window reads preserve every original byte. There is no full
image copy, resizing or orientation change. It never disposes injected engines,
the caller's pixels or source surface. Those remain alive during useful work.
Disposal cancels/waits and releases facade caches. Acquired frames/raw leases and
completed archives remain caller-owned, independently of facade lifetime.

`view` exposes presentation/source/branch/ELA-family controls; `visible(frame)`
reuses a cached frame with no compute. Set its D2PRL minimum before `prepare` or
`export`; conflicting explicit filter minima fail. `prepare` returns a new owned
lease even on cache hits. `cancel`, `snapshot`, `acquireResults` and `export` follow
the session/export contracts. Export pins all scientific inputs and serializes
refilters. Use distinct optional `entryWasmBinary` and `compositionWasmBinary`;
they are different kernels. Browser URLs are resolved normally if omitted.

`maxConcurrent` defaults to five useful detector jobs. Each engine keeps its own
adaptive CPU/GPU policy within the shared budget. Only actual concurrent memory
failures lower group concurrency and permit retries after peer completion, at
strictly lower concurrency down to one. No probes or startup calibration are introduced.
All-disabled selections instantiate no ELA provider and perform no analysis.

Validation: public-index Node tests cover fixed scope, explicit missing-engine
states, view-driven filtering, independent export/frame lifetimes, disabled work,
constructor cleanup and source ownership. Chrome uses the facade on the original
contiguous reference RGB with the real cell-only ELA pipeline: all 14 native
scientific arrays remain exact and its raw preview survives facade disposal.
The same proof retains the existing 25-array full-energy session export and seven
native ELA entries. Final budget zero, peak 108,702,774 bytes under 512 MiB,
temporary storage inventory unchanged. Absent PM/SIFT/D2 engines are explicit
errors in that ELA-focused case; Forgeryscope is disabled by its inactive envelope.
This is not full multi-detector inference qualification. The recorded M2
polygon/entry discrepancy remains unresolved.
