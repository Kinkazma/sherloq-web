# Public proof index

All images are generated mathematical patterns or seeded noise. No private image,
EXIF, account, browser profile, local identity or WordPress configuration is used.

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| fixtures/reference.json + binary RGB fixtures | 40 native ELA output SHA256 expectations; all 65,536 input-byte pairs and a textured/color synthetic image | General detection validity |
| fixtures/codec-reference.json | 7 generated JPEG cases, 56 recompressions at qualities 1/25/50/75/95/96/99/100; 1×1, odd, gray, progressive, larger images | EXIF/ICC/TIFF/alpha/high depth support |
| tests/codec.test.mjs | Those codec expectations plus synthetic.jpg (8 decode cases, 57 recompressions) | All encodable JPEG variants or bitstream-byte identity of the new recompression |
| tests/engine.test.mjs | End-to-end RGB equality, defensive copies, cache invalidation, memory admission, abort and large-image LUT path | Browser UI integration |
| tests/profiles.test.mjs | Resource profile choices independent of forensic parameters | Available/free system RAM |
| docs/browser-proof.json | Installed Chrome 154, real module worker/WASM, exact output, original bytes, caches, hard cancellation and reload; larger-job abort | Physical mobile/Safari/Firefox/Edge or the WordPress visual layout |
| docs/kernel-benchmark-before-yield.json | Earlier clamped-timer implementation | Current best CPU baseline |
| docs/kernel-benchmark.json | Reference CPU, fused CPU and integer WebGPU; preparation/transfers/readback included; 40 GPU native outputs exact | GPU dispatch-only timestamp or detector masks |
| docs/pool-benchmark.json | 1/2/4/8 worker experiment with transfer/assembly; each internal pool single-threaded | A fixed optimal count for every image or device |
| docs/pipeline-benchmark.json | Reference / optimized single worker / adaptive aggressive worker pool, actual JPEG+worker+output RPC; cold/warm/re-tone | GUI paint or cross-device guarantee |
| fixtures/pixel-reference.json | 2,682 native outputs across five new pixel tools, with exact source hashes | Other tools or all possible inputs |
| tests/pixel-tools.test.mjs + tests/pixel-integration.test.mjs | Pixels/masks/data parity, native CSV, ownership/cache/abort/memory; integer histogram counts above 2²⁴ | WordPress integration |
| docs/pixel-browser-proof.json | Same 2,682 outputs in Chrome module worker; all native defect CSV hashes | Other browsers/devices |
| docs/pixel-smoke-measurements.json | 1 MP cold/warm worker RPC and cancellation/reload | GPU/parallel speedup or display performance |
| docs/native-inventory.json | 130 modules statically enumerated with source hashes, functions and choices | Runtime execution of all branches |
| docs/engine-registry.json | Every one of the 50 native panels and per-panel status | Completion of all ports |
| docs/weights-inventory.json | 83 local checkpoint/index paths including duplicates; 3 unavailable groups explicitly retained | Converted models, new receipt or redistribution approval |

| fixtures/opencv-reference.json | 4,020 native outputs: spaces, noise filters, gradients, adjustments, Echo | Arbitrary OpenCV builds or all images |
| fixtures/illuminant-reference.json | 1,440 renders/counts/valid flags exact; RGB/angle <=1e-12 | Physical illumination ground truth |
| fixtures/magnifier-reference.json | 440 ROI cases including empty/clipped bounds | UI zoom/interpolation |
| fixtures/metadata-reference.json + image-codec-reference.json | 35 successful new native decodes, four native TIFF rejections | Other TIFF/PNG photometrics, RAW or full ExifTool |
| fixtures/quality-reference.json | 600 grayscale means, tables and minima; curve <=1e-12 | Learned quality predictor |
| tests/digest.test.mjs + image-hash.test.mjs | Ten byte digest algorithms and six perceptual hashes | Color moments/Marr-Hildreth added by digest-extra tests; segmented visual hashes remain pending |
| fixtures/exif-tools-reference.json | Independent synthetic GPS and native thumbnail resize/difference | Inferred geolocation or arbitrary EXIF tags |
| docs/extended-browser-{chrome,firefox,webkit}-proof.json | Extended corpus in Chrome 154, Firefox 155 and Playwright WebKit 26.6 with real worker/transfer/cache/abort | Physical Safari/mobile, WordPress controls or performance improvement |

