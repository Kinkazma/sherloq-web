# Global scientific ELA provider for automatic sessions

`createAutomaticElaProvider({image,budget,cellParams,energyParams,maxWorkers,
storage,wasmBinary?,onTemporarySession?})` connects the actual M5 scientific
pipelines to createAutomaticAnalysisSession. This provider currently requires
an original RGB surface record (the qualified segmented representation). It
uses globally coherent JPEG recompression, cell/Ghost/background preparation,
and the segmented energy cache. Selected ROIs never redefine the statistical
reference population. The source surface remains caller-owned.

cellParams follows elaCellParams, restricted to the automatic UI's selectable
16/32/64/96 block sizes. Energy block and quality must agree with cells; energy
profiles follow energyParams. As in native complete analysis, the background
control enables both residual/background cells and pixel energy. Ghost/all-grid
flags remain the actual scientific pipeline options. By default worker capacity
uses the available hardware concurrency capped at 32; an explicit runtime cap
can be supplied. The CPU setting does not reduce CPU worker capacity to one.
Existing useful-task admission/adaptation decides actual concurrency, without
performance calibration or probes.

`run` returns owned `{value: {cells,energy,metrics}, release}`. The global result
is cached for this provider's fixed source/settings and reused across automatic
selections. Stored metrics describe its original preparation; a subsequent cache
hit emits automatic-ela-cache without recalculating pixels. Changing global
cell/profile settings requires a new provider. `prepare` performs the existing
native complete-cell selection and pixel-energy segmentation from those global
references, using the session's relevant filters. Default energy thresholds are
the prepared profile's thresholds; explicit filter thresholds override them.

`prepare` returns an independently owned selected result with entries, masks,
labels, scope and metadata. The provider owns an independent temporary session,
not the image decoder's session. Raw leases and frames pin its storage and remain
readable after automatic session, provider and source disposal. Dispose awaits
active work, releases global caches and its own two-entry encoded-JPEG cache,
and deletes the temporary session when the last dependent lease ends. Progress
and cooperative cancellation come from actual work. onTemporarySession exposes
the session for host hard-worker cleanup. No source image or caller cache is
disposed by this provider.

This API supplies raw scientific profiles and selected outputs. The native
cached ELA preview raster and full snapshot field normalization still need their
own integration; no complete public automatic operation is announced here.
Large-source constraints of the codecs, full-source selection raster and contour
kernel remain explicit in their component contracts.

The actual native ElaBiomeEngine.prepare and complete_analysis.ela_entries
produce the 176×160 reference. Chrome runs the real preparation kernels and
compares 21 scientific arrays, panel references, scoped labels and seven selected
entries exactly; observed content error is zero (the existing allowed logarithm
bound remains 3e-7). Three cell recompressions and one additional energy
recompression suffice because two encoded qualities are reused. Source window
reads remain unchanged during threshold/filter changes and provider cache hits.
Real OPFS selected outputs and raw references survive provider/source disposal;
mid-segmentation cancellation cleans partial outputs. Final memory and temporary
inventory are zero/unchanged. Peak accounted 97,708,734 bytes under 512 MiB,
including test buffers. The initial ownership check exposed the encoded-JPEG
cache retention, which was fixed before delivery. See
`automatic-ela-provider-chrome-proof.json`.

The provider also retains the native cached linear ELA preview (scale 50,
contrast 20, source reference quality). `value.preview.surface` is RGB for
presentation; `value.cells.ela` is a borrowed BGR byte-store view for the native
scientific ndarray. Both are protected by the raw-value lease. The source
SHA-256 is computed incrementally in decoded BGR row order and appears as
`value.decoded_bgr8_sha256` and cells.metadata.image_pixels_sha256. The native
profile key and fixed preview metadata are included. Preview generation occurs
while its encoded reference quality is cached and performs zero recompressions.
The updated browser proof verifies 22 prepared arrays including the exact BGR
preview, the native source hash, preview survival after source/provider disposal,
and the same zero-memory/storage cleanup. This replaces the preview limitation
in the initial provider delivery; full snapshot normalization/public wiring
remain separate integration work.

Scientific export normalization is now supplied by automaticElaSnapshot (see
AUTOMATIC-ELA-SNAPSHOT.md). cells.energy_planes retains all three raw qualities,
even with background/energy regions disabled, as native prepare does. That path
computes planes without panel-reference statistics. The updated proof covers
both 25-array complete and 14-array cell-only native archives; its combined
ownership test peaks at 107,126,160 bytes including 8 MiB test buffers. Public
complete-analysis wiring and other detector snapshot normalization remain open.


Automatic ELA temporary sessions also receive the shared Budget (integration .15
follow-up). Before the correction, actual Chrome with OPFS disabled rejected
selected ELA preparation: IndexedDB requires a shared staging budget. The same
recipe now verifies22 native prepared fields (the existing content-logarithm
bound is retained), selected entries, all25 energy-enabled and14 cell-only
scientific export arrays, caches, cancellation and independent frame/raw owners.
Both provider sessions use real IndexedDB. Chrome512MiB budget, peak109274550B,
final owned0 and temporary inventory restored. See
`automatic-ela-provider-indexeddb-chrome-proof.json`. The new argument is ignored
by OPFS; its path in the active frozen composition runs is unchanged.
