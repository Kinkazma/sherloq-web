# Native reuse assessment: bounded median detector

The browser adapter prepares up to32 native64×64 blocks from oriented windows,
keeps the small global score/variance grid, and interpolates output rows from that
grid using the exact native factor64 rules. Published displays and grid masks have
independent owned storage; changing thresholds or display mode reuses scores.

The native MedianEngine already batches features and retains analyses. This port
therefore does not claim a new native feature-pool speedup. Potential separate
native work is avoiding the full padded grayscale allocation and the enlarged
padded RGB intermediate, while keeping every black boundary block, the zero map
border, global3×3median and exact interpolation. Browser row staging and compact
grid ownership can inform that implementation, but Python/OpenCV memory behavior
and performance need their own measurements. No native Mac source was modified.

The JSON parse bound concerns the browser's numeric-model importer; it does not
justify changing the native trained model, thresholds or probability arithmetic.
