# Native reuse assessment: segmented adjustments

The browser port separates global histograms/CLAHE interpolation/Otsu from bounded
local rows. It preserves full-row HSV arithmetic, true Gaussian halos, the native
8×8 padded CLAHE lattice and absolute-coordinate interpolation. Its WASM module
is fixed64MiB; output ownership and cancellation are explicit under the shared
engine budget.

The native application already has a bounded adjustment fallback and prefix
caches for sharpen/HSV/LUT/equalization, with global CLAHE and Otsu. The browser
port does not establish a native speedup or replace these caches. Potentially
reusable ideas are explicit accounting of intermediate lifetimes and streaming
global CLAHE tile histograms with the exact padding rule; any native adaptation
needs separate measurements and cancellation checks. No native file was changed.

The browser .21 cache of the completed pre-threshold prefix reduces the recorded
12.61MP warm view2.402s→0.144s, with37.8MB extra RAM. Native AdjustEngine already
seeks the furthest retained prefix and caches these stages. This supports browser
responsiveness, not a new native speedup or a duplicate native-cache proposal.

Browser .22 overlaps local row arithmetic and global-coordinate CLAHE histogram
construction in single-thread workers; reads/writes remain ordered. Same512MiB
12.61MP single/four-worker warm RPC2.385s→1.359s is measured locally. This does not
justify stacking workers over native OpenCV's existing threading. Native reuse
would first need one coordinated pool and separate measurements; no native code
was modified.
