# Dense clone presentation correction

PatchMatch Zernike could finish `dense-geometry` and then fail with
`INVALID_INPUT: Invalid sparse render input`. Dense postprocessing stores points
as Float32Array; the shared sparse renderer required Float64Array and its native
ABI reads doubles. Other dense profiles share this path.

The renderer now accepts both supported types and writes their numeric values
directly into HEAPF64. Compact evidence stays Float32 in the analysis cache and
scientific exports. The drawing heap admission counts eight bytes per point
component, with no extra full Float64 JavaScript buffer. Kernel disposal now also
covers renderer initialization failures. Detection settings, algorithm outputs,
workers and concurrency policies are unchanged.

Previous adapter tests substituted the renderer, while older dense drawing tests
used a different renderer. Neither covered this integration boundary. The new
regression executes the actual native renderer and the adapter's default surface
publisher, checks float32/float64 pixel parity for every drawing flag, confirms
that a view change reuses evidence, and checks release of memory reservations.

Validation: `node --test tests/copy-geometry.test.mjs tests/dense-adapter.test.mjs
tests/dense-render.test.mjs` (23 tests). `scripts/check-dense-render-browser.mjs`
runs the public worker protocol in isolated headless Chromium on a supplied PNG.
`docs/dense-render-browser-proof.json` records the exact reported spiral fixture,
its SHA256, default parameters, completed surface, changed output bytes and
cached redraw. This verifies this failure path, not every scientific algorithm.
