# Changelog

Implementation changes and their verification are recorded here. The [README](README.md) presents the available workflows and examples; [source identities](docs/SOURCE-IDENTITY.json) and [validation records](docs/VALIDATION.md) hold the detailed evidence.

## 0.20.0 — ELA views, native previews and RGB/HSV navigation · 2026-10-14

- Present ELA as Classic, Energy and Biome views, retaining explicit saved choices and migrating the former Energy-biome mode. Add the unified red/blue energy view while preserving separate signed views and independent map/overlay presentation.
- Keep the last view visible during recalculation. Coalesce continuous Classic and Biome parameter previews, reject obsolete source/gesture responses and restore the exact native result and exports on release. Shared JPEG preparation and cached residuals avoid redundant compatible recompression; draft previews cannot become scientific exports.
- Add Classic Auto using current JPEG quantization tables first, then a bounded independent native-grid DCT estimate where supported. Ambiguous traces retain the chosen quality. Residual-based gain calibration is a documented visibility rule, not a forgery probability or unique compression history. [ELA views and limits](docs/ELA-VIEWS.md).
- Show native residual and signed-score histograms for Biome with separate percentile/score units, valid original reference bounds, zero-score counts, logarithmic bar heights and provisional versus exact threshold markers.
- Allow a new workspace to start alongside existing tabs and workers while pinning each owner to its immutable resource inventory. Preserve migration and resource-deletion safeguards. Compose the new five-module ELA delivery with the unchanged scientific receipt and retained predecessor locks.
- Align the initial 3D RGB/HSV view with 2D. Honor the common mouse/trackpad preference, pointer-anchored zoom after panning, visible-center buttons, fractional CSS dimensions and camera preservation across rendering fallback. Points and scientific CSV/JSON data remain unchanged. [RGB/HSV navigation](docs/RGB-HSV-PLOTS.md).

## 0.19.1 — Downloads and batch result display · 2026-10-14

- Restore normal browser download dispatch for every explicit export, including browsers offering native Save as. Retain the prepared file and native Save as fallback without claiming a completed standard download.
- Store independent Biomes and Corroboration opacities, starting at 100% and 35%, and preserve both choices through archive import/export with explicit legacy migration.
- Enlarge and restore the batch window within the viewport; inspect native result PNGs inside the batch using shared mouse/trackpad navigation, Space panning and double-click fit. End interrupted gestures, preserve an open inspection across unchanged result refreshes, and release it when the source, scientific scope or results change, without another detector run.
- Keep batch result thumbnails static during page scrolling and arrange results in two responsive columns. Reserve image zoom/panning for the large inspection opened by click or keyboard; retain bounded lazy previews, selected views, opacity and unchanged scientific artifacts.

## 0.19.0 — Interactive regions, scientific scope and exports · 2026-10-14

- Align the public WordPress wrapper header, preview URL and editor-script version with 0.19.0.
- Add mouse editing of acquisition and exclusion zones, shared individual Zones / Biomes controls, immutable geometry restoration and native paired-biome presentation. Exclusions take priority inside acquisitions.
- Admit neural matching candidates before correlation using explicit scientific scope receipts; retain original CNN context and unchanged model identities. Preserve published D2PRL/SSG optimizations and optional-feature policies.
- Add native Save as with a compact common tools-dock shelf, durable prepared files, verified destination closure and coordinated update activity. Retain internal preference backups before activation or archive navigation.
- Preserve runtime increment identities in scientific resume, archived disabled-feature states and exact native evidence. Restart a cancelled result preview when it returns into view after an export.
- Preserve the earlier local updater, resource choices, settings recovery and compatibility inventories.

## 0.18.0 — Local updates, feature choices and recovery · 2026-10-13

- Add verified local release preparation, resumption, atomic activation, repair and rollback, retaining the active application until every window is idle. Batch imports, native display rendering, exports and local model operations also participate in the activity guard.
- Add the optional local “Auto update” startup check, translated in English and French. A styled prompt offers update preparation, postponement, suppression for that version or disabling future checks. Disabling asks for a second confirmation; Settings can enable checks again. Installation continues through the verified update controls.
- Add a functional resource catalogue and selective archive export. Stable exclusions survive updates; shared dependencies, recovery versions and imported optional models remain protected. Existing TAR resources are read in place and only changed resources are received.
- Preserve per-tool settings, profiles, favorites and recoverable original values through backup and restoration, including the current batch export/view preferences and independent neural subimage settings.
- Integrate these controls with the published D2PRL and batch improvements. Record the selection overlay separately from the retained scientific source identities; model weights, numerical settings and compatibility inventories remain unchanged.
- Keep WordPress and web installation packages private. Public reconstruction uses reviewed source code, authorized resources and build scripts.

