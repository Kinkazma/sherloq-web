LittleCMS 2.19.1 color engine (MIT), compiled using Emscripten 4.0.15. The exact
official source URL, archive SHA-256, generated file hashes and license are in
`PINNED.json`. No proprietary printing profiles are bundled.

```sh
python3 scripts/build-native-color.py \
  --lcms-source /path/to/lcms2-2.19.1 \
  --emscripten-root /path/to/emsdk/upstream/emscripten \
  --build-dir /path/to/color-build \
  --output vendor/color-managed-native
```

The application supplies a valid embedded ICC profile and explicit RGB16,
CMYK16 or Gray16 sample layout. LittleCMS accepts the ICC characterization
generically, including matrix and LUT profiles; there is no profile-name list.
The output is sRGB16, sRGB8, or XYZ float32 (PCS D50, with no added gamut clamp).
Matrix/TRC and LUT source profiles use the same LittleCMS pipeline. Profile
colorant, white-point and chromatic-adaptation tags can be inspected verbatim.
Native source samples remain unchanged and
separate from their display/model projection.

The imported WebAssembly memory maximum belongs to the application's resource
owner. Transform caches belong to that same owner and are keyed by profile
identity, sample formats, rendering intent and black-point compensation. Row
staging is reused; neither a full source image nor a second full converted image
is required. Close the owner to delete transforms and release its memory.

Nominal CICP profiles support linear and common SDR transfer functions for
BT.709, BT.2020, P3-D65 and DCI-P3 primaries. This helper deliberately rejects
PQ and HLG, which require an explicit HDR display adaptation before SDR display.

The additive Float32 entry formats preserve the source arrays and use the same
LittleCMS transforms. RGB and Gray require explicit relative units; CMYK requires
percent ink (0..100) or explicit normalized ink (converted only in the admitted
input scratch buffer). Storage precision never determines these units.

RGB8/RGB16 outputs are bounded derived SDR projections. XYZFloat32 is a D50 ICC
intermediate, not an automatic HDR tone mapping. Finite extrapolation beyond the
profile's nominal domain requires the explicit `lcms-defined` policy; this does
not assert physical characterization outside that domain. NaN/Inf and unit
overflow are refused for projection while original stored words stay unchanged.
Alpha association and orientation are handled by the typed source/display owner.
A one-channel sensor mosaic is not thereby an ICC Gray image. Existing integer
GPU/display-pipeline exports and all old UInt16 entry formats are unchanged.
