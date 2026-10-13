# Execution, recovery and export corrections — 0.15.1 / export.3

I integrated the qualified execution corrections into the web adaptation while preserving the existing batch workflow and example galleries. SHERLOQ remains the work of [Guido Bartoli and its original contributors](https://github.com/GuidoBartoli/sherloq); the integrated research methods retain their own authors and licenses.

The reviewed engine source is `a1f85661db24610ac3c7bf894214afc85a72d024` (0.35.0-export.3). The interface is derived from `f6fce639ff86262bbfbc48dd9e6bdacbcdfa4404` (0.15.1), merged with the existing batch implementation. `app.html` and `tool-client.js` needed three-way merges; the other batch production files were retained. [Source identities](SOURCE-IDENTITY.json) and [integration evidence](evidence/execution-integration-20261012.json) describe the resulting delivery.

## What changed

| Problem | Resulting behavior | Main source |
| --- | --- | --- |
| Separate ORT contexts accumulated across model switches; shared pools could wait circularly | Compatible idle contexts are reused, partial admissions are released before waiting, and independent work keeps its useful parallelism | [Neural graph pool](../web/engine-source/src/neural-graph-pool.js) |
| Early worker failures could escape observation or lose their cause | Startup is observed before admission; transport errors finish pending requests with the original cause and task context | [Worker client](../web/engine-source/src/worker-client.js) |
| Transform steps recreated workers and replayed too much work after a strip failure | Compatible workers persist; recovery reprepares only the failed strip and retains consumed strips | [Strip lifecycle](../web/engine-source/src/wavelet-strip-pool.js), [new worker helper](../web/engine-source/src/transform-strip-worker.js) |
| M2 display selected a surface owned by another worker | Display follows the views explicitly published by M2 | [Tool displays](../web/wordpress/sherloq-browser/assets/tool-displays.js) |
| ELA and exports could leave protocol acknowledgements pending | The common protocol preserves the primary failure and awaits the export consumer | [ELA worker](../web/wordpress/sherloq-browser/assets/engine-worker.js) |
| Magnifier redraws could repeatedly retry the same failed full-image effect | Failure is remembered for the source/effect identity; the useful preview stays available | [Magnifier client](../web/wordpress/sherloq-browser/assets/loupe-full-client.js) |
| CFA copied from a view invalidated by genuine WASM memory growth | Source and destination views are reacquired after allocation | [CPU CFA](../web/engine-source/src/cfa-program.js), [GPU CFA](../web/engine-source/src/cfa-gpu-program.js) |
| HTML numeric validity silently blocked valid gamma values | Bounded decimal values are accepted; invalid input receives a visible explanation | [Workspace controls](../web/wordpress/sherloq-browser/assets/tool-workspace.js) |
| Display/export callbacks could reopen an already completed calculation status | Progress belongs to the active calculation and revision | [Application](../web/wordpress/sherloq-browser/assets/app.js) |
| Diagnostics blurred completed, partial, suspended and resumed work | Structured group states, attempts and causes are preserved; intentional cancellation is excluded from the documented-failure signal | [Session log](../web/wordpress/sherloq-browser/assets/session-log.js) |
| NPZ export treated exact one-point/two-point mask contours as invalid vector polygons | Pixel masks remain intact and are excluded only from vector IoU workspace sizing | [Corroboration](../web/engine-source/src/clone-corroboration.js), [native mask regressions](../web/engine-source/tests/automatic-mask-export.test.mjs) |

No scientific model weights or WASM binaries changed. The Composite vendor baseline remains `ab675126b4c5384508f8dee43f54ac334720a7be`; its current client uses the unified M2 execution layer.

## Qualified source evidence

The source handoff records 138 distinct engine tests across separate batches and 256 interface tests, with no failure or skip. Overlapping subsets were not added again. Native references cover 3,380 wavelet outputs, 295 strip variants, 640 gradients, 290 channels, 53 contrast maps and 159 contrast views.

Its real Chrome 155 journeys exercised calculation, parameters, display and exports, including TruFor followed by CAT-Net while retaining the first result, forced WebGPU CFA at 1600 × 1100, ELA, magnifier, Composite, PRNU, resampling, SSIM and additional tools. Firefox 155 and desktop WebKit 26.6 exercised real CPU workers: seven surfaces on a controlled 64 × 48 input matched the native reference exactly. This is a stated coverage set, not a claim about every tool/input/device combination.

The final automatic 320 × 256 journey completed all five groups and downloaded an NPZ with 196 validated members and 194 resolved array references. A separate suspend/resume journey retained the four acquired groups at one attempt each; only D2PRL resumed. Its 194 scientific arrays matched the uninterrupted run bit for bit, including shape and dtype. Metadata/provenance differed as expected. The archives, session logs, user images and screenshots used for qualification remain outside this public evidence.

The consolidated source deltas are available as [engine patch](evidence/execution-20261012/engine-execution-corrections.patch) and [interface patch](evidence/execution-20261012/ui-execution-corrections.patch). They describe the qualified source ranges; they do not replace the merged public tree or its batch additions.

## Integration checks

After merging, I reran all 256 interface tests, 123 targeted engine tests and 11 batch contract tests successfully. The packaging tests and four real Chrome startup-recovery scenarios also passed. Those reruns are recorded separately from the earlier source qualifications.

The isolated browser recipe exercised the merged batch interface: ZIP/PDF input, two unique images, clone/ELA calculations, ZIP and PDF exports, archive reimport, result reuse, mobile layout and handoff to the ordinary workspace. The final journal contains 1,732 events, no raw errors, no documented failures and no storage error. Six WASM requests reported `net::ERR_ABORTED`; the check retains those events separately. Completed calculations and exports establish the workflow outcome, not the cause of each abandoned network request.

The dependency recipe exercised real worker bytes, exact synthetic pixels, a lossless WebP export, a model range crossing two chunks, offline reuse of an ordinary saved library file, and a standard TAR verified independently. It uses two local origins; the actual published origin has its own verification receipt.

All 5,246 runtime file hashes and 4,247 referenced chunks were verified after reconstruction, including the seven multi-chunk files. The 191 WASM file hashes and 2,894 scientific binary/model file hashes match the preceding manifest. All 90 WASM modules below 300 KiB remain local.

The batch PDF/ZIP vendor bytes and paths are unchanged. Eight files now form a locked `batch-vendor` slot, loaded on demand through the integrity-checked dependency transport. Source reconstruction and the resource manifest include this addition; the original qualified handoff package had 5,238 runtime files and 4,239 chunks before batch integration.

## Limits

[SAFIRE issue #1](https://github.com/Kinkazma/sherloq-web/issues/1) remains open. These shared corrections do not resolve its distinct 2 GiB admission policy. There is no new complete 96 MP qualification, physical iPhone qualification, universal speed benchmark, or fresh run of every AI model. Local worker/strip recovery also does not guarantee recovery after loss of the browser process and unpersisted RAM.

## Published origin

The resources are pinned to `34d648a10c5e516107a9d0a7f1cf4b2f51870e81`. The manifest and all 935 new chunks (9,251,807 bytes) were downloaded from that exact GitHub raw origin and matched their SHA-256 identities. A second batch browser journey used that origin: 1,739 journal events, no raw error or documented failure, ZIP/PDF export, archive reimport and workspace handoff completed. Six abandoned WASM transport requests remain recorded separately. [Published-origin receipt](evidence/execution-published-origin-20261012.json).
