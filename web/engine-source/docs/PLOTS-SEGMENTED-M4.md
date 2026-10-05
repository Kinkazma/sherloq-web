# Native RGB/HSV tables and bounded graph rendering

`segmentedPlots(image, params, options)` computes native full-axis byte pyrDown
levels and RGB/HSV float32 values into a six-column paged table. Only the user's
sampling scale changes resolution; null retains the native initial level1.
The five-tap Gaussian uses original reflect101 boundaries and integer rounding.
HSV preserves the native four-pixel prefix/tail hue arithmetic and scalar FMA
reference. Independent row strips run immediately with memory-admitted workers.
The original module and contiguous plot API remain available.

31 acquired native arrays across all fixture levels are bit-exact. Changing
axes/colors/camera reuses values. Increasing the level can reuse the preceding
cached RGB pyramid. Table leases survive replacement of that cache, until the
consumer releases them. `createEngine.run(colors.plots)` on a segmented source
returns `layout:'table'`, `tables.values`, count/columns/scale/style and metrics.
`readTable`, `readTableCsv`, `releaseTable` accept the new `float32-table` format.
Rows are original row-major sampled pixels, six values in Red/Green/Blue/Hue/
Saturation/Value order, all normalized as native. Source unload invalidates
its handles and releases the pyramid cache. Chrome EXIF6 API proof verifies
full values, CSV, refilter cache, old-table lifetime and complete cleanup.

`createPlotRenderer.setData` accepts a borrowed Float32Array or a table with
that descriptor and async `readRows({offset,length},{signal})`, returning a
Float32Array `data` and `release()` lease. Keep the table alive until renderer
and any exports finish. If all GPU data fits, the persistent buffer path retains
camera/axis changes without uploading again. Otherwise a bounded GPU buffer
streams every selected point, accumulating into a persistent framebuffer; camera
changes repeat GPU transfers, not native RGB/HSV calculations. The final texture
is drawn into the default multisampled framebuffer (single-sample -> multisample
blits are invalid). Point submission order, global depth for opaque3D and alpha
blending for other modes remain across chunks. No point sampling/cap is added.

Await `setData`, `setStyle`, `setCamera`, `resize`, `render` and `exportPng` when
using paged input. Newer camera renders supersede older work. Replacement is
published after its full first frame; cancellation preserves the previous cloud.
`exportSvg` reads every table page with bounded strings. Projected3D SVG retains
its already-documented lack of a depth buffer. PNG captures the complete graph.
Real browser600003-point proof exports600003 SVG circles and a nonempty GPU PNG,
with peak12058624B/18MiB and final0. Existing100003-point persistent proof still
passes with one data upload across camera changes. The96MP source journey at
levels1/2 (24M/6M points), native arrays, complete SVG/NPZ and PNG exports is running;
it is not yet claimed qualified by this delivery. No WordPress UI change.

The low-level streamed scientific exporter accepts `values` as shape[count,6],
descr `<f4`, reading the stored bytes in chunks. The current engine table API
exposes full CSV; NPZ96MP evidence uses the existing common stream exporter
without introducing another archive format.
