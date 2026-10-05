# SHERLOQ Web — browser and WordPress community adaptation

## [▶ Try SHERLOQ online](https://gaeldauchy.com/sherloq/)

**SHERLOQ is the work of [Guido Bartoli and the original contributors](https://github.com/GuidoBartoli/sherloq).** I refer to the original project for its introduction, history, research references and upstream development.

## Why this is a separate repository

This is a derivative adaptation of SHERLOQ, not a claim to have created the original project. My account already owns [the macOS fork](https://github.com/Kinkazma/sherloq). GitHub did not offer a destination for another fork under the same account, either from Guido's repository or from my existing fork: both belong to the same fork network. I therefore keep the web adaptation in this separate repository so the two versions can have their own code, documentation and examples. The absence of GitHub's “forked from” badge is a hosting constraint, not a change in authorship or attribution.

**Original project: [GuidoBartoli/sherloq](https://github.com/GuidoBartoli/sherloq). macOS adaptation: [Kinkazma/sherloq](https://github.com/Kinkazma/sherloq). Browser adaptation: this repository.** Original notices and licenses remain with their components.

I started with [my macOS adaptation](https://github.com/Kinkazma/sherloq), then worked on bringing its image-analysis workflows into a browser workspace embedded in WordPress. This repository contains the interface, browser engine, native kernel sources, converted model resources and the scripts needed to reconstruct the locked dependency library.

Much of the implementation was produced with AI assistants. My role has been to direct the work, question and correct implementation choices, explore possible solutions, shape the interface, and review part of the calculations and results. That process does not make every method independently validated. I describe the evidence and its limits alongside the code. SHERLOQ and the integrated research methods retain their original authors and component licenses.

[Source layout and reconstruction](docs/BUILD.md) · [Validation and performance limits](docs/VALIDATION.md) · [Example inputs](examples/README.md) · [Credits and licenses](docs/ATTRIBUTION.md)

## What I have adapted

| Area | Implementation in this delivery |
| --- | --- |
| Browser workspace | Independent tool documents, tabs, tiled/cascaded layouts, French/English controls, theme, favorites, zoom and portable settings |
| WordPress integration | A block or shortcode embeds the workspace; WordPress serves the interface while computation runs in the browser |
| Tool interfaces | A 50-entry catalogue with individual and automatic workflows; tool presence is not a claim that every browser, input and algorithm combination has been qualified |
| Runtime and models | Locked browser runtimes, WebAssembly kernels and converted model resources, with explicit source identities and SHA-256 manifests |
| Resource loading | Large dependencies requested as needed, verified pieces, bounded concurrent downloads and optional caching |
| Local resource library | Ordinary files in their original formats, folder reconnection and standard TAR import/export |
| Results | Tool-specific views and exports; changing display controls can reuse a completed result where supported |

The interface source is **0.14.3**, from `abd61d23df1d487fa81efe490bd40e76ec826764`. The engine snapshot is **0.35.0-export.2**, from `638d0f7aeebb6fc680fcd99b8af0e3977fb40284`. The runtime lock also retains earlier engine slots used by specific tools; a single version number does not replace that inventory.

## Additional and restored tools

I focus the new examples on the work added to the [original SHERLOQ baseline](https://github.com/GuidoBartoli/sherloq/tree/3fe95fcb56037e47e2eefbc2d3785804a31a74f5): Copy-Move Forgery 2 and its dense/geometric matching, Noisesniffer, ZERO JPEG Grids, Adaptive CFA, AI clone methods including D2PRL and Forgeryscope Auto, combined automatic workflows, and CAT-Net, SAFIRE, FOCAL and AdaIFL. These integrate existing research methods; their original authors retain credit.

Illuminant Map and Dead/Hot Pixels used existing menu labels but lacked working implementations in that baseline. Multiple Compression was also restored and expanded. The energy/territory views extend ELA, which was already present. TruFor was already an upstream integration and is not presented as a newly invented detector.

### Dense Copy-Move display correction

The web renderer now accepts the compact point arrays produced by PatchMatch. This fixes the error after `dense-geometry` without changing detector settings or the scientific arrays. The reported spiral example completes and its cached result can be redrawn. [Correction and regression evidence](web/engine-source/docs/dense-render-correction.md).

### WordPress frame loading and language

The PHP workspace entry explicitly supplies the isolation headers required by the page and its workers, including on hosts that do not apply `.htaccess` rules to static assets. Service-worker updates carry a version identity. The default language follows the visitor's French or English browser preference; an explicit language choice is retained. [Reproduction and verification](docs/evidence/wordpress-0.14.2-proof.json).

### Startup and updates

The workspace shows progress from the first page load and continues when a slow resource installation finishes, without requiring a manual reload. Temporary startup errors are retried. A new service worker only takes over early when every open window confirms it is waiting for that exact version and has no mounted workspace, preserving an already open session. [Verification, including a deliberately delayed 32-second manifest response](docs/evidence/wordpress-0.14.3-proof.json).

## What the distribution checks establish

The supplied Chrome 154, Firefox 155 and WebKit 26.6 records cover two distinct local origins: resource transport, a large model range spanning two pieces, a real engine operation and lossless export on synthetic 67 × 65 pixels, reuse of a local resource library, and independently read standard TAR archives.

Startup transferred 2,363,985 application bytes with no remote resource requests in those checks. This is a startup measurement, not an inference-speed claim. The records do not establish public-host performance or the scientific accuracy of every catalogue method. See [the exact scope](docs/VALIDATION.md).

## Performance work and remaining limits

Calculation time, memory use and model loading still need substantial optimization. I would start with reproducible measurements of expensive tools, cold versus cached model preparation, CPU/GPU transfers and repeated allocations, and cancellation or recovery during large jobs. Improvements must retain scientific parameters and compare actual output arrays against a fixed reference.

The transport admits at most two pieces and 128 MiB of declared payload at once. Hashing, response copies, caches and engine allocations add to that amount; it is not a physical-RAM cap. Browser storage can be evicted, and hardware/browser differences matter. [Priorities and evidence](docs/VALIDATION.md).

## Example material

These are the same original and edited inputs used to document my macOS work. Edit-reference images are visual comparisons and are never detector inputs. The previews below show input material, not browser analysis results.

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
