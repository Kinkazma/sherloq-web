> Scheduling update in 0.13: runtime calibration below describes historical
> measurements only. Current CPU/GPU calls start useful work immediately;
> see `IMMEDIATE-COMPUTE.md`. No native Mac change is implied.

# Pixel engine tranche — 0.3.0

Five additional native tools now have callable CPU implementations. This is not
completion of the 50-panel application. Panel status stays **partial** because
WordPress controls/rendering and other browsers/devices have not been validated.
All compute parameters below preserve the native defaults and ranges; resource
profiles do not change them. No input is rescaled.

| Operation / panel | Implemented controls | Returned scientific data |
| --- | --- | --- |
| `inspection.histogram` / 2:1 | `channel` 0–3 = R/G/B/value (default 3), `start` 0, `end` 255; reversed bounds sorted | Exact four-channel 256-bin counts, cumulative counts, unique colors/ratio and native range summaries; float64 holds integer counts exactly for admitted images |
| `colors.stats` / 4:3 | `mode`: min (default), avg (middle), max; `inclusive`: false | RGB rank visualization; inclusive ties use native R, G, B precedence |
| `noise.planes` / 5:2 | `channel` 0–4 = luminance/R/G/B/RGB norm, `bit` 0–7, `filter` 0–2 = off/median/Gaussian; defaults 0/0/0 | RGB display plus original binary plane; Gaussian display is not relabeled a binary mask |
| `noise.minmax` / 5:1 | `channel` 0–4, `minimum` 1, `maximum` 0 (colors R/G/B/white/black = 0–4), `filter` 0–5 | Strict eight-neighbor min/max masks; excluded outer border; native density display uses block radius `filter + 3` |
| `pixels.defects` / 9:2 | `radius` 1 or 2 (3×3/5×5), `threshold` 1–255 (32), `spread` 0–255 (32), `kind` 0/1/2 = both/hot/dead, `mode` 0/1/2 = overlay/mask/correction | RGB channel flags, combined bit mask, candidate-pixel count, compact coordinate rows and exact native CSV |

`noise.planes` preserves the unusual historical RGB norm convention: truncated
square root modulo 256. Median filtering replicates borders; Gaussian 3×3 uses
reflect-101 and integer 1–2–1 weights. `noise.minmax` norm comparisons use exact
squared magnitudes; ties are not extrema. Constant and tiny images have explicit
native-compatible behavior. Mask pixels remain in source coordinates with origin
(0,0), identical dimensions and no interpolation.

Defect mask codes: 0 none, 1 hot, 2 dead, 3 both (different channels). Channel
flags use RGB order and values 0/1/2; they are not RGB colors. Candidate rows are
`[x,y,rgbChannelIndex,flag,originalValue,replacementValue]` in native y/x/B/G/R
iteration order. Correction changes candidate channels only in a derivative.
It never changes `original()` or `imagePixels()` and does not diagnose a sensor.

## Verification

`generate-pixel-reference.py` imports the actual native classes and records their
source SHA256, OpenCV and NumPy versions. Nine generated cases cover odd sizes,
all 27 channel ties/orderings over 0/127/255, black/white 1×1, constant images,
1×9/9×1, 2×2 and targeted hot/dead/border/threshold pixels.

2,682 parameterized native outputs are compared in Node and in a real Chrome
module worker, including exact RGB/masks, histogram summaries and candidate
counts. Every bit/channel/filter combination is covered. Min/max colors and
filters, defect kinds/views/radii and threshold/spread endpoints are exercised.
The browser suite also verifies all 486 native defect CSV byte hashes. This is
finite fixture evidence, not a proof for all possible images or devices.

Lifecycle tests verify cache ownership, shared budget admission, progress abort,
no partially cached result, BUSY rejection, hard worker termination and explicit
reload. A 4,097×4,097 constant image tests histogram counts beyond 2²⁴.

## Measurements and limits

`pixel-smoke-measurements.json` records a single 1,024×1,024 synthetic JPEG run per
operation, transfer-inclusive worker RPC and warm result requests. Observed cold
RPC was about 6/9/10/24/95 ms respectively, warm about 0.2/1.2/2/2.9/8.9 ms on that
run. These are smoke observations, not statistically established performance gains.
JPEG load was measured separately; display is excluded. Desktop co-load and JIT
state are not controlled. Only the cached result is reused across repeated calls;
histogram range/channel changes additionally reuse the raw histogram analysis.

All five currently execute on **one CPU worker**. No GPU or multi-worker speedup
is claimed for them. Existing ELA calibration remains independent. Buffers and
cached result payloads use the engine's shared budget; defect admission includes a
conservative worst-case coordinate table and defensive clone. Budget metrics are
accounting estimates, not browser RSS. Returned buffers belong to the caller and
leave engine accounting. Explicit export has its own caller-controlled byte cap.

Full-frame only. Input decoder support remains restricted JPEG or explicit RGB8
with provenance. EXIF/ICC/TIFF/high depth and the other native engines are still
listed separately as unavailable. JSON can export all five results; CSV supports
histograms and native-compatible defect coordinates. PNG presentation/export is
an interface responsibility, not an alternative analysis decoder.
