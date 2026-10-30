# Credits and component licenses

SHERLOQ was created by [Guido Bartoli and its contributors](https://github.com/GuidoBartoli/sherloq). Its original license is retained at the root of this repository. This browser adaptation follows the work shared in [my macOS fork](https://github.com/Kinkazma/sherloq).

The engine retains its [NOTICE](../web/engine-source/NOTICE.md), [license](../web/engine-source/LICENSE), component notices and [license directory](../web/engine-source/licenses). Exact runtime deliveries retain their source and notices under [runtime-sources](../web/runtime-sources). Integrated methods and models keep their respective authors and terms; the root license does not replace third-party terms.

The example originals, edits and edit-reference images were supplied by me for these galleries. [Their manifest](../examples/manifest.json) identifies the already published source files and exact hashes. A reference of known changes is not a detector result.

AI assistants produced much of the implementation. I directed and corrected choices, explored solution approaches, worked on ergonomics, and reviewed part of the calculations. The validation documents distinguish actual checks from broader claims.

The browser inspection tools integrate [B-Free (GRIP-UNINA)](https://github.com/grip-unina/B-Free), [SPAI (MeVer)](https://github.com/mever-team/spai), [DTD / DocTamper (Qu et al.)](https://github.com/qcf-568/DocTamper) and [Comprint (Mareen et al.)](https://github.com/IDLabMedia/comprint). Their [component notices](../web/extensions-source/licenses) and model notices remain attached. B-Free and Comprint have component-specific restrictions; the repository's root license does not replace them.

Comprint uses [Pyodide](https://pyodide.org/) and its packaged numerical/scientific libraries in the browser. Their original notices remain in the [runtime resources](../web/extensions-source/comprint-statistics/pyodide/closure.json), package archives and [extracted dependency notices](../web/extensions-source/licenses/pyodide-packages).

RITA retains its authors' credits and [conversion notice](../web/wordpress/feature-inputs/individual-assets/rita-native/NOTICE.txt). Its model weights and converted FP32 operators are distributed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); the source-code licences remain separate. [Reconstruction and method](RITA-NATIVE.md).

The [RITA/TruFor comparison](../examples/studies/rita-trufor/mini-study-rita-trufor.md) has a separate [image licence](../examples/studies/rita-trufor/IMAGE-LICENCE.txt): its photographs, edits, maps and boards are available for viewing, with all rights reserved. The repository's code licence grants no reuse rights over those images.

## Luminance gradient variants

The default “Gradient de Sobel” retains SHERLOQ’s existing Sobel derivatives and global channel normalization. “Gradient de Krawetz” is an independent reconstruction of the directional visualization described by Neal Krawetz in [A Picture’s Worth… (2008), pages 22–24](https://blackhat.com/presentations/bh-dc-08/Krawetz/Whitepaper/bh-dc-08-krawetz-WP.pdf#page=22) and illustrated in [Body By Victoria (2009)](https://www.hackerfactor.com/blog/index.php?/archives/322-Body-By-Victoria.html). It does not contain or claim to reproduce the author’s unavailable original source code. The reconstruction uses integer BT.601 luminance, available-neighbour differences with relative weights 4:7:4, local direction in red/green and clipped magnitude divided by nine in blue.

Acquisition and exclusion domains are applied before scientific observations; absent neighbours are omitted for Krawetz. Sobel retains its existing boundary extension. Optional equalization uses the admitted union. Integer Krawetz derivatives match the independent reference exactly; Python and WebAssembly color values can differ by one 8-bit level at transcendental-function truncation boundaries. Browser calculations share the same WebAssembly kernel.

## Display equalization

The original studies and authors are listed in the [equalization method references](../web/engine-source/docs/equalization.md#original-references). The ESIHE implementation retains [Kuldeep Singh’s original licence](../web/engine-source/docs/ESIHE-LICENSE.txt). The segmented ALIKED graphs also retain their [pinned BSD licence and conversion notice](../web/engine-source/vendor/aliked-cm2-segments/NOTICE.md); graph partitioning does not replace the original authors or their terms.
