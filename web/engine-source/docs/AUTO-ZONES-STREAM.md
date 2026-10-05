# Native-equivalent panel detection from RGB surfaces

Internal detectSegmentedPanels(image,{budget,signal,onProgress,storage}) returns
owned polygons, metrics and dispose(). Coordinates are original integer pixel
centres. Empty detection stays empty; only the energy caller may explicitly apply
its separate whole-image fallback. This helper supports the segmented energy
pipeline; it does not replace any other clone/panel detector.

The native palette lattice step ceil(max(width,height)/1800) is unchanged. Two
RGB-band visits preserve the exact sampled previous-row/previous-column wrap:
first count BGR quantized flat-color codes, then collect per-channel histograms
for the native top-eight palette and exact integer medians. Neither a resized
proxy nor a full sampled RGB image is allocated. Full-resolution color-distance
masks, neutral-border3×3 closing, eight-connected global components, area/fill/
border tests, overlap rejection and native row ordering are preserved.

Mask and queue storage is segmented RAM/temporary. Global connectivity uses
bounded mutable pages and a uint32 queue; no component is split at a band seam.
Closing reads64 output rows plus one-row halo. RGB border tests use bounded
windows of the original source. The original source is never modified.

Sampling buffers reserve32768*4+8*3*256*4+6*sampleWidth bytes. Mask/closing buffers
reserve196*width+8192; paging admits at most64×64KiB mask pages and4×64KiB queue
pages plus a spare page each. Admission also protects RGB windows/I/O before
choosing mask storage. Logical scratch uses six bytes/pixel. Each proposal reserves
2048 bytes and each returned polygon1024; dispose releases returned metadata.
All scratch files/pages are removed before return or after failure/cancellation.
Memory/storage failures remain explicit. No runtime calibration is introduced.

All144 native panel cases match exactly: palette ties, colored/white gutters,
morphology/borders, asymmetric panels, codec/orientation pixel references, thin
images and native sampling boundaries beyond1800/3600 pixels. Sampling/growing/
color-stage cancellation, consumer exceptions and admission refusal clean up.

Chrome15412MiB OPFS proof now detects the two native1027×1021 panels from its RGB
surface, then chains preparation, scientific estimators and global segmentation.
Polygons, scores, scope, summaries, estimates, labels and four regions match native.
Panel workspace1813077 bytes; combined-stage peak10446836 bytes. Final storage and
budget cleanup pass. These are supplied synthetic energy planes; complete JPEG-to-
energy analysis and multi-megapixel extremes are qualified separately.

Progress phases: panel-palette, panel-components(color/visited), panel-colors.
Run tests/auto-zones-stream.test.mjs and scripts/test-m5-browser.mjs
--energy-prepare-stream. Native/reference files remain read-only; no public
subimages.detect API behavior is changed by this internal adapter.
