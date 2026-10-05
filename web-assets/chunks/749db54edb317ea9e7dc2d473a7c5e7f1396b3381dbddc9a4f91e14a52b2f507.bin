# Sampled display frames — 0.34.1-display.1

The UI used many 256-texel reads. Each read copied full-resolution bands before sampling them. Cropped RGB and numeric reads forced an event-loop timer on their first row and every 32 rows, even when the read itself took microseconds. Browser timer clamping accumulated seconds. UI worker queues serialized those reads; each response scheduled another canvas redraw.

`readDisplay({surfaceId, revision, tile, render})` now prepares the visible RGB frame inside the owner worker. Resident RGB reads sample directly. Segmented RGB/masks/flags/numeric planes read only contributing scanlines through a reusable row buffer, including all eight EXIF orientations. Numeric palettes and overlays are applied after sampling. Source descriptors, analysis arrays, exact reads and exports retain their original resolution. The display output is bounded to 8 Mi pixels; the caller additionally enforces its canvas cache budget.

Small exact window reads no longer force a timer. A shared read cooperator still services cancellation after approximately 8 ms of accumulated work across successive reads. M2 display replies transfer a sampled frame directly instead of creating, paging and releasing an export for every tile. Segmented M2 rendering is bounded to contributing scanlines; the older nonsegmented API renders once per display request, rather than once per source band. Its rendering cost can still dominate particular legacy views. TruFor noise normalization retains its existing full-data quantile calculation and cache.

The UI composes one complete viewport frame and retains the previous canvas until it is ready. Repeated pending viewport requests coalesce. Shared image and loupe consumers have independent viewports. A completed revision is never mixed with another result. At 100% ordinary viewports preserve individual pixels; large zoomed-out previews remain sampled. No runtime calibration or canary is introduced.

## Synthetic measurements

`node scripts/check-display-browser.mjs --all` compares immutable engine `7e34e5208c83b292d6106c1f7fbfd3f4ded2e64c` / UI `0fcee0c550925f100f2d42bad47b07d0fabe05e7` with this implementation. Each pass starts from an already computed synthetic 10000 × 10000 RGB image in a fresh worker and displays the complete image at 1250 × 1250. Three passes per case. The measurement includes reads, RPC transfers, RGB-to-RGBA conversion, canvas drawing and the final automated pixel readback; excludes analysis, decoding and worker initialization. These are display timings, not total ELA or detector timings.

Median milliseconds (raw runs in `display-100mp-proof.json`):

| Browser | Resident result before → after | Segmented RAM surface before → after |
|---|---:|---:|
| Chrome 154.0.8037.93 | 125.8 → 32.2 | 8388.5 → 32.2 |
| Firefox 155 | 85.7 → 23.0 | 8755.6 → 23.6 |
| WebKit 26.6 | 126.4 → 24.7 | 8259.6 → 38.6 |

25 presentation RPCs become one. Disk-backed sources, machine load, larger viewports and scientific rendering are not represented by these timing figures.

`check-display-contract-browser.mjs` exercises the actual public worker API and shipped UI ELA worker in all three browsers, comparing sampled pixels against exact originals and two successive native ELA results. Unit tests additionally cover EXIF transforms, scientific palettes, overlays, mask/flag semantics, cancellation, stale handles, failure cleanup, M2 ownership and the UI frame lifecycle. See `display-worker-contracts.json`. No user image or existing browser session was manipulated.

The Chromium contract test also exercises the WebGL loupe with asynchronous remote sampled frames: visible lens, mapped pixel values at five radii, two independent detail views, wheel magnification with a fixed camera and full cleanup. The `loupeRemote` result is null where that GPU-specific test was not exercised.
