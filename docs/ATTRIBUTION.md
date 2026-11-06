# Credits and component licenses

SHERLOQ was created by [Guido Bartoli and its contributors](https://github.com/GuidoBartoli/sherloq). Its original license is retained at the root of this repository. This browser adaptation follows the work shared in [my macOS fork](https://github.com/Kinkazma/sherloq).

The engine retains its [NOTICE](../web/engine-source/NOTICE.md), [license](../web/engine-source/LICENSE), component notices and [license directory](../web/engine-source/licenses). Exact runtime deliveries retain their source and notices under [runtime-sources](../web/runtime-sources). Integrated methods and models keep their respective authors and terms; the root license does not replace third-party terms.

The example originals, edits and edit-reference images were supplied by me for these galleries. [Their manifest](../examples/manifest.json) identifies the already published source files and exact hashes. A reference of known changes is not a detector result.

AI assistants produced much of the implementation. I directed and corrected choices, explored solution approaches, worked on ergonomics, and reviewed part of the calculations. The validation documents distinguish actual checks from broader claims.

The AI-image detectors integrate [DDA](https://github.com/roy-ch/Dual-Data-Alignment), [GAPL](https://github.com/UltraCapture/GAPL), [SPAI](https://github.com/mever-team/spai), [PRL](https://github.com/wittyuu/Relative-Patch-Response-Learning), [Community Forensics 384](https://github.com/JeongsooP/Community-Forensics) and [B-Free](https://github.com/grip-unina/B-Free). Their complete author lists appear once in the [chronological README credits](../README.md#credits). [DTD / DocTamper](https://github.com/qcf-568/DocTamper) and [Comprint](https://github.com/IDLabMedia/comprint) retain their own credits and [component notices](../web/extensions-source/licenses). B-Free and Comprint have component-specific restrictions; the repository’s root licence does not replace them.

DDA and PRL retain the DINOv2 and DINOv3 credits respectively; GAPL retains the CLIP credits. SPAI also uses [Masked Frequency Modeling (MFM)](https://github.com/Jiahao000/MFM), by Jiahao Xie, Wei Li, Xiaohang Zhan, Ziwei Liu, Yew Soon Ong and Chen Change Loy; its [S-Lab notice](../web/extensions-source/licenses/spai/mfm-LICENSE.txt) is retained separately. Vision Transformer architecture credits and the full DINO author lists are included in the same README table. The [model resource notices](METHODS-RESOURCE-LICENSES.txt) retain the component-specific declarations.

Comprint uses [Pyodide](https://pyodide.org/) and its packaged numerical/scientific libraries in the browser. Their original notices remain in the [runtime resources](../web/extensions-source/comprint-statistics/pyodide/closure.json), package archives and [extracted dependency notices](../web/extensions-source/licenses/pyodide-packages).

RITA retains its authors' credits and [conversion notice](../web/wordpress/feature-inputs/individual-assets/rita-native/NOTICE.txt). Its model weights and converted FP32 operators are distributed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); the source-code licences remain separate. [Reconstruction and method](RITA-NATIVE.md).

The [RITA/TruFor comparison](../examples/studies/rita-trufor/mini-study-rita-trufor.md) has a separate [image licence](../examples/studies/rita-trufor/IMAGE-LICENCE.txt): its photographs, edits, maps and boards are available for viewing, with all rights reserved. The repository's code licence grants no reuse rights over those images.

## Luminance gradients

The gradient panel uses Krawetz by default. The expanded operators credit Irwin Sobel and Gary Feldman (Sobel–Feldman), Judith M. S. Prewitt, Russell A. Kirsch, Hanno Scharr, Hany Farid and Eero P. Simoncelli. Peter Kovesi’s seven-tap coefficient reference, Tony Lindeberg’s Gaussian-derivative reference and the orientation/coherence work of Zsuzsanna Püspöki, Martin Storath, Daniel Sage and Michael Unser are listed with their dates and sources in the [README credits](../README.md#credits) and [technical references](LUMINANCE-GRADIENT-FIELDS.md#references).

Krawetz’s directional visualization is described in [A Picture’s Worth… (2008), section 3.4.4](https://blackhat.com/presentations/bh-dc-08/Krawetz/Whitepaper/bh-dc-08-krawetz-WP.pdf) and [Body By Victoria (2009)](https://www.hackerfactor.com/blog/index.php?/archives/322-Body-By-Victoria.html). Its unavailable original source code is not included. The experimental weighted disk is a separate SHERLOQ implementation; central differences use the standard finite-difference definition. The browser operators and coherence view are independent implementations, rather than embedded OrientationJ Java code. Their numerical conventions are documented in the technical reference.

The gradient example uses the Victoria’s Secret photograph reproduced in Krawetz’s 2009 article. The analysis panels were calculated by SHERLOQ Web.

## TruFor and TruFor Mini

The original TruFor / Noiseprint++ authors are Fabrizio Guillaro, Davide Cozzolino, Avneesh Sud, Nicholas Dufour and Luisa Verdoliva. TruFor Mini is my adaptation of that model; it retains the original model credits. [The study and reproduction files](../examples/studies/trufor-mini/README.md) include the retained [TruFor notice](../examples/studies/trufor-mini/reproduction/licenses/LICENSE.txt) and [CMX notice](../examples/studies/trufor-mini/reproduction/licenses/LICENSE_CMX.txt), including Huayao Liu’s copyright. The CMX and SegFormer/Mix Transformer research authors are also credited once in the README table.

## Native colour histograms

The native JPEG colour decoder uses libjpeg-turbo and retains the [libjpeg-turbo licence](../web/wordpress/sherloq-browser/assets/vendor/local-jpeg-color/LICENSE.md) and [Independent JPEG Group notice](../web/wordpress/sherloq-browser/assets/vendor/local-jpeg-color/README.ijg), including Thomas G. Lane, Guido Vollbeding and their collaborators. This software is based in part on the work of the Independent JPEG Group. The local/global histogram controller and native TIFF-channel reader were prepared for this adaptation; they are not attributed to a separate research model.

## Display equalization

The original studies and authors are listed in the [equalization method references](../web/engine-source/docs/equalization.md#original-references). The ESIHE implementation retains [Kuldeep Singh’s original licence](../web/engine-source/docs/ESIHE-LICENSE.txt). The segmented ALIKED graphs also retain their [pinned BSD licence and conversion notice](../web/engine-source/vendor/aliked-cm2-segments/NOTICE.md); graph partitioning does not replace the original authors or their terms.
