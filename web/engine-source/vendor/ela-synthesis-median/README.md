# Exact RGB8 synthesis median

`median.wasm` reduces already-computed, frame-major RGB8 bytes. Each channel is
independent. Odd axes select rank `count >> 1`; even axes take the central pair
and truncate its mean to uint8. The module changes neither ELA nor equalization.

The freestanding kernel uses standard WebAssembly SIMD128, with sixteen byte
columns per vector. Counts use unsigned 16-bit lanes when the axis has 256
entries. A scalar tail handles arbitrary byte windows. Memory is imported,
fixed in extent, and owned by the reduction phase; the caller bounds each call
for cooperative cancellation. Unsupported SIMD uses the exact JavaScript path.

Rebuild with LLVM clang and lld 23.1.0:

```sh
CLANG=/path/to/clang WASM_LD=/path/to/wasm-ld python3 scripts/build-ela-synthesis-median.py
```

The script regenerates the physical module, `PINNED.json` and its JavaScript
size/SHA-256 pin. Runtime loading verifies the complete module before
compilation. Source: `native/ela-synthesis-median.c`. License: GPL-3.0, as in the
engine's `LICENSE`; a copy accompanies the module.
