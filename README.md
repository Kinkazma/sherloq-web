# SHERLOQ Web — browser and WordPress adaptation

## [▶ Try SHERLOQ online](https://gaeldauchy.com/sherloq/)

**SHERLOQ is the work of [Guido Bartoli and the original contributors](https://github.com/GuidoBartoli/sherloq).** I refer to the original project for its introduction, history, research references and upstream development.

## Why this is a separate repository

This is a derivative adaptation of SHERLOQ, not a claim to have created the original project. My account already owns [the macOS fork](https://github.com/Kinkazma/sherloq). GitHub did not offer a destination for another fork under the same account, either from Guido's repository or from my existing fork: both belong to the same fork network. I therefore keep the web adaptation in this separate repository so the two versions can have their own code, documentation and examples. The absence of GitHub's “forked from” badge is a hosting constraint, not a change in authorship or attribution.

**Original project: [GuidoBartoli/sherloq](https://github.com/GuidoBartoli/sherloq). macOS adaptation: [Kinkazma/sherloq](https://github.com/Kinkazma/sherloq). Browser adaptation: this repository.** Original notices and licenses remain with their components.

I started with [my macOS adaptation](https://github.com/Kinkazma/sherloq), then worked on bringing its image-analysis workflows into a browser workspace embedded in WordPress. This repository contains the interface, browser engine, native kernel sources, converted model resources and the scripts needed to reconstruct the locked dependency library.

Much of the implementation was produced with AI assistants. My role has been to direct the work, question and correct implementation choices, explore possible solutions, shape the interface, and review part of the calculations and results. That process does not make every method independently validated. I describe the evidence and its limits alongside the code. SHERLOQ and the integrated research methods retain their original authors and component licenses.

[Source layout and reconstruction](docs/BUILD.md) · [Changelog](CHANGELOG.md) · [Validation and limits](docs/VALIDATION.md) · [Example inputs](examples/README.md) · [Credits and licenses](docs/ATTRIBUTION.md)

## Featured example — D2PRL across automatic microscopy zones

I used the web engine to analyze **16 automatically detected panels and their enclosing global zone**, with **minimum component sizes of 100 and 10 pixels on each 448 × 448 model grid**. Each panel has its own inference; the global pass sees the panels together and can highlight similarities across them.

<details>
<summary>Microscopy — automatic zones, local detections, global detections and their combined result</summary>

**Combined result — the two filter settings**

This view retains every pixel selected by either a local search or the global search. Overlap still counts as one D2PRL contribution, not agreement between independent algorithms.

**Minimum 100 pixels**

[![Combined local and global detections — minimum 100](examples/results/microscopy-d2prl-automatic-zones/combined-detections-100.webp)](examples/results/microscopy-d2prl-automatic-zones/combined-detections-100.png)

**Minimum 10 pixels**

[![Combined local and global detections — minimum 10](examples/results/microscopy-d2prl-automatic-zones/combined-detections-10.webp)](examples/results/microscopy-d2prl-automatic-zones/combined-detections-10.png)



**1. Automatic search zones**

The blue rectangles identify the 16 independent panel searches. The orange rectangle is the global search area enclosing them, including the gaps between panels. These outlines describe where the model searches; they are not detections of image manipulation.

[![Sixteen automatic panels and their enclosing global zone](examples/results/microscopy-d2prl-automatic-zones/automatic-zones.webp)](examples/results/microscopy-d2prl-automatic-zones/automatic-zones.png)

**2. Detections within each panel**

Lowering the minimum keeps smaller connected components. Both settings reuse exactly the same model outputs; no neural inference is rerun.

Each panel is analyzed separately. Its filtered mask is placed back at the panel's original coordinates. This view shows the union of those 16 local results.

**Minimum 100 pixels**

[![Independent panel detections — minimum 100](examples/results/microscopy-d2prl-automatic-zones/local-detections-100.webp)](examples/results/microscopy-d2prl-automatic-zones/local-detections-100.png)

**Minimum 10 pixels**

[![Independent panel detections — minimum 10](examples/results/microscopy-d2prl-automatic-zones/local-detections-10.webp)](examples/results/microscopy-d2prl-automatic-zones/local-detections-10.png)

**3. Global analysis across panels**

The enclosing-zone pass sees all the panels together. It can therefore reveal responses spanning different panels that an isolated panel search cannot see. This is a segmentation map, not a list of verified source–target pairs.

**Minimum 100 pixels**

[![Global detections — minimum 100](examples/results/microscopy-d2prl-automatic-zones/global-detections-100.webp)](examples/results/microscopy-d2prl-automatic-zones/global-detections-100.png)

**Minimum 10 pixels**

[![Global detections — minimum 10](examples/results/microscopy-d2prl-automatic-zones/global-detections-10.webp)](examples/results/microscopy-d2prl-automatic-zones/global-detections-10.png)

**Detail — local panel 1**

The same crop, enlarged 2× for display, shows the input, the local mask at 100 and the local mask at 10. I selected the panel with the most additional image pixels retained at 10 so the effect of the filter is easier to inspect.

[![Local panel 1: input, minimum 100 and minimum 10](examples/results/microscopy-d2prl-automatic-zones/threshold-detail.webp)](examples/results/microscopy-d2prl-automatic-zones/threshold-detail.png)

Yellow is applied only to the **filtered masks**, at a uniform opacity; it does not encode probability. All eight previews are WebP files under 500 kB. Click a preview for its full-resolution PNG. [Settings, per-panel masks and run records](examples/results/microscopy-d2prl-automatic-zones/README.md).

</details>


## What I added

I brought the following method families into the web workflows, alongside the inherited SHERLOQ tools:

- **Copy-move matching:** SIFT + G2NN + RANSAC, PatchMatch, XFeat, ALIKED + LightGlue, EfficientLoFTR and SSG.
- **Clone localization:** D2PRL, Forgeryscope Auto, CMSeg-Net, MGCFDN and SelfDM.
- **Noise, CFA and JPEG analysis:** Noisesniffer, Adaptive CFA, ZERO JPEG Grids and Multiple Compression.
- **Text detection and document inspection:** PP-OCRv6 and DTD / DocTamper.
- **Neural forensic maps:** CAT-Net, SAFIRE, FOCAL and AdaIFL.
- **Experimental AI detectors:** B-Free and SPAI.
- **Compression fingerprints:** Comprint.
- **Other additions and restored tools:** Illuminant Map, Dead/Hot Pixels, and ELA energy/territory views.

B-Free, SPAI and DTD are experimental and hidden by default. Show them through **Settings → Enable experimental tools**.

These are integrations of existing research methods, whose authors retain credit. SelfDM requires model files imported into the local resource library; the supplied models and their terms are described in the [resource notices](docs/METHODS-RESOURCE-LICENSES.txt).

### Batch processing

Import documents or images, review the automatically proposed acquisitions and text/graph exclusions, and run the selected methods as a batch. Results can be reviewed together and compared between studies. PDF reports, source-linked ZIP archives and complete journals can also preserve a partial run; saved archives can be resumed. [Batch workflow](docs/TRAITEMENT-PAR-LOT.md).

Choose paired **Biomes** or scientific **Corroboration** counts and adjust their opacity without rerunning the detectors. ZIP exports support PNG, WebP, TIFF, AVIF and HEIC; saved archives retain their display settings and scientific outputs.

### Entirely local web app

The **Take offline / Emporter hors ligne** command prepares a local web app with a selected resource library. Local Settings can check for updates, remove optional tools and recover saved preferences. **Auto update** is off by default; enabling it checks at startup and asks before preparing or activating a change. [Local updates and resource management](docs/LOCAL-UPDATES.md). The saved resource archive can restore its working library. [Local installation and restoration](web/wordpress/DISTRIBUTION.md#sherloq-web-local).

Once the local version and its resources are prepared, SHERLOQ runs entirely offline, independently of WordPress and my website. It works like a standalone desktop application in a compatible browser. Installation is straightforward, even without programming knowledge. SHERLOQ can be used online or locally, and updates are easy to apply. I can easily imagine the future of open-source software taking this direction.

## Example material

The spiral, Street Photo and microscopy inputs also document my macOS work. I supplied the three-cell image for additional clone examples. Edit-reference images are visual comparisons and are never detector inputs. The previews below show input material, not browser analysis results.

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

These are computed outputs from the shipped web engine, generated in batches on the inputs above. They are illustrations of the methods, not interface screenshots or a guarantee of detection. Expand a section to see the images directly. WebP previews are limited to 500 kB each; click an image to open its original. The [full-resolution outputs and settings](examples/results/README.md) remain available; [generation procedure](docs/EXAMPLE-GENERATION.md).

<details>
<summary>Copy-Move Forgery 2 — dense PatchMatch and SIFT + G2NN + RANSAC</summary>

| Spiral — PatchMatch Zernike | Spiral — SIFT + G2NN + RANSAC |
| --- | --- |
| [![Spiral — PatchMatch Zernike](screenshots/readme-webp/examples/results/spiral-patchmatch/result.webp)](examples/results/spiral-patchmatch/result.png) | [![Spiral — SIFT + G2NN + RANSAC](screenshots/readme-webp/examples/results/spiral-sift-g2nn/result.webp)](examples/results/spiral-sift-g2nn/result.png) |

Colors distinguish groups of matched regions. These are geometric correspondences, not a reconstruction of every edit. Compare their locations with my spiral edit reference above.

</details>

<details>
<summary>CMSeg-Net and MGCFDN — clone localization on the three-cell image</summary>

[![Input, CMSeg-Net overlay and MGCFDN overlay](screenshots/readme-webp/examples/results/three-cells-localization/comparison.webp)](examples/results/three-cells-localization/comparison.png)

Both models respond clearly to the three cells and to the partial structure at the right edge. These are the application's native overlays; the colors follow each model's map. They also include responses around some boundaries. [Separate maps, masks and settings](examples/results/NEW-METHODS.md#cmseg-net-and-mgcfdn).

</details>

<details>
<summary>SelfDM — initial map and complete refinement</summary>

[![SelfDM input, initial map, complete pipeline overlay and final mask](screenshots/readme-webp/examples/results/three-cells-selfdm/comparison.webp)](examples/results/three-cells-selfdm/comparison.png)

The complete experimental pipeline refines the initial map and returns a mask in the original image coordinates. This example retains its responses in the background between and beside the cells; it is not an exact outline of every pasted pixel. SelfDM requires separately imported local model files. [Outputs and settings](examples/results/NEW-METHODS.md#selfdm).

</details>

<details>
<summary>XFeat and ALIKED + LightGlue — Biomes</summary>

[![Input, guided XFeat comparison and full-image ALIKED Biomes](screenshots/readme-webp/examples/results/three-cells-learned-biomes/comparison.webp)](examples/results/three-cells-learned-biomes/comparison.png)

**XFeat + LighterGlue compares two explicitly selected regions here; ALIKED + LightGlue searches the full image.** The XFeat view illustrates a guided comparison, not automatic discovery of those regions. In each result, the same color marks the two sides of an accepted Biome. Their envelopes describe matched points, not pixel-level segmentation. Only Biomes are displayed. [Search regions, outputs and settings](examples/results/NEW-METHODS.md#xfeat-and-aliked).

</details>

<details>
<summary>EfficientLoFTR — Biomes between two selected regions</summary>

[![EfficientLoFTR input and Biomes between two selected regions](screenshots/readme-webp/examples/results/three-cells-efficient-loftr/comparison.webp)](examples/results/three-cells-efficient-loftr/comparison.png)

EfficientLoFTR compares the selected upper-left and lower regions. The paired envelopes show where its geometrically accepted matches lie. This is a two-region comparison, not a whole-image search. Only Biomes are displayed. [Regions, outputs and settings](examples/results/NEW-METHODS.md#efficientloftr).

</details>

<details>
<summary>SSG — structured-edge matching and localized mask</summary>

[![SSG input and native localized mask](screenshots/readme-webp/examples/results/three-cells-ssg/comparison.webp)](examples/results/three-cells-ssg/comparison.png)

This run keeps the input's original resolution. SSG associates the upper-left and lower cells through its structured-edge and spatial-phrase pipeline. Its native SSIM localization extends beyond the visible cell boundaries. The area view shows that mask alone, with no circles or connecting lines. [Outputs and settings](examples/results/NEW-METHODS.md#ssg).

</details>

<details>
<summary>PP-OCRv6 — proposed text regions for scientific preparation</summary>

[![PP-OCRv6 text proposals on the microscopy figure](screenshots/readme-webp/examples/results/microscopy-ppocrv6/result.webp)](examples/results/microscopy-ppocrv6/result.png)

The red outlines are the detector's text proposals over the unchanged input. They can help prepare text exclusions before analysis. This is text detection, not recognition or evidence of manipulation. One proposal also follows a vertical gap between panels, so the proposals still need review. [Polygons, model identity and settings](examples/results/NEW-METHODS.md#pp-ocrv6).

</details>

<details>
<summary>ELA extension — low and high energy layers</summary>

| Spiral — low-energy score | Spiral — high-energy score |
| --- | --- |
| [![Spiral — low-energy score](screenshots/readme-webp/examples/results/spiral-ela-layers/view-1.webp)](examples/results/spiral-ela-layers/view-1.png) | [![Spiral — high-energy score](screenshots/readme-webp/examples/results/spiral-ela-layers/view-2.webp)](examples/results/spiral-ela-layers/view-2.png) |

These are separate score layers, displayed with the application’s fixed red-channel scale. They also respond to scene structure and should be read alongside the territory overlay and edit reference.

</details>

<details>
<summary>ELA extension — energy territories</summary>

[![Spiral — ELA energy overlay](screenshots/readme-webp/examples/results/spiral-ela-energy/result.webp)](examples/results/spiral-ela-energy/result.png)

The energy view highlights two areas on the right of this spiral. It does not reveal every marked edit. ELA itself belongs to the original SHERLOQ tools; this example illustrates the added energy/territory view.

</details>

<details>
<summary>Noisesniffer — spiral and Street Photo</summary>

| Spiral — noise responses | Street Photo — noise responses |
| --- | --- |
| [![Spiral — noise responses](screenshots/readme-webp/examples/results/spiral-noisesniffer/result.webp)](examples/results/spiral-noisesniffer/result.png) | [![Street Photo — noise responses](screenshots/readme-webp/examples/results/street-noisesniffer/preview.webp)](examples/results/street-noisesniffer/preview.png) |

Red regions are the tool’s responses. They extend beyond some known edits and also follow parts of the scene. The edit-reference images provide a separate visual comparison.

</details>

<details>
<summary>ZERO JPEG Grids — Street Photo</summary>

[![Street Photo — ZERO grid analysis](screenshots/readme-webp/examples/results/street-zero/preview.webp)](examples/results/street-zero/preview.png)

Blue marks missing-grid regions and red marks foreign-grid regions in this view. Broad responses across the scene are not a pixel-accurate edit mask. The analyzed file is the edited PNG, retaining whatever compression traces survived its editing/export history.

</details>

<details>
<summary>Adaptive CFA — response and local grid views</summary>

| Spiral — response overlay | Spiral — local grid view |
| --- | --- |
| [![Spiral — response overlay](screenshots/readme-webp/examples/results/spiral-adaptive-cfa/result.webp)](examples/results/spiral-adaptive-cfa/result.png) | [![Spiral — local grid view](screenshots/readme-webp/examples/results/spiral-adaptive-cfa/view-2.webp)](examples/results/spiral-adaptive-cfa/view-2.png) |

This is the Original variant with block 32 and tile 512. The map is coarse and responds widely across the spiral; it is not a precise outline of my edits.

</details>

<details>
<summary>FOCAL and AdaIFL — different localization responses</summary>

| Spiral — FOCAL | Spiral — AdaIFL |
| --- | --- |
| [![Spiral — FOCAL](screenshots/readme-webp/examples/results/spiral-focal/result.webp)](examples/results/spiral-focal/result.png) | [![Spiral — AdaIFL](screenshots/readme-webp/examples/results/spiral-adaifl/result.webp)](examples/results/spiral-adaifl/result.png) |

FOCAL produces a broad region on the right. AdaIFL gives a much smaller response on the left. The difference is retained here instead of presenting either result as complete detection.

</details>

<details>
<summary>SAFIRE — source clustering</summary>

[![Spiral — SAFIRE, three source clusters](screenshots/readme-webp/examples/results/spiral-safire/result.webp)](examples/results/spiral-safire/result.png)

This run uses three k-means groups. The colors represent clusters, not automatic “authentic” and “forged” classes. A single cluster can span both edited and unedited material.

</details>

<details>
<summary>CAT-Net — overlay and heatmap</summary>

| Street Photo — CAT-Net overlay | Street Photo — CAT-Net heatmap |
| --- | --- |
| [![Street Photo — CAT-Net overlay](screenshots/readme-webp/examples/results/street-catnet/preview.webp)](examples/results/street-catnet/preview.png) | [![Street Photo — CAT-Net heatmap](screenshots/readme-webp/examples/results/street-catnet/preview-view-1.webp)](examples/results/street-catnet/preview-view-1.png) |

Several compact responses align with marked edits in the sky and on the building; other cloud and edge responses are also visible. Compare with my Street Photo edit reference above.

| Spiral — CAT-Net overlay | Spiral — CAT-Net heatmap |
| --- | --- |
| [![Spiral — CAT-Net overlay](screenshots/readme-webp/examples/results/spiral-catnet/result.webp)](examples/results/spiral-catnet/result.png) | [![Spiral — CAT-Net heatmap](screenshots/readme-webp/examples/results/spiral-catnet/view-1.webp)](examples/results/spiral-catnet/view-1.png) |

The response on the spiral is weak. A successful execution does not mean the tool found its known edits.

</details>

<details>
<summary>D2PRL — spiral clone localization</summary>

| Spiral — probability overlay | Spiral — probability display |
| --- | --- |
| [![Spiral — probability overlay](screenshots/readme-webp/examples/results/spiral-d2prl/overlay.webp)](examples/results/spiral-d2prl/overlay.png) | [![Spiral — probability display](screenshots/readme-webp/examples/results/spiral-d2prl/result.webp)](examples/results/spiral-d2prl/result.png) |

Yellow opacity follows the saved probability display, without a new detection threshold. Several repeated patches respond around the spiral; other known edits do not. The native model retains its 448-pixel analysis grid, 40 iterations and seed 22. This run uses the original 1254 × 1254 input and projects its output back to those coordinates.

</details>

<details>
<summary>Complete automatic analysis — corroboration view</summary>

[![Spiral — automatic corroboration](screenshots/readme-webp/examples/results/spiral-complete-automatic/result.webp)](examples/results/spiral-complete-automatic/result.png)

Colors count distinct detector/search-context contributions: blue 1, cyan 2, green 3, yellow 4, orange 5 and red 6 or more. D2PRL contributes at most one vote per pixel; ELA never votes in this map. The accompanying record lists the completed branches and detected search regions.

</details>

<details>
<summary>Restored tools — Illuminant Map and Dead/Hot Pixels</summary>

| Street Photo — Illuminant Map | Street Photo — Dead/Hot Pixels |
| --- | --- |
| [![Street Photo — Illuminant Map](screenshots/readme-webp/examples/results/street-illuminant/preview.webp)](examples/results/street-illuminant/preview.png) | [![Street Photo — Dead/Hot Pixels](screenshots/readme-webp/examples/results/street-dead-hot-pixels/preview.webp)](examples/results/street-dead-hot-pixels/preview.png) |

Both use the original street photograph. The illuminant view is a local color estimate. The pixel tool reports 36 candidate pixels. The magnified windows below show six reported positions, with the original pixels beside their detector overlays. These are candidates, not a diagnosis of the camera sensor.

[![Street Photo — six pixel candidates at close range](screenshots/readme-webp/examples/results/street-dead-hot-pixels/preview-details.webp)](examples/results/street-dead-hot-pixels/preview-details.png)

</details>

<details>
<summary>Low-response examples — results that do not explain the known edits</summary>

| Street Photo — sparse matching | Street Photo — ELA energy |
| --- | --- |
| [![Street Photo — sparse matching](screenshots/readme-webp/examples/results/street-sift-g2nn/preview.webp)](examples/results/street-sift-g2nn/preview.png) | [![Street Photo — ELA energy](screenshots/readme-webp/examples/results/street-ela-energy/preview.webp)](examples/results/street-ela-energy/preview.png) |

These views do not clearly expose the marked edits at normal viewing size. They remain visible because a quiet output must not be read as proof that an image is original.

[![Spiral — ZERO, no main grid found](screenshots/readme-webp/examples/results/spiral-zero/result.webp)](examples/results/spiral-zero/result.png)

ZERO did not identify a main JPEG grid on this spiral and returned no foreign/missing-grid regions.

</details>

<details>
<summary>Multiple Compression — recompression curve and aligned JPEG analysis</summary>

| Street Photo — recompression curve | Street Photo — aligned double-JPEG scores |
| --- | --- |
| [![Street Photo — recompression curve](screenshots/readme-webp/examples/results/street-recompression/preview.webp)](examples/results/street-recompression/preview.png) | [![Street Photo — aligned double-JPEG scores](screenshots/readme-webp/examples/results/street-multiple-compression/preview.webp)](examples/results/street-multiple-compression/preview.png) |

Both calculations use the original JPEG. The curve measures pixel differences after recompression at qualities 0–100. The separate aligned detector returns **inconclusive** here, with no frequency reaching its decision threshold. These plots show the unchanged engine values; they neither count past saves nor establish authenticity.

</details>

<details>
<summary>Comprint — compression fingerprints on the moss photo</summary>

[![Comprint — original and edited compression-distance maps](examples/results/moss-comprint/comparison.webp)](examples/results/moss-comprint/comparison.png)

Top: the edited photo and its edit reference. Below: Comprint on the original and edited images. The edited image produces local responses near parts of the supplied edit reference, and additional responses elsewhere. These are compression-distance displays, not probabilities of manipulation. [Full-resolution maps and settings](examples/results/moss-comprint/README.md).

</details>

<details>
<summary>⚠ DTD / DocTamper — experimental text-edit detection</summary>

Five synthetic documents, each shown before and after a text edit. **DTD can flag unchanged text or miss edits; its result does not constitute proof.**

[![DTD — five documents before and after editing](examples/results/dtd-documents/planche-dtd.webp)](examples/results/dtd-documents/planche-dtd.png)

| Measure | Result |
| --- | ---: |
| Edited pixels detected | 36.50% |
| Unedited pixels wrongly flagged | 0.0308% |
| Correct among pixels flagged | 75.26% |
| Correct pixel decisions overall | 99.81% |

Green: detected edits · red: false alerts · yellow: missed edits. Always answering “unedited” would give 99.74% overall.

[Inputs, maps and detailed results](examples/results/dtd-documents/README.md).

</details>

<details>
<summary>B-Free — experimental AI detector</summary>

**⚠ Experimental — low reliability: about 62% correct classifications on the study’s images.** An AI label, even when correct, does not mean the underlying data are false. A real acquisition processed with AI denoising or sharpening can still contain reliable information. Partial AI edits may also be missed.

| Independent CONVEX study | B-Free |
| --- | ---: |
| Of AI images, those detected | 52.72% |
| Of non-AI images, those wrongly flagged | 27.81% |
| Of AI alerts, those that are correct | 65.65% |
| Correct answers overall | 62.42% |

[Chrysidis et al., 2026, Table 3](https://arxiv.org/abs/2604.15372) · [Details and model limits](docs/BROWSER-INSPECTION-METHODS.md#independent-evaluation-of-the-ai-detectors).

</details>

<details>
<summary>SPAI — experimental AI detector</summary>

**⚠ Experimental — low reliability: about 58% correct classifications on the study’s images.** An AI label, even when correct, does not mean the underlying data are false. A real acquisition processed with AI denoising or sharpening can still contain reliable information. Partial AI edits may also be missed.

| Independent CONVEX study | SPAI |
| --- | ---: |
| Of AI images, those detected | 41.48% |
| Of non-AI images, those wrongly flagged | 24.66% |
| Of AI alerts, those that are correct | 62.90% |
| Correct answers overall | 58.34% |

[Chrysidis et al., 2026, Table 3](https://arxiv.org/abs/2604.15372) · [Details and model limits](docs/BROWSER-INSPECTION-METHODS.md#independent-evaluation-of-the-ai-detectors).

</details>

<details>
<summary>TruFor — anomaly, confidence and Noiseprint++ views</summary>

| Spiral — anomaly map | Spiral — confidence |
| --- | --- |
| [![Spiral — anomaly map](screenshots/readme-webp/examples/results/spiral-trufor/result.webp)](examples/results/spiral-trufor/result.png) | [![Spiral — confidence](screenshots/readme-webp/examples/results/spiral-trufor/view-1.webp)](examples/results/spiral-trufor/view-1.png) |


[![Spiral — Noiseprint++](screenshots/readme-webp/examples/results/spiral-trufor/view-2.webp)](examples/results/spiral-trufor/view-2.png)

The anomaly map responds strongly to two regions on the right; the confidence and Noiseprint++ outputs are separate views. TruFor was already integrated upstream. These are new outputs from the browser adaptation, not a claim to have introduced the method.

</details>

<details>
<summary>Forgeryscope Auto — microscopy figure, final mask and intermediate evidence</summary>

**Input figure**

[![User-supplied microscopy figure](screenshots/readme-webp/examples/microscopy/preview.webp)](examples/microscopy/preview.png)

[![Forgeryscope Auto — final mask](screenshots/readme-webp/examples/results/microscopy-forgeryscope-auto/preview.webp)](examples/results/microscopy-forgeryscope-auto/preview.png)

| Candidates without geometric support | Geometric matches |
| --- | --- |
| [![Candidates without geometric support](screenshots/readme-webp/examples/results/microscopy-forgeryscope-auto/preview-view-1.webp)](examples/results/microscopy-forgeryscope-auto/preview-view-1.png) | [![Geometric matches](screenshots/readme-webp/examples/results/microscopy-forgeryscope-auto/preview-view-2.webp)](examples/results/microscopy-forgeryscope-auto/preview-view-2.png) |

The run detects 16 panels, tests 23 candidate pairs and accepts 5 microscopy correspondences under its geometric rules. The final mask and geometric map coincide here; the separate candidates-without-geometry field is empty. This is the same engine component used by the automatic workflow, run directly on the supplied figure. The example does not establish a new conclusion about the source publication. [Input provenance](examples/microscopy/provenance.json).

</details>

## Screenshots from the original SHERLOQ project

The following desktop screenshots come from [Guido Bartoli’s original repository](https://github.com/GuidoBartoli/sherloq/tree/master/screenshots). They illustrate inherited tools and are credited to the original project; they are not captures of this web interface.

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

## Interpretation and privacy

Maps, groups and geometric matches are analysis outputs, not automatic verdicts of manipulation. Responses outside known edits and missed edits must remain visible in example discussions.

This application adds no image-upload endpoint or analysis telemetry. Dependencies are downloaded separately from image processing. This statement does not describe the logs or behavior of a hosting site, its other WordPress plugins, optional font services or GitHub.
