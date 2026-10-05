# Native thumbnail comparison over segmented originals

Internal `segmentedThumbnailComparison(image,embedded,{budget,signal,onProgress})`
accepts an already decoded RGB8 thumbnail and the original full-resolution RGB
surface. It returns owned `resized` and `difference` byte stores, dimensions,
metrics and an idempotent asynchronous `dispose()`.

The kernel calls unmodified OpenCV4.11 `cv::resize(...,INTER_LANCZOS4)` in a
private, bounded, disposable WASM module. Its full output retains native global
coordinates and edge behavior. The original is read only in32-row windows;
absolute RGB difference uses owned window bytes, and both outputs are delivered
to segmented stores. No full original or full JavaScript resized matrix is made.
The original surface is never mutated. Orientation is already applied by its
surface provider; analysis coordinates are full-resolution.

Admission includes enforced WASM maximum, embedded copies, native coefficient/
row buffers and I/O windows before output stores are allocated. Stores spill to
temporary storage under the existing policy. The native resized matrix remains
resident in WASM: this is not an unlimited-memory or independently tiled Lanczos
algorithm. Dimensions and WASM address-space limits remain explicit. There is no
calibration or alternate interpolation. Native resize is synchronous inside its
owning worker; hard worker cancellation handles interruption within that call,
and row delivery cooperatively checks signal and consumer errors.

The minimal native wrapper and build script are recorded with OpenCV library,
compiler and artifact hashes under `vendor/thumbnail-resize/PINNED.json`. Build
inputs under OPENCV_BUILD_ROOT/EMSDK are read-only; only this worktree is written.

Ten native `analyze_thumbnail` cases are exact for resized and difference bytes,
including1-pixel inputs/outputs, up/downsampling, odd dimensions and row seams.
Cancellation in resize/delivery, consumer errors and memory refusal free every
unpublished store. The independent native generator writes only the owned JSON
oracle and reads the native reference without modifying it.

The browser proof is in `thumbnail-stream-chrome-proof.json`; reproduce with
`scripts/test-m5-browser.mjs --thumbnail-stream`. Original decoding, embedded
ExifTool extraction and public thumbnail-result publication are separate steps;
this internal primitive does not claim those are already connected.

Chrome154 with4103×5401 BigTIFF and31×17 RGB thumbnail under192MiB: complete
resized and difference hashes match native; both66480909-byte output planes are
OPFS. The largest source window is393888 bytes; actual native heap83427328 bytes,
enforced maximum117440512, peak accounted193519473. Cancellation after10% row
delivery removes partial files and leaves source intact; final memory and
storage cleanup are exact. This proves comparison from supplied decoded pixels,
not extraction of an embedded thumbnail from this BigTIFF.
