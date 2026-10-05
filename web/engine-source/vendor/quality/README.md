Bounded binary64 quality-curve normalization, Emscripten4.0.15.
Source: native/quality-normalize.cpp; scripts/build-quality-arithmetic.sh.
The module has a fixed128KiB heap and processes exactly100 samples. Native
float64 fused rounding is preserved before the regression model float32 cast.
C99 fma is supplied by the pinned Emscripten musl library. Its upstream fma.c
and full MIT/musl copyright notice are retained here. No model weights included.
