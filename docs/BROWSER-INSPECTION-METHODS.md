# Browser inspection methods

These four independent tools use the common browser engine, resource library and memory admission policy. Opening a tool with an image starts its calculation automatically and loads any required resources. Calculate remains available to rerun it. The existing preference for highlighting new tools controls their yellow outline.

B-Free, SPAI and DTD are experimental and hidden by default. Enable them in Settings using Enable experimental tools. The choice is saved and applies to favorites too; turning it off closes their open panels while retaining their settings and favorites. Comprint remains available independently. DTD can flag unchanged text or miss edits, so its output does not constitute proof. Its unboxed reminder sits between the CPU/GPU selector and secondary actions, in two or three closely spaced lines within the existing control height. Hovering anywhere over the reminder displays separate synthetic-example and original-publication tables over the image; the panel stays open while the pointer moves from the text to the tables and closes after leaving both. The same information is available on keyboard focus.

| Tool | Menu | Output and interpretation |
| --- | --- | --- |
| [B-Free](https://github.com/grip-unina/B-Free) | AI Solutions | Whole-image generation score. The native threshold is zero on the raw logit; neither a sigmoid nor a binary decision is calibrated authenticity confidence. It does not localize edits. |
| [SPAI](https://github.com/mever-team/spai) | AI Solutions | Whole-image generation score from the upstream patch/aggregation procedure. It does not localize or exclude partial generated edits. Incomplete bottom/right windows follow the upstream grid convention. |
| [DTD / DocTamper](https://github.com/qcf-568/DocTamper) | Tampering | Documentary-text activation, declared-threshold mask and analyzed-pixel validity. Inspect validity together with the activation map. |
| [Comprint](https://github.com/IDLabMedia/comprint) | JPEG | Compression fingerprint and anomaly-distance map, retaining Float64 statistical output. A compression inconsistency alone is not proof of manipulation. |

The methods retain their original authors and terms. See [component credits](ATTRIBUTION.md) and the [included notices](../web/extensions-source/licenses). Model conversion does not replace upstream restrictions.

## Local resources

The four optional entries use the same catalogue as Take offline and Local Settings. Their model and runtime files are identified by size, SHA-256 and ordered content-addressed pieces. Resource preparation retains the selected tools and their transitive dependencies; deliberately disabled tools remain disabled across updates. Shared engine resources stay available to the other methods.

Comprint's browser-side Python runtime is Pyodide 0.26.4. Its local resource closure includes NumPy, SciPy, scikit-image and their transitive packages, with package identities from the pinned Pyodide lock. Runtime and packages resolve under the local Comprint resource path. The package archives retain their notices; extracted notices are also provided. No system Python installation or inference service is used by these tools.

The existing CPU/GPU scheduler and budgets apply in online and local use. A browser can refuse a method when its automatic memory budget is insufficient; installation alone does not promise that every method will fit on every device. In particular, SPAI can be refused under the automatic 2 GiB fallback budget. No hardware hint or memory budget is raised to force execution.

## DTD and Comprint displays

DTD opens with a colour heatmap. Comprint opens with its colour overlay; its heatmap alone remains available. TruFor opens with its standard anomaly map; its alternative heatmap and existing controls remain available.

DTD uses a display threshold of 0.5 and opacity starts at 70%, directly controlling the selected regions. Comprint starts with a zero cutoff in native distance units. Its display response is 1 − exp(−ln(2) × (distance / 194)²): zero is transparent, 194 gives 50%, 388 gives 93.75% and 582 gives about 99.8%. This curve changes only overlay transparency. The heatmap retains its original palette, global numerical range and colour legend. The opacity slider scales this curve globally; the optional cutoff can filter small distances. These are presentation settings, not new scientific scores. The grayscale map alone retains the original numerical range.

During slider movement, a cached proxy has at most 256 pixels on its long edge and integer-rounded Comprint distances (256 response levels for DTD). Releasing the control restores the precise, native-resolution view; exports use that committed view. Proxy storage participates in the existing memory budget and is released with the result.

[Five synthetic document pairs](../examples/results/dtd-documents/README.md) illustrate DTD responses; their reference comparisons remain separate from the ordinary tool.

## Independent evaluation of the AI detectors

B-Free and SPAI are presented as experimental AI detectors, with a prominent gauge alongside the unchanged scientific results. The gauge displays the uncalibrated model index, not a probability of authenticity.

The independent study below reports 58.34% correct classifications for SPAI and 62.42% for B-Free on its corpus. These figures describe the original models on those images, rather than a general reliability rate.

An image generated or regenerated by AI can faithfully reproduce real data. A real acquisition processed with AI denoising or sharpening can also retain reliable information. Even a correct AI-generated label does not establish that the underlying data are false; the score alone does not assess their fidelity. This distinction is highlighted above both detectors’ results.

Zacharias Chrysidis, Stefanos-Iordanis Papadopoulos and Symeon Papadopoulos, [*The Synthetic Media Shift: Tracking the Rise, Virality, and Detectability of AI-Generated Multimodal Misinformation*](https://arxiv.org/abs/2604.15372), 2026, Table 3, evaluate the original pretrained models on the CONVEX corpus. These are independent study results, not measurements of this browser adaptation.

| Measure on that corpus | SPAI | B-Free |
|---|---:|---:|
| Of the AI-generated images, those correctly detected | 41.48% | 52.72% |
| Of the non-AI images, those wrongly flagged as AI | 24.66% | 27.81% |
| Of the AI alerts, those that are correct | 62.90% | 65.65% |
| Across all images, correct answers | 58.34% | 62.42% |


Temporary result banks retain the scientific maps independently of their screen previews. Display changes and compatible result recalls reuse existing outputs. Closing the owning documents releases their workers and temporary stores.

## Source and reconstruction

`web/extensions-source/` contains the browser methods, runtime factories, codecs and notices. Its relative core imports resolve beside `web/engine-source/`. The delivered `extension-engine` runtime rebases those imports to `unified-engine` and joins the normal resource transport. Reconstruct the dependency library using the [standard build procedure](BUILD.md); model payloads are stored as hashed pieces rather than duplicate large source files.

The additional runtime layer verifies its declared core changes, component source, predecessor snapshots and source/executable locks. Existing scientific and ELA receipts remain immutable. These delivery identities establish the implemented code and resources; they do not establish scientific sensitivity, specificity or a guarantee of detection.

