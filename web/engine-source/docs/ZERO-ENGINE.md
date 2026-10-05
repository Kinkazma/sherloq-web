# ZERO JPEG grids — `jpeg.zero`

The native ZERO method (IPOL 2021/390) is compiled from its portable C source into
a separate WebAssembly module. Its AGPL-3.0-or-later license, attribution and
corresponding sources are retained under `vendor/zero/`; the native macOS library
is never loaded by the browser. Native GUI integration remains separate.

## Input and result

`missing` defaults to `true`: create the native JPEG99 **4:4:4** companion and
look for missing grids when an overall grid exists. `view` is 0–4, default 0:
regions, source votes, JPEG99 votes, different grids, missing grids. Input is the
unchanged decoded RGB8 image, at least 16×16. There is no hidden resizing, JPEG
sampling change or scientific threshold change.

`result.data` contains the native arrays in row-major source coordinates:

- `luminance`, `luminance_jpeg`: Float64Array, native rounded luminance.
- `votes`, `votes_jpeg`: Int32Array, -1 means no vote; 0–63 denotes grid origin
  `(value % 8, floor(value / 8))`. The outer seven pixels cannot vote.
- `mask_f`, `mask_m`: Int32Array with 0/255 detected vote pixels for foreign and
  missing grids; `mask_f_reg`, `mask_m_reg` are their native regularized regions.
- `grid_log10_nfa`: Float64Array of 64 global scores. Negative means meaningful
  under this method; it is not a manipulation probability.
- `metadata`: main grid (-1 if absent), foreign/missing regions, companion-use
  and missing-analysis flags, CPU reference flag and method identity.
- `width`, `height`, RGB `palette`, and `regionBounds:'inclusive xyxy'`. Native
  region `x1,y1` include the last pixel; convert explicitly if the UI expects
  half-open bounds. Region records preserve `grid` and `log10_nfa`.

The five views are full-resolution owned RGB8. Regions show red foreign grids and
blue missing grids, with the native darkened background and foreign-grid priority.
Four independent `result.masks` expose binary 0/1 versions, each with explicit
semantics. A regularized region is not the same as the originally detected vote
pixels. Source and companion votes remain separate, and an unanalyzed companion
vote map remains -1 rather than being presented as evidence.

Analysis/masks are cached independently of `view`; returning a different view
does not re-encode JPEG or recalculate grids. Returned buffers are independent of
private caches. These are processing clues, not authenticity verdicts.

## Numerical and resource policy

Native cosine values are frozen as portable float64 constants. Computing them
with a different libm changed real vote decisions during qualification, so the
runtime does not substitute its own cosine results. Native contraction order is
preserved through explicit IEEE FMA for the reference path.

The optimized CPU path uses a separable float64 DCT as a threshold filter. It
recomputes coefficients within 1e-8 of absolute value 0.5 using the original
multiplication/FMA order. RGB8 luminance bounds the difference between these
summation orders below 1e-9; the guard is deliberately wider. The shortcut returns
only zero-count decisions, not supposedly identical intermediate coefficients.
Constant blocks and vote ties retain the native rules. `cpuKernel:'reference'`
selects original-order votes, while `'single'` selects optimized serial votes.

At >=1 MP, `'auto'` starts requested votes directly on bounded single-thread
workers. Horizontal bands include seven-row halos and restore global grid phase;
minimum band geometry preserves the native 16-row input requirement. There is no
runtime serial comparison, warm-up or candidate sweep. The largest count allowed
by cores/geometry/memory is used initially; real completed tasks inform subsequent
concurrency. Workers are released after each pass. Source and JPEG99 passes are
scientifically required and remain sequential; each executes once. Regions and
significance remain serial. See `IMMEDIATE-COMPUTE.md`.

RGB8 is converted directly to float64 luminance with the original contractions,
avoiding two sets of three float64 input planes. The module grows on demand up to
2 GiB; admission reserves 72 bytes/pixel plus 32 MiB inside that ceiling, and the
global engine budget additionally covers decoded input, outputs, cache ownership,
presentation and worker copies. Native's 100 MP ceiling also remains. A browser
may refuse earlier; no resolution reduction follows. Accounting and WASM capacity
are reported separately and are not physical RSS. Dispose the worker engine to
release its runtime heap. No ZERO GPU path is currently qualified.

