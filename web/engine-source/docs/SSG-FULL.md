# Full SSG local browser port

`SsgFullEngine` executes the complete detector: VLFeat DoG/SIFT frames, Bessel–Fourier word invariants and I2NN, the original structured-edge forest with sharpening, salience-weighted spatial phrases, displacement/phase filtering, RST MLESAC and SSIM/ROI mask localization. This is the `paper-v2-full` implementation. The earlier word/phrase core alone is not presented as the complete detector.

Source: [Spatial Structure Graph for Copy-Move Forgery Detection](https://arxiv.org/abs/2207.09135v2), DOI `10.1109/TIFS.2023.3234861`; [author implementation](https://github.com/ChaoWang1016/word2phraseCMFD), pinned at `66bb26eca0c7e95c76042d5bcca58f744d70a27d`. Numerical definitions and deliberate differences are recorded below. There is no claim of bit-for-bit MATLAB end-to-end parity.

## Entry and output

`new SsgFullEngine(image, budget, profile).analyze(parameters, hooks)` accepts an immutable `rgb8` image, either tightly packed `Uint8Array` data or the leased `rgbRowSource(surface).readRows(y, count, {signal})` contract. Every row lease is released, including failed preparation. The source and results remain in original oriented pixel-centre coordinates; analysis enlargement is internal.

`hooks.models['ssg-edges']` supplies the manifest identity `{url, bytes, sha256}`. The current local forest manifest SHA-256 is `62ce0d714bd265962a1964c5ba345463b90eb9e23c66f1772cb1969908c06988`. The manifest pins every standard NPY array and both runtime variants. Each fetch retains its admitted backing through its native copy or module initialization, with URL/status/hash/cause diagnostics from the shared verified downloader.

Results contain `points` (Float64, seven columns), `pairs` (Float64, source ID, destination ID, accepted flag, original spatial distance), one `pair_search_regions` owner per pair, `groups`, fitted `models`, display colours, and the original-size `mask` (Uint8, values 0/1). The accepted flag is not a probability or descriptor distance. `models[].ssg` records MLESAC iterations, threshold and score definition. A noiseless source likelihood of +Infinity is exported as `score: null, nonfiniteScore: 'positive-infinity'`, preserving its meaning in JSON without changing model ranking. Each result has an idempotent `release()`; call `dispose()` on the engine when its immutable source is retired.

The mask is the localized native union, including holes and separated components. It is not a convex hull generated from the displayed links. Changing link visibility does not change this scientific mask.

## Parameters

| Parameter | Default | Meaning |
|---|---:|---|
| `normalizationLongEdge` | 3000 | Enlarge a smaller source to this long edge. Zero explicitly uses original size. Larger sources are not silently reduced. |
| `minimumDistance` | 100 | Minimum spatial separation in analysis pixels. |
| `ratio`, `absolute` | 0.6, 0.1 | Word matching ratio and second absolute-neighbour threshold. |
| `spatialK` | 3 | Neighbours used in phrase spatial pooling. |
| `salienceSigma` | 0.001 | Gaussian structured-edge salience scale; also the finite radial ROI weighting scale. |
| `roiRadius` | 50 | Counted-map grayscale disk dilation radius. |
| `maskThreshold` | 0.4 | Final SSIM/ROI localization threshold. |
| `minimumArea` | 0.0001 | Component size fraction. |
| `ssimRadius`, `ssimOpening` | 3, 4 | SSIM Gaussian sigma and mask opening disk radius. |
| `rngSeed` | 1 | Reproducible MLESAC sampling seed. |
| `regions`, `excluded`, `compare` | [], [], false | Polygon search constraints and optional explicit comparison of two regions. |

`limit` is zero in the SSG UI; generic maximum-match controls do not truncate this detector. Full reflected matching and an explicit WebGPU request are rejected, rather than substituting ordinary matching or a hidden CPU fallback. SSG intrinsically estimates rotation, scale and translation. The current full photographic qualification covers translation; primitive RST fitting and descriptor quarter-turn invariance have independent tests, but that is not a complete rotated/mirrored image qualification.

## Scientific definitions and script differences

* I2NN retains both absolute neighbours, following the paper. The author's executable script keeps only the first in its corresponding branch.
* Structured-edge salience uses the paper Gaussian `exp(-sigma * distance²)` with finite three-sigma support. The script's written kernel uses `exp(-sigma * distance)`.
* Point columns are deduplicated; the script's `unique(points, 'rows')` and row-vector phase-filter loop are not reproduced as accidental indexing behaviour.
* MLESAC keeps the author's similarity model, symmetric forward/inverse error, threshold `13.278488654186267` and 128-point gamma likelihood grid. Sampling is uniform without replacement using a reproducible LCG, or an explicit sample stream; it is not MATLAB's clock-seeded Twister. There is one least-squares consensus refit. No OpenCV affine RANSAC substitute is used.
* SSIM receives double data with dynamic range **1**, constants 0.0001/0.0009/0.00045, exponents `[3,1,2]`, Gaussian sigma 3 by default, three-sigma support and replicated SSIM borders. Its Gaussian preprocessing uses 15×15, sigma 2 and zero borders.
* ROI pixels are counts of strict feature-support disks. Dilation is a grayscale maximum, not early binarization. Radial convolution is finite, zero padded and normalized by the mean of filtering the three-valued kernel-sized normalization image. Overlap-save FFT preserves this radial kernel; it is not replaced by a separable Gaussian.
* Morphological disk decomposition is padded for the whole footprint before its periodic-line operations, then cropped once. This avoids the loss of border paths that occurs when each line is prematurely cropped. Published MATLAB footprints of disk 4 (37 pixels, 7×7) and disk 5 (69 pixels, 9×9) have independent exact tests. The complete disk-50 footprint has no direct MATLAB oracle here; metadata states that limitation. Its decomposition has the published 99×99 extent.
* `correlation.m` removes a rejected component with `RhoXY(r,c)=0`, which addresses a Cartesian product of rows and columns and can remove unrelated pixels. This port intentionally removes only the component's linear pixel indices. The independent review saves a counterexample. The later localization checks already use linear indexing in the original source.

## Workspace, parallelism and reuse

The forest's seven standard arrays occupy 218,140,772 payload bytes. The original compressed `model.mat` and NPY files remain standard reusable library assets; the manifest is integrity/provenance metadata. Shared-memory mode has one model, not one copy per worker. An admitted CPU team performs independent forest columns, salience Gaussian planes and exact nearest-neighbour queries; non-isolated browsers use the single-thread variant. CPU leases describe admission, not measured physical utilization.

Phrase matching uses an exact balanced KD-tree with stable coordinate/ID tie ordering, not an approximate index or a dense N² distance matrix. Displacement DBSCAN collapses only exactly coincident coordinates into weighted vertices and preserves their original order and density. Both changes are tested against the original Float64 core without caps on resolution or points.

Native arenas have a geometry-derived wasm32 maximum and reusable scratch. Failed forest arenas are retired before retry; even a cleanup failure cannot replace the allocation cause. Pthread pools are terminated on retirement. Geometry that exceeds the qualified 2 GiB arena yields a detailed `MEMORY_LIMIT`; there is currently **no banded large-image SSG path and no 96 MP SSG qualification**.

Each engine retains at most one budgeted native checkpoint: normalized gray, feature coordinates, accepted pairs, fitted groups/models and provenance. It does not retain RGB, the forest arena, or accumulating masks. Edits to `maskThreshold`, `minimumArea`, `ssimRadius`, `ssimOpening` or `roiRadius` recompute localization from that checkpoint. Edits affecting preparation, extraction or matching replace it. Cache entries are evictable when idle and pinned while used. Returned groups and model indices do not alias transferred checkpoint buffers.

## Local qualification and limits

Run `node --test tests/ssg-full.test.mjs tests/ssg.test.mjs tests/ssg-vlfeat.test.mjs` (42 tests at integration). Compiled C++ phrase IDs, descriptors and distances are bit-identical to the core JS formula; weighted DBSCAN pairs, clusters and original row IDs match the prior implementation.

The actual pinned native x86/SSE forest and compiled scalar/shared WASM were compared on a 97×113 textured fixture: zero differing leaf IDs (11,600) and zero differing final edge pixels (10,961). Scalar and ten-thread WASM outputs were byte-identical. Channel intermediates differ by at most 1.12e-6; final decisions match. The adapter preserves the original approximate SSE reciprocal/reciprocal-square-root instruction values through generated tables and aligned buffers.

An independent SciPy oracle qualifies disk-4/5 borders exactly, blur within 5.69e-14, ROI within 1.44e-16, and SSIM within 7.16e-15 with zero threshold-decision differences. This is an independent numerical reference, not a MATLAB border/window oracle. The local review is under `method-integration-resources-20261012/ssg/ssim-roi-independent/`.

`scripts/qualify-ssg-full.mjs` runs the real native pipeline from private fixture files and writes masks, points, pairs and a receipt. A 660×340 duplicated photograph at the default normalization of 3000 produced 26,190 retained descriptors, 21,936 pairs, six localized models and a 223,858-pixel mask in 17.13 s in a local Node run (ten admitted CPU workers, peak accounted 1,247,162,082 bytes, final budget zero). A 320×320 single photographic region at original size produced 13 words, four phrases and no final pair/mask; it actually ran the forest.

`scripts/qualify-ssg-full-checkpoint.mjs` uses real leased surface rows and transfers the published output buffers. On the positive default-3000 case, threshold 0.4→0.8 changed the mask from 223,858 to 223,011 pixels; returning to 0.4 restored every byte. Both subsequent runs performed zero extraction, zero forest, zero matching and zero downloads. Checkpoint size remained 38,481,592 bytes; every row lease was returned and final budget was zero. These local wall times are receipts, not universal browser or machine performance promises. The parent integration task separately performs the true application UI run.

## Restricted assets

The author's forest/toolbox is under MSR-LA and the author repository retains its own restrictions. No redistribution permission is inferred. `scripts/build-ssg-full.py` deliberately emits its copied restricted source, forest runtime, standard model arrays and manifest only into an explicit **private** directory. Those assets and photographic fixture proofs must not enter a public Git repository or public distribution. The independently written full-detector adapters, math, tests and the BSD pocketfft dependency do not grant a different licence to the restricted forest. Any public availability of this complete detector requires resolving that dependency's licence separately.
