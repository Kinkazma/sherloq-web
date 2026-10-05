# Resampling Fourier evidence

`tampering.resampling.fourier` implements the native standalone Fourier view of
an original image or one selected rectangle. The probability-map EM algorithm,
its 3×3/5×5 interpolation models and probability composites remain unavailable.
This operation is a frequency-domain visualization, not a resampling detector,
probability map, binary authenticity mask or automated peak classifier.

Defaults are `{rect:null, window:'hanning', upsample:true, center:false,
highpass:'simple', gamma:4, rescale:true}`. `rect` is an integer half-open
`[x0,y0,x1,y1]` inside the image, at least2×2; null selects the entire image.
`window` and `highpass` accept `hanning|radial` and `simple|radial` respectively.
Gamma is finite0–5. There is no automatic rectangle clipping or downsampling.
Generic `task.regions` is still refused; select this single rectangle explicitly.

Original JPEG/PNG/TIFF bytes are decoded with qualified OpenCV grayscale
semantics, independently of displayed RGB. The entire decoded gray source is
normalized by `(gray-min)/(max-min)` **before** selecting a rectangle. A flat
source becomes zero. Caller-only RGB fallback and probability-map input are not
implemented. ICC/orientation/depth/alpha follow the existing qualified codec
contract; Canvas never supplies analysis pixels. Unsupported encodings or a
grayscale/RGB dimension disagreement fail explicitly.

The source rectangle is cropped to its central even square, multiplied by the
selected window and optionally upsampled by the native float64 OpenCV `pyrUp`.
NumPy1.26.4's original complex pocketfft runs rows then columns, followed by
fftshift. Optional center cropping and the simple disk or radial highpass retain
the native formulas. The magnitude is normalized, raised to gamma, and optionally
multiplied by its original maximum. Gamma zero preserves native `0**0` behavior.
Values above one are retained, without clipping or hidden threshold changes.

`data.magnitude` and `data.values` are owned binary64 frequency-grid arrays.
`data.geometry` records the selected rectangle, spatial square, FFT size and
center offset. `data.grayNormalization` records the global extrema. The RGB
preview uses the exact Matplotlib3.8.4 gray byte LUT with fixed display limits0–1;
that LUT has truncation artifacts and is not the integer0–255 ramp. Output
coordinates are **frequency-grid**, never image-mask coordinates. JSON exports
the arrays, parameters, original SHA and geometry, subject to the normal bounded
export limit (large arrays can explicitly exceed the default32MiB JSON allowance). Native Matplotlib figure/axes
composition and its figure export belong to UI integration and are not emulated.

Reference and measured errors
-----------------------------

`scripts/generate-resampling-reference.py` creates only public synthetic inputs.
The unchanged native core's SHA, dependency versions, byte offsets and hashes are
in `fixtures/resampling/reference.json`. The compressed payload contains full
arrays and actual native palette bytes, not just selected sample values.

- Nine FFT shapes, including31×37 prime dimensions, and seven pyrUp shapes,
  including1×1, match bit for bit in Chrome154, Firefox155 and WebKit26.6.
- Eight fields exercise1024 Fourier parameter combinations:992 outputs and32
  expected errors for undersized center crops. All displayed RGB bytes match.
- Nine original JPEG/PNG/TIFF images, including EXIF rotation, progressive JPEG
  and16-bit PNG/TIFF, exercise180 full pipelines and ROI/global normalization.
- A synthetic1MP JPEG exercises three full-array cases, with and without
  upsampling/center/radial highpass, in all three browsers and both serial and
  parallel presentation paths. `generate-resampling-large-reference.py` rebuilds
  its larger arrays under `.build`; no private input is needed.

The complete chain is **not bit exact**. Declared metric is
`max(abs(actual-reference)/max(1,abs(reference)))`, observed at most
8.128108605379478e-9 on the small corpus, with tolerance1e-8. Maximum absolute
error there is about7.9e-8; the small gamma0.1 can amplify one-ULP window changes.
The1MP corpus has maximum observed scaled error below4.8e-13. This is an observed
corpus bound, not a universal accuracy proof. `Math.cos`, complex magnitude and
power may differ by runtime. No correction, clamping or rounding hides them.

