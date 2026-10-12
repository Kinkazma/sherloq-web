# SHERLOQ Browser Lab 0.10.0 — local integration candidate

The workspace starts empty. Opening an image creates its Original document;
selecting a tool opens an independent, closable document. Selecting another tab
keeps the calculation and its source alive. Language changes preserve panel state.
File/settings menus and layout actions share the top bar; zoom is below the tools.
First-visit favorites are PCA, ELA, luminance gradient and clone detection 2.
Clone display starts with Biomes only; calculation actions have a consistent
leading position. See `../CLONE-CONTROLS-0.9.md` and `../WORKSPACE-0.7.md`.

All 50 catalogue entries are connected: Original, automatic analysis and clones,
ELA, Composite, and 45 individual tool interfaces. The individual workspace
provides scientific parameters, file/model inputs, result layers, tables,
histograms, original-byte editing to a derived copy, and native exports.

The individual and automatic clients use integration.33 plus the committed
clone-panel source increment `343c89f2cfd54816085fc7a8af69e530805a7742`
(API `0.33.1-clone-panel.1`). All binary and model assets retain their original hashes. Classic/energy ELA and Composite
keep their previously pinned clients. Original segmented inputs and the selected
aggressive/maximum compute policy are preserved. Display sampling never replaces
scientific inputs; internal CPU/GPU concurrency remains owned by the engines.

This is a local application for Gaël's image tests, not a production ZIP.
The code, API contracts and dependency closure are checked automatically.
Gaël owns interactive image/calculation testing; the integration checks do not
claim a complete browser recipe. External model hosting remains unqualified.
See `../INDIVIDUAL-TOOLS.md` and `../runtime-lock.json` for the exact scope.

## Historical release notes

The sections below describe older releases and their limits at that time.

## SHERLOQ Browser Lab 0.4.1 — local validation candidate

**Local candidate only, not a production distribution.** The two runtime slots
remain pinned by `runtime-lock.json`; builds verify every locked file before any
installation. No code is collected from another agent's live worktree.

Classic and energy ELA now run on the pinned 0.28.0 engine with one uncapped
resource policy, after reserving the UI and returned-result buffers. Profiles use
hardware hints and actual requested work; there is no preliminary calibration.

Import retains the original Blob and reads exact pixel windows for display.
JPEG, PNG and the engine's qualified TIFF subset can be selected. A 96 MP JPEG
was loaded through segmented storage and read in four windows in Chrome.
This does **not** imply segmented PNG/TIFF decoding or segmented ELA execution:
those engine features are still pending. An operation that still requires a
resident result reports its actual memory requirement instead of changing the
analysis, resolution or selected zones.

Energy JSON/NPZ exports stream with backpressure to temporary OPFS storage
(available-memory fallback when OPFS is unavailable). A complete 3 MP analysis
produced an 84,012,708-byte NPZ through the actual UI, reloaded with NumPy. ZIP64
preserves all five numerical arrays, metadata and provenance. Original source
pixels remain in the worker; full RGB copies are not sent to the interface.

The 0.4.0 UI features remain: independent energy controls, profiles, opacity
without inference, preserved zoom, optional novelty highlights, settings export.
No extra native tools are claimed as connected by this maintenance release.
Last distributable archive remains 0.3.4 until external dependencies are qualified.

## Earlier release documentation (historical, not the 0.4.1 capability list)

The following sections preserve the history and limitations of earlier releases.

Install the ZIP through **Plugins → Add New → Upload Plugin**, then activate it.
Insert the **SHERLOQ Browser Lab** block in a page, or use:

```
[sherloq_browser language="fr" height="920"]
```

Set `language="en"` for English. The block inspector exposes language and height.
Use HTTPS or localhost so the browser permits secure WebAssembly/worker APIs.
The iframe isolates the workspace from theme styles; it serves only local assets.
The plugin adds no image upload endpoint, remote inference service, telemetry,
third-party CDN or dependency on a particular desktop/NAS. PHP serves the UI.

## Current functionality

Classic ELA uses a CPU worker and a bundled JPEG WASM codec. Quality, gain,
contrast, linear rendering and grayscale are independent controls. The native
classic defaults are 75 / 50 / 20. Named presets and preferences are stored in the browser's local storage. Browsers may clear that storage; session JSON is an
explicit portable export. Imported images are kept in memory, not local storage.

Pan by dragging; wheel zoom follows the pointer; two pointers support pinch/pan.
Draw rectangles in source coordinates; hide outlines without recomputing.
Only whole-image classic ELA is available for calculation. Independent-region,
exactly-two-region and enclosing-rectangle search semantics are retained in
sessions, but execution is refused until a compatible engine is available.

PNG exports are derived ELA visualizations. JSON reports include engine
provenance and settings. Session JSON contains settings, image SHA256 and regions,
without original bytes. Restoring requires the same image fingerprint. Exports
are created locally and downloaded using the browser's normal download flow.

## Scientific and platform limits

ELA is a recompression residual visualization, not a manipulation verdict.
Kernel parity and JPEG codec parity are distinct; read the exported provenance.
The initial decoder accepts only 8-bit JPEG supported by the bundled engine.
EXIF/XMP/ICC JPEG, CMYK, TIFF, alpha and high bit depth are not qualified and may
be rejected. Original preview uses the exact RGB8 pixels returned by the engine; the browser
does not apply a separate JPEG decoder or silently orient the image.

Energy/biomes/Ghosts and the rest of the native application are unavailable.
Their planned Conservative profile is 1/99 percentiles and deviations 5/5;
Sensitive and Aggressive are adaptive. Those controls are not simulated by
classic ELA. WebGPU acceleration is unavailable in this initial release; CPU
continues to work when WebGPU is absent. Mobile emulation does not qualify the
memory or GPU of a physical phone.

