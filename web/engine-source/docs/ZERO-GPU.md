# ZERO computation and reconstruction

The original ZERO implementation and its authors are retained in `vendor/zero/zero.c` and `LICENSE`. Its grid decisions, global significance, component populations, borders and JPEG99 branch remain authoritative.

The CPU implementation uses exact integer luminance, a separated binary64 DCT threshold filter with original-order refinement, bitsets for component discovery, and separable closing with the original interior-center border rule. A scalar build preserves the original software FMA. The SIMD build admits hardware FMA only after the instruction actually used by the computation agrees with software FMA on the runtime qualification corpus; exceptional and out-of-domain values retain the software path.

The WebGPU path computes a centered float32 threshold filter for complete overlapping8×8 blocks. It emits uncertainty bitsets; native binary64 and original-order refinement resolve every ambiguous threshold before votes are published. The GPU transport is currently bounded to4,194,304 pixels per complete native context; larger or resource-refused jobs retain CPU processing at the original dimensions. A GPU failure permits CPU fallback only after owned mappings, work and backing credits have been acknowledged. Source errors and cancellation are preserved.

Strict domains use complete admitted native RGB contexts. Each has its own unchanged ZERO populations and native boundaries. Excluded RGB is used only for display. Retained previews sample existing full-resolution scientific planes and never invoke JPEG99, voting, significance, components or closing.

Auto selection observes necessary Original/JPEG99 vote phases, including native workers, compilation, transport, threshold refinement, queue acknowledgement and acceptance. Only a conservative CPU preference can cross analysis/device lifetimes: metadata is bounded to32 entries of2KiB and expires after5minutes. No source arrays, adapters, devices or scientific values are stored in that policy. GPU preference is re-learned from consumed work in the current analysis. Explicit CPU remains available.

Rebuild using Emscripten4.0.15 with `EMSDK` set to its SDK directory:

```sh
python3 scripts/build-zero-kernels.py --targets all
```

This emits scalar and SIMD main/stream modules, their loaders, frozen cosines and relative source/resource fingerprints. Diagnostic call counters are optional (`--diagnostics`) and are not complexity metrics.

Focused ownership/policy tests use Node.js22 with module mocks:

```sh
node --experimental-test-module-mocks --test tests/zero-gpu-lifecycle.test.mjs tests/zero-native-owner.test.mjs tests/zero-preview.test.mjs tests/zero-policy.test.mjs tests/zero-controller-capture.test.mjs
```