## 0.17.3 — Batch results, archive export and individual tools · 2026-10-13

- Add Biomes / Corroboration display choices and opacity controls using archived scientific data. Sparse and dense paired groups retain their native geometry and colors; partial and legacy results keep the views supported by their recorded data.
- Add PNG, WebP, TIFF, AVIF and HEIC options for ZIP images. Default validated PNG sources retain their encoded identity for archive resume; explicit conversions preserve original analyses in history. Geometry references remain valid after flattening archive paths.
- Use 7-pixel matching separation, 15-pixel displayed length and four witnesses per side for new sparse/dense batch clone recipes, with explicit and restored settings taking priority. Individual, SSG and neural defaults remain unchanged.
- Add independent automatic subimage selection for D2PRL, MGCFDN and SelfDM. Neural settings prepare the task; Calculate starts it. Shared clients read the engine's actual configured variant and serialize model configuration with inference.
- Increase the local launcher's HTTP request backlog to support concurrent browser module loading.
- Restore the retained result after tracing, clear stale displays on failure and name JSON/NPZ/image exports after the actual operation and profile. Add streamed, SHA-verified local import of the listed optional model files, with removal limited to chunks introduced by the dialogue.

Integration passes 437 interface checks and 12 archive/export checks on the retained 0.17.2 engine delivery. Fresh Chrome verifies the packaged export and model-library controls, source pixels/lossless export, native configuration capability and shared-engine ownership. The supplied paired-biome and real individual-path qualification is retained; its native grouping recipe was not repeated. Engine sources, models, worker scheduling, resource locks and seven compatibility manifests are preserved.

## 0.17.2 — Clone matching and worker transport · 2026-10-13

- Reuse dense descriptor banks when a batch repeats the same bank, and respect an explicitly selected CPU backend for paged PatchMatch.
- Optimize SSG scalar image preparation, identity resizing and ordered accumulation while retaining its existing geometry and results.
- Use the audited ordered float32 distance helper for XFeat banks above 100 actual points. Smaller banks retain the previous matcher; cached results clear obsolete native-distance observations.
- Handle worker deserialization errors through actual event listeners and reject malformed envelopes, with cancellation and resource ownership preserved.
- Update D2PRL's exact half-round decode table and the matching WASM loader identity. Model weights, preparation 448, 40 iterations and seed 22 remain unchanged.

The supplied D2PRL comparisons retain exact outputs, masks, views, exports and refilters. Median paired analysis gains were about 9.3% on the supplied 30 MP and 96 MP cases, relative to the already optimized runtime, with two balanced timing pairs per size. These measurements describe those inputs and test host.

Integration passes 368 interface checks, 150 targeted engine checks and 19 retained scheduling/resource checks. Fresh Chrome verifies pixels and lossless export, PP-OCR text detection, D2PRL and SSG native loading, and exact ordered XFeat distance calls with the descriptor bank released. Existing batch preparation and atomic SIFT scheduling are preserved. Experimental dense GPU transport reuse remains disabled by default.

## 0.17.1 — D2PRL execution and memory · 2026-10-13

- Integrated the qualified HWC PatchMatch evaluator with exact half decoding and SIMD interpolation, windowed descriptor transfer, reusable buffers and the bounded D2PRL role runtime. Existing evaluator variants remain selectable; the general 512 MiB runtime and other methods are preserved.
- Added immutable parameter publications, reusable finiteness validation, SHA-verified parameter caching and bounded OPFS/IndexedDB spill/recovery. The model retains preparation 448, 40 iterations, seed 22, ordered reductions and explicit FMA.
- Retained the improved batch workflow, atomic SIFT scheduling, startup manifests, noindex correction and local/offline features. The resource stager validates its runtime catalogue and handles a stale primary WASM hiding the qualified fallback.

The supplied real 30 MP and 96 MP qualifications passed native-array/mask checks, refiltering without inference and large paged export/reimport. The 30 MP timing is a single functional comparison; full bit parity with Torch and a universal speed gain are not claimed. Detailed image/array qualification reports stay local.

Independent integration checks pass 368 interface tests, 256 D2PRL/projection checks and 78 shared-resource checks. The scientific qualification above comes from the completed supplied runs.

## 0.17.0 — Scientific batch preparation and exports · 2026-10-12

