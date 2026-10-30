# Noisesniffer native DCT graph

These source graphs describe the operations of the pinned pocketfft DCT in
`native/noisesniffer-dct.cpp`: type II, axis 1 then axis 2, orthonormal scaling,
native frozen twiddles and contracted binary64 FMA operations. They contain
arithmetic constants and source indices; they contain no image outputs.

The native byte inputs are loaded at every invocation. Opcodes are constant
(1), input (2), add (3), subtract (4), multiply (5), negate (7), and FMA (8).
The generator preserves contributing operations, the native frequency mask,
the Float32 conversion and the NumPy reduction order. Dead coefficients under
that frequency mask are omitted. The original native implementation remains
the CPU reference and the fallback for ambiguous results.

Run `node scripts/build-noisesniffer-gpu.mjs` to regenerate all WGSL files and
their identity manifest. An optional output directory supports independent
rebuild comparisons. This needs only the checked-in graph and generator
sources. The graphs originate from scalarized lane-wise tracing of the pinned
native LLVM representation; `trace-dct.cpp` is the tracing support source.
The pinned LLVM SHA-256 is
`08cec2fcb9357c5355278589bd6d1a968962a8d0b4233da0a3862ae61cfa63c4`.

GPU arithmetic uses a hi/lo Float32 pair. Conservative byte-domain error
bounds and outward Float32 variance intervals enforce the maximum absolute
variance tolerance of 1e-4. The production guard is stricter: both Float32
interval endpoints and the candidate must be bit-identical. Ambiguous cases
use the original native DCT, protecting the native unstable sorting decisions
even for tiny near-zero variances. Identical constant blocks are evaluated once natively per block size and
encountered byte value, then memoized. Their output is never replaced by an
assumed mathematical zero.

The method remains Noisesniffer by its original authors. The derived DCT graph
uses pocketfft by Martin Reinecke and contributors; see
`LICENSE-POCKETFFT.md` and the project-wide notices for the original method and
native dependencies. Numerical and decision qualification is device-specific;
unavailable or rejected GPU execution falls back to the original CPU method.
