# Browser memory execution contract — implementation target

Status: the existing runtime has shared admission, cache eviction and bounded
worker pools. Version0.14 adds JPEG segmented sources, exact pixel windows and a
global histogram (see SEGMENTED-SOURCES.md). Versions0.15–0.17 add owned channel-rank,
bit-plane and local-extrema RGB/mask surfaces. Other segmented operations and portable raster
streams remain open. Version0.18 adds deferred temporary storage for owned results
of initially RAM-backed segmented sources. Version0.19 adds original-byte hex
windows and ten streaming cryptographic hashes with explicit visual-hash opt-out.
No unlimited-size or complete-coverage claim.

The native memory-adaptive contract is a semantic reference. Native mmap, Qt
tiles, macOS page-release calls and Metal buffers are not browser APIs. Each
browser adapter must provide an independently measured implementation.

1. Plan from actual dimensions, types, parameters and the selected backend.
   Account for retained original bytes, decoded pixels, live outputs, caches,
   staging copies, per-worker WASM heaps, shared buffers and GPU limits. Global
   capacity and maximum size of one allocation are separate resources. Browser
   memory hints are estimates, not measurements of installed or available RAM.
2. Keep the existing full-memory path when it fits. Add lossless compact or
   segmented paths before storage-backed execution. Quota, allocation or device
   loss must name the exhausted resource. Retry only on a recognized resource
   failure, after freeing the failed path, using a qualified alternative.
3. Never alter image dimensions, precision, thresholds, iteration counts,
   candidate reach or allowed regions to fit memory. Local kernels may use
   exact halos; global extrema/histograms and normalizations remain global.
   Test vector/scalar alignment and boundaries after partitioning.
4. FFT, wavelets, attention, matching, sorting and connected components need
   their own global segmented algorithms. Independent tile analyses are not
   replacements. In particular, Noisesniffer's mean filter retains full-image
   FFT geometry; only its independent window DCT stage is partitioned today.
5. Temporary browser storage must be local, job-scoped and disposable. Estimate
   quota before writing, handle real quota failures, bound simultaneous handles
   and staging buffers, and clean up on cancellation/error/disposal. A storage
   estimate is not a reservation. Source bytes and returned live results must
   never be evicted as though they were recomputable cache entries.
6. Evolve the source/result contract additively: immutable Blob input without
   eager byte duplication; owned array descriptors with dtype, shape, strides,
   segmentation and exact region reads; streamed exports. Existing contiguous
   RGB8 calls stay available for consumers and kernels already qualified.
   Do not expose an unimplemented descriptor as a callable capability.
7. Presentation can request display tiles at reduced zoom; source coordinates,
   exact pixels at 100% and full-resolution analysis/export remain independent.
   UI requests and stale task generations must not retain unbounded buffers.
8. Qualify every adapter using ordinary and large synthetic noisy inputs,
   independent native references, seam/alignment cases, all parameter variants,
   public worker calls, failure recovery, cancellation, cache reuse and export.
   Report cold/warm/whole-path time, accounted memory, actual heap capacities,
   temporary bytes and limitations; do not call accounting browser process RSS.

Coverage must enumerate all 50 native panels and their variants, including
unavailable engines. A validated native 96 MP or 1 GP run is not a browser proof.
Model adapters additionally require actual received weights, license clearance,
conversion/operator checks and final mask/decision qualification.
