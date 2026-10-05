Portable NumPy1.26.4 complex FFT and native-order OpenCV4.11.0 float64 pyrUp.
Source: native/resampling-math.c and the unchanged vendor/numpy-fft/_pocketfft.c.
Build: scripts/build-resampling-math.py, Emscripten4.0.15, -ffp-contract=off.
Explicit C99 fma calls remain fused through the pinned musl implementation.
The initial32MiB WASM heap may grow in16MiB steps up to512MiB; callers must admit resident
capacity, staging, working buffers and owned outputs before invoking it.
This is an internal primitive, not a complete resampling detector; docs/RESAMPLING.md qualifies the Fourier adapter only.
NumPy, pocketfft, OpenCV and musl licenses accompany the module. No model weights.
