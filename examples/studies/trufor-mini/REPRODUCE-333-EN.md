# Reproducing the channel 333 readout

This supplement specifies the operations needed to recover the response shown in the examples.

## Model and input data

Use the full TruFor network with the `mit_b2` configuration, a 512-channel `MLPDecoder`, RGB and NP++ branches, and the confidence and `confpool` detection heads. The original study checkpoint has the following SHA256:

```text
2845912ff57f33502abea6a2075eecacd093a553825515691598c04ca5e94c12
```

The [complete script](extract_channel333.py) loads `trufor.yaml`, disables loading any other pretrained weights and loads `checkpoint["state_dict"]` with `strict=True`. The model uses `float32`, `eval()` and no gradient computation. TruFor sources and weights must be supplied separately; the script does not download them.

The image is decoded with Pillow, oriented according to EXIF, then converted to RGB uint8. Its values are divided by **256**, without external ImageNet normalization, resizing, recompression or manually added borders. The input tensor is `[1, 3, H, W]`.

## Capture and readout

The hook attaches only to `model.decode_head.linear_fuse`, after the 1×1 convolution, BatchNorm and ReLU. The confidence decoder, `decode_head_conf`, is a separate module. Capturing `output[:, 333:334, :, :]` as a detached copy retains the 334th channel without changing the network computation.

For a large image, the optimized fusion block may be called several times. Accumulating the captures and calling `torch.cat(parts, dim=2)` reconstructs the bands in order. Without band processing, the list contains a single element. The grid is approximately four times smaller than the image in each dimension; use its actual dimensions without manually rounding them.

```python
parts = []

def capture(_module, _inputs, output):
    parts.append(output[:, 333:334, :, :].detach().clone())

handle = model.decode_head.linear_fuse.register_forward_hook(capture)
try:
    with torch.inference_mode():
        out, confidence, detection, noiseprint = model(x)
        activation333 = torch.cat(parts, dim=2)
        activation333_native = torch.nn.functional.interpolate(
            activation333, size=x.shape[-2:],
            mode="bilinear", align_corners=False
        )
        response333 = torch.sigmoid(
            2.834346325108858 * activation333_native
            - 4.3996579849141835
        )
finally:
    handle.remove()
```

Here, `model` and `x` are prepared as described above; the complete script also includes this loading procedure. Keep the order: interpolation, affine combination, sigmoid. Do not normalize each image separately or rescale its minimum and maximum to 0 and 1.

To compare regions, the original localization is `torch.softmax(out, dim=1)[:, 1:2]`. Both outputs are binarized using the same rule, `>= 0.5`, then compared by Dice: `2 × intersection / (area1 + area2)`. Examples 1, 2 and 3 yield 90.9, 97.1 and 63.9/100, respectively.

## Running the script

The script requires Python 3.11 or later, NumPy, Pillow and the model dependencies, including PyTorch, timm and yacs. Replace the paths below with those of the chosen sources, configuration, weights and image:

```bash
python extract_channel333.py \
  --src chemin/vers/src \
  --config chemin/vers/src/trufor.yaml \
  --weights chemin/vers/trufor-original.pt \
  --image exemple-1.jpg \
  --output resultats/exemple-1-333.npz \
  --device cpu
```

The script rejects a checkpoint with a different hash and does not overwrite an existing file. The NPZ retains `activation333` on its internal grid, `response333` and `trufor_localization` at native resolution, and metadata describing the operations. It produces no other file.

## Coefficient fitting and scope of the exploration

The probe is fitted to the logit of TruFor’s localization. Channels are standardized and selected progressively by their weighted residual correlation with this target; their coefficients are then fitted using stabilized regression. Fitting weights balance response strata within each image; measurement weights restore their spatial proportions. Cross-validation folds separate source groups and documented donor links. This procedure selected 333 as the first channel in each of the three folds; the supplied formula was then fitted on all 52 images used for development. The three illustrated composites were excluded from this fitting.

The mean single-channel Dice in cross-validation is 51.9/100 across the 37 images where TruFor flags at least 0.5% of pixels. The three illustrations therefore do not summarize the entire exploration. These measurements concern similarity to TruFor, without probability calibration from human masks.

In an analytical intervention on the localization head, replacing channel 333 with its control mean changes strong responses by approximately −0.30 point on a scale of 100; Dice against the initial output remains 99.15/100. A predictive channel is therefore not necessarily the one on which the decision depends most. Computing it retains the model’s upstream layers. This exploration is separate from the comparative benchmark of 6,246 images.
