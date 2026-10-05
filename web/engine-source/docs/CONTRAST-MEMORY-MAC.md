# Native reuse assessment: contrast block rows

`native/contrast-bands.cpp` computes native histogram error and channel similarity
from a core row of blocks with actual neighboring rows. The full image's zero
padding and additional map row/column remain explicit. Float32 grid values survive
until the global byte conversion/median operation; only the output repetition is
streamed. This avoids retaining image-wide gray, three derivative channels, tri
and average arrays merely to produce a compact grid.

The NumPy reduction correction is specific to the browser port:8192-element
partial sums combine in order, with the existing pairwise reduction inside each.
The native implementation already executes that NumPy behavior. Its output should
not be changed to match the earlier browser defect.

No native Mac code or performance was changed or measured. The native module
already has a bounded implementation; compare that path before adopting this
strategy. A native revision must retain padded neighbor derivatives, zero borders,
float32/f64 arithmetic, the complete-grid median and actual partial edge cells.
The browser functional timings do not establish a Mac speedup.