## Exports

`exportAnalysis(result,{format:'npz',maxBytes})` creates a stored ZIP of NPY 1.0
arrays, preserving the nine native names, float64/int32 types and 2D/64-element
shapes. `metadata_json` is a Unicode scalar, as in the native export;
`browser_provenance_json` additionally records the browser's source/parameters.
There is no pickle or object array. Compression differs from native's compressed
ZIP; the numerical payload is preserved. Format references:
[NumPy NPY specification](https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html)
and [NumPy NPZ writer](https://numpy.org/doc/stable/reference/generated/numpy.savez.html).

For large files, prefer `await workerEngine.exportResult(result,options,hooks)`
to perform serialization in the existing worker with budget admission. It supports
JSON/CSV where already available and ZERO NPZ. `maxBytes` defaults to 32 MiB;
a 1 MP ZERO NPZ needs about 40 MiB and therefore an explicit larger bound. A
refusal does not alter image state; aborting a running export hard-terminates
the worker, as for analysis, so reload original bytes afterwards. Export arrays
are copies; callers retain their result buffers. PNG visualization export is UI work.

## Evidence and reproduction

- 76 generated images with missing-grid analysis off/on: 152 analyses, all 64
  grid origins, RGB rounding ties, flat/striped/checker patterns, odd/narrow
  dimensions, JPEG/spliced/missing-grid cases. Native serial and parallel paths
  agree on this corpus before browser comparison.
- All votes, detected/regularized masks, region geometry, main grids and 760
  view images match. A further 1 MP encoded fixture matches all arrays/masks/views
  in actual workers. Observed maximum global-score error is 1.27e-11; every
  tested significance decision agrees. The small corpus exercises 9364 guarded
  coefficient recalculations.
- 413 samples around native log10-NFA zero boundaries retain the same decision
  within the declared 1e-8 score tolerance. Compact luminance conversion matches
  all 16,777,216 RGB8 colors against the native reference hash.
- Chrome 154, Firefox 155 and WebKit 26.6 worker suites verify pool parity,
  caches, ownership, cancellation/reload, NPZ serialization and memory release.
  NPZ is independently read with NumPy 1.26.4, `allow_pickle=False`, including
  ZIP CRC, dtypes/shapes, all arrays and non-ASCII metadata.

Run `scripts/generate-zero-reference.py`, `generate-zero-large-reference.py`,
`generate-zero-luminance-reference.py` and `generate-zero-palette.py` in the native
oracle environment. Regenerate cosines only against that native oracle; shipped
constants are platform independent. Rebuild with pinned Emscripten 4.0.15 via
`scripts/build-zero.sh`. Then run `tests/zero.test.mjs` and
`scripts/browser-test.mjs --zero`; optional `--zero-memory` and
`--zero-benchmark` are isolated resource measurements. `check-zero-npz.mjs` plus
`check-zero-npz.py` independently verify the exported archive. Native images are
generated patterns only. Physical Safari/mobile and WordPress are not validated
by these Playwright results.

Recorded sequential Chrome run: 256² original-order RPC 5367.8 ms versus 68.8 ms
optimized serial on the same votes. At 1024², optimized serial RPC samples were
2072.2 / 1600.5 / 1641.6 ms; auto selected eight workers and took
4672.8 / 977.0 / 1034.2 ms, historical pre-0.13 calibration included; current scheduling is described above. Median complete
load/raster paths were 1695.6 / 1087.3 ms. View changes reused analysis in
38.0–38.5 ms. These measurements are different from the native macOS speed.
A separate 4096×2048 uniform-input test completed unchanged-resolution analysis
with 1,702,887,425 peak accounted bytes and 579,010,560 bytes of WASM capacity,
then released tracked arrays/cache; it verifies analytical invariants, not a
new native 8 MP parity corpus. See the machine/browser-scoped JSON evidence.
