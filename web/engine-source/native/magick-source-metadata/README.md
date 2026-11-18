# Source sample facts from the existing ImageMagick Ping

These metadata-only patches accompany the complete Magick.Native Q8 SDK and
Wasm pair. They do not change Q8 pixels, numerical settings, profiles, encoder
options, supported delegates, or the application's import format registry.

The coders record declared source channel types and depths before returning the
existing Ping. `source-samples-private.h` writes a bounded artifact; the SDK
copies and validates it inside `MagickImageInfo.create`, before closing that
same Ping object. No second Ping, separate decoder, or high precision module is
loaded to obtain these facts. A failed or missing artifact leaves dimensions
and the existing eight bit import available, with an explicit limitation.

`sourceSamples` distinguishes color, alpha, palette indices and extra channels.
The types `uint`, `sint`, `float`, `shared-exponent` and `unknown` describe what
the coder actually knows. Mixed EXR/JXL channels retain their separate types;
palette color depth differs from index depth; HEIC alpha depth remains unknown
when its delegate does not establish it. PFM scale/byte order and RGBE shared
exponents describe source semantics rather than claiming 32 encoded precision
bits. The Core tests for these coders do not add public PFM/HDR imports.

`selection.preferredQuantumDepth` is only a numeric representation hint.
`selection.preservationQualified` is false. Neither is proof that an RGB8
display contains the original precision or that an HDR reconstruction has been
materialized. ICC, CICP, transfer, gain map and source-view ownership remain
separate. The specialized AVIF, PNG/TIFF native and RAW imports keep priority.

The media worker carries this optional descriptor and its limitation into its
header and the retained record's provenance. It keeps the existing Q8 Read and
SDR/profile projection, independent of the new metadata.

## Rebuild

Use Python 3.12+, Node with `--experimental-transform-types`, npm, CMake,
pkg-config, GNU make, patch and Emscripten **4.0.15**. The script verifies the
public archives listed in `SOURCE-ARCHIVES.json`, applies the checked source
patches, builds the full Q8 non-HDRI Core and Native API, then bundles the real
SDK. It uses the official pinned static delegate archive, whose sources are
identified in `DEPENDENCY-SOURCE-REFS.json` and the pinned Dependencies source
archive. The same delegate set is linked; it is not a reduced decoder facade.

```sh
python3 scripts/magick-q8/rebuild.py \
  --work-dir /path/to/build-magick-q8 \
  --emsdk /path/to/emsdk --jobs 2
```

`--archive-dir` may be repeated to reuse verified downloads. Add `--offline`
to prohibit downloads, or `--prepare-only` to verify and apply the source
inputs without compiling. The Native type/constants generator runs from the
pinned C sources and supplies a local npm package; no authenticated GitHub
Packages access or credentials are required. Other build dependencies use the
public npm registry and the checked SDK lockfile.

Outputs are written only to the chosen build folder. Review them as one paired
SDK/Wasm/types set and regenerate the media integrity pins after adoption.
Emscripten/minifier or build environment changes may alter resource hashes;
the shipped pair is fixed by `vendor/media/PINNED.json`, and ABI/delegate checks
are fixed by `vendor/media/magick/SOURCE-METADATA.json`. Never combine a factory
from one link with a different Wasm because its internal minified exports can
change even when the public ABI is unchanged.

The current product selects the wasm32/x86 resource. The existing x64 JavaScript
export is retained in the bundle for API compatibility, but no x64 Wasm is
shipped or selected and these metadata changes have not been qualified there.
The rebuild preserves that JavaScript factory from the shipped SDK; a future
usable x64 route needs its own paired build and qualification.

The patches and modified TypeScript retain their upstream licenses. Existing
Magick.Native, ImageMagick, magick-wasm and delegate notices remain in the
vendor directory. No user image or installation configuration is a build input.
