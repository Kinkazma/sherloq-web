# Global paged SIFT

SIFT, RootSIFT, SIFT–G2NN, Panels/Text and SIFT–LightGlue retain their native
extractor settings, original coordinates, masks, ranking, reflection and matching.
`SparseFeatureEngine` uses paged extraction when the admitted whole-pyramid
estimate exceeds 512 MiB or 60% of the shared budget. The existing whole-image
CPU implementation remains the reference for smaller inputs. No additional UI
parameter or model weight is required. `backend` selects CPU/WebGPU/auto; cache
identity includes that choice. The result reports the provider and per-job storage,
worker counts, heap high-water marks, actual executions and retries.

The controller stores one **global base per octave**, including the original
native doubled first octave. It evaluates the native Gaussian/DoG layers over
1024-pixel cores with 128-pixel support, then constructs the next global base by
native factor-two sampling. Finite supports are preserved; these are not separate
cropped-image SIFT detections. Newton refinements that leave a valid support
window explicitly continue against their globally addressed neighborhoods, with
the original five-step limit. The controller then globally removes duplicates,
ranks and masks candidates before calculating selected descriptors against those
same bases. G2NN uses global per-ROI min/max normalization and the original cubic
4× enlargement rule. LightGlue keeps its four-layer pyramid, pixel deduplication
and RootSIFT descriptor arithmetic.

WebGPU implements the ordered float32 row FMA and symmetric-column filter.
Detection, refinement, orientation, global selection and descriptor code use the
qualified OpenCV 4.11 WASM arithmetic. CPU evaluates the same Gaussian kernels.
Shared memory admission precedes worker/storage creation. OPFS/IndexedDB storage
is available through the existing temporary-session hooks. Resource failure can
reduce concurrency without dropping completed windows, or select CPU in auto
mode. These adaptations observe useful work; there is no runtime calibration.

## Evidence

- Five extraction cases in both CPU and WebGPU: all points, descriptors and mask
  memberships exactly match the prior qualified WASM path. This does not erase
  that path's already documented small angle differences from the Mac reference.
- Ten complete GPU pipeline cases including positive SIFT, RootSIFT, G2NN and
  Panels/Text/reflection: native pair IDs/order, ownership, groups, colors and RGB
  agree; fitted matrix maximum difference below 4.2e-13.
- SIFT-LightGlue CPU/GPU complete comparison: same pair IDs, owners, groups and
  RGB; maximum native match-score differences 3.46e-6 / 1.61e-6. Its existing Mac
  point-metadata differences remain recorded in the proof.
- Forced global continuation of 180 seeds: same 133 final points and descriptors
  as the unpaged native WASM. The production 96 MP run naturally used 95 such
  continuations.
- Real OPFS run: 13,456,660 peak temporary bytes, zero open files and reservations
  afterwards, exact output. A development-only memory failure after actual octave
  computation reduced concurrency 2→1 and preserved the same result; no injection
  is part of the runtime.
- Chrome 154, original **12000×8000 / 96 MP** deterministic RGB noise with a distant
  copied half: 298,473 global candidates; native retainBest yields 6,001 before
  the established UI limit retains 6,000. Final 2,998 pairs and one group. Full
  worker API path, original-sized windows, cached hidden-group view, NPZ and PNG
  export succeeded in 109.51 s including 16.09 s loading. Shared accounted peak
  **4,070,696,782 bytes** under 6 GiB; actual peak SIFT worker heap 116,195,328 bytes,
  two Gaussian workers, no retry. All global bases used RAM in this run. NPZ is
  3,624,956 bytes and PNG 200,625,532 bytes. Final active/retained/cache bytes zero.
  Timing is an observed development run with concurrent activity, not a controlled
  benchmark. Independent native drawing of the NPZ is checked over all 288 MB.

Small CPU/GPU proofs also record elapsed times, but include the reference
extraction and browser overhead. The 96 MP evidence qualifies the common paged
SIFT storage path; it does not independently qualify large OCR/Panel preprocessing,
large LightGlue attention, or another 96 MP native extraction. Those distinct
paths remain tracked in the M3 coordination state.

Build: run the existing qualified SIFT arithmetic-source preparation, then
`scripts/build-sift-paged-study.py --runtime` with the pinned OpenCV/Emscripten
paths. The builder modifies only owned `.build/m3` copies. Runtime binary identity
and licenses live in `vendor/sift-paged`; proofs live beside this document.
