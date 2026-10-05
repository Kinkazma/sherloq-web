# Native reuse assessment: signal separation

The browser implementation streams full-width row groups with real halos and
keeps whole-image histogram normalization separate from filtering. Source and
output can use bounded temporary storage. It preserves the historical NLM meaning
of radius (strength), the fixed7×7/21×21 windows, bilateral arithmetic, color
conversion tails and the original image-edge policies.

The native NoiseEngine already has a bounded fallback and separate caches for
filtered images, residuals and renders. Compare that implementation before adopting
any browser staging ideas. The browser port has no measured Mac speedup and has
not replaced those native caches. Potential reuse is precise memory accounting,
owned result lifetimes and a global histogram pass without full residual copies.

The float32 histogram-count fix corrects the browser magnifier, not the native
OpenCV reference. No native source, threshold, model or CPU/GPU selection changed.

Browser .17 additionally overlaps independent row jobs with single-thread64MiB
heaps and ordered storage. Four workers reduced the recorded96MP Gaussian warm
RPC from20.737s to8.021s under the same768MiB budget, including the resulting
RAM-to-OPFS output tradeoff. This does not establish a native Mac acceleration:
native OpenCV already has its own threading and bounded/cache paths. Any reuse
must coordinate those threads rather than layering an independent N×N pool.

Browser .19 retains optional private raw filter/residual RGB and global counts,
with explicit borrowing/accounting and immutable owned outputs. The recorded96MP
warm view improves7.434s→1.144s, at a0.653s cold penalty and288MB cache footprint.
The native engine already caches these stages; this browser measurement does not
justify a second native cache or a native performance claim.
