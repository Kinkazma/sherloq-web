# Segmented energy score preparation

Internal `prepareSegmentedEnergy(image,planes,quantiles,log,options)` consumes a
qualified RGB source surface, three float32 byte stores in global row-major order,
and explicit `options.polygons` from native-equivalent panel detection. Missing
geometry is rejected; an explicit empty detection invokes the native whole-image
fallback. This is a preparation stage, not the public complete ELA energy method.
Panel detection, scientific profiles and region segmentation still need connection.

The adapter validates every energy value, including outside the panels, generates
the native grayscale valid mask (3<gray<252), and collects valid panel values in
source order. Exact bounded statistics come from ENERGY-STATISTICS-STREAM.md.
The existing qualified logarithm and float32 casts produce three signed score
planes in temporary/RAM stores. Their pixelwise median gives the native low/high
scores. Panels execute in native order: skipped panels keep their original id
gaps, and overlap writes retain native scope/score overwrite semantics.

Return fields energy_low_score/energy_high_score are float32 byte stores;
energy_scope is int32; energy_summary retains native panel ids, half-open bboxes
and three probe summaries. `dispose()` releases the three output stores and summary
reservation. Inputs remain caller-owned. Scratch validity/signed scores and each
panel-value stream are deleted before return. Cancellation and consumer errors
remove all unpublished stores. Progress phases include energy-valid, the four
statistics phases with panel/qualityIndex, energy-panel-scores and
energy-quality-median; fractions apply within a phase.

Fixed buffers use41*width+(5*65536+8192)*4+8192 bytes, plus2MiB during statistics.
Initial admission additionally protects source windows and I/O before choosing
output storage. Summaries reserve2048 bytes per input polygon. Retained outputs
need12 bytes/pixel; scratch requires13 bytes/pixel plus4 bytes per selected panel
pixel, separately admitted as segmented RAM or temporary storage. The three input
energy planes and original source are admitted independently. Count stays below
2^31. Memory/storage refusal is explicit; no resizing or approximate statistics.

All84 existing native preparations match low/high/scope bytes and full summaries.
A separate overlapping-panel case matches contiguous qualified preparation,
including a skipped small panel and nonconsecutive ids. Invalid values outside
panels, absent geometry, low-memory refusal and four cancellation phases pass.

Chrome154 with12MiB: deterministic1027×1021 RGB and three energy planes, two actual
native panel polygons, all input/scratch/output planes in OPFS. Full low/high/scope
hashes and summaries match the native oracle exactly. The original preparation-only
run peaked at8774052 accounted bytes; the current proof also runs profiles/regions
and records their combined peak separately.
preparation buffers/statistics3490939 bytes. Cancellation during variance removes
all scratch, input files remain intact, final memory/storage cleanup passes.
This development test uses supplied synthetic energy planes; it does not claim
full JPEG-to-regions qualification or a large-image panel detector. Native files
and shared fixtures remain read-only. IndexedDB is not qualified by this proof.

See energy-prepare-stream-chrome-proof.json. Run tests/energy-prepare-stream.test.mjs
and scripts/test-m5-browser.mjs --energy-prepare-stream. The owned native oracle
script writes only tests/data/energy-prepare-stream-native.json.
