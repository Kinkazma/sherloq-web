# Native reuse assessment: Echo arithmetic

The portable browser kernel in `native/echo.cpp` now avoids reflection modulo for
interior pixels and uses one float32 rounding of an exact double product+sum in
its horizontal integer domain. The domain bound and isolated measurements are
in `SEGMENTED-ECHO.md`. The vertical FMA is preserved because that bound does not
apply there. A generic replacement of FMA by double arithmetic is not valid.

No native Mac code was changed or benchmarked. The current native path already
uses OpenCV separable filters with hardware/vector arithmetic; copying this
scalar WebAssembly optimization into it is not justified by the browser result.
The reusable part is the proven domain and an exact fallback for platforms
without float32 hardware FMA. Any native adoption must preserve native ordering
and pass its own output corpus and complete-path timing before selection.
