# File Digest perceptual hashes

`file.digest` with `imageHashes:true` (default) now returns all six native image
hashes, alongside the ten unchanged original-byte cryptographic digests:

| Key in `data.imageHashes` | Representation |
|---|---|
| Average | Uint8Array8 |
| Block mean | Uint8Array32 |
| Color moments | Float64Array42 (seven Hu moments for each HSV/YCrCb channel) |
| Marr-Hildreth | Uint8Array72, native default alpha2/scale1 |
| pHash | Uint8Array8 |
| Radial variance | Uint8Array40 |

B should display raw arrays, preserving the42 floating values for Color moments.
Do not reinterpret that vector as bytes or a hexadecimal digest. These are image
similarity descriptors, not authenticity probabilities. The existing `pHash`
key is preserved (native table label: Perceptual). JSON exports include all arrays.
Byte-only requests remain `imageHashes:false`, including segmented sources.
Supplied physical-file properties and naming hints follow
[ORIGINAL-BYTE-ENGINES.md](ORIGINAL-BYTE-ENGINES.md).

## Native arithmetic and evidence

The two previously withheld algorithms now have a separate pinned kernel in
`vendor/digest-extra`. The original method remains unchanged: Color moments uses
512×512 cubic resize,3×3 Gaussian, HSV/YCrCb and Hu moments. Marr-Hildreth uses
original-resolution grayscale/7×7 Gaussian,512×512 cubic resize, equalization,
the17×17 default kernel, native transposed16px block sampling and strict binary
comparisons. The squared-distance exponential is preserved exactly as upstream;
no alternative LoG formula or perceptual algorithm replaces it.

Corrections reproduce native ARM integer cubic coefficients and float FMA vertical
rounding, Carotene HSV reciprocal estimation, native double moment contractions,
and promotion of Marr float samples before accumulation. The OpenCV moments source
is compiled with explicit portable IEEE FMA; core/imgproc/DFT inputs remain pinned.
The existing general OpenCV runtime and its four hashes are unchanged. SDK and
OpenCV build inputs are read-only; the build writes only this worktree.

All117 diagnostic stages on the nine existing native synthetic fixtures now
match exactly, including intermediate resize/HSV/frequency planes and both final
hashes. Public tests cover those fixtures plus original PNG531×517 and1024×1024
inputs (intrinsic hash downsampling). All42 Color-moment values and72 Marr bytes
are exact. A real Chrome154 engine worker checks all six hashes,2190 values over
11 images including cached ownership checks, with zero differences. Seven Node
digest/file-property tests also pass, including original-byte integrity, explicit
memory refusal and cancellation between useful kernels. Evidence is in
`docs/digest-extra-chrome-proof.json`; generator/source hashes and build objects
are recorded in the vendor PINNED manifest. Results are measured-corpus evidence,
not an assertion of universal bit identity across every source/platform.

## Resource and lifecycle contract

The new kernel admits a128MiB heap through the common engine budget before loading.
Its conservative input/workspace guard is `12*sourcePixels+16MiB <=128MiB`.
The original RGB and general runtime retain their existing admission too. Inputs
are never reduced to fit memory; the intrinsic512px hash resize remains part of
the native method. Both new hashes run as requested work, without runtime probes,
calibration, synthetic warmup or GPU substitution. Progress reserves80% for file
bytes and20% for the six image hashes. Cancellation is checked between chunks and
useful kernels; hard worker cancellation retains its existing source-clear policy.
The temporary module/output is released after the call, and returned arrays are
owned copies under the result budget.

All six hashes now also accept segmented RGB through the bounded adapter in
[DIGEST-STREAM.md](DIGEST-STREAM.md). The128MiB extra-kernel limit above describes
the contiguous path. Browser access to native filesystem stat remains unavailable.
