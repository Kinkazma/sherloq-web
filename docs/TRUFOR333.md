# TruFor channel 333

Full TruFor can retain channel index 333 (zero-based) after the localization decoder's linear_fuse ReLU. The activation is stored in float32 on its internal grid; requesting the diagnostic view interpolates this retained plane to native coordinates without another network execution.

The displayed empirical readout is sigmoid(2.834346325108858 × activation − 4.3996579849141835), applied after bilinear interpolation with align_corners=False semantics. This is a diagnostic response of one channel, not calibrated forgery probability, model confidence, or the original image-level classification score. The original learned outputs remain separate.

Native NPZ exports include neuron333_activation and neuron333. Strict independent contexts export the packed diagnostic response and document their native grids in metadata. Older results without a retained channel do not expose this view and never trigger an automatic rerun.

The joined decoder graph keeps the eight native projections and both heads within one runtime invocation per row window. Original learned coefficients and normalization operators are retained. A fixed identity row selects channel 333 at the existing final convolution. Noiseprint++ and both encoders retain the full original model.

Rebuild the graph from the existing converted original operators with Python, NumPy and ONNX:

```sh
python web/engine-source/scripts/export-trufor-neuron333.py --source ASSET_ROOT/trufor-split-value --output ASSET_ROOT/trufor-neuron333
```

Retain the original asset folders referenced by the generated relative manifest. Update the complete resource catalog, content-addressed chunks, runtime locks, current source snapshot and interface shell through the normal reconstruction pipeline. Original TruFor and component licenses and author credits continue to apply.
