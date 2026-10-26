# D2PRL input resize

The released D2PRL demo converts RGB to a Tensor before resizing to 448 × 448.
Its requirements pin torchvision 0.11.1. That Tensor resize used bilinear
interpolation without antialiasing. torchvision changed the default to `True`
in 0.17, so the equivalent modern call must explicitly specify
`Resize((448, 448), antialias=False)`.

The native application specifies this argument on the D2PRL Tensor path. The
browser implements the same non-antialiased bilinear preparation for ordinary
RGB inputs and native RGB row sources. Both retain float32 NCHW layout,
half-pixel coordinates, `align_corners=False`, and the original 448 model grid.
This does not change model weights, iterations, seed or thresholds.

The preparation identity is `d2prl-tensor-bilinear448-noaa-v1`. Its JavaScript and
WebAssembly build hashes are recorded in `vendor/d2prl/PINNED.json`. Preparation
checkpoints and strict fragment banks belong to their runtime/session instance;
they cannot be restored into another runtime from an earlier preparation.

PIL resize behaves differently: bilinear/bicubic PIL inputs remain antialiased.
The change concerns Tensor resize and does not modify the PIL-first preparation
of other models.

Historical antialiased references describe the former preparation. They do not
qualify the corrected complete model output. New generators write into separate
`*-noaa` build directories/files. Native model references must be regenerated
and compared before claiming complete output parity; preprocessing equality
alone does not establish detector quality or final mask equivalence. The small
`tests/d2prl-noaa-prepare.test.mjs` regression checks actual float32 input tensors
against explicit modern Tensor `antialias=False` oracles. It does not establish
bit identity with the unavailable torch 1.10 binary.

Sources: [released D2PRL demo](https://github.com/byc33/D2PRL/blob/a4314b614ea3186b4fac98e9e96939e37f275fc5/test_demo.py),
[released requirements](https://github.com/byc33/D2PRL/blob/a4314b614ea3186b4fac98e9e96939e37f275fc5/requirements.txt),
[torchvision Resize documentation](https://docs.pytorch.org/vision/0.17/generated/torchvision.transforms.Resize.html).
