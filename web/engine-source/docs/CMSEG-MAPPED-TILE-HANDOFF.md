# Bounded CMSeg GPU-to-worker handoff

The nonresident correlation path uses the general GPU convolution, which returns a view of a mapped readback. That ArrayBuffer cannot be detached/transferred by `postMessage`; only the GPUBuffer's unmap/destroy can retire it. The original handoff attempted to transfer it directly to the CPU postprocessing worker. See [GPUBuffer.getMappedRange](https://developer.mozilla.org/en-US/docs/Web/API/GPUBuffer/getMappedRange) and the [WebGPU buffer-mapping contract](https://gpuweb.github.io/gpuweb/#buffer-mapping).

The correction copies only the current complete comparison-row tile into an ordinary Float32 host buffer, then releases the mapping after that useful copy and transfers the host tile. No whole N×N matrix is created. The existing per-worker envelope already includes `2 * tileBytes`; the new copy is bounded by `tileBytes = rowsPerJob * (h*w) * 4` inside that admission. The resident-input path is unchanged. Allocation/validation failures still release the mapping, and a cleanup failure cannot replace the original cause.

Four transport tests cover protected nontransferable buffers, real ArrayBuffer detachment after copying, exact Float32 bytes including signed zero, the existing tile bound, and allocation/cleanup failure preservation. The correlation admission, resident-dot rollback and mapped-output suites also pass: 15 tests in total.

An isolated Chromium 153.0.8010.12 numerical API qualification additionally exercised the real WebGPU mapped range: direct MessagePort transfer produced the expected TypeError (`ArrayBufferDetachKey`), unmap detached it only after copying, and the copied host tile transferred normally. It then computed the complete correlation operator on the pinned native `blobs-copy` feature tensor `[1,96,32,32]`, k=96 and native alpha 5.1324782371521. CPU, resident GPU and nonresident GPU produced all 98,304 output values exactly equal to each other and to the independent native PyTorch 2.8 reference.

Input SHA-256: `49f02598f7feeb192721d7a42238ce0741f05b660121cccf6882515c3a09d444`.
Native/all-three output SHA-256: `43af5964e436aa27e56662dfba06419c2a63daf9b0018ae3f09c1b54ecd7de0d`.
With 64 rows per job, the transferred tile is at most 262,144 bytes. Measured peak accounted memory was 68,763,648 bytes for CPU, 75,112,768 for resident GPU, and 75,164,416 for nonresident GPU; final budgets were all zero. This is admission/accounting, not physical GPU/CPU utilization. The qualification concerns this operator geometry and handoff, not a new full neural-model or 96 MP result. No weights, mathematical kernels, thresholds or model graph were changed.

Private reproducible receipt: `.build/validation/cmseg-mapped-browser-proof.json`, with source hashes, native identities, browser version and empty console/request/page-error lists. The harness used an independent browser context on the existing preview server and did not use application tabs, user image state or new infrastructure.
