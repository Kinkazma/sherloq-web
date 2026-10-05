# Local verification — 2026-09-29

Experimental UI 0.1.0, engine 0.2.0. Tested in installed Chrome 154 on macOS,
WordPress 7.1.2 / PHP 8.3.33. This qualifies the tested vertical slice, not all
native SHERLOQ algorithms or all WordPress themes and browsers.

Verified through the real local WordPress and Chrome UI:
- Plugin activation, Gutenberg block insertion, draft save, reload and preview.
- Dedicated viewport workspace; light/dark, FR/EN, home return, optional browser
  fullscreen enter/exit. Narrow 400 px responsive emulation visually inspected.
- Synthetic JPEG import and exact engine RGB8 original display; classic ELA CPU.
- Gain change switches to Manual and invalidates the previous result; layers,
  zoom, rectangle drawing and source-coordinate list.
- Session export, page reload, JSON restore, same-image SHA256 acceptance,
  preserved gain 51 and rectangle [43,34] to [122,90].
- Real JSON and PNG downloads: engine 0.2.0, CPU, quality 75 / gain 51 / contrast 20,
  PNG 384x256. Repeated result was cached; its timings are not a speed benchmark.
- Active task cancellation on a synthetic 4800x3200 JPEG, no partial result,
  successful next run reloading the original into a new worker.
- PHP lint and entry-point JavaScript syntax checks passed.

After clearing Chrome's console, rerunning ELA completed with zero messages.
Earlier console history contained three asynchronous message-channel errors of
unconfirmed origin. Gutenberg retained warnings about another block's API2
registration and global-styles iframe injection; no SHERLOQ preview failure.

Not qualified: physical mobile/pinch, Safari/Firefox/Edge, broad JPEG metadata or
color formats, GPU acceleration, every native algorithm, region-based analysis,
and general maximum-size stability. See README and engine contract for limits.


## UI 0.2.0 follow-up

Real Chrome / local WordPress: named presets created with distinct grayscale/gain
settings; save immediately offers a global download. Exported JSON contains the
legacy preset plus both new presets. Imported an empty collection, then restored
the renamed full JSON: all three profiles and active gain 51 returned. Cancel on
Close all retained the loaded image and result. Confirm reloaded only the app,
left the browser tab open, removed the image and retained preset/gain/grayscale.
Tile and Cascade displayed exact Original and calculated ELA surfaces; Tabs
restored the single view. Five targeted validation/JSON round-trip tests pass.

## UI 0.2.1 — manual ownership before numeric edits

Classic ELA's quality, gain and contrast controls now select Manual and invalidate
the result generation on primary pointerdown, ArrowUp/ArrowDown or editing
beforeinput, before the browser updates the value. This also covers a step at a
limit with no input/change event. Focus, Tab, context clicks and text-navigation
keys do not select Manual. There is no custom wheel stepping. Numeric ranges and
all analysis formulas remain unchanged. Energy/adaptive controls remain unavailable.

Verified in the local WordPress preview in Chrome: saved profile at quality 100,
gain 51, contrast 20; keyboard focus preserves the profile; ArrowUp at 100 selects
Manual while all values remain unchanged; right click preserves the profile;
primary click selects Manual; reload preserves Manual. Real JPEG ELA completes,
and the next edit intention disables the stale export. Gutenberg canvas renders,
draft save confirms, reload and preview succeed. Preview console: zero messages;
editor retains the existing Sphaera API-version and global-style warnings.

Twelve Node tests pass, including controlled late-worker and numeric-intention
cases. Those transport tests are not a browser validation of energy auto-adjustment:
no such operation is connected in the packaged engine 0.2.0. Its future four
controls require their own real-engine/browser race tests when connected.

## UI 0.3.0 — bounded presentation and full-resolution PNG

Original File/Blob inputs are retained for reload; their temporary encoded
ArrayBuffer is transferred to the worker. RGB buffers returned by the engine
are transferred and retained without converting the whole image to RGBA canvases.
Source/result views share a byte-bounded tile LRU (16/32 MiB); only visible tiles
are drawn in source coordinates. Low-zoom presentation is sampled; full pixels
remain available for analysis and PNG export. The latter streams scanline batches
through CompressionStream, supports cancellation, and enforces an encoded-byte
budget. UI reservations reduce the engine profile budget before engine creation.
These are accounting estimates, not free RAM or process RSS measurements.

