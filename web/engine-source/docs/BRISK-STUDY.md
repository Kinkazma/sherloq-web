# BRISK interpolation and orientation study

This historical detector study is retained with its original limitations.
The M3 delivery below now exposes the actual BRISK detector and pipeline; it
does not establish bit-exact orientation or arbitrary-image descriptor parity.

The pinned reference is NumPy1.26.4/OpenCV4.11.0 and the existing cloning core
SHA256161d3b3589383740fafd97cd9871f531c7ee2313db55ac5620a8c9770637db27.
All inputs are generated gray8 fields; no private photographs or model weights
are required. Original-byte decoding remains independently qualified by each
product operation; these gray8 tests do not qualify another codec path.

## Interpolation before detection

The BRISK pyramid alternates a two-thirds layer with half-sized layers. The
stock portable INTER_AREA differs from the native reference before a descriptor
is calculated. The source adaptation retains OpenCV's interpolation geometry,
coefficients, float32 accumulation and rounding. Horizontal products accumulate
with FMA. Vertical vector-prefix products add separately; the scalar tail uses
FMA. An exact integer scale uses the existing cv::resize path.

The public reproducible corpus has 680 resize stages: five stages from each of
16 synthetic images, including four around1MP, plus600 odd/even small cases,
noise, binary fields and repeated rows. Stock:90 differing cases,508 bytes,
maximum error1 gray level. Adapted:0 differing cases and0 bytes. See
brisk-area-study.json. This adaptation is gray8 only; AKAZE's float32 pyramid is
not covered. It is retained under experiments, with the complete source notice.

## Detector and angle evidence

| Corpus | Cases | Native keypoints including masks | Different angles | Other different fields | Different descriptor bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial | 48 | 55399 | 5836 | 0 | 0 |
| Expanded | 128 | 684817 | 70592 | 0 | 0 |

Counts agree on every case. The maximum angle error is3.0517578125e-5degrees.
The128 cases include32 images, large fields, narrow/tall dimensions, odd sizes,
blurred and binary textures, rotated copies, and absent/empty/half/sparse masks.
This is not a claim of unchanged descriptors on arbitrary images.

Capturing integer orientation vectors isolates the angle library. For413428
unmasked keypoints, native libSystem atan2f reproduces every reference angle.
Portable atan2f changes42703 final angles; evaluating atan2 in double then
rounding its radians tofloat changes12636. Neither changes a descriptor bin in
that particular image corpus. See brisk-angle-study.json and
brisk-angle-expanded-study.json.

A separate boundary corpus deliberately places128000 integer vectors near the
1024 descriptor orientation boundaries. Portable atan2f changes120 bin choices;
the double-to-float candidate changes38. Maximum raw-angle error is
1.52587890625e-5degrees. These are synthetic vectors, **not observed final image
detections**, but they disprove treating a small angle error as a guarantee of
identical descriptor selection. See brisk-boundary-study.json. No tolerance,
threshold, rotation count or resolution was changed to hide these differences.

## Reuse constraint

An isolated local experiment with the published polynomial from Eric
Postpischil's atan2f reproduced all33534 initial unmasked angles. The
[author identifies these sources as APSL2.0](https://edp.org/work/), which the
[FSF identifies as GPL-incompatible](https://www.gnu.org/philosophy/apsl.html).
Therefore its source, coefficients, adaptation and derived binary are excluded
from the GPL runtime and source delivery. A numerically promising local test is
not authorization to relabel or bundle that implementation. The native library
is only called as an oracle on the reference host; no native library is loaded
in the browser, and no runtime hardware-brand dispatch is introduced.

At the time of this study browser activation remained pending. The subsequent
M3 delivery uses the distributable portable atan2f with its measured boundary
limits; no APSL implementation or substitute detector is included.

## Reproduce

Use the pinned native environment and the existing Emscripten/OpenCV build
prerequisites. EMSDK points to the local4.0.15 SDK. Scripts write intermediate
inputs/binaries to .build, outside releases.

```sh
python scripts/generate-cloning-study.py --large
python scripts/build-brisk-area-study.py
python scripts/generate-brisk-area-study.py
node scripts/check-brisk-area-study.mjs
python scripts/build-cloning-study.py --native-brisk-area
node scripts/check-cloning-study.mjs --native-brisk-area
python scripts/generate-brisk-expanded-study.py
node scripts/check-cloning-study.mjs --native-brisk-area --brisk-expanded
python scripts/summarize-brisk-study.py
python scripts/build-cloning-study.py --native-brisk-area --capture-brisk-directions
node scripts/capture-brisk-directions.mjs
python scripts/check-brisk-native-angle.py
node scripts/capture-brisk-directions.mjs --expanded
python scripts/check-brisk-native-angle.py --expanded
python scripts/generate-brisk-boundary-study.py
node scripts/check-brisk-boundary-study.mjs
```

The native angle oracle scripts require the pinned Darwin reference; this
requirement applies only to development reference generation, not to a browser
product capability. No runtime calibration, preload, warmup or persistent
performance profile is added. None of these diagnostic loops run on user input.

## M3 historical pipeline delivery

`tampering.copyMove.brisk` now uses the native BRISK algorithm, qualified
INTER_AREA pyramid and explicit FMA expressions. The portable atan2f is retained;
the angle/bin boundary limitation above remains applicable. Six complete
recipes cover copied regions, partial/empty masks, flat images, alternate
controls and rendering. Node and Chrome agree with native matches, groups,
statistics and RGB outputs. Angles differ by at most3.05e-5 degrees on these
recipes; this is not a promise of unchanged descriptors for every input.
Eight ORB/AKAZE regression tests and22 classical CM2 browser recipes pass after
linking. Peak accounted memory254871098bytes; cache, JSON identity and disposal
verified. GPU Hamming and very large match fields remain resource work; no speed
claim is inferred from parity. Build scripts write exclusively inside M3.

The heap estimate now saturates at the admitted1GiB module cap instead of
refusing an image solely because a pessimistic pyramid multiplier exceeds that
cap. Real native allocation failures remain explicit memory errors. A7.08MP
flat source formerly refused by this estimate now completes through the public
API with the native zero-keypoint result and unchanged RGB, actual heap153.1MB,
peak accounted1.314GB under2GiB. This is a memory-admission fixture, not evidence
for texture-dense7MP matching performance or physical process RSS.
