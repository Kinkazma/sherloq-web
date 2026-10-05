# Guarded double-precision FMA

The Sewar convolution keeps the original order of operations, including the
four-product groups and fused multiply-adds. `native/comparison-fma.h` accelerates
the fused operation without reducing the precision. `cpuKernel: 'reference'`
selects the original software FMA. Qualification and timings are separate.

The fast path requires round-to-nearest binary64, disabled contraction and no
reassociation. Nonzero factors must have magnitude in [2^-200, 2^200], and the
addend must be zero or have magnitude in [2^-400, 2^400]. These intentionally
narrow bounds exclude overflow and underflow in all error-free transformations.
Every other input uses `std::fma`, including nonfinite numbers and zero factors.

Dekker splitting produces `p + pe = x*y` exactly. Three error-free TwoSum
transformations then give `s + se = p+z`, `t + te = pe+se`, and `r + re = s+t`.
Thus the exact answer is `r + re + te`. The implementation computes the distance
`h` from `r` to its nearer rounding midpoint, including the smaller adjacent
spacing at powers of two. It accepts `r` only when
`2*abs(te) < h-abs(re)`; otherwise it calls `std::fma`.

For `abs(re) >= h/2`, the positive difference on the right is exact by Sterbenz's
lemma. For smaller residuals, rounding that difference cannot inflate it by a
factor of two, so the same strict inequality remains sufficient. Accepted exact
answers are strictly inside the rounding interval. Halfway cases, cancellation
to zero, and out-of-range results use the reference routine. Bounded scaling by
a power of two is exact and can directly use the subsequent rounded addition.
Signed zero and exceptional cases are left to the reference path where needed.

The underlying error-free transformation requirements are described by
[Fasi and Mikaitis, section 5](https://eprints.maths.manchester.ac.uk/2790/1/fami20.pdf).
The rounding guard above is local implementation reasoning, not a claim that
this implementation has received an independent formal verification.

The executable arithmetic check compares bits with `std::fma` on unrestricted
IEEE patterns, bounded normal numbers, exact and near cancellation, values
typical of convolution, halfway traps, signed zeros, subnormal numbers and
infinities/NaNs. It compares NaNs by classification. It complements the range
argument and the complete native comparison corpus; random sampling alone is
not treated as a proof of correctness.

## SIMD convolution

`native/comparison-simd.h` computes two independent output pixels per vector.
Each lane keeps SciPy's kernel row order, four-product grouping and fused tails.
The kernel factor's split is prepared outside the output loop. Normal-range
checks, residual guard and software FMA fallback apply independently to each
lane. Zero inputs use their exact multiply/add result only with a bounded finite
factor and addend. Odd output columns use the scalar guarded operation. Zero
padding is materialized with the same asymmetric anchor as the original
convolution; valid convolution still swaps the operands in the native tiny-image
case. No precision-changing relaxed SIMD instructions are used.

The isolated experiment compares original loops/software FMA, contiguous
loops/software FMA, and contiguous guarded SIMD separately. The earlier scalar
arithmetic-only attempt remains recorded: 48,004.8 ms median full 1 MP RPC versus
43,594.7 ms originally. It was rejected as a default because it was slower.