Current test counts belong to the versioned qualification report. Historical
benchmark JSON remains reproducible, including the superseded calibration cost.
From 0.13 no runtime calibration or warm-up precedes requested work. First useful
RPC and native parity are recorded separately; see `IMMEDIATE-COMPUTE.md`.
Cached results avoid the kernel. Development benchmarks remain outside the product.

Original JPEG **bytes** are preserved and SHA256-identified; native decoded RGB
and recompressed RGB are checked separately. Encoded recompression bitstream
identity is not asserted by these tests, which do not export the intermediate
JPEG stream. Classic ELA has no decision mask; GPU mask parity is not applicable.

## M1.27 — actual segmented neural API

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| neural-segmented-mgcfdn*-cpu-proof.json | Five real MGCF models on decoded synthetic JPEG; three independent zones, exact final masks, declared continuous probability bounds, cached reprojection and owned NPZ | Universal numerical parity or other physical devices |
| neural-segmented-cmseg-addnoise-cpu-proof.json | Actual512 input/all-pairs CMSeg addnoise, native JPEG scores below1e-4 and exact source masks | Generalization checkpoint acceptance |
| neural-segmented-d2prl-webgpu-proof.json and its npz proof | Three-zone D2PRL448/40/seed22, source maps/masks/roles bit-exact, refilter500→17 without inference, exact independent NumPy export | Pure GPU execution or new isolated speedup |
| neural-segmented-*-extracted-proof.json | Actual copied-runtime API, ownership and lifecycle; the D2PRL large case compares every pixel of12000×8000 source outputs and pages its complete NPZ | WordPress integration, arbitrary dimensions, or process RSS |
| neural-input-session / neural-exports / neural-result-surfaces tests | Eight orientations, complete-only hash memo, crop access, controller cache, numeric/mask handle ownership and release, export rollback/independent lifetime | Neural correctness from fake models used in controller-only tests |
| cmseg-jpeg-*diagnostic*.json and generalization counterexample reports | Known score failure localized to real encoder/correlation arithmetic; exact FMA primitives and native-feature correlation do not repair the complete network | Permission to feed native oracle tensors into product inference or relax1e-4 |
| Historical M1.27 admission test | Generalization was withdrawn before graph fetch | Current v2 qualification; see the M1.28 evidence below |

The new CMSeg counterexample supersedes availability claims for generalization
in older proof descriptions. Its old positive results are preserved as historical
observations. Read `CMSEG-JPEG-NUMERICAL-LIMIT.md` before interpreting them.

## M1.28 — native-order CMSeg repair

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| fixtures/cmseg-winograd/reference.json and cmseg-winograd.test.mjs | Nine entire native convolution tensors bit-exact, odd borders, padding and bias | Complete model parity alone |
| cmseg-backbone-legacy-proof.json | Actual checkpoint backbone, ONNX bypass/decoder and global FMA correlations; four native probability/mask cases including2611 foreground pixels | Other devices or WordPress |
| neural-segmented-cmseg-generalization-cpu-backbone*-proof.json | Repaired real JPEG three-zone API, exact decisions, probability bounds, cached composition, owned NPZ and cancellation | Universal scientific equivalence or isolated speedup |
| cmseg-backbone-admission / segmentation-admission tests | Partial-constructor rollback, failed reads/cancellation cleanup, lazy identity verification, old bundle rejection | Numeric parity from the synthetic failure graph |

The retained M1.27 counterexample rejects v1; it is not a remaining failure of the
separately pinned M1.28 v2 path. See `CMSEG-BACKBONE-REPAIR.md`.

## M1.29 — scientific export scheduling

The three strategies in `neural-export-throughput-proof.json` preserve the complete
1.44GB NPZ checksum while isolating write and hash yielding. Independent NumPy
readback checks every full96MP scientific plane. Real control-message cancellation
during both stages preserves sources and removes partialOPFS files. Five focused
tests include float64/int32/Unicode and prior neural ownership cases. This is an
export improvement, not a new neural inference or native Mac speed claim.
See `SCIENTIFIC-EXPORT-SCHEDULING.md` for timings and copied-runtime evidence.
