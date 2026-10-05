# Exact dense SIMD execution

The dense runtime now uses a Wasm SIMD implementation of Zernike convolution
when the requested module compiles successfully. Four neighboring pixels occupy
four vector lanes. Each lane retains the original x-major/y-minor accumulation,
separate multiplication/addition and final complex magnitude. No reduction is
reassociated, no relaxed SIMD is enabled, and no PatchMatch candidate order is
changed. Scalar handling covers image boundaries and narrow interiors.

The pinned native sources remain unchanged. `build-dense-math.py` transforms a
verified build copy to call `native/dense-zernike-simd.h`. The build checks the
emitted Wasm contains `f32x4.mul` and `f32x4.add`, and rejects relaxed SIMD.
Required SIFT FMA intrinsics retain their single-rounding semantics, including
any vector intrinsics emitted by the compiler.

The scalar compatibility binary is byte-for-byte the previous `dense.wasm`
(SHA-256 `fe2b49935fa50e0f12565dc783f455d99931e029414282b93c1f545f1eaa61b6`).
`vendor/dense/dense.js` compiles the actual requested SIMD runtime and gives that
compiled module to its Emscripten factory. A compile failure selects the scalar
runtime for that useful job. Network and allocation failures are not silently
treated as missing SIMD. No miniature capability module, calibration, warm-up,
numerical canary or persistent profile is used. Compiled modules are reused only
inside the current worker. SIMD itself requires no SharedArrayBuffer or COOP/COEP.

`createDenseMath` keeps its existing interface. Development callers can pass
`wasmVariant: 'scalar'` or `'simd'` to force one implementation; the default is
`'auto'`. Explicit `wasmBinary` bytes must belong to the selected variant.

## Validation

The machine-readable evidence is in `dense-simd-proof.json`:

- Thirteen Node tests pass, including ten scalar/SIMD cases with identical
  descriptor bits and complete PatchMatch fields. They cover SIFT, Zernike,
  reflection, borders, patch sizes 3/8/32, compact reconstruction and resident
  descriptor seams.
- Five native reference cases retain their original qualification: all twenty
  fields have identical targets, distances and comparison counts. SIFT
  descriptors are exact. Zernike descriptor differences against native remain
  at their previous maximum of `1.1920928955078125e-7`; SIMD adds no difference
  relative to the scalar browser implementation.
- The stored 512 × 384 reflected Zernike path under a 64 MiB budget matches the
  complete in-memory field, including both output hashes and comparison count.
- Chrome 154, Firefox 155 and WebKit 26.6 produce identical scalar/SIMD hashes
  for descriptors and final fields.

One development run per variant measured useful computation with module loading,
compilation, instantiation, input preparation, descriptors and final global field
included. There was no warm-up. These small cases do not predict complete-image
or automatic-analysis throughput.

| Engine | Zernike scalar → SIMD | SIFT scalar → SIMD |
| --- | ---: | ---: |
| Chrome 154 | 482 → 171 ms | 133 → 126 ms |
| Firefox 155 | 542 → 185 ms | 114 → 105 ms |
| WebKit 26.6 | 257 → 138 ms | 135 → 135 ms |

Zernike used 192 × 144 pixels, patch 8 and reflection. SIFT used 131 × 113,
patch 8 and reflection. Both ended with two global PatchMatch iterations.

## Rebuild and reproduce

Set `EMSDK` to Emscripten 4.0.15 and `EM_CACHE` to a private writable cache, then
run `python3 scripts/build-dense-math.py`. The default builds both variants and
the dispatcher. `--variant scalar` and `--variant simd` can generate separate
development artifacts with `--output DIRECTORY`.

Run `node --test tests/dense.test.mjs tests/dense-compact.test.mjs
tests/dense-zernike-resident.test.mjs tests/dense-simd.test.mjs`.

Run `node scripts/check-dense-simd-browser.mjs` for Chromium, or set
`DENSE_SIMD_BROWSER=firefox` / `DENSE_SIMD_BROWSER=webkit`. An optional
`DENSE_SIMD_REPORT` saves the result. Existing native fixtures support
`scripts/check-dense-reference.mjs`; the independent stored-path check is
`scripts/check-dense-paged-zernike-browser.mjs`.