- Verified the immutable dependency origin through anonymous HTTPS and fresh Chrome checks of the text detector and runtime resources. [Delivery evidence](docs/evidence/batch-publication-0.17.0.json).
- Added acquisition preclassification and PP-OCRv6 detector-only text polygons for native-coordinate exclusions. Ambiguous OCR proposals can be reviewed without losing their source/model provenance; original pixels remain unchanged.
- Corrected native neural window bounds for D2PRL and MGCFDN while keeping exact scientific polygons for filtering. Small annotations already outside acquisitions are shown explicitly.
- Added biomes-only single-method views, multi-method corroboration, source-linked flat archives, restored history and partial-run PDF/journal exports. Journal reads use ordered bounded windows and report incomplete exports.
- Qualified shared SSG callers and reject a different algorithm injected into the automatic SIFT provider before computation. The local preview serves pinned SSG logical URLs from existing pieces. This local 404 correction is not claimed as a production WordPress failure.
- Preserved the 0.16.0 method integrations, normal SIFT worker capacity, immutable models/WASM, startup migration, local/offline workflows and the noindex correction.

The user accepted this version as functional. The interrupted four-method run is not counted as sixteen completed analyses; scientific accuracy on all 86 images and full MATLAB parity remain unestablished. See [batch preparation evidence](docs/evidence/batch-scientific-preparation-local.json) and the separate SSG records.

## 0.16.0 — Browser methods and batch integration · 2026-10-12

- Removed the hardcoded `noindex,nofollow` robots directive from the WordPress workspace template.
- Integrated CMSeg-Net, MGCFDN, SelfDM, ALIKED + LightGlue, EfficientLoFTR and complete SSG into individual and batch workflows. Profiles remain part of their method families.
- EfficientLoFTR requires two actual image rectangles. SSG publishes a mask in the original image dimensions, retaining holes and components; its localization controls reuse a completed checkpoint where supported.
- Corrected VIG mapped GPU output lifetime and bounded CMSeg correlation-tile transfer. Scientific parameters and the declared numerical scope remain documented with the implementations.
- Batch clone tasks and between-study comparisons now explicitly request biomes alone, without circles, lines or points. This is a display correction; automatic exclusion of text, charts and diagrams in mixed figures is still not accepted.
- Preserved the atomic SIFT phase handoff, browser-private output files, streaming ZIP32/ZIP64, native SIFT NPZ data, startup migration and offline layout.
- Added verified local resource imports for optional SelfDM/SuperPoint/SuperGlue graphs. Missing files produce an explicit local-resource requirement rather than a failing remote download; bulk public downloads skip these optional files.
- Preserved exact hashes for factories that receive already verified WASM binaries. Corrected offline preparation to reuse models in a connected local folder. Repeated private builds start from clean reviewed inputs.
- The frozen interface passes 317 tests; the combined batch contracts pass 15 tests. The earlier real interface/batch method runs produced 14 scientific NPZ files with 249 independent checks. These are functional and export checks, not acceptance of the scientific filtering workflow.
- The generated delivery passes Chrome 154 and WebKit 26.6 checks on two local origins: exact synthetic pixels, lossless WebP, ranges across two chunks, verified local-model import, SSG factory ABI and independently read TAR/offline resources. These records do not establish a new 96 MP, physical-mobile or universal numerical-parity qualification.

- A fresh Chrome run against the actual pinned GitHub origin verifies native pixels, lossless WebP export, SSG factory/WASM identities and ABI, with zero remote requests at startup. Anonymous HTTPS checks verify the manifest and new model/factory resources against their hashes, sizes and CORS policy. [Browser checks](docs/evidence/methods-public-origin-browser.json) · [HTTP checks](docs/evidence/methods-public-origin-http.json).

[Method/resource notices](docs/METHODS-RESOURCE-LICENSES.txt) · [Declared method scope](web/engine-source/docs/local-methods-integration.txt)

## Batch 0.2.0 — Memory correction and output storage · 2026-10-12

I corrected a SIFT scheduling error during CPU/GPU phase changes. The scheduler now queues the continuation and releases its previous lease atomically, keeping the normal worker capacity and existing memory budgets. Outputs are stored in browser-private files and read on demand; ZIP32/ZIP64 export and import use bounded windows instead of retaining the whole output archive in memory.

The complete human-selected batch of **86 images from seven PDFs** finished **172 analyses with zero errors**, using SIFT + G2NN + RANSAC + Panels + Text and Forgeryscope Auto. Its 1.17 GB of output artifacts exported and reimported successfully; all 172 NPZ files passed independent checks. Three reference images produced exactly the same scientific arrays at nine to ten workers as at three workers. This is a functional/export qualification, not a speed benchmark or a verdict on the supplied publications. [Batch workflow and qualification](docs/TRAITEMENT-PAR-LOT.md).

**The scientific filtering requirements have not been accepted.** Text, charts and diagrams inside mixed figures are not reliably excluded and can generate false positives. The default display also includes circles and lines alongside biomes, whereas the requested default is biomes alone. Successful execution and intact exports do not validate these requirements.

