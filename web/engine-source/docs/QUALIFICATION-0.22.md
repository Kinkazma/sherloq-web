# Qualification 0.22 — median-filter detector

Final source regression: **136/136 tests pass**, zero failures/skips,
255,483.469417ms with test concurrency2. Targeted resident-admission tests also
pass (29/29 plus final BUSY checks). Fresh extracted runtime passes all 33 callable operations plus the real-model
median recipe (3252 views, synthetic1MP JPEG with four native views, cancellation,
cache/lifecycle and memory rejection) in Chrome154. See
`extracted-runtime-0.22-proof.json`. All129 runtime file hashes still match.

The new CPU operation `various.median` consumes an explicitly loaded local model.
No trained checkpoint ships. Strict JSON, feature arithmetic, grayscale/padding,
raw grids, display decisions, result ownership, caches, worker lifecycle and
memory admission are tested separately. Details and limits: [MEDIAN.md](MEDIAN.md).

The public fixture generators use synthetic data and unchanged native references:
36 blocks across four feature layouts, five RGB inputs, four boundary grids and
a synthetic 1024×1024 JPEG. The table/heap limits are implementation constraints,
not reductions in image quality, block size, thresholds or precision.

- 9216 model feature inputs match after float32 conversion; native variances exact;
 float64 feature tolerance relative 1e-13.
- 3252 native render cases pass in each of Chrome 154, Firefox 155 and WebKit 26.6:
 identical RGB, valid/decision grids and margins/scores on the image corpus.
- The local 128-feature checkpoint has 3724 trees and 437672 nodes. A separate 2084-row
 arithmetic probe records exact margins, four expf score differences <=3.73e-9,
 and no decision differences at 101 UI thresholds. Universal arbitrary-threshold
 or scientific detection accuracy is not inferred from these fixtures.
- One forest is retained; bounded 64×64 feature workers each have a hard 16MiB WASM
 heap. Maximum fitting useful workers start immediately. No preflight, calibration,
 persistent performance profile or hidden remote/model fallback is introduced.
- Worker abort clears both model and image. Reload/recovery, insufficient parse
 budget, owned outputs, model dependency invalidation and cleanup are verified.

Three alternating Chrome samples on the synthetic 1MP JPEG measure complete
calculation RPC at 50,377.9ms with one worker and 7,857.4ms with ten (6.41× gain).
The chain including model load, JPEG load and display measures 51,257.7/8,742.3ms.
All four large views, raw margins/scores, variances and masks match native;
separate Firefox/WebKit recipes include the JPEG and cancellation between useful
block batches. Timing is not a physical-device, GPU or native Mac claim.

Resident-heap accounting also covers the legacy imports, ELA path, PRNU methods
and owned `imagePixels`/`original` copies. A module's grown WASM capacity does not
disappear when another engine is constructed in the same JS realm. Constrained
tests now reserve that known capacity before their small working allowance;
requests that exceed the total fail explicitly. This corrects admission, without
shrinking images or discarding caller sources. Cross-engine/page coordination
and physical RSS accounting remain separate open work.

Inventory correction: 191 local component paths comprise 38 model files and 51
TensorFlow index/data/meta sets. This corrects omitted suffixes/components, not
receipt of new weights. The three historically absent groups remain blocked;
conversion and redistribution remain separate from presence.

Remaining limits: full-memory source/RGB output for median, no GPU/ONNX backend,
no arbitrary checkpoint accuracy guarantee, no physical-device or WordPress
qualification for this new operation. B owns WordPress integration. The complete
50-panel mission and other functions' memory adapters remain unfinished.

Frozen runtime:129 files,7,937,378 bytes, SHA256
`d6d778e42a83a4b524a547a2930c0566991e1bb6f0d7d44ece61bd1f0cc04603`.
Runtime/source archive identity is recorded in `releases/release-0.22.0.json`.
The runtime smoke uses the labeled toy model only for its generic API pass;
the separate detector recipe uses the existing native checkpoint by SHA256.
