# Exact reuse of SIFT continuation pyramids

A continuation is still the original SIFT Newton state `(x,y,layer,iteration)`.
The controller groups states by the 256-pixel cell containing their current
position, builds one immutable Gaussian/DoG pyramid for that cell plus the
existing 128-pixel halo, then invokes the existing native refinement and
orientation functions in seed order. It never averages, merges, drops or
re-ranks seeds. A state that leaves the qualified interior is continued in its
new cell with the same iteration count. The native five-Newton-step rule is
unchanged. This is separate from the five-failure resource-recovery guard.

## Spatial dependency bound

The bound uses the pinned native implementation, not a runtime calibration:

- `experiments/m3/sift-paged-kernel.cpp`, `m3_sift_kernel`: the kernel length is
  `cvRound(sigma*8+1)|1`, with successive sigma increments from the native
  octave layers. The oracle reads every actual kernel length from this export.
- `m3_sift_build` performs sequential Gaussian convolutions, so their support
  radii add. Subtraction to form DoG adds no spatial support. Summing all
  `layers+2` incremental kernel radii is conservative for every layer read.
- `m3_sift_refine` reads a 3×3×3 neighborhood: one extra spatial pixel. A
  converged scale has `abs(xi)<0.5` and layer at most `layers`.
- `m3_sift_finish_orientation` uses `SIFT_ORI_RADIUS=4.5`, native sigma 1.6,
  scale `1.6*2^((layer+xi)/layers)` and a one-pixel gradient neighborhood.
  `ceil(4.5*1.6*2^((layers+0.5)/layers))+1` bounds the orientation read radius,
  including rounding. The oracle checks the sum against 128.
- The current pinned kernels yield 42+18=60 pixels for three layers and
  40+17=57 for four layers. Both are strictly inside the unchanged 128-pixel
  guard. At a true image edge the cropped pyramid uses the same native border
  rule; the guard is required only at artificial internal edges.

`src/sift-paged-worker.js` checks the 128-pixel interior before each native
Newton neighborhood and its resulting orientation. No native arithmetic or
Wasm artifact changes. The oracle includes varying row pitches and SIMD tails;
it compares each seed's status, final state and every float bit, before any
native global selection is applied.

## Ownership and publication

Batch output has one status and Newton state per original seed plus point
spans. The maximum point capacity derives from the native 36-bin orientation
histogram. The complete allocated buffer remains accounted, including unused
capacity. An exact-window pyramid cache stays inside its existing admitted
worker heap; replacing the key or retiring that worker releases it.

The checkpoint scatters completed groups back to the original seed indices.
It publishes only the consecutive ready prefix, retains later groups and
returns each group owner only after its last seed has been consumed. An atomic
point-page append can fail without advancing the publication index. Explicit
resume consumes the retained native result; it does not recalculate successful
batches or duplicate their points. The five-failure guard remains unchanged.

## Qualification

`tests/sift-continuations-native.test.mjs` uses the real pinned Wasm through
production workers. It covers 600×440, 603×439 and 517×515 octave bases, three
and four layers, 64 real detected extrema plus every layer at twelve border,
corner and cell-boundary anchors. The cases exercise three to five continuation
rounds and the native five-step limit. Exact seed results are then fed in their
original order into native global selection, descriptor extraction and G2NN;
these ordered results must also match. There is no comparison-time sorting of
point outputs.

The corpus reduces continuation pyramid builds from 97–100 to 5–10. This is a
count of eliminated useful recomputation, not a prediction of total 96 MP
latency. `tests/sift-continuations-browser-worker.js` repeats the odd-pitch
cases in Chromium on CPU and WebGPU. `tests/sift-continuations.test.mjs`
injects five consecutive publication refusals with out-of-order seed groups,
then verifies explicit resume, no recomputation, no duplicate points and zero
remaining ownership. No calibration or preflight dispatch is used by runtime.