The limitations above describe that recorded batch stage. The biome display defaults are corrected in 0.16.0; the scientific filtering requirement remains unaccepted.

## 0.15.2 — Startup migration and offline presentation · 2026-10-12

### Startup after a WordPress plugin update — 0.15.2

Replacing the plugin directory could remove the immutable manifest still requested by an installed older service worker, blocking navigation before the replacement workspace could open. The update retains deployed manifests, keeps startup documents/configuration/modules reachable, and stores SHA-verified manifest copies that survive a worker restart. A temporary manifest failure remains retryable.

A persistent Chrome profile reproduced the original navigation failure, migrated to 0.15.2, and reopened successfully after every server manifest was forced to return 404. Shared-memory isolation remained active. [Migration checks and source identity](docs/evidence/startup-migration-0.15.2.json).

### Offline setup presentation

The blue **Take offline / Emporter hors ligne** button sits immediately before Settings. The preparation page shares SHERLOQ’s typography and themes, supports French and English, and presents its three steps once in the main content. The Home Screen landing resolves all shared styles and font modules correctly. [Presentation and path checks](docs/evidence/offline-layout-0.15.2.json).

## Execution and export increment — Interface 0.15.1 / engine 0.35.0-export.3

I integrated corrections to shared ONNX Runtime residency and memory admission, worker startup and error reporting, and reusable transform workers. Local strip recovery retains completed work. The interface uses the views actually published by M2, preserves useful magnifier previews after a failure, accepts valid decimal gamma settings, and keeps calculation progress tied to the active calculation.

Automatic diagnostics now distinguish partial results, suspension, resumption and intentional cancellation. NPZ export preserves D2PRL masks whose native contours contain only one or two points. Model weights and WASM binaries are unchanged. The existing batch workflow is retained; its PDF/ZIP dependencies load on demand through the same hashed resource library.

[Causes, source revisions, qualification and integration checks](docs/EXECUTION-CORRECTIONS.md). The separate [SAFIRE admission issue](https://github.com/Kinkazma/sherloq-web/issues/1) remains open. This delivery does not claim a new 96 MP qualification or a universal speed benchmark.

## Earlier tool integrations and restorations

I focus the new examples on the work added to the [original SHERLOQ baseline](https://github.com/GuidoBartoli/sherloq/tree/3fe95fcb56037e47e2eefbc2d3785804a31a74f5): Copy-Move Forgery 2 and its dense/geometric matching, Noisesniffer, ZERO JPEG Grids, Adaptive CFA, AI clone methods including D2PRL and Forgeryscope Auto, combined automatic workflows, and CAT-Net, SAFIRE, FOCAL and AdaIFL. These integrate existing research methods; their original authors retain credit.

Illuminant Map and Dead/Hot Pixels used existing menu labels but lacked working implementations in that baseline. Multiple Compression was also restored and expanded. The energy/territory views extend ELA, which was already present. TruFor was already an upstream integration and is not presented as a newly invented detector.

## Dense copy-move display correction

The web renderer now accepts the compact point arrays produced by PatchMatch. This fixes the error after `dense-geometry` without changing detector settings or the scientific arrays. The reported spiral example completes and its cached result can be redrawn. [Correction and regression evidence](web/engine-source/docs/dense-render-correction.md).

## 0.14.3 — Startup and update scheduling

The workspace shows progress from the first page load and continues when a slow resource installation finishes, without requiring a manual reload. Temporary startup errors are retried. A new service worker only takes over early when every open window confirms it is waiting for that exact version and has no mounted workspace, preserving an already open session. [Verification, including a deliberately delayed 32-second manifest response](docs/evidence/wordpress-0.14.3-proof.json).

## 0.14.2 — WordPress isolation headers and language

The PHP workspace entry explicitly supplies the isolation headers required by the page and its workers, including on hosts that do not apply `.htaccess` rules to static assets. Service-worker updates carry a version identity. The default language follows the visitor's French or English browser preference; an explicit language choice is retained. [Reproduction and verification](docs/evidence/wordpress-0.14.2-proof.json).

## Initial dependency-distribution checks

The supplied Chrome 154, Firefox 155 and WebKit 26.6 records cover two distinct local origins: resource transport, a large model range spanning two pieces, a real engine operation and lossless export on synthetic 67 × 65 pixels, reuse of a local resource library, and independently read standard TAR archives.

Startup transferred 2,363,985 application bytes with no remote resource requests in those checks. This is a startup measurement, not an inference-speed claim. The records do not establish public-host performance or the scientific accuracy of every catalogue method. See [the exact scope](docs/VALIDATION.md).
