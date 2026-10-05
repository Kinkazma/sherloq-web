# Native cell ELA biomes on segmented sources

`ela.biomes` accepts segmented JPEG, PNG and TIFF/BigTIFF sources through the
existing engine/worker `run` API. Parameters, full-resolution cell coordinates,
scientific fields, score combinations, seeded regions and JSON/NPZ exports match
ELA-CELLS.md. This is the cell/peer/background/Ghost family; the scientific pixel
energy pipeline remains separate under `ela.energy`.

The pipeline shares the original scoring and segmentation code. Global RGB JPEG
streams now feed cell descriptors with eight-pixel halos; no complete decoded
recompression array is needed. Native block adjustment still increases by8 until
the complete grid is at most16384 cells. Trailing incomplete cells are excluded.
Automatic JPEG quality reads the original sparse quantization tables; PNG/TIFF
retain the native fallback75. There is no original-file staging for this choice.

Ghost evidence uses the same segmented global JPEG, circular phases, native
16×16 block means and per-quality normalization as standalone `jpeg.ghosts`.
Its71 qualities30–100 and optional64 phases are preserved. The existing exact
integral aggregation, peer scores and best-phase rules remain shared with the
contiguous pipeline. CPU auto uses adaptive useful quality workers when memory
allows; cell descriptor qualities currently stream serially. No synthetic
preflight or calibration occurs.

## B contract and ownership

The result retains `data.content`, profiles, signed/quality/coherent scores,
support/counts, optional background/Ghost fields, cell labels, regions and
metadata. Both layers remain in source cell coordinates with `pixelSize:block`.
No full-image RGB array is added. Results are owned copies, and source identity,
decode provenance and `layout:segmented` are attached as for other operations.

Progress has phase-local fractions: jpeg-encode/render, ela-cell-describe,
ela-biomes, ghost-workers-encode/render and ghost-quality, then complete. Quality
and phase coordinates accompany codec/Ghost work. Threshold/minimum changes reuse
prepared scores. Quality shifts reuse overlapping descriptor probes. Standalone
Ghost and biome Ghost share completed phase/quality block planes; completed RGB
JPEGs also share the two-entry cache with classic ELA. RAM JPEG cache entries may
be reclaimed under budget pressure; the stream currently decoded stays pinned.

Cancellation does not publish incomplete analysis. Cooperative direct retry can
reuse finished stages. Worker cancellation closes owned temporary storage, clears
sources and caches, and requires reload. Unload removes all image-stage caches.

## Admission and qualification

Source pixels and encoded JPEGs can use RAM segments or OPFS/IndexedDB through
their existing adapters. Scientific cell arrays and the current71-quality Ghost
cube remain in RAM with explicit shared-budget admission. Descriptor and peer
heaps each reserve64MiB; the descriptor heap is released before peer scoring.
The internal Ghost consumer keeps only the normalized cube, produced in place,
with admission `8*S+8*C+1MiB`; the standalone raw+normalized result contract
retains its existing admission. Codec/workers are admitted separately. Wide descriptor bands use bounded halo windows with the original
full-width arithmetic partition; see ELA-CELL-STREAM.md. Scientific grids or
remaining workspaces that exceed their admitted capacity fail explicitly; no quality, phase or source
dimension is silently reduced. This does not promise unlimited external-memory
scientific arrays or fast64-phase execution on arbitrary images.

All four complete small native pipelines pass through segmented providers,
including background and64 Ghost phases with native winning-phase decisions.
Threshold reuse and overlapping quality probes pass. The existing contiguous
four-pipeline tests and27 descriptor/9-score/27-region study pass after the shared
native correction below. The51 pixel-energy pipeline regressions remain exact.

Chrome154 tests the public worker API on4103×5401 BigTIFF under512MiB. Its135×102
grid uses block40 after the native adjustment. With background enabled and Ghost
disabled, every measured content/profile/score/support/label byte and region
matches the independent native reference; content maximum error is0. Peak
accounted memory483467196 bytes. Threshold changes use zero new JPEG probes;
owned-cache mutation,4.28MB NPZ, hard cancellation, native-exact reload and storage
cleanup pass. See segmented-biomes-chrome-proof.json.

The separate large Ghost test starts two useful workers under the same512MiB
budget (peak accounted514689491 bytes, no preflight). It covers execution, complete71-quality curves,
native cell/background stages, cache and cleanup. Its full Ghost-biome oracle
remains the small64-phase corpus; large final Ghost-region identity is not
claimed from that execution test alone. Browser timings are useful-work
observations, not a runtime benchmark or universal speed claim.

## Shared native correction exposed by the large case

The former descriptor mapped magnitude HAL scalar tails onto full-image stripes.
Native `cv.magnitude` actually receives each halo matrix, so its stripe partition
must use that matrix's dimensions. On odd-width22MP input, the old mapping changed
54 profile entries and downstream scores; the corrected mapping restores native
values. Both contiguous and segmented descriptors use the corrected kernel.

Content log transforms also exposed one-float32-ULP differences from musl log1pf.
The kernel now exposes its unlogged float32 statistics; both JS adapters evaluate
log1p in binary64 and round once into the output float32 array. On the full
descriptor/scoring corpus and the22MP reference this restores exact content
values. The previous3e-7 acceptance bound was not widened. This is measured
parity, not a claim about every possible floating-point input.

Reproduce with tests/segmented-ela-biomes.test.mjs,
scripts/generate-segmented-biomes-reference.py and the two test-m5-browser suites
--segmented-biomes and --segmented-biomes-ghost.

The rich12000×8000 public-worker path now completes cell/background preparation,
all71 Ghost qualities for one phase, native comparisons, refilter/cache and two
complete NPZ exports under1GiB. See M5-LARGE-SOURCE-COVERAGE.md and
m5-biomes-96mp-proof.json for measured errors, memory, timings and scope.
