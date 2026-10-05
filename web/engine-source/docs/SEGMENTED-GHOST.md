# JPEG Ghost maps over segmented full-resolution sources

`jpeg.ghosts` now accepts segmented JPEG, PNG and TIFF/BigTIFF sources. It keeps
the existing quality range/step, X/Y phase0–7, palette and include-original
parameters. Every quality uses one global native RGB JPEG stream; row bands do
not reset its state. Circular phase reads map exactly to oriented source rows,
including wraparound at both edges, without a full-image roll allocation.

Within each complete16×16 block, channel squared differences are summed exactly,
divided by3 in float64, then reduced with the native NumPy pairwise order before
division by256. The existing per-cell min/max normalization spans the requested
qualities; a zero range produces zero. Right/bottom incomplete blocks remain
excluded, as in the native engine. There is no independent tile recompression,
resized input, approximate thumbnail or altered quality grid.

## B contract

Call the existing `run({id,imageId,operation:'jpeg.ghosts',params},hooks)`.
The returned `data` keeps qualities, raw/maps Float64Array cubes, rows/cols,
blockSize16, roll, sourceDimensions, completeExtent, layout row/column/quality
and the existing grayscale/viridis RGB preview planes. Layer coordinates remain
shifted-16px-block-grid. The native Matplotlib figure layout is still UI work.

For `includeOriginal:true` on a segmented source, `data.originalSurface` and the
original RGB layer refer to the already-loaded source surface. There is no
materialized `data.original` pixel array. This handle is borrowed; it ends when
the source is unloaded. The original can be displayed through exact readPixels
windows. Contiguous results retain their previous original-array contract.

Metrics report qualityPlanesComputed, recompressions, encodedCacheHits,
codec/source-window capacities, temporary encoded storage and per-quality stage
cache hits. JPEG phases report quality and index/total as well as a phase-local
fraction; ghost-quality reports completed quality fraction. Existing JSON export
retains exact arrays and provenance under its own size/memory admission.
Ghost evidence is not a tampering probability or recovered source JPEG quality.

## Cache, memory and lifecycle

The global RGB JPEG adapter from SEGMENTED-ELA.md now keys its two-entry encoded
LRU by X/Y phase and quality. Zero-phase ELA and Ghost share completed JPEGs.
Block-mean planes are cached by phase/quality. A quality subset reuses its planes
and computes the new normalization; palette/include-original changes reuse the
normalized analysis and only rebuild views. Returned arrays are owned copies;
mutating a result cannot alter the analysis cache.

The source, encoded streams and intermediate disk arrays use the shared budget
and owned temporary session. Circular windows reserve their own output plus
bounded source windows. Grid admission conservatively includes raw/maps arrays,
owned copies, preview planes and one temporary quality plane; for S cube values
and C cells it reserves `35*S+8*C+1MiB` in addition to known resident heaps. Native
JPEG workspace is admitted separately. CPU auto starts useful quality workers
immediately according to the resource profile and available memory. Each worker
owns one bounded native JPEG heap; the parent reads each source band once per
batch and owns all encoded storage. CPU single uses the serial adapter. Existing
encoded qualities are reused before dispatching new JPEG work.

The adaptive scheduler observes completed useful work only. A worker/resource
failure lowers concurrency and resumes unfinished qualities serially; completed
quality planes are preserved. Metrics expose workers, scheduling.count/maximum,
resourceReduced, zero preflightExecutions and retry.remainingQualities. Parallel
phases are ghost-workers-encode and ghost-workers-render. Their fraction spans
batches; ghost-quality still counts completed qualities. sourcePasses counts
started source traversals, including partial traversals on a failed attempt.
No benchmark/calibration or synthetic runtime probe is introduced.

The full RGB staging limit is removed, but arbitrarily large quality cubes are
not unconditionally admitted. A grid that cannot fit returns MEMORY_LIMIT; it
does not reduce source dimensions or omit qualities. JSON export has separate
limits. The current output cubes are not external-memory arrays.

Only completed quality planes/analysis are cached. Cancellation does not publish
partial grids; source unload removes cached planes, analysis and encoded JPEGs.
Direct-engine retry can reuse completed work; worker cancellation closes storage,
terminates and requires reload. Borrowed original surfaces and normal source
windows use the established revision/lifetime rules.

## Qualification

All368 existing native Ghost cases match raw float64 means, normalized cubes and
both palettes through this adapter. Cases cover all64 phases, qualities0–100,
step/range endpoints, single-quality/flat inputs, incomplete blocks and varied
textures. An independent byte test checks every phase across row-band wraparound.
The existing contiguous Ghost corpus still passes; shared ELA/Ghost encoded-cache
reuse, source APIs and RGB recompression error paths are tested.

A real Chrome worker under64MiB processes a4103×5401 BigTIFF at phase7,3 and
qualities60/80/100. Complete raw/maps SHA256 values match native GhostEngine.
The80/100 subset performs zero new JPEG work, and palette changes use owned cached
analysis. Include-original references the live source. Worker cancellation,
reload, single-quality zero normalization and OPFS cleanup pass. See
segmented-ghost-chrome-proof.json for metrics and evidence.

This qualifies the stated OPFS sizes and CPU path. Larger quality grids,
Ghost-specific IndexedDB behavior and ZERO are separate work. ELA biome Ghost
support now uses this provider; see SEGMENTED-ELA-BIOMES.md. Reproduce with
scripts/generate-segmented-ghost-reference.py, tests/segmented-ghosts.test.mjs and
scripts/test-m5-browser.mjs --segmented-ghost.

A second real Chrome worker test under192MiB starts three workers for the same
22MP native phase/qualities: three encodings share two source traversals, and raw
and normalized cubes remain native-exact. Peak accounted memory160852941 bytes;
three16MiB codec heaps. A separate injected second-batch MEMORY_LIMIT on the1MP
native reference retains three completed qualities and computes only the six
remaining qualities serially; all nine planes match native. This is a development
fault test, never a runtime probe. Cancellation during parallel rendering closes
storage before worker termination; reload and final storage inventory pass.
See ghost-stream-pool-chrome-proof.json and run scripts/test-m5-browser.mjs
--ghost-stream-pool. Serial under64MiB remains supported.
