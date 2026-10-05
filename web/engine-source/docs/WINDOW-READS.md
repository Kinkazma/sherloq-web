# Exact grouped window reads

Version0.15 groups contiguous upright, full-width windows into reads of at most
4 MiB. Version0.14 read every source row separately. Partial-width rectangles
and other orientations retain their exact row-based path. Both methods admit the
same owned output and keep bounded cancellation checkpoints; no interpolation,
precision change or extra source image is introduced.

The development benchmark compares the frozen0.14 row implementation with0.15
against the same decoded noisy12000×8000 source and temporary store. Five reads
per path alternate their order. Every output checksum agrees. Codec loading,
hashing, worker-to-UI transfer and display are excluded. The source has already
been decoded/written; these are not cold disk or whole-application measurements.
There is no benchmark, probe or warm-up in the product path.

| Browser/backend | Window | Row reads, median | Grouped reads, median |
| --- | --- | ---: | ---: |
| Chrome154 / OPFS | 12000×64 | 18.9 ms | 6.8 ms |
| Chrome154 / OPFS | 12000×512 | 169.3 ms | 34.6 ms |
| Firefox155 / OPFS | 12000×64 | 2 ms | 0 ms reported; clock too coarse for a ratio |
| Firefox155 / OPFS | 12000×512 | 85 ms | 9 ms |
| WebKit26.6 / IndexedDB | 12000×64 | 44 ms | 2 ms |
| WebKit26.6 / IndexedDB | 12000×512 | 309 ms | 14 ms |

The Chrome512-row case improves4.89× at this boundary; WebKit22.1×. Ratios describe
only window reads on the development host. Raw samples include timer variability
and live in `window-read-{chrome,firefox,webkit}-benchmark.json`. Browsers ran
sequentially after the test suites, with the shared benchmark slot held by C.
The real public source/result APIs independently pass native pixel checks,
cancellation, oversized-window admission and cleanup in all three browsers.
WordPress rendering/export integration and physical devices remain separate work.

Reproduction: generate the public96MP JPEG with `scripts/generate-large-jpeg.py`,
then run `scripts/browser-test.mjs --window-read-benchmark --browser=chrome`
(or firefox/webkit). The row baseline is preserved in
`experiments/window-row-reference.js`; it is never selected by the product.
