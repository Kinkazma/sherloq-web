# Six native perceptual hashes on segmented RGB

`file.digest` now accepts segmented JPEG/PNG/TIFF surfaces with its normal default
`{imageHashes:true}`. It returns the same ten original-byte digests and six typed
image hash arrays described in [DIGEST-PERCEPTUAL.md](DIGEST-PERCEPTUAL.md).
`imageHashes:false` remains the explicit byte-only option. Load/capabilities no
longer advertise a visual-hash restriction. Inputs retain full source dimensions.

The extra WASM module prepares each algorithm from exact full-width source bands:
Average/Block mean/pHash use their native 8/256/32 linear-exact resize; Color
moments uses the qualified cubic 512 resize, HSV/YCrCb and Hu moments; Marr uses
original-resolution grayscale and Gaussian with a three-row halo before cubic
512 resize. Repeated supporting row ranges are reused within each algorithm.
Radial variance records the native global projection sampling geometry, visits
32 source rows with three-row halos, then evaluates the original feature and
hash calculations. Native loop geometry, counts and border reflection are retained. There is no intermediate approximate thumbnail.

## Interface and lifecycle

Call `engine.run({id,imageId,operation:'file.digest'}, {signal,onProgress})`.
The `data.imageHashes` keys and typed values are unchanged; Color moments remains
42 float64 values, not a byte digest. `exportResult(result,{format:'json'})`
retains all arrays, byte hashes, source-file properties and provenance.

Progress remains globally monotone: encoded bytes occupy 0–0.8, visual kernels
0.8–1. The public phases are `original-bytes`, `perceptual-hashes`, `complete`.
Results are cached by source and complete parameters, returned as owned copies.
Cancellation never stores an incomplete result. Direct-engine cancellation leaves
its loaded source available; worker cancellation follows the existing storage
close/termination policy and requires reloading the source. Source unload removes
results and storage. No synthetic runtime probe, warmup or calibration is used.

Metrics report `wasmHeapPeakBytes`, `wasmMaximumBytes`, `sourceWindowReads` and
`maxSourceWindowBytes` in addition to the shared memory account. A cached result
retains the original calculation's descriptive metrics and sets `cache.result`
to true and workers to zero.

## Memory and exactness evidence

WASM starts at16 MiB. Its imported per-call maximum rounds the conservative bound
`32MiB + 1620*max(width,height) + 8*(height+1) + 228*width` upward to16 MiB.
The dimension bound is1–65500 and the heap ceiling256 MiB. An additional8 MiB
allowance covers module/output overhead. Source windows and store scratch are
reserved separately under the same budget, as are resident codecs, stored source
pixels and the existing32 MiB cryptographic allowance. Refusal is explicit;
no algorithm parameters or source resolution change to fit memory. These are
accounted capacities, not a claim about browser process RSS or immediate GC.

Node qualification compares all six hashes exactly against native OpenCV4.11:
nine existing RGB fixtures including 1px/row/column, three original encoded
531×517,1024×1024 and1600×2200 images, and eight independently oriented fixtures.
The two downsampling sizes exercise odd coordinates and an exact2x resize.
Admission refusal, direct cancellation and retry, owned caches and JSON are tested.
A real Chrome worker checks the1600×2200 segmented JPEG, all six hashes, original
SHA256, cancellation/reload and cleanup. Its116 MiB budget peaks at119,799,104
accounted bytes; native heap peaks at16 MiB under a48 MiB imported maximum.
Largest source window:182,400 bytes. Browser proof also checks the six hashes on
OPFS and IndexedDB source storage. See `digest-stream-chrome-proof.json`.
These are corpus results, not a universal platform-parity claim or qualification
of every possible65500px shape. Segmented decoding supports JPEG, static PNG (PNG-STREAM.md) and TIFF/BigTIFF (TIFF-STREAM.md).

The same unchanged path is now qualified on a rich12000×8000 original JPEG with
distant copies. All ten byte digests and six complete perceptual arrays are exact
against independent hashlib/OpenCV references, including Color moments float64.
Owned cache and full JSON after unload pass. Chrome256MiB, peak141323360B, final
ownership0 and temporary inventory restored;15.558s whole functional test under
shared load. See `m5-digest-96mp-proof.json` and `M5-LARGE-SOURCE-COVERAGE.md`.

Reproduction: `scripts/build-digest-stream.py` reads the shared pinned SDK/OpenCV
inputs and writes this worktree only. First produce this worktree's explicit-FMA
moments object with `scripts/build-digest-extra.py` if absent. The radial source
rewrite changes four pixel reads into sample records and three input parameter
types into dimension-only shapes. All linked objects/sources and output hashes
are recorded in `vendor/digest-stream/PINNED.json`. Independent native references
come from `scripts/generate-digest-stream-reference.py` with native OpenCV4.11.

## Radial arithmetic at large projection boundaries

A4103×5401 native TIFF exposed one differing output byte (the maximum normalized
coefficient,254 vs255). Diagnostic projection comparison isolated four pixels
whose tangent rounding chose a neighboring source row. The adapter now uses a
fixed180-angle table from the native ARM Darwin libm `tanf`, generated offline
as exact hexadecimal float constants. Two floating reductions use explicit FMA
to preserve the native ARM contraction. No output clamp or tolerance is used.
The original projection loops, sample counts, Gaussian, feature normalization and
40-byte output remain intact. The constants depend only on the algorithm's fixed
angles; no input fitting, benchmark or runtime calibration occurs.

Both contiguous file.digest and segmented sources use this radial adapter.
Contiguous inputs expose already-owned row views without copying the whole RGB
image. Other contiguous hashes keep their existing implementations. Six extra
independent native patterns (two patterns at4103×5401,3101×1703,1027×2053), the
49+2 TIFF RGB cases and the previous hash corpus validate the correction.
`generate-radial-tables.py` requires the ARM Darwin reference host;
`generate-radial-reference.py` independently calls native OpenCV4.11.
