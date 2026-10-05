# Composite covariance-floor-v1 distribution

Integration API `0.31.0-integration.16` includes M2 commits `cd78aff` and
`bbac537`. Ship the runtime and the statistics assets together. Existing
Noiseprint weights, neural runtime and Pyodide WASM binary remain unchanged.

The schema-2 asset manifest is `composite-statistics-runtime-manifest.json`.
Its 11 files total **131507535 bytes**. `noiseprint-statistics.zip` is
**47155 bytes**, SHA-256
`d3f5386ec00efb11cb27d1a7be1b78b6a35b1399341f95f76f9bd5bcd7250899`.
The integration rebuild is byte-identical to M2's package, including its
manifest. Every ZIP member and the three pinned native source hashes were
checked. The complete asset bundle stays outside Git.

From the integration checkout, assemble an immutable delivery after committing:

```sh
node scripts/stage-composite-delivery.mjs
```

The default destination is
`.build/composite-covariance-floor-v1-0.31.0-integration.16/`. The assembler
checks every input and copied output against the manifests, refuses an existing
destination, and records the engine commit and manifest hashes in `binding.json`.
It emits `runtime/`, `pyodide/manifest.json` with all listed assets, and
`statistics-runtime.json`. This is local assembly, not publication.

A packages both directories and preserves their relative files. B resolves
the configurable asset origin when constructing `statisticsRuntime`:

```js
const descriptorUrl = new URL('statistics-runtime.json', deploymentAssetsBase);
const descriptor = await (await fetch(descriptorUrl)).json();
const statisticsRuntime = {
  ...descriptor,
  url: new URL(descriptor.url, descriptorUrl).href,
};
```

The resulting configuration has `statisticsPolicy: "covariance-floor-v1"`,
`sourceSha256` equal to the ZIP hash above, and `downloadBytes: 131507535`.
Keep the trailing slash on the resolved Pyodide URL. Pass this configuration
through the existing Composite model-loading/analyzer API alongside its existing
assets and runtimes. Do not retain the previous ZIP hash or its download bound.
The worker verifies the downloaded ZIP and reports the loaded policy; the
controller rejects an incompatible policy. Serve the modules and manifest
assets from a versioned location to avoid mixing releases.

Reload the extension to load the new runtime. A fresh analysis computes the
stabilized map; previously returned result objects are not rewritten. Noise
residuals remain reusable. Map cache identities include the statistics policy,
adapter revision and source hash. Counters and policy are included in the NPZ.

Integration validation: ten targeted policy/export tests pass, including the
other M2 NPZ byte-preservation cases. Actual Chrome/WASM using the reconstructed
package preserves PCA32 with 27 regularized directions, the original 507 zero
eigenvalues, the global EM reference scale of 2 through covariance collapse,
and the explicit no-variation rejection; final accounted ownership is zero.
See `m5-composite-floor-contract-wasm-proof.json`.

The nine native/browser comparisons and full 12000×8000 source/export proof
are reused from M2; see `COMPOSITE-STABILITY-M2.md` for errors, timings and
limits. The large run is not an independent native96MP oracle or WordPress UI
test. Composite is outside the five automatic groups. The active common96MP
run remains bound to `b364e4c`; see `m5-complete-runtime-reuse.json`.
