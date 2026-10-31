# SHERLOQ Web – Browser Adaptation

<table id="web-application-card">
<tr>
<td align="center" valign="middle" width="17%">
<a href="https://gaeldauchy.com/sherloq/"><img src="chromium-extension/extension/icons/favicon.svg" alt="SHERLOQ Web application" width="112" height="112"></a>
</td>
<td valign="middle">
<strong>Web application</strong><br>
Image forensics, PDF inspection and batch analysis. Use it online or prepare an entirely offline workspace.
</td>
<td align="right" valign="middle" width="23%">
<a href="https://gaeldauchy.com/sherloq/">
<picture>
<source media="(max-width: 600px)" srcset="screenshots/readme/try-sherloq-online-compact.svg">
<img src="screenshots/readme/try-sherloq-online.svg" alt="Try SHERLOQ online">
</picture>
</a>
</td>
</tr>
</table>

SHERLOQ Web adapts SHERLOQ’s image-analysis workflows for a browser workspace embedded in WordPress. It also runs entirely offline once the local application and its resources are prepared.

SHERLOQ was created by [Guido Bartoli and the original contributors](https://github.com/GuidoBartoli/sherloq). Their repository documents the original project, its history, research references and upstream development. This web adaptation follows [my macOS fork](https://github.com/Kinkazma/sherloq).

[Source layout and reconstruction](docs/BUILD.md) · [Changelog](CHANGELOG.md) · [Validation and limits](docs/VALIDATION.md) · [Example inputs](examples/README.md) · [Credits and licenses](docs/ATTRIBUTION.md)

<table id="chromium-extension-card">
<tr>
<td align="center" valign="middle" width="17%">
<a href="https://chromewebstore.google.com/detail/fjofgojebfginofjnigpgnafdebkelba"><img src="screenshots/chromium/chromium-logo.svg" alt="Chromium" width="112" height="112"></a>
</td>
<td valign="middle">
<strong>Chrome extension</strong><br>
Full-resolution image and PDF magnifier, with adjustments and optional OCR. Open your selection in SHERLOQ Web or your local workspace.
</td>
<td align="right" valign="middle" width="23%">
<a href="https://chromewebstore.google.com/detail/fjofgojebfginofjnigpgnafdebkelba">
<picture>
<source media="(max-width: 600px)" srcset="screenshots/chromium/chrome-web-store-compact.svg">
<img src="screenshots/chromium/chrome-web-store.svg" alt="Chrome Web Store">
</picture>
</a>
</td>
</tr>
</table>

## Using the app

### Images and PDF documents

Open PDFs in the dedicated reader, browse pages and extract embedded images at their native resolution. The loupe and shared image adjustments are available for page inspection. [PDF reader](docs/PDF-READER.md).

In **Original image**, select acquisitions and exclude regions before starting an analysis. Each tool keeps its own copy of the selection; supported methods operate on the admitted pixels at native resolution. [Source regions](docs/ORIGINAL-SOURCE-REGIONS.md).

**Misc → OCR** recognizes English and French text with PP-OCRv6 Medium or Tesseract. Select text over the image or copy the full transcript. [OCR tools](docs/OCR-NOISESNIFFER.md).

### Batch processing

Import images or documents, review the proposed acquisitions and text/graph exclusions, then run the selected methods as a batch. Review results together or compare studies. PDF reports, source-linked ZIP archives and complete journals can preserve partial runs; saved archives can be resumed. [Batch workflow](docs/TRAITEMENT-PAR-LOT.md).

Switch between paired **Biomes** and scientific **Corroboration** counts, or adjust their opacity, without rerunning detectors. ZIP exports support PNG, WebP, TIFF, AVIF and HEIC. Saved archives retain display settings and scientific outputs.

### Entirely local web app

Use **Take offline / Emporter hors ligne** to prepare a local application with the resources you choose. Once prepared, it runs in a compatible browser, entirely offline and independently of WordPress or my website. Installation does not require programming knowledge.

Local Settings can check for updates, remove optional tools and recover saved preferences. **Auto update** is off by default. When enabled, it checks at startup and asks before preparing or activating a change. A saved resource archive can restore the working library. [Local updates and resource management](docs/LOCAL-UPDATES.md) · [Local installation and restoration](web/wordpress/DISTRIBUTION.md#sherloq-web-local).

The local version works like a standalone desktop application, with straightforward updates. I can see more open-source software taking this route.

## What I added

Alongside SHERLOQ’s inherited tools, I integrated the following methods and added or restored the views listed below. They share the browser workspace, with source-region selection and batch processing available for supported analyses.

- **Copy-move matching:** SIFT + G2NN + RANSAC, PatchMatch, XFeat, ALIKED + LightGlue, EfficientLoFTR and SSG. Inspect correspondences within an image or between selected acquisitions.
- **Clone localization:** D2PRL, Forgeryscope Auto, CMSeg-Net, MGCFDN and SelfDM. Inspect localization maps in the original image coordinates, including local and global searches where supported.
- **Noise, CFA and JPEG analysis:** Noisesniffer, Adaptive CFA, ZERO JPEG Grids and Multiple Compression, for inspecting noise inconsistencies, sensor patterns and compression traces.
- **Text recognition and document inspection:** PP-OCRv6 and Tesseract for OCR; DTD / DocTamper for locating possible text edits.
- **Neural forensic maps:** CAT-Net, SAFIRE, FOCAL, AdaIFL and RITA. Compare their different localization or source-clustering responses with the input image.
- **Experimental AI detectors:** B-Free and SPAI, with whole-image scores and the published evaluation results shown alongside their limitations.
- **Compression fingerprints:** Comprint, with compression-distance maps, colour overlays, display thresholds and opacity controls.
- **Display equalization:** a shared menu covering Histogram, CLAHE, AHE, bi-histogram, recursive, weighted, dynamic, exposure-based and contextual methods, plus adaptive gamma correction. Each view remembers a separate setting for each method.
- **Other additions and restored tools:** Illuminant Map, Dead/Hot Pixels, ELA energy and Biome territory views, and a choice between Sobel and Krawetz luminance gradients.

The workspace also provides CPU/GPU execution choices, lightweight adjustment previews and retained results. For retained maps, changing the view or opacity reuses the computed response. Independent source regions and exclusions carry through supported analyses, batch recipes and saved results.

B-Free, SPAI and DTD are experimental and hidden by default. Enable them through **Settings → Enable experimental tools**.

The research methods retain their original authors’ credits. SelfDM requires model files imported into the local resource library. See the [resource notices](docs/METHODS-RESOURCE-LICENSES.txt) for the supplied models and their terms.

## Featured example — D2PRL across automatic microscopy zones

I ran D2PRL on **16 automatically detected microscopy panels and their enclosing global zone**, using **minimum component sizes of 100 and 10 pixels on each 448 × 448 model grid**. Each panel has a separate inference; the global pass sees them together and can reveal similarities across panels.

<details>
<summary>Microscopy — automatic zones, local detections, global detections and their combined result</summary>

**Combined result — the two filter settings**

The combined view includes every pixel selected by a local or global search. Overlapping detections count as one D2PRL contribution, not independent agreement.

**Minimum 100 pixels**

[![Combined local and global detections — minimum 100](examples/results/microscopy-d2prl-automatic-zones/combined-detections-100.webp)](examples/results/microscopy-d2prl-automatic-zones/combined-detections-100.png)

**Minimum 10 pixels**

[![Combined local and global detections — minimum 10](examples/results/microscopy-d2prl-automatic-zones/combined-detections-10.webp)](examples/results/microscopy-d2prl-automatic-zones/combined-detections-10.png)

**1. Automatic search zones**

Blue rectangles mark the 16 separate panel searches. The orange rectangle marks the enclosing global search area, including the gaps between panels. These are search boundaries, not manipulation detections.

[![Sixteen automatic panels and their enclosing global zone](examples/results/microscopy-d2prl-automatic-zones/automatic-zones.webp)](examples/results/microscopy-d2prl-automatic-zones/automatic-zones.png)

**2. Detections within each panel**

Lowering the minimum retains smaller connected components from the same model outputs, without rerunning inference.

Each panel’s filtered mask is returned to its original coordinates. This view combines all 16 local results.

**Minimum 100 pixels**

[![Independent panel detections — minimum 100](examples/results/microscopy-d2prl-automatic-zones/local-detections-100.webp)](examples/results/microscopy-d2prl-automatic-zones/local-detections-100.png)

**Minimum 10 pixels**

[![Independent panel detections — minimum 10](examples/results/microscopy-d2prl-automatic-zones/local-detections-10.webp)](examples/results/microscopy-d2prl-automatic-zones/local-detections-10.png)

**3. Global analysis across panels**

The global pass can reveal responses spanning panels that isolated searches cannot see. Its output is a segmentation map; it does not establish source–target pairs.

**Minimum 100 pixels**

[![Global detections — minimum 100](examples/results/microscopy-d2prl-automatic-zones/global-detections-100.webp)](examples/results/microscopy-d2prl-automatic-zones/global-detections-100.png)

**Minimum 10 pixels**

[![Global detections — minimum 10](examples/results/microscopy-d2prl-automatic-zones/global-detections-10.webp)](examples/results/microscopy-d2prl-automatic-zones/global-detections-10.png)

**Detail — local panel 1**

The same crop, enlarged 2×, shows the input and local masks at 100 and 10. I chose the panel with the most additional image pixels retained at 10 to make the filter’s effect visible.

[![Local panel 1: input, minimum 100 and minimum 10](examples/results/microscopy-d2prl-automatic-zones/threshold-detail.webp)](examples/results/microscopy-d2prl-automatic-zones/threshold-detail.png)

Yellow shows only the **filtered masks**, at uniform opacity, without encoding probability. The eight WebP previews are under 500 kB each; click one for its full-resolution PNG. [Settings, per-panel masks and run records](examples/results/microscopy-d2prl-automatic-zones/README.md).

</details>

<details id="d2prl-resolution-comparison">
<summary>Microscopy — D2PRL at 448 × 448 and 896 × 896</summary>

The same image at both model grid sizes, with display thresholds of 100 and 500. The enlarged details show how the resolution and filtering affect the visible detections.

[![D2PRL at 448 and 896: four complete images and two matched enlarged details](examples/results/microscopy-d2prl-resolution-comparison/comparison.webp)](examples/results/microscopy-d2prl-resolution-comparison/comparison.png)

</details>

## Example material

The spiral, Street Photo and microscopy inputs also document my macOS work. I supplied the three-cell image for further clone examples. The galleries below contain source material; edit-reference images show the known changes for visual comparison and are never fed to detectors.

<details>
<summary>Spiral — original, edited input and my edit reference</summary>

| Original | Edited input | My edit reference |
| --- | --- | --- |
| [![Original spiral](screenshots/readme-webp/examples/spiral/original.webp)](examples/spiral/original.png) | [![Edited spiral](screenshots/readme-webp/examples/spiral/edited.webp)](examples/spiral/edited.png) | [![Spiral edit reference](screenshots/readme-webp/examples/spiral/edit-reference.webp)](examples/spiral/edit-reference.png) |

</details>

<details>
<summary>Street Photo — original, edited input and my edit reference</summary>

| Original | Edited input | My edit reference |
| --- | --- | --- |
| [![Street Photo original](screenshots/readme-webp/examples/street/original-preview.webp)](examples/street/original-preview.jpg) | [![Street Photo edited](screenshots/readme-webp/examples/street/edited-preview.webp)](examples/street/edited-preview.png) | [![Street Photo edit reference](screenshots/readme-webp/examples/street/edit-reference-preview.webp)](examples/street/edit-reference-preview.jpg) |

[Full-resolution files and provenance](examples/README.md).

</details>

<details>
<summary>Three cells — input for the new clone examples</summary>

[![Three-cell microscopy input](screenshots/readme-webp/examples/three-cells/input.webp)](examples/three-cells/input.png)

[Input record](examples/three-cells/provenance.json).

</details>

<details>
<summary>Moss photo — original, edited input and my edit reference</summary>

[![Moss photo — original, edited input and edit reference](examples/moss/comparison.webp)](examples/moss/comparison.png)

[Original](examples/moss/original.png) · [Edited input](examples/moss/edited.png) · [My edit reference](examples/moss/reference.png)

</details>

## Examples from the web engine

These results were generated in batches by the shipped web engine from the inputs shown above. They are computed outputs rather than interface screenshots. The examples retain missed edits and responses outside known edits; they do not establish detection accuracy beyond the cases shown.

Expand a section to view the images. WebP previews are limited to 500 kB each; click an image for its original. [Full-resolution outputs and settings](examples/results/README.md) · [Generation procedure](docs/EXAMPLE-GENERATION.md).

### Matching and clone localization

<details>
<summary>Copy-Move Forgery 2 — dense PatchMatch and SIFT + G2NN + RANSAC</summary>

| Spiral — PatchMatch Zernike | Spiral — SIFT + G2NN + RANSAC |
| --- | --- |
| [![Spiral — PatchMatch Zernike](screenshots/readme-webp/examples/results/spiral-patchmatch/result.webp)](examples/results/spiral-patchmatch/result.png) | [![Spiral — SIFT + G2NN + RANSAC](screenshots/readme-webp/examples/results/spiral-sift-g2nn/result.webp)](examples/results/spiral-sift-g2nn/result.png) |

Colors separate groups of geometrically matched regions. Compare their locations with my spiral edit reference; the correspondences do not reconstruct every edit.

</details>

<details>
<summary>CMSeg-Net and MGCFDN — clone localization on the three-cell image</summary>

[![Input, CMSeg-Net overlay and MGCFDN overlay](screenshots/readme-webp/examples/results/three-cells-localization/comparison.webp)](examples/results/three-cells-localization/comparison.png)

Both models respond to the three cells, the partial structure at the right edge and some boundaries. The overlays use the application’s native display and each model’s colors. [Separate maps, masks and settings](examples/results/NEW-METHODS.md#cmseg-net-and-mgcfdn).

</details>

<details>
<summary>SelfDM — initial map and complete refinement</summary>

[![SelfDM input, initial map, complete pipeline overlay and final mask](screenshots/readme-webp/examples/results/three-cells-selfdm/comparison.webp)](examples/results/three-cells-selfdm/comparison.png)

The experimental pipeline refines the initial map and returns a mask in the original image coordinates. Here it also responds between and beside the cells, so the mask does not exactly trace the pasted pixels. SelfDM requires separately imported local model files. [Outputs and settings](examples/results/NEW-METHODS.md#selfdm).

</details>

<details>
<summary>XFeat and ALIKED + LightGlue — Biomes</summary>

[![Input, guided XFeat comparison and full-image ALIKED Biomes](screenshots/readme-webp/examples/results/three-cells-learned-biomes/comparison.webp)](examples/results/three-cells-learned-biomes/comparison.png)

**XFeat + LighterGlue compares two explicitly selected regions; ALIKED + LightGlue searches the full image.** XFeat is a guided comparison here, without automatic region discovery. Only Biomes are displayed: each color pairs the two envelopes of an accepted match group. These envelopes describe matched points, not pixel-level segmentation. [Search regions, outputs and settings](examples/results/NEW-METHODS.md#xfeat-and-aliked).

</details>

<details>
<summary>EfficientLoFTR — Biomes between two selected regions</summary>

[![EfficientLoFTR input and Biomes between two selected regions](screenshots/readme-webp/examples/results/three-cells-efficient-loftr/comparison.webp)](examples/results/three-cells-efficient-loftr/comparison.png)

EfficientLoFTR searches only the selected upper-left and lower regions. The paired envelopes contain its geometrically accepted matches. Only Biomes are displayed. [Regions, outputs and settings](examples/results/NEW-METHODS.md#efficientloftr).

</details>

<details>
<summary>SSG — structured-edge matching and localized mask</summary>

[![SSG input and native localized mask](screenshots/readme-webp/examples/results/three-cells-ssg/comparison.webp)](examples/results/three-cells-ssg/comparison.png)

SSG runs at the input’s original resolution, associating the upper-left and lower cells through structured-edge and spatial-phrase matching. Its native SSIM localization extends beyond the cell boundaries. The area view shows only that mask, without circles or connecting lines. [Outputs and settings](examples/results/NEW-METHODS.md#ssg).

</details>

<details>
<summary>D2PRL — spiral clone localization</summary>

| Spiral — probability overlay | Spiral — probability display |
| --- | --- |
| [![Spiral — probability overlay](screenshots/readme-webp/examples/results/spiral-d2prl/overlay.webp)](examples/results/spiral-d2prl/overlay.png) | [![Spiral — probability display](screenshots/readme-webp/examples/results/spiral-d2prl/result.webp)](examples/results/spiral-d2prl/result.png) |

Yellow opacity follows the saved probability display, with no new detection threshold. Several repeated patches respond around the spiral; other known edits do not. The native model uses its 448-pixel analysis grid, 40 iterations and seed 22. Results are projected back onto the original 1254 × 1254 input.

</details>

<details>
<summary>Forgeryscope Auto — microscopy figure, final mask and intermediate evidence</summary>

**Input figure**

[![User-supplied microscopy figure](screenshots/readme-webp/examples/microscopy/preview.webp)](examples/microscopy/preview.png)

[![Forgeryscope Auto — final mask](screenshots/readme-webp/examples/results/microscopy-forgeryscope-auto/preview.webp)](examples/results/microscopy-forgeryscope-auto/preview.png)

| Candidates without geometric support | Geometric matches |
| --- | --- |
| [![Candidates without geometric support](screenshots/readme-webp/examples/results/microscopy-forgeryscope-auto/preview-view-1.webp)](examples/results/microscopy-forgeryscope-auto/preview-view-1.png) | [![Geometric matches](screenshots/readme-webp/examples/results/microscopy-forgeryscope-auto/preview-view-2.webp)](examples/results/microscopy-forgeryscope-auto/preview-view-2.png) |

The run detects 16 panels, tests 23 candidate pairs and accepts 5 microscopy correspondences under its geometric rules. The final mask and geometric map coincide; the candidates-without-geometry field is empty. This is the automatic workflow’s engine component, run directly on the supplied figure. The result establishes no new conclusion about the source publication. [Input provenance](examples/microscopy/provenance.json).

</details>

### Noise, compression and pixel inspection

<details>
<summary>ELA extension — low and high energy layers</summary>

| Spiral — low-energy score | Spiral — high-energy score |
| --- | --- |
| [![Spiral — low-energy score](screenshots/readme-webp/examples/results/spiral-ela-layers/view-1.webp)](examples/results/spiral-ela-layers/view-1.png) | [![Spiral — high-energy score](screenshots/readme-webp/examples/results/spiral-ela-layers/view-2.webp)](examples/results/spiral-ela-layers/view-2.png) |

The two score layers use the application’s fixed red-channel scale. They also respond to scene structure; compare them with the territory overlay and edit reference.

</details>

<details>
<summary>ELA extension — energy territories</summary>

[![Spiral — ELA energy overlay](screenshots/readme-webp/examples/results/spiral-ela-energy/result.webp)](examples/results/spiral-ela-energy/result.png)

The added energy/territory view highlights two areas on the right of the spiral and misses other marked edits. ELA itself is inherited from the original SHERLOQ tools.

</details>

<details>
<summary>Noisesniffer — spiral and Street Photo</summary>

| Spiral — noise responses | Street Photo — noise responses |
| --- | --- |
| [![Spiral — noise responses](screenshots/readme-webp/examples/results/spiral-noisesniffer/result.webp)](examples/results/spiral-noisesniffer/result.png) | [![Street Photo — noise responses](screenshots/readme-webp/examples/results/street-noisesniffer/preview.webp)](examples/results/street-noisesniffer/preview.png) |

Red marks Noisesniffer’s responses, including regions beyond known edits and parts of the scene. Use the edit-reference images for comparison.

</details>

<details>
<summary>ZERO JPEG Grids — Street Photo</summary>

[![Street Photo — ZERO grid analysis](screenshots/readme-webp/examples/results/street-zero/preview.webp)](examples/results/street-zero/preview.png)

Blue marks missing-grid regions; red marks foreign-grid regions. The broad responses do not trace edits pixel by pixel. This run uses the edited PNG, with the compression traces that survived editing and export.

</details>

<details>
<summary>Adaptive CFA — response and local grid views</summary>

| Spiral — response overlay | Spiral — local grid view |
| --- | --- |
| [![Spiral — response overlay](screenshots/readme-webp/examples/results/spiral-adaptive-cfa/result.webp)](examples/results/spiral-adaptive-cfa/result.png) | [![Spiral — local grid view](screenshots/readme-webp/examples/results/spiral-adaptive-cfa/view-2.webp)](examples/results/spiral-adaptive-cfa/view-2.png) |

The Original variant uses block 32 and tile 512. Its coarse map responds across much of the spiral without precisely outlining my edits.

</details>

<details>
<summary>Restored tools — Illuminant Map and Dead/Hot Pixels</summary>

| Street Photo — Illuminant Map | Street Photo — Dead/Hot Pixels |
| --- | --- |
| [![Street Photo — Illuminant Map](screenshots/readme-webp/examples/results/street-illuminant/preview.webp)](examples/results/street-illuminant/preview.png) | [![Street Photo — Dead/Hot Pixels](screenshots/readme-webp/examples/results/street-dead-hot-pixels/preview.webp)](examples/results/street-dead-hot-pixels/preview.png) |

Both tools use the original street photograph. Illuminant Map estimates local color; Dead/Hot Pixels reports 36 candidate pixels. The enlargements below show six reported positions, pairing original pixels with detector overlays. Candidate pixels alone do not diagnose the camera sensor.

[![Street Photo — six pixel candidates at close range](screenshots/readme-webp/examples/results/street-dead-hot-pixels/preview-details.webp)](examples/results/street-dead-hot-pixels/preview-details.png)

</details>

<details>
<summary>Low-response examples — results that do not explain the known edits</summary>

| Street Photo — sparse matching | Street Photo — ELA energy |
| --- | --- |
| [![Street Photo — sparse matching](screenshots/readme-webp/examples/results/street-sift-g2nn/preview.webp)](examples/results/street-sift-g2nn/preview.png) | [![Street Photo — ELA energy](screenshots/readme-webp/examples/results/street-ela-energy/preview.webp)](examples/results/street-ela-energy/preview.png) |

Neither view clearly reveals the marked edits at normal viewing size. They are retained here because a quiet output does not establish that an image is unedited.

[![Spiral — ZERO, no main grid found](screenshots/readme-webp/examples/results/spiral-zero/result.webp)](examples/results/spiral-zero/result.png)

ZERO found no main JPEG grid on the spiral and returned no foreign- or missing-grid regions.

</details>

<details>
<summary>Multiple Compression — recompression curve and aligned JPEG analysis</summary>

| Street Photo — recompression curve | Street Photo — aligned double-JPEG scores |
| --- | --- |
| [![Street Photo — recompression curve](screenshots/readme-webp/examples/results/street-recompression/preview.webp)](examples/results/street-recompression/preview.png) | [![Street Photo — aligned double-JPEG scores](screenshots/readme-webp/examples/results/street-multiple-compression/preview.webp)](examples/results/street-multiple-compression/preview.png) |

Both calculations use the original JPEG. The recompression curve measures pixel differences at qualities 0–100. The separate aligned double-JPEG detector returns **inconclusive**: no frequency reaches its decision threshold. The plots retain the engine’s values; they do not count past saves or establish authenticity.

</details>

<details>
<summary>Comprint — compression fingerprints on the moss photo</summary>

[![Comprint — original and edited compression-distance maps](examples/results/moss-comprint/comparison.webp)](examples/results/moss-comprint/comparison.png)

The top row shows the edited photo and its edit reference; below are Comprint’s results on the original and edited images. Some local responses lie near marked edits, with others elsewhere. The maps show compression distances, not manipulation probabilities. [Full-resolution maps and settings](examples/results/moss-comprint/README.md).

</details>

### Neural maps and combined analysis

<details>
<summary>FOCAL and AdaIFL — different localization responses</summary>

| Spiral — FOCAL | Spiral — AdaIFL |
| --- | --- |
| [![Spiral — FOCAL](screenshots/readme-webp/examples/results/spiral-focal/result.webp)](examples/results/spiral-focal/result.png) | [![Spiral — AdaIFL](screenshots/readme-webp/examples/results/spiral-adaifl/result.webp)](examples/results/spiral-adaifl/result.png) |

FOCAL gives a broad response on the right; AdaIFL gives a much smaller one on the left. Neither map should be read as a complete detection.

</details>

<details>
<summary>SAFIRE — source clustering</summary>

[![Spiral — SAFIRE, three source clusters](screenshots/readme-webp/examples/results/spiral-safire/result.webp)](examples/results/spiral-safire/result.png)

The three colors are k-means source clusters. They do not assign “authentic” or “forged” labels: one cluster can contain both edited and unedited material.

</details>

<details>
<summary>CAT-Net — overlay and heatmap</summary>

| Street Photo — CAT-Net overlay | Street Photo — CAT-Net heatmap |
| --- | --- |
| [![Street Photo — CAT-Net overlay](screenshots/readme-webp/examples/results/street-catnet/preview.webp)](examples/results/street-catnet/preview.png) | [![Street Photo — CAT-Net heatmap](screenshots/readme-webp/examples/results/street-catnet/preview-view-1.webp)](examples/results/street-catnet/preview-view-1.png) |

Several compact responses align with marked edits in the sky and building. Others follow clouds and edges. Compare them with my Street Photo edit reference.

| Spiral — CAT-Net overlay | Spiral — CAT-Net heatmap |
| --- | --- |
| [![Spiral — CAT-Net overlay](screenshots/readme-webp/examples/results/spiral-catnet/result.webp)](examples/results/spiral-catnet/result.png) | [![Spiral — CAT-Net heatmap](screenshots/readme-webp/examples/results/spiral-catnet/view-1.webp)](examples/results/spiral-catnet/view-1.png) |

The spiral produces a weak response despite the known edits. Successful execution alone does not establish detection.

</details>

<details>
<summary>TruFor — anomaly, confidence and Noiseprint++ views</summary>

| Spiral — anomaly map | Spiral — confidence |
| --- | --- |
| [![Spiral — anomaly map](screenshots/readme-webp/examples/results/spiral-trufor/result.webp)](examples/results/spiral-trufor/result.png) | [![Spiral — confidence](screenshots/readme-webp/examples/results/spiral-trufor/view-1.webp)](examples/results/spiral-trufor/view-1.png) |

[![Spiral — Noiseprint++](screenshots/readme-webp/examples/results/spiral-trufor/view-2.webp)](examples/results/spiral-trufor/view-2.png)

The anomaly map responds strongly to two regions on the right. Confidence and Noiseprint++ are separate outputs. TruFor was already integrated in the original SHERLOQ; these results come from the browser adaptation.

</details>

<details>
<summary>RITA — clone-stamp and generative-edit localization</summary>

RITA opens with an overlay at threshold **0.5**; Scores and Mask views are also available. Image dimensions are preserved. Reflection padding is applied when needed and removed from the result.

| Three-cell input | RITA — overlay, threshold 0.5 |
| --- | --- |
| [![Three-cell input](examples/three-cells/input.png)](examples/three-cells/input.png) | [![RITA overlay at threshold 0.5](examples/results/three-cells-rita/overlay.png)](examples/results/three-cells-rita/overlay.png) |

Red highlights an upper-left cell and the lower-right rectangular area. [Method and reconstruction](docs/RITA-NATIVE.md).

I compared RITA and TruFor on **96 edited versions from 26 sources**, covering clone-stamp, generative and mixed edits. The measurements concern edit localization, not image-level classification accuracy. [Comparison with before/after images, known edited regions and both models’ results](examples/studies/rita-trufor/mini-study-rita-trufor.md) · [Study images: all rights reserved](examples/studies/rita-trufor/IMAGE-LICENCE.txt).

</details>

<details>
<summary>Complete automatic analysis — corroboration view</summary>

[![Spiral — automatic corroboration](screenshots/readme-webp/examples/results/spiral-complete-automatic/result.webp)](examples/results/spiral-complete-automatic/result.png)

Colors count distinct detector/search-context contributions: blue 1, cyan 2, green 3, yellow 4, orange 5 and red 6 or more. D2PRL contributes at most one vote per pixel; ELA contributes none. The run record lists completed branches and detected search regions.

</details>

### Text analysis and AI-image detection

<details>
<summary>PP-OCRv6 — proposed text regions for scientific preparation</summary>

[![PP-OCRv6 text proposals on the microscopy figure](screenshots/readme-webp/examples/results/microscopy-ppocrv6/result.webp)](examples/results/microscopy-ppocrv6/result.png)

Red outlines mark candidate text regions on the unchanged input. They can guide exclusions before analysis, but need review: one follows a vertical gap between panels. This output detects text regions; it neither transcribes the text nor identifies manipulation. [Polygons, model identity and settings](examples/results/NEW-METHODS.md#pp-ocrv6).

</details>

<details>
<summary>⚠ DTD / DocTamper — experimental text-edit detection</summary>

Five synthetic documents are shown before and after text editing. **DTD can flag unchanged text and miss edits; its output alone is not proof.**

[![DTD — five documents before and after editing](examples/results/dtd-documents/planche-dtd.webp)](examples/results/dtd-documents/planche-dtd.png)

| Measure | Result |
| --- | ---: |
| Recall — edited pixels detected | 36.50% |
| False-positive rate — unedited pixels | 0.0308% |
| Precision — correct among flagged pixels | 75.26% |
| Overall pixel accuracy | 99.81% |

Green: detected edits · red: false alerts · yellow: missed edits. Predicting “unedited” for every pixel would already give 99.74% overall accuracy.

[Inputs, maps and detailed results](examples/results/dtd-documents/README.md).

</details>

B-Free and SPAI assess AI-image signals. Even a correct AI label does not establish that the underlying data are false: a real acquisition can retain reliable information after AI denoising or sharpening. Partial AI edits may also go undetected.

<details>
<summary>⚠ B-Free — experimental AI detector</summary>

**Experimental — low reliability in the independent CONVEX study.** B-Free correctly classified 62.42% of the study’s images.

| Independent CONVEX study | B-Free |
| --- | ---: |
| Recall — AI images detected | 52.72% |
| False-positive rate — non-AI images | 27.81% |
| Precision — correct AI alerts | 65.65% |
| Overall image accuracy | 62.42% |

[Chrysidis et al., 2026, Table 3](https://arxiv.org/abs/2604.15372) · [Details and model limits](docs/BROWSER-INSPECTION-METHODS.md#independent-evaluation-of-the-ai-detectors).

</details>

<details>
<summary>⚠ SPAI — experimental AI detector</summary>

**Experimental — low reliability in the independent CONVEX study.** SPAI correctly classified 58.34% of the study’s images.

| Independent CONVEX study | SPAI |
| --- | ---: |
| Recall — AI images detected | 41.48% |
| False-positive rate — non-AI images | 24.66% |
| Precision — correct AI alerts | 62.90% |
| Overall image accuracy | 58.34% |

[Chrysidis et al., 2026, Table 3](https://arxiv.org/abs/2604.15372) · [Details and model limits](docs/BROWSER-INSPECTION-METHODS.md#independent-evaluation-of-the-ai-detectors).

</details>

### Display equalization

**AHE** enhances local contrast. **CLAHE** limits its amplification to keep local contrast under control. Both are available through the shared equalization menu.

Other methods: **Histogram**, **BBHE**, **DSIHE**, **MMBEBHE**, **RMSHE**, **RSIHE**, **RSWHE**, **DHE**, **BPDHE**, **WTHE**, **ESIHE**, **CVC** and **AGCWD**. [Compare all equalization methods](examples/equalization/README.md).

<details>
<summary>Original, CLAHE, CLAHE + gamma and AHE — compact example</summary>

| Original | CLAHE | CLAHE + gamma | AHE |
| --- | --- | --- | --- |
| ![Original microscopy crop](examples/equalization/images/original.webp) | ![CLAHE with contrast limit 5](examples/equalization/images/clahe.webp) | ![CLAHE with contrast limit 5 and gamma 5](examples/equalization/images/clahe-gamma.webp) | ![AHE with 8 tiles per axis](examples/equalization/images/ahe.webp) |

> If you’re wondering where this little smiling fellow comes from: he already appeared in [this study published in *Scientific Reports*, a Nature Portfolio journal](https://pmc.ncbi.nlm.nih.gov/articles/PMC6026137/pdf/41598_2018_Article_28183.pdf#page=6), page 6, Figure 4, panel A, third image in the top row. He certainly looks as though he was drawn with a paintbrush. I’m not sure, though, that the author noticed the little fellow they were drawing.

If the article is retracted or becomes unavailable, an [archived copy of the PDF](examples/equalization/sources/reinehr-2018-s100b/s41598-018-28183-6.pdf#page=6) is available in this repository.

The same microscopy crop in each view. CLAHE + gamma uses gamma 5 (50 in the global-adjustment field), with CLAHE’s contrast limit kept at 5. These adjustments change the display, not the source image or detector inputs.

</details>

## Interpretation and privacy

Maps, groups and geometric matches require interpretation. They can miss edits or respond outside edited regions, and the examples retain both. The validation records describe the checks performed and their limits; they do not claim independent validation of every method.

The application adds no image-upload endpoint or analysis telemetry. Resource downloads are separate from image processing. This statement does not cover the hosting site’s logs, other WordPress plugins, optional font services or GitHub.

## Why this is a separate repository

My account already holds the macOS fork. GitHub offered no destination under that account for another fork, whether from the original repository or my existing fork; both belong to the same fork network. The web version therefore has its own repository, code, documentation and examples. The missing “forked from” badge does not change the original attribution.

This repository contains the interface, browser engine, native kernel sources, converted model resources and scripts for reconstructing the dependency library with its pinned versions.

AI assistants produced much of the implementation. I directed the work, questioned and corrected technical choices, explored solutions, shaped the interface and reviewed some calculations and results. The evidence and its limits are documented alongside the code.

## Screenshots from the original SHERLOQ project

These desktop screenshots from [Guido Bartoli’s original repository](https://github.com/GuidoBartoli/sherloq/tree/master/screenshots) show inherited SHERLOQ tools. They are credited to the original project and do not show the web interface.

<details>
<summary>General and Metadata</summary>

| General | Metadata |
| --- | --- |
| [![Upstream SHERLOQ — General](screenshots/readme-webp/screenshots/upstream/0_general.webp)](screenshots/upstream/0_general.png) | [![Upstream SHERLOQ — Metadata](screenshots/readme-webp/screenshots/upstream/1_metadata.webp)](screenshots/upstream/1_metadata.png) |

</details>

<details>
<summary>Inspection and Detail</summary>

| Inspection | Detail |
| --- | --- |
| [![Upstream SHERLOQ — Inspection](screenshots/readme-webp/screenshots/upstream/2_inspection.webp)](screenshots/upstream/2_inspection.png) | [![Upstream SHERLOQ — Detail](screenshots/readme-webp/screenshots/upstream/3_detail.webp)](screenshots/upstream/3_detail.png) |

</details>

<details>
<summary>Colors and Noise</summary>

| Colors | Noise |
| --- | --- |
| [![Upstream SHERLOQ — Colors](screenshots/readme-webp/screenshots/upstream/4_colors.webp)](screenshots/upstream/4_colors.png) | [![Upstream SHERLOQ — Noise](screenshots/readme-webp/screenshots/upstream/5_noise.webp)](screenshots/upstream/5_noise.png) |

</details>

<details>
<summary>JPEG and Tampering</summary>

| JPEG | Tampering |
| --- | --- |
| [![Upstream SHERLOQ — JPEG](screenshots/readme-webp/screenshots/upstream/6_jpeg.webp)](screenshots/upstream/6_jpeg.png) | [![Upstream SHERLOQ — Tampering](screenshots/readme-webp/screenshots/upstream/7_tampering.webp)](screenshots/upstream/7_tampering.png) |

</details>

## Credits

SHERLOQ, the integrated research methods and shared components retain their original authors’ credits, notices and licenses. The table below lists methods and models chronologically; years refer to the cited publications or original software release.

<details>
<summary>Authors of the methods and models — chronological order</summary>

| Publication year | Method or model | Original authors | Reference |
| --- | --- | --- | --- |
| 1977 · 1980 · 2004 | **Illuminant Map — colour-constancy foundations** | G. Buchsbaum; Graham D. Finlayson, Elisabetta Trezzi; Edwin H. Land | [Gray World](https://www.sciencedirect.com/science/article/pii/0016003280900587) · [Shades of Gray / Max-RGB](https://library.imaging.org/admin/apis/public/api/ist/website/downloadArticle/cic/12/1/art00008) · [Retinex](https://doi.org/10.1038/scientificamerican1277-108) |
| 1981 · 2004 · 2011 | **SIFT + G2NN + RANSAC** | SIFT: David G. Lowe. G2NN copy-move method: Irene Amerini, Lamberto Ballan, Roberto Caldelli, Alberto Del Bimbo, Giuseppe Serra. RANSAC: Martin A. Fischler, Robert C. Bolles. | [SIFT](https://www.cs.ubc.ca/~lowe/keypoints/) · [G2NN method](https://ailab.uniud.it/wp-content/uploads/2018/11/serra_TIFS_2011.pdf) · [RANSAC](https://www.sri.com/publication/artificial-intelligence-pubs/random-sample-consensus-a-paradigm-for-model-fitting-with-applications-to-image-analysis-and-automated-cartography-2/) |
| 1987 | **AHE** | Stephen M. Pizer, E. Philip Amburn, John D. Austin, Robert Cromartie, Ari Geselowitz, Trey Greer, Bart ter Haar Romeny, John B. Zimmerman, Karel Zuiderveld | [Adaptive histogram equalization and its variations](https://doi.org/10.1016/S0734-189X(87)80186-X) |
| 1994 | **CLAHE** | Karel Zuiderveld | [Contrast Limited Adaptive Histogram Equalization](https://doi.org/10.1016/B978-0-12-336156-1.50061-6) |
| 1997 | **BBHE** | Yeong-Taeg Kim | [Contrast Enhancement Using Brightness Preserving Bi-Histogram Equalization](https://doi.org/10.1109/30.580378) |
| 1999 | **DSIHE** | Yu Wang, Qian Chen, Baeomin Zhang | [Image enhancement based on equal area dualistic sub-image histogram equalization method](https://doi.org/10.1109/30.754419) |
| 2003 | **MMBEBHE / RMSHE** | Soong-Der Chen, Abd. Rahman Ramli | [Minimum Mean Brightness Error Bi-Histogram Equalization in Contrast Enhancement](https://doi.org/10.1109/TCE.2003.1261234) · [Contrast enhancement using recursive mean-separate histogram equalization for scalable brightness preservation](https://doi.org/10.1109/TCE.2003.1261233) |
| 2004 · 2006 | **Multiple Compression — double-quantization foundations** | Alin C. Popescu, Hany Farid; Junfeng He, Zhouchen Lin, Lifeng Wang, Xiaoou Tang | [Statistical foundations](https://farid.berkeley.edu/downloads/publications/ih04.pdf) · [DCT coefficient analysis](https://www.microsoft.com/en-us/research/publication/detecting-doctored-jpeg-images-via-dct-coefficient-analysis/) |
| 2007 | **ELA — underlying method** | Neal Krawetz | [Original paper](https://www.blackhat.com/presentations/bh-usa-07/Krawetz/Whitepaper/bh-usa-07-krawetz-WP.pdf) |
| 2007 | **Tesseract OCR / English and French LSTM data** | Ray Smith and the Tesseract / tessdata_best contributors. Browser runtime: Tesseract.js-core contributors. | [Original paper](https://tesseract-ocr.github.io/docs/tesseracticdar2007.pdf) · [Authors](https://github.com/tesseract-ocr/tesseract/blob/main/AUTHORS) · [Language models](https://github.com/tesseract-ocr/tessdata_best) · [Browser runtime](https://github.com/naptha/tesseract.js-core) |
| 2007 | **BPDHE** | Haidi Ibrahim, Nicholas Sia Pik Kong | [Brightness Preserving Dynamic Histogram Equalization for Image Contrast Enhancement](https://doi.org/10.1109/TCE.2007.4429280) |
| 2007 | **DHE** | M. Abdullah-Al-Wadud, Md. Hasanul Kabir, M. Ali Akber Dewan, Oksam Chae | [A Dynamic Histogram Equalization for Image Contrast Enhancement](https://doi.org/10.1109/TCE.2007.381734) |
| 2007 | **RSIHE** | K.S. Sim, C.P. Tso, Y.Y. Tan | [Recursive sub-image histogram equalization applied to gray scale images](https://doi.org/10.1016/j.patrec.2007.02.003) |
| 2007 | **WTHE** | Qing Wang, Rabab Ward | [Fast Image/Video Contrast Enhancement Based on Weighted Thresholded Histogram Equalization](https://doi.org/10.1109/TCE.2007.381756) |
| 2008 | **VLFeat** | Andrea Vedaldi, Brian Fulkerson | [Original project](https://www.vlfeat.org/) |
| 2008 | **RSWHE** | Mary Kim, Min Gyo Chung | [Recursively Separated and Weighted Histogram Equalization for Brightness Preservation and Contrast Enhancement](https://doi.org/10.1109/TCE.2008.4637632) |
| 2009 · 2015 · 2018 | **PatchMatch / Zernike matching** | Dense-field detection: Davide Cozzolino, Giovanni Poggi, Luisa Verdoliva. IPOL implementation: Thibaud Ehret. Original PatchMatch: Connelly Barnes, Eli Shechtman, Adam Finkelstein, Dan B Goldman. | [Dense-field method](https://doi.org/10.1109/TIFS.2015.2455334) · [IPOL implementation](https://www.ipol.im/pub/art/2018/213/) · [Original PatchMatch](https://collaborate.princeton.edu/en/publications/patchmatch-a-randomized-correspondence-algorithm-for-structural-i/) |
| 2011 | **CVC** | T. Celik, T. Tjahjadi | [Contextual and Variational Contrast Enhancement](https://doi.org/10.1109/TIP.2011.2157513) |
| 2013 | **Structured Forests / edge detection** | Piotr Dollár, C. Lawrence Zitnick | [Original implementation](https://github.com/pdollar/edges) |
| 2013 | **AGCWD** | Shih-Chia Huang, Fan-Chieh Cheng, Yi-Sheng Chiu | [Efficient Contrast Enhancement Using Adaptive Gamma Correction With Weighting Distribution](https://doi.org/10.1109/TIP.2012.2226047) |
| 2014 | **ESIHE** | Kuldeep Singh, Rajiv Kapoor | [Image enhancement using Exposure based Sub Image Histogram Equalization](https://doi.org/10.1016/j.patrec.2013.08.024) · [Implementation licence](web/engine-source/docs/ESIHE-LICENSE.txt) |
| 2015 · 2018 | **DeepMask** | Pedro O. Pinheiro, Ronan Collobert, Piotr Dollár. PyTorch implementation: Qiang Wang. | [Research and implementation](https://github.com/foolwood/deepmask-pytorch) |
| 2018 | **ConvCRF** | Marvin T. T. Teichmann, Roberto Cipolla | [Paper](https://arxiv.org/abs/1805.04777) |
| 2018 · 2020 | **SuperPoint / SuperGlue** | Daniel DeTone, Tomasz Malisiewicz, Andrew Rabinovich; Paul-Edouard Sarlin (SuperGlue) | [SuperPoint](https://arxiv.org/abs/1712.07629) · [SuperGlue](https://github.com/magicleap/SuperGluePretrainedNetwork) |
| 2020 | **Adaptive CFA** | Quentin Bammey, Rafael Grompone von Gioi, Jean-Michel Morel | [Paper](https://openaccess.thecvf.com/content_CVPR_2020/html/Bammey_An_Adaptive_Neural_Network_for_Unsupervised_Mosaic_Consistency_Analysis_in_CVPR_2020_paper.html) |
| 2021 | **PP-LCNet — text-line orientation** | Cheng Cui, Tingquan Gao, Shengyu Wei, Yuning Du, Ruoyu Guo, Shuilong Dong, Bin Lu, Ying Zhou, Xueying Lv, Qiwen Liu, Xiaoguang Hu, Dianhai Yu, Yanjun Ma; PaddlePaddle contributors for the text-line model. | [Paper](https://arxiv.org/abs/2109.15099) · [Official model](https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori_onnx) |
| 2021 · 2022 | **CAT-Net** | Myung-Joon Kwon, In-Jae Yu, Seung-Hun Nam, Heung-Kyu Lee, Changick Kim | [Original project and both papers](https://github.com/mjkwon2021/CAT-Net) |
| 2021 · 2024 | **Noisesniffer** | Marina Gardella, Pablo Musé, Miguel Colom, Jean-Michel Morel | [Paper and implementation](https://www.ipol.im/pub/art/2024/462/) |
| 2021 | **ZERO JPEG Grids** | Tina Nikoukhah, Jérémy Anger, Miguel Colom, Jean-Michel Morel, Rafael Grompone von Gioi | [Paper and implementation](https://www.ipol.im/pub/art/2021/390/) |
| 2022 | **SelfDM** | Yaqi Liu, Chao Xia, Xiaobin Zhu, Shengwei Xu | [Original project](https://github.com/yaqiliu-cs/SelfDM-TIP) |
| 2023 | **ALIKED** | Xiaoming Zhao, Xingming Wu, Weihai Chen, Peter C. Y. Chen, Qingsong Xu, Zhengguo Li | [Original project](https://github.com/Shiaoming/ALIKED) |
| 2023 | **Comprint** | Hannes Mareen, Dante Vanden Bussche, Fabrizio Guillaro, Davide Cozzolino, Glenn Van Wallendael, Peter Lambert, Luisa Verdoliva | [Original project](https://github.com/IDLabMedia/comprint) |
| 2023 | **DTD / DocTamper** | Chenfan Qu, Chongyu Liu, Yuliang Liu, Xinhong Chen, Dezhi Peng, Fengjun Guo, Lianwen Jin | [Original project](https://github.com/qcf-568/DocTamper) |
| 2023 | **LightGlue** | Philipp Lindenberger, Paul-Edouard Sarlin, Marc Pollefeys | [Original project](https://github.com/cvg/LightGlue) |
| 2023 | **Segment Anything** | Alexander Kirillov, Eric Mintun, Nikhila Ravi, Hanzi Mao, Chloe Rolland, Laura Gustafson, Tete Xiao, Spencer Whitehead, Alexander C. Berg, Wan-Yen Lo, Piotr Dollár, Ross Girshick | [Paper](https://arxiv.org/abs/2304.02643) |
| 2023 | **SSG / spatial-phrase matching** | Chao Wang, Zhiqiu Huang, Shuren Qi, Yaoshen Yu, Guohua Shen, Yushu Zhang | [Paper](https://arxiv.org/abs/2207.09135) |
| 2023 | **TruFor / Noiseprint++** | Fabrizio Guillaro, Davide Cozzolino, Avneesh Sud, Nicholas Dufour, Luisa Verdoliva | [Original project](https://github.com/grip-unina/TruFor) |
| 2023 | **Ultralytics YOLO** | Glenn Jocher, Ayush Chaurasia, Jing Qiu and Ultralytics contributors | [Original citation](https://docs.ultralytics.com/models/yolov8/) |
| 2024 | **AdaIFL** | Yuxi Li, Fuyuan Cheng, Wangbo Yu, Guangshuo Wang, Guibo Luo, Yuesheng Zhu | [Original project](https://github.com/LMIAPC/AdaIFL) |
| 2024 | **EfficientLoFTR** | Yifan Wang, Xingyi He, Sida Peng, Dongli Tan, Xiaowei Zhou | [Original project](https://github.com/zju3dv/EfficientLoFTR) |
| 2024 | **XFeat / LighterGlue** | Guilherme Potje, Felipe Cadar, André Araujo, Renato Martins, Erickson R. Nascimento | [Original project](https://github.com/verlab/accelerated_features) |
| 2025 | **B-Free** | Fabrizio Guillaro, Giada Zingarini, Ben Usman, Avneesh Sud, Davide Cozzolino, Luisa Verdoliva | [Original project](https://github.com/grip-unina/B-Free) |
| 2025 | **CMSeg-Net** | Hao-Chiang Shao, Yuan-Rong Liao, Tse-Yu Tseng, Yen-Liang Chuo, Fong-Yi Lin | [Paper](https://arxiv.org/abs/2412.10258) |
| 2025 | **D2PRL** | Yuanman Li, Yingjie He, Changsheng Chen, Li Dong, Bin Li, Jiantao Zhou, Xia Li | [Paper](https://arxiv.org/abs/2404.17310) |
| 2025 | **FOCAL** | Haiwei Wu, Yiming Chen, Jiantao Zhou, Yuanman Li | [Paper](https://arxiv.org/abs/2308.09307) |
| 2025 | **SAFIRE** | Myung-Joon Kwon, Wonjun Lee, Seung-Hun Nam, Minji Son, Changick Kim | [Paper](https://arxiv.org/abs/2412.08197) |
| 2025 | **SPAI** | Dimitrios Karageorgiou, Symeon Papadopoulos, Ioannis Kompatsiaris, Efstratios Gavves | [Original project](https://github.com/mever-team/spai) |
| 2026 | **Forgeryscope / Forgeryscope Auto** | Uladzislau Leketush | [Original project](https://github.com/vlad3996/forgeryscope) |
| 2026 | **MGCFDN** | Hang Tu, Peng Liang, Xiaoguang Lu, Huimin Zhao | [Original project](https://github.com/tuhanglsWorld/MGCFDN) |
| 2026 | **PP-OCRv6 — text detection and recognition** | Yubo Zhang, Xueqing Wang, Manhui Lin, Yue Zhang, Penglongyi Deng, Ting Sun, Tingquan Gao, Zelun Zhang, Jiaxuan Liu, Changda Zhou, Hongen Liu, Suyin Liang, Cheng Cui, Yi Liu, Dianhai Yu, Yanjun Ma. Small detector ONNX conversion: RapidAI / RapidOCR contributors. Medium models: official PaddlePaddle ONNX exports. | [Paper](https://arxiv.org/abs/2606.13108) · [Small conversion](https://github.com/RapidAI/RapidOCR) · [Official Medium models](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx) |
| 2026 | **RITA** | Xuekang Zhu, Ji-Zhe Zhou, Kaiwen Feng, Chenfan Qu, Xiwen Wang, Yunfei Wang, Liting Zhou, Jian Liu | [Original project](https://github.com/scu-zjz/RITA) · [Weights: CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |

</details>
