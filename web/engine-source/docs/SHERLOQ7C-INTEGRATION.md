# Sherloq 7C: integration and data contracts

This document describes the private integration and its qualified input/output boundaries. It does not establish novelty or publication readiness of the scientific method. The method and numerical error certificates are implemented in the Sherloq modules; the older source/runtime manifests describe the base version. A private source-delta manifest and worker build record identify this integration separately without changing the product version.

## Inputs and presentation

The dedicated operation is `inspection.sherloq7c`. It receives the complete encoded original. Unsigned 16-bit TIFF/PNG samples are decoded directly into owned interleaved RGB `Uint16Array` values. The scientific input does not pass through the historical RGB8 display surface. TIFF strip/tile storage, planar/contiguous RGB, native byte order and orientation are handled before analysis. PNG16 gray/RGB/RGBA and interlacing are supported; analysis is RGB and alpha is not a fourth scientific channel. The original encoded file remains available.

An original whose intrinsic depth is at most 8 bits can use its qualified RGB8 surface, promoted exactly by `u16 = u8 * 257`. Its normalized values are unchanged; no extra information is recovered. An original deeper than 8 bits without a qualified native decoder is refused rather than silently reduced.

The common equalization method ID is `sherloq7c`, appended at index 16 after the 16 older methods. Existing saved indices/values are preserved. Its input is the actual computed presentation of the upstream tool, including ELA, gradient and global adjustments. A native RGB16 descriptor remains native16; an intrinsically RGB8 proxy is explicitly promoted as above. The original depth and working depth are distinct provenance fields.

Native samples are analyzed in their stored RGB space. ICC transforms are not applied. The PNG16 exporter currently writes the exact numeric result without copying the original ICC profile. Numeric sample fidelity and appearance in a color-managed viewer are therefore separate contracts.

## Controls

The dedicated controls use percentage values in `[0,100]`:

- `revelation`: the revelation amount. At zero, the baseline already stretches the present dynamic range.
- `micro`: microcontrast contribution, active independently of revelation, including revelation zero.
- `precision`: `reference`, `1e-7`, `1e-4`, or `1e-2`.

For the common menu, revelation is `equalization.values[16]`, while the other controls are `equalization.sherloq7c = {micro, precision, backend}`. Both Sherloq sliders are continuous; the former methods retain their original step rules. Backend is `cpu`, `webgpu`, or `auto`.

An error option is a maximum floating-point error request before RGB16 quantization. RGB16 rounding adds at most `0.5/65535`, about `7.63e-6`. A request of `1e-7` cannot promise quantized RGB16 samples accurate to `1e-7`. Unsupported or insufficiently certified calculations must produce an explicit error; a stricter mode is not silently relaxed.

The reference class retains the historical target RMS stopping criterion. It is distinct from a requested maximum-error class. Recorded benchmarks identify the target and projection criteria and compare both observed error and certificate uncertainty.

## Outputs and ownership

Each core result owns three arrays:

- RGB8 display: `pixels`, 3 bytes per pixel.
- RGB16 data: `pixels16`, 6 bytes per pixel.
- Float64 scalar intensity: `scalar`, 8 bytes per pixel.

The combined 17-byte reservation is separate from graph/target/native-workspace caches. `result.release()` is awaitable. A cache clear cannot steal a retained output. The adapter transfers these arrays to three surfaces with shared ownership; final retirement releases the core result. Surface-window transfers are independently owned and bounded to 4 MiB.

Dedicated plane names are `intensity` and `rgb16`; common-pipeline plane names are `sherloq7c_intensity` and `sherloq7c_rgb16`. Global threshold/inversion operates on both RGB8 and RGB16 after Sherloq. The Float64 scalar remains before that presentation finish, and the certificate explicitly describes that preceding stage. A discontinuous threshold is not covered by an unchanged floating-point bound.

`PNG16 natif` exports the native RGB16 surface, with bounded row streaming and export-owner acknowledgement. It does not resize or pass through RGB8. The historical display PNG exporter remains an 8-bit exporter. The dedicated scalar CSV represents the Float64 plane before optional finish.

## Identity, cancellation and resource policy

Scientific cache identity includes the actual RGB16 bytes and geometry. Original-file SHA, source ID and proxy revision alone are insufficient. A mutable caller buffer is snapshotted synchronously before the first await; an explicitly immutable input must remain stable until the call settles. Pixel SHA authentication is separate from original-file SHA.

For the qualified dynamic ELA, gradient and global-adjustment routes, the producer's abort signal reaches proxy preparation, the CPU solver and GPU initialization. Their interface retains at most one active job and the latest pending request. Superseded generations may not publish or newly paint their output. Cancellation waits for native/GPU retirement acknowledgement; it does not terminate the shared worker. The previous valid output may remain visible while a replacement is pending. Other upstream tool families retain their historical cancellation policy; the saturation evidence does not qualify those producers.

There is one shared runtime per engine, using the central Budget, scheduler and resource-recovery policy. Existing native heaps, host arrays, future output arrays and admitted workspace maxima must be financed. Idle reproducible caches may be reclaimed; original data and visible output owners may not. Budget credits are not an RSS measurement, nor a promise of immediate garbage collection.

GPU is an initializer for the same final CPU binary64 problem. The current policy uses 64 GPU iterations with the qualified dual scaling, then CPU refinement and a new certificate. `actualGPUWork` records real submitted/completed work; `actualUsefulGPUWork` records admission of that seed. If the seed is discarded, the final backend is correctly reported as CPU while GPU-attempt evidence remains visible. Cached results do not claim new GPU work. Auto uses a fixed policy selected offline, with no runtime scientific preflight or calibration.

Nonidentity regions/exclusions need a separately qualified graph domain and are currently refused for this method. An after-the-fact output mask does not qualify excluded scientific observations.

## Sources and reconstruction

The target kernel source and generic rebuild script are `native/sherloq7c-target.cpp` and `scripts/build-sherloq7c-target.sh`. The OSQP bridge, vendored OSQP/QDLDL sources and offline recipe are documented in `SHERLOQ7C-OSQP-SOURCES.md`. Additive native16 decode/export sources and build scripts are kept alongside the historical codecs. The worker builder records source/native-wrapper/wasm hashes, preserves required shared module singletons, and verifies its generated bundle before selecting it. The scientific model is not replaced by a packaging benchmark or runtime canary.

The target's imported wasm32 memory has a 16 MiB initial allocation and a 4 GiB declared growth maximum. Emscripten keeps the final 64 KiB page outside allocator growth to avoid wasm32 size wraparound. Admission follows the current budget; it does not allocate the complete maximum eagerly. Host pointers returned as signed i32 are converted to unsigned addresses before indexing typed arrays. The native source, arithmetic instructions and numerical stopping rules are unchanged by this memory rebuild; `src/target-kernel.PINNED.json` records the source, build flags and artifacts. This is a single-heap capacity contract, not a guarantee for every graph or image size.
