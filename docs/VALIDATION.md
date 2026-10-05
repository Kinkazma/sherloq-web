# Validation scope and optimization priorities

## Resource integrity

For the initial delivery, publication preparation independently checked SHA-256 and size for every one of the 4,224 pieces and streamed reconstruction hashes for all 5,237 original resources. All passed. The five replacement runtime resources in the Copy-Move correction were subsequently checked against their supplied hashes. The current manifest uses 4,225 unique pieces for the same 5,237 reconstructed files; historical pieces remain available at their immutable commit. Every file in the supplied public tree is at most 100,000,000 bytes.

## Independent interface checks

After reconstructing the locked resources in a separate local copy, all 142 Node tests passed. The public source alone intentionally omits the large runtime files until reconstruction; running the tests before restoration is incomplete. [Result](evidence/publication-node-tests.json).

## Supplied browser evidence

The following records were supplied with the interface delivery, rather than rerun as part of the documentation work:

- [Chrome 154](evidence/browser-chrome-proof.json)
- [Firefox 155](evidence/browser-firefox-proof.json)
- [WebKit 26.6](evidence/browser-webkit-proof.json)

Each record uses two distinct local origins, a fresh automated browser context and synthetic 67 × 65 pixels. It checks a real engine/export path, an exact range of a model spanning two 100 MB pieces, a local library without the remote server, and an ordinary TAR independently checked with Python. The startup measurement is 2,363,985 bytes and zero remote requests in each record.

These checks do not establish accuracy across all algorithms, compatibility with every WordPress deployment, arbitrary image sizes, physical mobile devices, or actual public-origin delivery. Public-origin headers, bytes and browser behavior require their own check. Scientific qualification in the engine documents remains limited to its declared inputs, configurations and comparisons.

## Where I would optimize first

1. Measure cold and cached execution separately on the same images and settings, retaining outputs and hardware/browser details.
2. Profile model initialization, CPU/GPU transfer and repeated allocations before changing arithmetic or model graphs.
3. Check memory retained after closing documents, cache eviction, worker recovery and cancellation of long computations.
4. Measure large exports and local-library reconstruction with slow disks and constrained browser storage.
5. Compare scientific arrays and masks after each optimization; faster display alone does not establish faster inference or better accuracy.

Two concurrent downloads and 128 MiB of admitted payload bound transport scheduling. They do not bound total browser memory. Cached resources may be evicted; an independently saved ordinary-file library avoids relying exclusively on browser cache persistence.

## Corrected interface failure

On 2026-10-05, the frozen 0.14.0 interface and 0.35.0-export.1 engine were exercised in the actual local web workspace on `examples/spiral/edited.png` (1254 × 1254). ELA, PCA Projection and Luminance Gradient completed; their successful execution was recorded during publication checks.

Copy-Move Forgery 2 with the default PatchMatch Zernike profile reached `dense-geometry` and then failed with `INVALID_INPUT: Invalid sparse render input.` The captured [diagnostic](evidence/spiral-copy-move-failure.json) records settings, progress and the stack through `copy-geometry.js`, `sparse-copy-view.js`, `m3-sparse-surface.js` and `dense-adapter.js`. That failure belongs to engine 0.35.0-export.1. It was corrected in 0.35.0-export.2: dense point coordinates remain Float32 in the cache and are widened directly into the native renderer’s double-precision heap. The original diagnostic remains as a development record. [Correction](../web/engine-source/docs/dense-render-correction.md) and [successful worker reproduction](../web/engine-source/docs/dense-render-browser-proof.json) were supplied with the fix; 23 focused engine tests and the interface test checks accompany it.

## Public GitHub delivery

The first complete resource commit was checked over anonymous HTTPS: the manifest, a 100,000,000-byte piece and a smaller piece returned exact bytes and SHA-256 values, with CORS allowing browser access. [HTTP evidence](evidence/public-origin-http.json). The complete library was verified locally before publication; this was not a second download of all 6.6 GB.

An isolated lean bootstrap configured with that immutable GitHub origin completed ELA on the 1254 × 1254 edited spiral in the actual web workspace, with no console errors. It contained no local WASM files. [UI evidence](evidence/public-origin-ui.json). This is distinct from deployment on a particular WordPress site.

## WordPress startup correction

The supplied 0.14.3 record reports 148 passing Node tests and a real PHP-frame check against the public GitHub resources, including a forced 32-second manifest delay, automatic recovery from a temporary 503 response, and preservation of an already mounted window during a worker update. These are the delivery author’s checks, distinct from the initial 142-test publication run. [Evidence](evidence/wordpress-0.14.3-proof.json).

The changed lifecycle and workspace test files were also rerun independently in the publication checkout: **15/15 passed**. [Targeted publication result](evidence/publication-startup-targeted-tests.json).

## Example images

Examples illustrate how tools can be read, not a promise of identical output across every release. The batch process uses the shipped web engine, its model assets and its presentation routines directly. Computation preserves each input's dimensions. Preview scaling belongs to the gallery, not to detector preprocessing. Input, method, settings, engine version and output hashes identify each generated example. Browser screenshots and upstream desktop screenshots are labeled separately.

The completed gallery contains 24 recorded examples and 38 rendered outputs. The previously timed-out D2PRL and complete-analysis runs now finish; all five automatic branches report done, with no recorded errors. The microscopy Forgeryscope run detects 16 panels, evaluates 23 pairs and accepts 5 geometric correspondences. Input/output hashes, decoded dimensions and local gallery links were checked. [Gallery checks](evidence/example-gallery-checks.json). These are illustrative runs, not a performance benchmark or a general accuracy study.


## 0.14.5 dependency recovery and diagnostics

164 Node checks pass, including HTTP/body/integrity failures, byte-range resume,
compressed-response restart, aborting a pending retry, complete session retention,
redaction and idempotent delivery adaptation. In the actual local WordPress,
Chrome 154 and desktop WebKit 26.6 reject a wrong native module, wait for an
explicit retry and then compute successfully with the loaded image retained.
A deliberately unavailable remote JavaScript module also resumes its original
import. The session records the 503 and the later 200 response. No unhandled
JavaScript error was recorded. [Recovery evidence](evidence/0145-recovery-proof.json).

Gutenberg and the real page preview load, with clean JavaScript consoles; the
preview retains cross-origin isolation and shared memory. Apache policy headers
are no longer duplicated when PHP serves the application document.
[WordPress evidence](evidence/0145-wordpress-proof.json).

All 90 WebAssembly files below 300 KiB are now packaged locally, while remaining
lazy-loaded. All 191 WASM hashes are unchanged. Only JavaScript transport and
session instrumentation are adapted. [Packaging evidence](evidence/0145-packaging-proof.json).
These checks do not establish the original iPhone network cause or compatibility
on a physical iPhone; desktop WebKit uses a local mirror for controlled failures.

The finalized delivery also passed a fresh Chrome run against the actual pinned
GitHub origin: eight remote requests succeeded, the synthetic lossless WebP
export and dense Float32 rendering completed, and window/worker isolation stayed
active. Startup required zero remote resource requests. A 32-second delayed
manifest and transient configuration error recovered without document reload;
an existing analysis window blocked the worker update until it closed.
[Published-origin check](evidence/0145-published-browser-proof.json),
[HTTP identities](evidence/0145-github-http-proof.json).