One engine runs per dedicated page, with a measured CPU worker pool for larger
images. Cancellation terminates the coordinator, discards stale results, and the
next run reloads the original bytes. The Aggressive compute profile adapts the
budget to browser memory hints; Maximum is optional. These resource profiles do
not alter scientific parameters. The reported budget is an engine accounting
limit, not free RAM or total browser memory. Display overhead is additional.
The compressed-file admission limit is 512 MiB; engine memory validation can
reject smaller images. No hidden resizing or quantization.

This is an experimental local build with engine 0.2.0-b1 (local scheduling patch). Classic ELA and the
interface were exercised in Chrome on a local WordPress/Gutenberg installation.
Responsive emulation was inspected at 400 px; physical touch/pinch, other
browsers, large-image stability and other engines remain unqualified.

## Development and verification

The engine's source and contract are maintained separately. `../build.py` copies
only the files whose SHA256 matches `runtime-manifest.json` into this
plugin. No WordPress site configuration, database, media or private reports are
included. A final ZIP must be checked byte-for-byte against the installed files
used for real WordPress/Gutenberg/browser verification. See the release recipe
for the actual qualification status; source presence does not imply test success.

License: GPL-3.0-or-later. Third-party codec licenses accompany the engine assets.

## Workspace appearance

A dedicated page containing this block or shortcode opens the workspace across
the browser viewport, without the site's navigation/header/footer. Use a dedicated
page: other page content is not rendered by this workspace template. WordPress
still handles access permissions and draft previews. Password-protected pages
keep their normal password form. One workspace/engine is rendered per page.

The top-right house returns to the site's dynamically configured home URL.
The adjacent button enters browser full screen after a user click. Browser full
screen cannot be forced automatically on initial navigation. The workspace
already fills the viewport before that optional click.

The historical tool groups and Original/ELA tabs follow the native application.
Unported engines are visibly disabled. Theme and language buttons use the same
rounded control style as the site's ISO Studio. Light/dark follows this lab's
saved preference, an existing ISO Studio theme preference if present, then the
system preference. Theme changes persist only for this lab. No site-specific
URL, font service or theme dependency is bundled.

The application header credits Guido Bartoli (original SHERLOQ project) and
Gaël Dauchy (community fork) with two stacked name links to their repositories.
Both links open in a separate tab and preserve the current analysis workspace.

## Window layouts and portable settings (0.2.0)

Tile shows Original and ELA side by side (stacked on narrow screens). Cascade
stacks those views; drag their title bars and click to bring a view forward.
Tabs returns to one full-size view. Both views reuse decoded surfaces and one
engine; layout changes do not recompute analysis. Only currently available tools
are included. Previous/Next commands are intentionally absent.

Close all asks for confirmation and reloads this application empty in the same
browser tab, terminating its workers and releasing images/results. Settings are
saved before reload. If browser storage is unavailable, it clears image state
without reloading, retains settings in memory and asks for a JSON export.

Save preset opens a name field. A new name adds a profile; an existing name updates
it. The existing legacy preset is migrated. Each save offers Download all settings.
Export settings also downloads the complete backup at any time. The plain JSON
schema `sherloq.settings/1` includes every named preset, current analysis settings,
active preset, theme, language, favorite, compute profile, region mode, layout and
panel/outline visibility. It contains no image bytes, coordinates or fingerprint;
use Export session for image-specific regions. Up to 100 presets, 80 characters
per name; imports are validated as a complete bundle before any replacement.

Files are named `SHERLOQ-reglages-<UTC timestamp>.json`. Recall settings opens a
JSON file chooser after displaying this filename pattern. Browser file selectors
do not allow a page to prefill their search field; users can navigate or search
freely and select renamed JSON files. Confirmation shows the number of profiles
and states that the entire saved collection and preferences will be replaced.
The loaded image stays; derived results are invalidated for a new calculation.
Malformed or incompatible files are rejected without changing existing settings.
Browser storage is convenient, not a durable backup: keep the downloaded JSON.


## Navigation and site typography (0.3.2)

Mouse wheel zooms at the pointer; left drag moves the image. Trackpad scrolling
moves the image in both axes and pinching zooms. Navigation defaults to automatic;
use the Mouse or Trackpad override under Layers and regions when the browser's
wheel events are ambiguous. This preference is included in settings backups;
older backups default to automatic mode.

Double-click evaluates the current image framing: an oversized, undersized or
panned image is fitted and centered; an already fitted image zooms in at the
pointer (at least 100%, or twice the fitted scale for small images). There is no
remembered alternating toggle. The behavior applies in tabs, tiles and cascade.

Iowan Old Style uses the active site's Adobe Fonts kit, passed through the
`GAELDAUCHY_V4_ADOBE_FONTS_URL` theme constant into both the editor and front-end
iframes. Other sites can supply `sherloq_browser_adobe_fonts_url`. Only HTTPS
Adobe kit CSS URLs are accepted. Font binaries are not redistributed; local
Iowan/Palatino/Georgia fallbacks keep the interface usable offline.


## Catalogue placement (0.3.3)

AI Clone Detection / Détection de clones par IA now appears in AI Solutions
just after AdaIFL. Both Copy-Move tools remain in Tampering. Existing IDs and
unavailability are preserved; this catalogue change does not enable new engines.


## Complete catalogue order (0.3.4)

Complete Automatic Analysis belongs last in Inspection, after Reference Comparison.
All 10 categories and 50 tool names/order now match the native visible tree and
the reference screenshot of 2026-09-30. Personal favorites are preserved, not
copied from the screenshot. Native colored outlines are not introduced.
The development reference native-tree.json records visible placement, including
the native reparenting of Complete Automatic Analysis and AI Clone Detection.
