# Qualification 0.26 — explicit AKAZE

The portable API has 36 callable operations. The 50-panel port is still
unfinished: a callable variant does not complete its entire native panel.
WordPress integration is a separate deliverable and is not claimed here.

## Current evidence

| Check | Result |
| --- | --- |
| Node regression | 153/153 pass, no failures/skips, concurrency 2, 328819.985083 ms |
| AKAZE float32 primitives | 429 exact comparisons |
| AKAZE detector | 128 cases; 78,626 keypoints including masks; all seven fields and descriptor bytes exact |
| Descriptor boundaries | 22 native cases for 32/61-byte Hamming, ties, last byte and 64-query batches |
| AKAZE actual worker API | 223 complete outputs per Chrome154/Firefox155/WebKit26.6, all compared fields and RGB exact |
| Existing ORB regression | 162 small product cases plus grouping-pool lifecycle per browser |
| Native and Chrome dense default | Same 256 MiB match-result refusal; 20,934 detected/11,864 selected native points; browser cleanup verified |
| Runtime rebuild | JS and WASM byte-identical after rebuild with Emscripten4.0.15 |
| Complete-pipeline benchmark | Isolated Chrome, 3 alternating useful runs; auto medians 6860.4 ms (512×384) and 31555.9 ms (1 MP); one worker useful in both modes, no speedup claimed |
| Immutable archives and extracted runtime | Separate release record and post-extraction proof; extraction must not be inferred from the source tests. 0.25 archives remain unchanged |

Browser runs use a development M1 Max host. Playwright WebKit is not a physical
Safari or mobile-device qualification. Native source, payload and runtime hashes
are retained in the corresponding proofs. The final regression duration is a
functional observation with other validations running, not a performance claim.

## Scientific and resource boundaries

AKAZE is explicitly selected as `tampering.copyMove.akaze`. The historical BRISK
default remains unavailable, without substitution. Parameters, original-byte
decoding, binary1 masks, all 61 descriptor bytes, the historical Matching radius,
ordered matches, overlapping groups and seeded direction count are retained.
Cache keys separate ORB and AKAZE. Style/minimum changes reuse the proper stages.

CPU only, full-memory only. The main computation worker handles detection;
independent grouping rows can use the existing budgeted worker pool. AKAZE's
admission reserves 256 bytes per image pixel plus 160 MiB of WASM allowance,
with a 1 GiB heap ceiling and additional JavaScript budget. No hidden reduction
of resolution, precision, quality or thresholds is used. No runtime preflight,
warm-up, synthetic image or persistent performance profile is introduced.

Peak accounted memory for the regular large corpus is 564,089,521 bytes under
1 GiB. The dense default refusal peaks at 809,280,344 accounted bytes and releases
all active reservations. These values are not browser process RSS.

The broad parameter sweep of the dense 1 MP checker was stopped in native
quadratic grouping. Its successful full pipeline and other dense configurations
remain unqualified. The default refusal was then verified independently; it must
not be generalized into a pass for the whole dense sweep.

## Rejected optimization and remaining work

An exact float32 FMA guard passed 48 detector cases and 2,021,297 arithmetic
probes, but its isolated Chrome medians were about 1.5–2% slower than the unchanged
runtime. It is not linked into the product. See `akaze-fma-chrome-benchmark.json`.

BRISK still has angle/bin parity and redistribution constraints documented in
`BRISK-STUDY.md`. CFA ONNX and resampling EM retain their previous rejection
records. The three missing model groups remain blocked; no training or remote
service was added. Automatic sub-images, complete analysis, ELA energy/biomes,
Copy-Move2 variants and the remaining model/large-image adapters are still open.
