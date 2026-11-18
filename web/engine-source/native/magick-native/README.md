# Reconstructing the native precision resources

This recipe builds the same ImageMagick Core and native C interface at
Q16-HDRI and Q32-HDRI. Precision follows the declared source content. Image
dimensions do not select a different numerical engine. The asynchronous
pixel-cache bridge works with both variants.

The recipe explicitly uses the official, checksum-pinned delegate bootstrap
listed in `SOURCE-ARCHIVES.json`. It does **not** claim that those24delegate
libraries were rebuilt locally from source. Their exact source commits and
upstream build recipes are recorded separately. No image-runtime code invokes
this reconstruction or installs a compiler.

## Inputs

Use Python3.12or newer for the conductor, a POSIX build environment with GNU
make/pkg-config, and an activated official Emscripten4.0.15 SDK matching
`TOOLCHAIN.json`. The release hash, Emscripten/LLVM/Binaryen revisions and
bundled Node/Python versions are checked before building. The SDK path is a
caller-supplied parameter; no particular installation location is required.
If the SDK does not bundle Node or Python, supply the matching executables
with `--node` and `--python`; the same versions are checked.

The source archives are downloaded only when absent. Each archive must match
its recorded size/SHA before use. An optional archive cache accepts exactly
those same pinned inputs, not another binary bootstrap. The work directory
must be new unless `--resume` is given explicitly. No directory is removed
automatically.

```sh
python3 reconstruct.py --sdk /path/to/emsdk --work-dir /path/to/new-build --jobs 2
```

To prepare and verify the sources without native compilation:

```sh
python3 reconstruct.py --sdk /path/to/emsdk --work-dir /path/to/new-build --prepare-only
```

Continue that prepared directory with `--resume`. A diagnosis of a different
output should use a new directory so the previous logs and outputs remain
available. `--archive-cache /path/to/pinned-archives` avoids downloading
already verified archives. The build is limited to one or two jobs and has no
deadline that cancels compilation. It builds both variants by default; use
`--quantum 16` or `--quantum 32` for a specific precision resource.

## Ownership of work files

The scripts copy their C interface, source manifests and checked recipe into
the work directory. Sources, generated headers, configuration, libraries and
outputs stay there. The SDK's system-library cache starts empty in a new
work directory; the needed system libraries are generated there from the pinned
SDK. The installed SDK cache is never used as a work directory. Core sources,
objects and prefixes are also built from scratch.

`NATIVE_MAGICK_BUILD_ROOT` is set by the conductor. The lower-level fetch,
patch and build scripts require this explicit work root. The environment-only
Emscripten configuration resolves all installation paths from supplied
parameters, not embedded paths. The compiler maps the work root to the same
logical source prefix as the qualified recipe. The historical virtual runtime
configuration prefixes are pinned per precision in `QUALIFIED.json`; neither
represents a host installation directory. The build fails if a private build prefix survives in either runtime
resource.

The SDK fingerprints are recorded before and after the build. Policy budgets
and image memory are not inferred from the compiler process's RAM usage.

## Results and comparison

`REBUILD-REPORT.json` records each expected and actual length/SHA. The outputs
are `output-paged/native-magick.{mjs,wasm}` and
`output-q32-paged/native-magick.{mjs,wasm}` under the work directory. Fetch,
patch and per-Quantum build logs remain beside them.

`QUALIFIED.json` contains the original comparison identities. The conductor
never strips, edits or patches an output binary to match them. A difference is
reported and preserved with exit code2; a build failure is also preserved.
The two numeric variants are compared separately. A byte-identical result
does not itself qualify the application importer, display projection or
worker lifetime; those have separate tests.

Only after the reconstruction is verified should the two resource pairs be
placed under `vendor/media/magick-native/q16/` and `q32/`, together with their
pins and notices. This recipe does not create an application, an installer or
a WordPress archive.

## Sources and licenses

`source-metadata.patch` plus `SOURCE-PATCHES.json` describe all7Core changes
relative to the pinned ImageMagick archive. `patch-source-metadata.py`
regenerates the patch from that original archive and verifies the resulting
identities. The C interface and WASI bridge have their own exact source pins.

The Core license, delegate license texts, dependency SBOM and compiler/runtime
notices accompany the resource directory. The SBOM describes the complete
official bootstrap, whereas the link command lists the actual libraries
used. The ImageMagick dependency source recipe is a separate reproducibility
path; use its pinned commits in an isolated work directory, never destructive
Git commands in an existing project checkout. This reconstruction does not
execute those clone/build commands or assert a complete delegate-source build.
