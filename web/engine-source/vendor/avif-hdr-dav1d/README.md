# libavif/dav1d HDR reader

The ST/MT modules are built from libavif 1.4.2 and dav1d 1.5.4, using the same
`native/avif-hdr-decode.c` API as the libaom reader. No precompiled third-party
module is imported. ST uses ordinary imported memory; MT uses shared imported
memory and a caller-admitted pthread pool. Both use WASM SIMD, a 4 GiB declared
maximum and a smaller actual maximum supplied by the numerical/resource owner.

Sources:

- dav1d 1.5.4: <https://downloads.videolan.org/pub/videolan/dav1d/1.5.4/dav1d-1.5.4.tar.xz>
  SHA256 `686616b7c69eb88d44459391ab25cac13b6647a3b288835c5784e71c1514a5c5`,
  verified against the official `.sha256` sidecar; BSD 2-Clause, see DAV1D-COPYING.
- libavif 1.4.2: <https://github.com/AOMediaCodec/libavif/releases/tag/v1.4.2>,
  source archive SHA256 `2b645287340ba5a631d268b551dc2d72bd73ac33335962dd36dcdb6d8366921d`;
  see LIBAVIF-LICENSE for its notices.

The Meson cross-compilation approach was checked against the primary build
instructions in <https://github.com/phenomen/libavif-wasm/blob/main/scripts/build.sh>
and its Emscripten cross file. This component independently builds pinned upstream
sources with its own wrapper and flags; it does not use that package's binaries.

Rebuilding requires Emscripten 4.0.15, Meson 1.6.1, Ninja 1.11.1.1, CMake, and Python.
Set `EMSDK`, `MEDIA_CODEC_SOURCES` (containing the unpacked libavif 1.4.2 sources)
and, if necessary, `DAV1D_BUILD_TOOLS` (directory containing Meson/Ninja). Run:

```sh
python3 scripts/build-avif-hdr-dav1d.py st --100mp
python3 scripts/build-avif-hdr-dav1d.py mt --100mp
```

The optional `--100mp` applies the documented checked 32-bit patch in `patches/`
to separate build-source copies. The original source trees stay untouched.
The same decoder/kernel/owner handles every admitted dimension: no alternate
large-image implementation. The patch changes the 32-bit guard from 8192² to 100 MP,
checks picture-size arithmetic in uint64 before conversion, and rejects single
allocations larger than PTRDIFF_MAX including padding. The owner still admits
actual memory before decoding; memory exhaustion is an error, not a wrapped
allocation. libavif's single-frame parallelism remains 1. The imported memory's
funded ceiling may be smaller than 4 GiB; the owner may tighten later growth after
observing decoder residency.

`DAV1D_LINK_ONLY=1` re-links only a changed common wrapper against existing
matching ST/MT libraries. Build manifests record the wrapper hash, source pins,
patch hash, flags and output hashes. The script regenerates
`src/avif-hdr-dav1d-resources.js` with local static WASM URLs and integrity pins.

The 4 GiB module declaration is an address-space maximum. It is not a claim that
every 100 MP bitstream/layout fits every device budget. Source chroma, extra planes,
alpha, film grain, super-resolution and thread counts remain part of admission.
