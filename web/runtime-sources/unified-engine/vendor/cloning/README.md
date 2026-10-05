# Qualified ORB arithmetic module

Built from pinned OpenCV4.11.0 with Emscripten4.0.15 by
`scripts/build-cloning-math.py`. First build the base libraries with
`scripts/build-opencv.sh`. The generated ORB translation unit restores the native
fast-angle polynomial and102 explicit fused contractions; original upstream/native
sources remain unchanged. Pinned LLVM libc++15.0.7 sort helpers preserve the
native equal-distance order. Their originals and hashes are in vendor/llvm-sort15.

PINNED.json records generated JS/WASM identities and source versions. This module
contains ORB detection/selection, ordered32-byte Hamming matching, scalar fused
boundary norm, native drawing and seeded kmeans counting. Its32MiB initial heap
can grow to1GiB; the JS adapter must admit working bounds before allocation.
Drawing buffers are caller-owned; result scratch is read and released within one
synchronous section. No runtime native/macOS library, network model, private image
or trained weight is required. BRISK/AKAZE are not hidden fallbacks.

Retain OpenCV Apache, embedded ORB notices, LLVM Apache with exceptions, and
musl copyright/license files alongside reuse. See docs/COPY-MOVE-ORB.md for the
scientific contract, qualification corpus, device and memory limitations.