As an additional diagnostic, first-argmax indices change in20/24/24 of992 small
outputs in Chrome/Firefox/WebKit, among equal or near-equal conjugate peaks. The
native Fourier view defines no argmax-based decision. The unchanged RGB preview
does not establish identical future peak detections; those require their own
qualification. WebKit automation is not a physical Safari/mobile qualification.

Resources, caches and performance
--------------------------------

The operation admits full source normalization, original-byte gray decoding,
windows, FFT input/output, cached stages, copies and output before allocation.
The portable arithmetic heap starts at32MiB, grows in16MiB steps and is capped at
512MiB. FFT dimensions above16384 or a larger bounded working set are refused.
Resident capacity is counted on subsequent engine operations; unloading an image
does not shrink the shared WASM heap. Source/output segmentation is unavailable.

Gray, spectrum and magnitude caches have distinct keys. Gamma/rescale reuse the
analysis; center/highpass reuse the spectrum; changing the window/upsampling/ROI
reuses whole-source gray only. Source unload invalidates all stages. Returned
arrays are independent copies. Cooperative cancellation releases admission;
hard worker cancellation clears loaded sources and requires explicit reload.

For output grids at least1MP, the CPU presentation distributes independent row
groups across the maximum useful workers admitted by the shared budget. Each
worker preserves binary64 `Math.pow` and the exact LUT; there is no WASM thread
pool inside these workers. Smaller grids and `cpuKernel:'single'` stay serial.
The pool starts the requested work directly, adapts from completed useful tasks,
and terminates workers after the job. No probe, persisted performance profile,
preload, resolution change or GPU inference is present.

An isolated Chrome benchmark, three alternating trials, measured serial versus
ten-worker presentation at18.4/30.7ms for512² (**rejected**),71.4/44.1ms for1024²,
and275/77.9ms for2048² (**3.53×**). Worker startup and copies are included. The1MP
original→2048² pipeline measured calculation RPC625.3/422.4ms (**1.48×**), warm
calculation587.1/410.4ms and original decode+RPC+example display709.1/499.4ms
(**1.42×**). Gamma change from cached analysis costs282.9/85.1ms (**3.32×**).
Accounted peaks1012564163/1058698703 bytes stay within the1GiB budget; these are
not process RSS. Example display costs15.6/15.5ms; it is not WordPress integration.

`fourierPreparationMs`, `fourierTransformMs`, `fourierMagnitudeMs` and `viewMs`
separate phases, including cooperative yields. `fourierViewWorkers` and
`fourierViewScheduling` describe the presentation pool, distinct from the single
FFT worker. The RPC-minus-engine time is a transport/scheduling envelope, not a
pure transfer benchmark. FFT multi-worker/GPU paths have not been qualified.

Reproduction from the source package
-----------------------------------

```sh
node --test tests/resampling.test.mjs
node scripts/browser-test.mjs --resampling
python scripts/generate-resampling-large-reference.py
node scripts/browser-test.mjs --resampling-large
node scripts/browser-test.mjs --resampling-parallel
node scripts/browser-test.mjs --resampling-benchmark
```

Use the pinned native Python environment for reference generation and the
documented Playwright browser cache. Add `--browser=firefox` or `--browser=webkit`
for the other development browsers. Public JSON proofs are `resampling-*proof`
and `resampling-*-benchmark` under `docs`. Benchmark runs require an isolated
development slot; none of these scripts runs inside the product startup path.

Build with Emscripten4.0.15 and `scripts/build-resampling-math.py`. The unchanged
NumPy C source, source archive SHA and upstream license are under
`vendor/numpy-fft`. Automatic floating contraction is disabled; explicit native
FMA operations remain fused. No native library is loaded by the browser.
