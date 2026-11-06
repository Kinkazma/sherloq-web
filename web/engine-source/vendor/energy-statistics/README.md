# Exact Energy statistics kernel

`statistics.wasm` implements the existing Float32 pairwise sum and squared
deviation reduction. It keeps eight independent accumulators, the original
128-value recursion boundary and splits aligned to eight values. SIMD performs
only the independent lane operations; the final addition tree is unchanged.
The companion filter performs stable in-place compaction of center, low and high
values with the original inclusive comparisons. The caller copies complete
blocks of at most 8192 values and appends the kept values in their original order.

Rebuild with LLVM clang and lld 23.1.0:

```sh
CLANG=/path/to/clang WASM_LD=/path/to/wasm-ld python3 scripts/build-energy-statistics.py
```

No libc or external source is linked. Compilation disables fast math,
reassociation and floating-point contraction. The module imports exactly one
64 KiB memory page, with a 16 KiB stack and no growth. `__heap_base` bounds the
aligned input of at most 8192 Float32 values. The JavaScript owner verifies the
pinned size/SHA before instantiation and retains the memory until backing ACK.
The existing JavaScript reducer remains the fallback. Source and build identity
are recorded in `PINNED.json`.
