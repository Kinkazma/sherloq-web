# Pixel queue consumed from integration 225eab8

M4 consumes M1's seven qualified pixel engines from the frozen integration
commit 225eab8. The native arithmetic and options are retained. The four extra
WASM modules (adjust, separation, contrast, gradient) and their sources, licenses
and build records are included. The OpenCV build recipes now accept a read-only
OPENCV_BUILD_ROOT; generated headers and outputs remain in this checkout.

Gradient derivative strips, color conversion and contrast block rows can execute
in independent workers. Admission includes source windows, output arrays and
fixed native heaps. Gradient/contrast release the idle owner heap while worker
jobs run, then reacquire it for ordered global rendering. Global maxima,
histograms, channel LUTs and native block statistics are unchanged. Existing
adjustment/separation workers and illuminant cell estimates are preserved.
There is no user calibration or speculative work.

Gradient derivatives, separation filtering and adjustment prefixes can now be
cached in source-owned temporary stores when RAM cannot retain them. Each family
owns one completed cache; a failed replacement does not publish partial data.
Threshold/inversion or display changes reuse these intermediates. Source unload
releases them. Full-frame magnifier uses a complete selected-region histogram
and native LUT in two passes when its resident working set does not fit. Bounds
remain oriented source coordinates; an empty region retains the existing result.

## UI/API connection

`loadBlob({id,blob,layout:'segmented'})`, then `run` with existing operation IDs:
`detail.gradient`, `colors.space`, `various.illuminant`, `tampering.contrast`,
`noise.separation`, `inspection.adjust`, `inspection.magnifier`. Parameters retain
M1's registry schemas/defaults. Large results expose `layout:'surface'` and an
owned RGB8 surface; consumers use `readPixels`, then `releaseSurface`. Magnifier
also preserves its source bounds/layer metadata. No hidden source resizing.

Progress is useful computation; `metrics.workers`, cache hits, source read counts,
cache storage and the shared memory snapshot describe actual work. `AbortSignal`
cancels work and cleans incomplete outputs. Cached completed intermediates remain
usable after cancellation. Old result surfaces remain valid through refiltering.

The common `exportSurface({surfaceId,revision,format:'png',compression})` creates
an independent encoded export read with `readExport` and released with
`releaseExport`. A temporary source surface defaults to temporary encoded
storage, leaving RAM for subsequent calculations. Optional `storage:'auto'` or
`'temporary'` makes that choice explicit. Exports survive source/result unload.
Merge these index/worker/client/raster-export changes once with M5's newer shared
registry; preserve M5's scientific export extensions.

## Evidence

`pixels-96mp-proof.json`: one real12000×8000 JPEG, one256MiB engine, fourteen
complete views, native full RGB hashes exact; fourteen complete PNGs independently
read after source release. Seven families, two settings each. Peak254178176B,
final accounted memory0, complete534.403s under concurrent development load.
`pixels-parallel-96mp-proof.json` additionally checks the final two-worker
admission for gradient/contrast, four96MP views and delayed PNG exports.

`pixel-stream-improvements-proof.json`: twelve complete small views equal the
reference kernels, cache/source-read assertions, old surface lifetime, cancelled
cached gradient/adjustment retry, all final reservations0. Rebuilt native modules
pass the same corpus. Large timings are observations, not a benchmark promise.

## M5 common integration

Pinned M4 `2a9e5e0` is merged with the shared JSON/NPZ/HDF5/PNG export registry,
source-owned temporary cache cleanup, typed `storage` selection and all other
M1–M5 providers. Small loupe outputs retain their original contract; large regions
publish a surface and original layer origin. Public capabilities describe both.

M5 reran the twelve-view/cache/cancellation Chrome corpus; its separate evidence
is `m5-pixel-stream-integration-proof.json`. Twenty-two targeted Node checks pass
after updating the old missing-storage expectation from MEMORY_LIMIT to
STORAGE_UNAVAILABLE, as required by the newly available streamed loupe path.
The owner's 96 MP full-native-view/PNG proofs are reused without alteration.

`m5-pixel-api-proof.json` additionally exercises the merged public worker at
6144×4096 under256MiB: two exact full RGB loupe views, cached global histogram,
original dimensions/origins, and two75,525,700-byte temporary PNG archives read
and hashed after source release. Peak201,283,584B; retained/cache/active finish0,
known codec heap24,248,320B before worker disposal. Total22.376s on the shared host.
This focused integration case does not replace the owner's96MP proof. A first
6MP/64MiB setup was refused by the common memory admission and is not qualified.
