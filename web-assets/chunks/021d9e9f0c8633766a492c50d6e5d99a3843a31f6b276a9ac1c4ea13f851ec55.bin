# CMSeg generalization — historical JPEG counterexample

M1.28 restores only the new `native512-backbone-v2` identity after the
[complete numerical repair](CMSEG-BACKBONE-REPAIR.md). The observations below
describe M1.27 and remain evidence against the former bundle.

M1.27 withdraws `cmseg-generalization` from callable public variants. Configuration
fails with `MODEL_PARITY` before fetching graphs. Its pinned identity remains
inspectable for diagnostics. Addnoise and the five qualified MGCF variants remain
separate; this failure must not be hidden by substituting any of them.

The new public synthetic JPEG produces native ROI-b probability error
1.5163421630859375e-4, exceeding the declared1e-4 maximum absolute tolerance.
Masks agree on this case; that does not waive the continuous-score criterion.
The common-worker contiguous and segmented outputs are bit-identical, including
full source-map SHA256
`586de6eb65f7f15e8b52e40b44b22c1f5772cf8463902a7b60cca91aba2d5ed2`.
Thus the counterexample exposes existing neural arithmetic, not the new row
preparation or projection. Previously positive corpus proofs are historical
observations, not evidence that this new case passes.

## Localized evidence

1. Exact native RGB/Pillow preparation still passes. Real encoder feature errors
   range1.57356e-5 to1.23978e-4 over the recorded stages.
2. Diagnostic FMA probes using captured native features reproduce every normalized
   value and six sampled full-GEMM rows exactly at all three correlation levels.
   Sequential unfused, double accumulation and four-lane alternatives do not.
3. A bounded correlation candidate with ordered float32 FMA produces all three
   complete native correlation tensors bit for bit when fed captured native
   encoder features. Gaussian arrays also agree. Native tensors are diagnostic
   inputs only and are never used by product inference.
4. With the real browser encoder, this candidate still fails: probability maximum
   1.5476346015930176e-4. It is not installed in `vendor`, and no performance gain
   is claimed. Correct local arithmetic does not establish complete-network parity.
5. Native-correlation substitution reduces the end error to2.74479e-5; replacing
   every decoder input reduces it to1.30534e-5. These oracle substitutions localize
   the material discrepancy to the encoder/correlation route; they are not fixes.

Reports: `cmseg-jpeg-arithmetic-diagnostic.json`,
`cmseg-jpeg-segmentation-diagnostics.json`,
`cmseg-jpeg-cmseg-native-fma-simd-diagnostics.json`,
`cmseg-jpeg-cmseg-native-fma-simd-native-features-diagnostics.json`, and the two
`neural-segmented-cmseg-generalization-cpu*proof.json` counterexamples. The latter
were captured before adding the public guard; the diagnostic split runner remains
available to reproduce the arithmetic without bypassing the public API guard.

## Historical reproduction and repair requirement

`scripts/probe-cmseg-jpeg.py` captures the actual native checkpoint on the new
JPEG ROI, verifies it against the generated reference and stores intermediate
arrays privately in `.build`. `scripts/build-cmseg-jpeg-probe.py` and
`scripts/check-cmseg-jpeg-probe.mjs` test accumulation hypotheses. The candidate
builder `scripts/build-cmseg-fma-candidate.py --simd` creates only private build
outputs. Run `scripts/study-cmseg-jpeg.mjs generalization` for the baseline or
pass `--kernel=/.build/cmseg-native-fma-simd/correlation.js`; add
`--native-features` only for the explicit oracle diagnostic.

Next repair work concerns real encoder arithmetic and its propagation through
all-pairs correlation. Preserve model, precision, native512 input, full search
domain and thresholds. A repaired path must pass complete native scores and
masks, not just a primitive, before restoring public availability. No native
application files or parameters were changed. There is no Mac speed gain to
transfer from this rejected candidate.