24 Node tests pass. Seven real-Chrome module checks pass: 100% pixels across tile
boundaries, cache eviction/release, no transparent seams at fractional zoom, full PNG round trip, encoded export quota,
compression cancellation, and real worker source/result admission failures with
reload. A downloaded 384×256 ELA PNG matches every RGB byte of the unchanged
engine with the same 75/51/20 grayscale parameters. In WordPress, the existing
4800×3200 synthetic JPEG loads and displays; an active ELA calculation cancels,
then reloads from File and completes. PNG export also cancels while compressing,
without a partial download. Mosaic displays both source and real ELA.

Chrome reported storage quota 10 GiB, usage 0, heap ceiling 4,395,630,592 bytes;
these are device/browser observations only. This release does not use disk
fallback or OPFS, and no storage-capacity guarantee follows from that estimate.
Engine 0.2.0 still holds full RGB images and makes defensive copies internally.
The UI source/result RGB budget is separate within the reserved total; admission
fails explicitly rather than reducing resolution. Codec, typed-array and engine
limits still apply. No browser claim for native 96 MP/1 GP cases, all tools,
full SIFT profiles, GPU acceleration, or universal device compatibility.


## UI 0.3.1 — immediate ELA, no performance calibration

Embedded engine 0.2.0-b1 changes scheduling only: first >=1 MP ELA dispatches
real chunks at the highest CPU/API/memory-admitted concurrency. No preliminary
baseline, warm-up, canary, or candidate timing loop remains. Worker/allocation
failure retries only failed chunks at reduced concurrency. Useful batch slowdown
and exposed heap pressure reduce concurrency, with no image/quality changes.
Scheduling observations exist only in the live engine; no persistent performance
profile or cookie is read/written. User settings and favorites are preserved.

30 Node tests pass, including six new scheduler cases: two fresh instances,
one-pass pixel counts, shared budget/API limits, failed-chunk recovery,
worker-allocation fallback, useful slowdown/heap pressure, and cancellation/retry.
Real Chrome: two new engines with a 1025 x 1024 JPEG start with ten workers;
1,049,600 RGB pixels dispatched exactly once per run, no retries, calibration
null/0 ms. Every output pixel matches the sequential kernel with the real codec.
The development-only comparison is not included in the application.
Actual WordPress preview: same JPEG calculates and exports a report with version
0.3.1 / engine 0.2.0-b1 and no calibration. Gutenberg canvas loads, draft saves,
reload keeps the user profile, preview loads; Chrome console shows zero messages.
This is a local experimental ELA correction, not completion of all 50 tools.
No new native/96 MP/browser memory claim; upstream engine development untouched.


## UI 0.3.2 — navigation gestures and Adobe typography

38 Node tests pass: wheel/pinch intent, units, two-axis panning, explicit device
preference and old-backup migration, Safari incremental gesture scale, pointer
drag/pinch, actual framing for double-click and unchanged scientific settings.
The renderer uses the same full image/region coordinates; engine 0.2.0-b1 unchanged.

Chrome 154: 23 checks on the installed iframe pass, including real JPEG/ELA,
automated wheel/pointer dispatch for tabs/tile/cascade and both viewports,
zoom/pan matrices, state-based double-click (including displaced/undersized
images), and unchanged analysis parameters. These are synthetic browser events,
not a physical trackpad or Safari-device qualification. Automatic classification
is heuristic because wheel events do not reliably identify the input hardware;
the explicit Navigation choice is available for ambiguous devices.

Adobe kit wqp3eph successfully loads iowan-old-style-bt weights400/700 inside the
isolated app iframe. Gutenberg uses the same configured kit; canvas and draft
save checked, then preview. French/light and English/dark inspected visually.
No Adobe font binary packaged. The iframe CSP only adds Adobe stylesheet/font
origins; analysis input and output remain local.

## UI 0.3.3 — AI catalogue placement

