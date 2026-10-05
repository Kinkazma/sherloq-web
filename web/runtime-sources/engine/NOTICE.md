# Attribution and runtime dependencies

SHERLOQ browser engine: port of the SHERLOQ native ELA algorithm and new browser
integration code. SHERLOQ by Guido Bartoli, GPL-3.0 (see LICENSE and upstream
https://github.com/GuidoBartoli/sherloq). Existing native improvements remain
attributed in the contribution history prepared separately. No author endorsement
is implied. This directory contains no native model checkpoint or user image.

This software is based in part on the work of the Independent JPEG Group.
libjpeg-turbo 3.0.3: https://github.com/libjpeg-turbo/libjpeg-turbo/tree/3.0.3 .
Unmodified library compiled to WebAssembly with Emscripten 4.0.15; wrapper source
is native/jpeg.c. Library license and IJG README are retained under vendor/libjpeg/.
Rebuild instructions: scripts/build-jpeg.sh. The compiler/SDK are build-only and
are not shipped. The JavaScript loader and WASM binary are generated artifacts.

Rejected evaluation codecs (MozJPEG and third-party fast-DCT wrapper) are absent
from the runtime manifest. No npm dependency is needed at runtime. Playwright is
a development test dependency, retained in package-lock.json; no browser profile
or credentials are shipped.


Local browser integration patch 0.2.0-b1: replace preliminary LUT concurrency
calibration with direct useful image batches and in-memory resource backoff.
The codec, LUT arithmetic, image resolution and scientific parameters are unchanged.
