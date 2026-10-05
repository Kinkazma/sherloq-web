# Deferred result storage — 0.18

A segmented JPEG source can fit in RAM while its later owned results no longer
fit. Channel ranks, bit planes and local extrema now open the source's temporary
session at the first result allocation that actually needs it. They reuse that
session for subsequent outputs. There is no speculative session, preflight test,
new decoding, resampling, or eviction of another live result.

The public result/window/mask APIs are unchanged. `metrics.storage` identifies
the RGB result's memory or temporary storage; `maskStorage` reports its masks.
`metrics.temporaryBackend` and `temporaryFallback` describe the actual late
session. The original load metrics describe the load, not future results.
Results stay valid until explicitly released or until their source is unloaded.

The worker wrapper pre-registers the source's private session ID even when the
source initially stays in RAM. This matters during cancellation: a session created
later must close cooperatively before worker termination. Unload, disposal and
partial-result failures retain the existing source ownership rules. An empty
session may remain owned until source unload; it is never another source's cache.

Scratch and potential IndexedDB staging are reserved before choosing retained
RAM. Once the actual backend is known, its staging allowance is used. Channel
ranking now bounds both input and output staging together, including unusual
non-pixel-aligned storage chunks. All three adapters translate allocation
RangeErrors to `MEMORY_ALLOCATION` after releasing unpublished results; actual
storage quota/I/O errors keep their own codes. No resource failure changes the
analysis parameters or silently launches a remote service.

## Validation

- Unit tests exercise factory deferral, missing storage, cancellation before
  allocation and explicit allocation failure/cleanup for all three adapters.
  Original arrays and accounting remain usable after failure.
- The browser recipe loads the public1MP JPEG into segmented RAM under48 MiB,
  then keeps successive results alive until storage is required. It verifies that
  no session exists beforehand, exactly one appears at the transition, and both
  the first and latest result windows/masks match the existing qualified full
  CPU implementation. It repeats transition/unload, transition/cancel and
  transition/dispose for each of the three operations.
- Public evidence lives in `lazy-result-storage-*-proof.json`; run
  `scripts/browser-test.mjs --lazy-result-storage --browser=chrome` (or firefox/
  webkit). These are lifecycle tests and functional times, not isolated speed
  measurements or process RSS. Scientific parity retains the native per-family
  fixtures and96MP tests documented in the preceding adapter qualifications.

The scope remains segmented JPEG sources and their qualified result adapters.
No new algorithm/format, general array spilling, multi-engine budget broker or
crash-recovery guarantee is implied. Physical quota exhaustion and abrupt process
loss remain separate from injected errors and cooperative cancellation. Browser
storage can itself be memory-backed in private sessions; no physical-disk claim.

Completed transition proof: Chrome154.0.8037.58 and Firefox155.0 use OPFS;
WebKit26.6 uses IndexedDB after explicit OPFS setup failure. Storage is first
needed at the7th rank,5th bit-plane and4th extrema result. The previously returned
results remain readable. Accounted transition peaks47,185,920 /44,684,874 /
48,450,624 bytes respectively stay within48 MiB. No storage artifact remains
after each unload, cancellation or disposal sequence in any of the three runs.