AI Clone Detection / Détection de clones par IA appears immediately after AdaIFL
in AI Solutions / Intelligence artificielle. Both Copy-Move tools stay in
Tampering / Retouches; identifiers and unavailable state are unchanged.
38 Node tests pass and installed PHP syntax is valid. Chrome on the real local
WordPress page1599: Gutenberg canvas and preview inspected in both languages,
draft saved then reloaded; ELA favorite and Recette gris profile retained.
No broken block. Preview console: zero messages. Gutenberg console: two normal
logs (JQMIGRATE and api-fetch preload) plus existing-site warnings about the
sphaera-lab/viewer API version2 and global-styles stylesheet injection; no
JavaScript error observed. No unrelated plugin/theme change included.
Embedded engine0.2.0-b1 unchanged; no additional detector activated.


## UI 0.3.4 — full visible catalogue order

All 10 categories and 50 bilingual tool names/positions match the user's
2026-09-30 screenshot and the native visible tree after its category reparenting.
Complete Automatic Analysis is last in Inspection, not Tampering. The reference
native-tree.json is updated; favorites, IDs and unavailable state are preserved.
38 Node tests pass. Chrome: all tools expanded and inspected in French/English
in the real WordPress preview; Gutenberg canvas shows the corrected placement.
Draft saved and reloaded, ELA favorite and Recette gris profile retained, no
broken block. Gutenberg console has the same two site warnings and two normal
logs documented for0.3.3, with no JavaScript error at the check. The preview
reported three asynchronous message-channel errors already observed in earlier
recipes; their origin is not attributed or claimed fixed by this catalogue edit.
No new model or style implementation, embedded engine unchanged.


## Local candidate 0.4.0 — 30 September 2026

45 Node checks pass. Chrome154 on the real local WordPress copy:14 browser
checks pass, real JPEG decoding/ELA kernels, five exported typed-array hashes
match independent native reference bytes, numerical JSON and NPZ exports,
cache reuse, stale-response rejection, repeated adaptive analysis, camera
preservation and complete settings/session restore. Opening a file computes
ELA automatically; canvas pixels differ from the original. File drop events on
welcome and original panes are exercised through browser DataTransfer events
(not a physical Finder drag). Global novelty highlighting changes no parameters,
canvas camera or viewport geometry and works with storage deliberately denied.

Preview page1599: native file picker opening immediate.jpg automatically reaches
ELA result; console0messages/errors on this load. Gutenberg: block rendered,
brouillon saved, reloaded; no broken block. Console0errors and2pre-existing site
warnings: sphaera-lab/viewer API2 and global-styles iframe insertion.

The frozen energy runtime matches all175C0.28 manifest entries. No C live sources
modified. Classic runtime unchanged. Candidate not zipped or published: heavy
dependencies still require the external distribution qualification. Old0.3.4 ZIP
does not include these changes. Full automatic v2 and D2PRL remain pending APIs.

## Local maintenance candidate 0.4.1 — 1 October 2026

G01–G04 corrected on branch `fix/audit-g01-g04`. Locked runtime file sets and
hashes are checked before installation/manifest writes. Both ELA routes use
0.28.0; the old classic runtime remains a locked historical staged dependency,
but its 4 GiB resource resolver is no longer imported by the worker.

46 Node UI/resource tests pass. Actual Chrome 154 checks: JPEG/PNG/TIFF open →
classic ELA; energy → manual deviation edit with zoom unchanged → NPZ download.
The 3 MP actual energy export is 84,012,708 bytes and all seven NPZ members reopen
with NumPy. Separate known-value 3 MP roundtrip checks preserve types/values.
A 96 MP JPEG uses segmented temporary storage under injected low memory hints;
four exact 17×19 windows are read. No performance calibration was added.

Additional exporter checks: row-window rendering equals resident rendering byte
for byte; incremental JSON retains typed-array numbers, Unicode and NaN rules.
Build fixtures reject modified, extra and missing locked runtime files before
any installation or manifest mutation. Memory tests distinguish source windows
from returned-result reservations; no UI full source RGB copy remains.

These checks supersede the old worker transport/source-quota assertions. They do
not qualify mobile hardware, every TIFF encoding, segmented PNG/TIFF, segmented
ELA, or the unconnected catalogue entries. No public ZIP was produced: external
hosting qualification remains open. Private proofs and handoff are in the
coordinator's `audit-fixes-2026-10-01` directory; do not publish private paths.
