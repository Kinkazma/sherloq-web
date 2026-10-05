# Qualification 0.27 — panel geometry

The portable API has 37 callable operations. `subimages.detect` adds native
rectangular panel geometry; complete analysis, ELA energy/biomes and D2PRL browser
inference remain unavailable. The complete 50-panel mission is unfinished.

| Check | Result |
| --- | --- |
| Full Node regression | 157/157 pass, no failures/skips, concurrency2, 313948.149334 ms |
| Final version check | Only the version string changed after full regression; 8 targeted detector/scope tests pass again on0.27.0 |
| Actual browser workers | 144 original-byte cases exact per Chrome154/Firefox155/WebKit26.6 on final runtime hashes |
| Original codecs | PNG, two progressive JPEG qualities/orientations2–8, RGB/gray16 TIFF and alpha TIFF; decoded RGB hashes exact |
| Geometry | Native inclusive vertices and half-open scope rectangles exact; empty stays empty |
| Lifecycle | Owned cache and JSON, useful cancellation, original reload, shared-budget refusal and retry, unload cleanup |
| Runtime smoke | All37 declared operations executed in Chrome; toy-model smoke is not model accuracy evidence |
| Isolated measurements | Cold auto chain medians100.7/206.8/397.4ms for the declared three inputs; no parallel speedup claimed |
| Peak memory | Maximum63,650,717 accounted bytes on the corpus; not process RSS |
| Immutable archive execution | Reported separately by release metadata and post-extraction proof |

Only generated public inputs are used. The browser fixture/native/runtime hashes
are retained in `auto-zones-*-proof.json`; measurements are separate from functional
test durations. CPU only, one computation worker, full-memory layout. WordPress,
physical Safari/mobile and non-Apple hardware remain unqualified. No runtime
calibration, synthetic preflight or persistent performance profile is introduced.

The weights inventory was refreshed after independently checking the received
D2PRL final checkpoint and native handoff archive. There are193 local component
files and two historical groups still missing. This does not qualify browser
inference or clear redistribution. A separate21-case synthetic study demonstrates
that tiny native postprocessing errors around zero can change final role masks;
no threshold or native algorithm was changed. See `D2PRL-WEB-STUDY.md`.

The frozen0.26 AKAZE/ORB archives remain unchanged. Other unqualified variants,
ONNX decision-parity rejections, incomplete model pipelines and large-image
adapters retain their explicit limitations in the engine register.
