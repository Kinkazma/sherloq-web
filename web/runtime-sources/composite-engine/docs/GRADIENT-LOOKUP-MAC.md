# Reusable native opportunity: exact gradient tables

Browser evidence: `gradient-optimizations-chrome-proof.json`. The selected
candidate reproduces640 native gradient outputs and the complete96MP reference
display exactly. This document proposes reuse; **no native Mac source was changed
and no Mac performance gain was measured**.

Two independent finite-domain calculations are repeated per pixel:

- Each signed3×3 luminance Sobel derivative is an integer in[-1020,1020]. For
  each of `mx,my` and the inversion flag, evaluate the existing float32 direction
  expression for all2041values, preserving neutral127 at zero maximum. A lookup
  then replaces per-pixel division/multiplication. Each maximum and inversion
  change invalidates the corresponding table.
- Mode3 uses red and green **after uint8 direction conversion**. Its float64
  square root/normalization can therefore be evaluated for65536pairs. The scale
  and shift must come from the actual image's extrema; taking extrema over all
  table entries would change the algorithm. Preserve the native fused/non-fused
  small-image rule and truncation conventions. Cache key: scale, shift, fusion
  rule. Lookup index: `uint16(red)*256 + uint16(green)`.

Together the byte tables use69618bytes. `native/gradient.cpp` provides portable
implementations. They eliminate repeated expressions without changing resolution,
precision, normalization domain or thresholds. The browser comparison isolated
the length table first, then the direction table; the additional integer-extrema
variant had no established benefit and is not selected by default.

A native integration would need to retain the actual native float32/FMA order,
check the same output corpus and measure its own complete path. NumPy indexing,
temporary arrays and native vectorization have different costs from WebAssembly;
the observed browser times cannot be transferred to the Mac implementation.


The .23 browser derivative cache reuses exactly the raw signed Sobel pairs plus
source-wide derivative extrema across display settings. Mode3 length extrema must
be recomputed after inversion; a cache of those extrema must include inversion.
At96MP the4N-byte cache occupies384001776bytes including its metadata. It replaces
the working slope store rather than duplicating it, is evictable and preserves
independent outputs. The isolated browser warm RPC improved1.40× at1GiB; no cold
gain or Mac gain is established. A Mac implementation should first check existing
native cache ownership and budget before retaining another copy; native files
were not changed by this delivery.
