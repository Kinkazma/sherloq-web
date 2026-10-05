# Automatic panel detection

`subimages.detect` exposes native `core/auto_zones.py:detect_panels` on original
decoded RGB8. It returns geometric proposals for rectangular sub-images separated
by flat coloured gutters. It does not classify authenticity, run clone searches,
compute ELA energy, or enable `analysis.complete`.

There are no scientific parameters. Native behaviour is preserved: sample step
`ceil(max(width,height)/1800)`, wrapped neighbours in the palette sample, flat
differences at most 2, eight most frequent quantized BGR bins with stable ties,
channel medians truncated to integers, colour distance 14, 3×3 morphological
closing, eight-connected components, occupancy/border/size filters, largest-first
overlap suppression, and native row ordering. Sampling is the native palette
rule; component masks and returned coordinates remain at full resolution.

`result.data.polygons` contains the four inclusive pixel-centre vertices in native
order. `result.data.regions` contains `{id:'panel-N',bounds:[x0,y0,x1,y1]}` with
integer half-open rectangles for `createAnalysisScopeController`. IDs are scoped
to this image/result, not persistent feature identities. There is no raster or
binary authenticity mask. Empty detection stays empty; it does not select the
whole image implicitly. JSON preserves both coordinate forms and provenance.

## Qualification

144 generated original-byte cases reproduce every decoded pixel and polygon in
Node, Chrome154, Firefox155 and Playwright WebKit26.6. They cover small/odd/1MP
dimensions, native sampling boundaries, flat/noisy inputs, coloured gutters,
palette ties and the eight-bin limit, median/colour thresholds, minimum sizes,
occupancy/border examples, connected shapes, overlaps and row order. Codec paths
include progressive JPEG at two qualities with orientations 2–8, RGB/gray16-bit
TIFF and alpha-bearing TIFF. The reproducible native oracle uses NumPy1.26.4 and
OpenCV4.11.0; source and compressed/raw payload hashes are in the fixture.

Node tests also cover cache ownership, unknown parameters, explicit GPU/region
refusals, filled shared-budget refusal and retry, useful-work cancellation, and
the actual detector wired into scope orchestration. Browser tests exercise the
worker API, JSON, source unload, hard cancellation and original-byte reload.
Empty detection never invokes the test analysis callback. These tests do not
qualify a complete-analysis implementation or WordPress integration.

Proofs: `auto-zones-*-proof.json`. Tests: `tests/auto-zones.test.mjs`,
`tests/auto-zones-browser.js` and `tests/analysis-scope.test.mjs`.

## Resources and measured chain

One computation worker, CPU only, full-memory inputs only. Admission reserves
`6*pixelCount + 2*sampleCount + 32768*4 + 8192` bytes for work arrays and fixed
allowances, plus 2048 bytes per accepted proposal before allocation; engine result
copies and caches have their own shared-budget accounting. This is not process
RSS. Insufficient budget fails explicitly and releases reservations. No hidden
resizing, lower precision, altered threshold, GPU substitution, runtime probe or
persistent performance profile is introduced.

Isolated M1 Max/Chrome154 measurements retained three alternating cold useful
runs per mode, including worker startup. Both `single` and `auto` use the same
single-worker detector; the measured differences are not an optimization gain.

| Input | Auto load median | Auto RPC median | Auto complete chain median | Peak accounted bytes |
| --- | --- | --- | --- | --- |
| 257×193, four panels | 74.4 ms | 25.6 ms | 100.7 ms | 35,109,374 |
| 1031×1024, outer-edge panels | 87.4 ms | 119.2 ms | 206.8 ms | 63,650,717 |
| 1031×1024, tied palette | 75.8 ms | 319.6 ms | 397.4 ms | 58,928,414 |

Cache RPC medians were 0.3–0.4 ms; RPC minus engine time 0.5–0.6 ms.
One warm source reload per mode took 2.2–18.3 ms, with fresh detector RPC
13.7–360.4 ms; these individual observations do not demonstrate a warm speedup.
Illustrative geometry-only Canvas submission took 0.2–0.5 ms median, not physical
paint. All measured polygons equal native. `auto-zones-chrome-benchmark.json`
retains every cold sample, warm observation, cache check and cleanup.

Parallel palette work and GPU morphology are not qualified. Other functions in
`auto_zones.py` (enclosing, diagonal, gap/distance policy, compact axes/points)
are separate dependencies of clone analysis and are not provided by this operation.
Physical Safari, mobile, non-Apple hardware and segmented inputs remain open.

## Reproduce

```sh
python scripts/generate-auto-zones-reference.py
node --test tests/auto-zones.test.mjs tests/analysis-scope.test.mjs
node scripts/browser-test.mjs --auto-zones
node scripts/browser-test.mjs --auto-zones --browser=firefox
node scripts/browser-test.mjs --auto-zones --browser=webkit
node scripts/browser-test.mjs --auto-zones-benchmark
```
