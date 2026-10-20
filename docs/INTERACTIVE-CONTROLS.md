# Interactive controls and adaptive previews

Sliders everywhere is enabled by default in Settings. Existing explicit choices remain saved. Numeric fields without an existing slider offer a compact hover control with the same bounds and step. An unbounded field can extend its display range without changing its valid native input. The controls follow the selected application theme and support keyboard interaction.

Brief and repeated clicks commit the native calculation or presentation directly. Holding a control or dragging a slider can show a provisional preview; releasing it, including outside the control, restores the exact requested native result. The last native view remains available while that result is prepared. Standard exports use native output, never a provisional preview.

The preview controller measures presentation cost, reuses calibration and retained native data, and selects a sampled resolution within the available memory and each method’s constraints. Its usual target is 50 ms; SAFIRE regrouping targets 200 ms. These are adaptive targets rather than cold-start or device-wide guarantees. Some parameter changes share the same sampled grid and can look identical in a preview.

Automatic values retain each tool’s native meaning. Where a control supports Automatic, it occupies a separate area beyond the manual minimum and requires deliberate movement and a short hold. Alt+Left selects it explicitly from the keyboard. Ordinary numeric zero values remain valid where the method defines them.

RGB/HSV plots retain the camera during provisional and native recalculation. Their short introduction respects reduced-motion settings, can be interrupted, and is rearmed by Reset or a new source. Original pixel colours are the default; explicit saved choices remain respected.

The interactive layer is reconstructed after the existing scientific, ELA, inspection-method and RITA layers. Keep runtime-interactive.py, runtime-patches/interactive-20261020.json and its predecessor snapshots together. The receipt binds canonical and delivered source, the reviewed PNG decoder, dependency metadata and both runtime locks. No model weights or native scientific settings change in this layer.
