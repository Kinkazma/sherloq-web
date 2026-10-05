# Native sub-algorithms that must not collapse into one web checkbox

The panel register covers all 50 panels. `native-inventory.json` captures every
function, import, uppercase configuration expression and UI `addItem(s)` expression
in 147 native modules. This is a reproducible static audit; it is not a claim that
all branches have been executed. Availability must be read per branch in the engine register.

## Historical Copy-Move

The original panel has BRISK (default), ORB and AKAZE. The browser's separate
`tampering.copyMove.orb` explicitly chooses ORB; `tampering.copyMove.akaze`
explicitly chooses AKAZE with 61-byte MLDB descriptors. Their own declared
qualification corpora and remaining limits must be retained. BRISK interpolation
is corrected in the delivered `tampering.copyMove.brisk`, but angles still differ and a boundary probe
changes descriptor-bin choices; the native-equivalent APSL polynomial is excluded
from GPL delivery (BRISK-STUDY.md). Response normalization, Hamming
radius, displacement/proximity distance and group minimum remain independent.
Masks are decoded at the same dimensions, converted RGB→gray and thresholded to
binary1 exactly as the native loader; a255 mask is not substituted. Groups overlap,
and minimum filters displayed groups without changing the geometry cache. Counts
use the original seeded kmeans heuristic. Point/line visibility changes rendering
only. Full result and byte provenance are exportable as bounded JSON; no binary
fraud mask, polygon detector or universal clone count is inferred. Detailed corpus,
ordering and scientific limits are in COPY-MOVE-ORB.md and COPY-MOVE-AKAZE.md.
The dense 1MP AKAZE checker complete pipeline remains unqualified, even though
its detector fields/descriptors match. The full 20-algorithm Copy-Move 2 panel
below is a separate engine. Its14sparse profiles are now available as
`tampering.copyMove.sparse`; six dense profiles belong to the separate M4 merge.
The Panels+Text profile includes automatic panels, OCR exclusions, genuine
mirrored descriptors, sub-biomes and provenance, not just G2NN.

## Copy-Move 2 and automatic analysis

Exactly 20 selectable algorithms in `core/cloning2.py`:
SIFT, RootSIFT, AKAZE, BRISK, ORB, PatchMatch Zernike, PatchMatch SIFT, XFeat,
XFeat + LighterGlue, ALIKED, ALIKED rotation, ALIKED + LightGlue, ALIKED rotation +
LightGlue, SIFT + LightGlue, PatchMatch Zernike + PatchMatch SIFT,
SIFT + G2NN + RANSAC, SIFT + G2NN + RANSAC + Panels + Text, Extended: PatchMatch Zernike + PatchMatch SIFT,
PatchMatch Zernike + PatchMatch SIFT + Mirror, and Extended: PatchMatch Zernike +
PatchMatch SIFT + Mirror.

Zernike uses 12-dimensional dense descriptors; SIFT uses 128 and a 3×patch border.
Both descriptor normalizations, minimum distance, radius, source masks, seed,
iteration count and full-field affine coherence filtering affect results. The
native bridge has seeded PatchMatch, not an interchangeable nearest-neighbor
approximation. Extended hypotheses and reflection passes add corroborated matches
without erasing normal results. Detail corroboration uses high-pass sigma 1.2,
9-pixel patches, minimum NCC .8, 6–32 samples, alignment radius 1 at .5 increments.
Additional geometry has 15° and .15 scale-relative tolerances, max anisotropy 1.15.
Geometry UI: None, Similarity, Affine, Homography. Do not silently remap them.

Search regions are independent; Compare requires exactly two. Excluded polygons,
per-region radii, gutter-adjusted coordinate axes and guide panels affect admissible
matches before descriptor comparison. Independent overlapping searches retain
each context in `pair_search_regions`; they are not assigned to the first common
ROI. Context-specific biome counts are distinct from any later evidence vote. Native polygon rasterization
rounds coordinates before OpenCV fillPoly; the half-open web rectangles must be
converted explicitly. A bounding box or convex hull is not an observed mask.

Automatic Clone Search combines Forgeryscope Auto, PatchMatch Zernike,
PatchMatch SIFT (extended + mirror settings), SIFT/G2NN/Panels/Text and D2PRL
multizone. Complete Analysis adds the two ELA biome families; cached ELA pixels may also be a selected
analysis input. Its exact-cell ELA masks and pixel energy territories differ from
clone polygons. Layer toggles and selection must not trigger detector recomputation.

Automatic sub-images are separately callable as `subimages.detect`; all native
geometry rules and the 144-case corpus are recorded in AUTO-ZONES.md. This does
not enable the clone/ELA pipeline or gutter-compacted clone coordinates.

## ELA sub-engines

- Classic: quality 75, gain 50, contrast 20, absolute uint8 or float32 normalized
  square-root error, tone LUT and grayscale. A visualization, not a binary verdict.
- Quality reference: explicit value or nearest conventional original JPEG
  quantization tables; fallback 75 with reason. Three probes: q−5/q/q+5, shifted
  at endpoints. Never infer the original quality from a Ghost deficit peak.
- Peer biomes: full cells only (16/32/64/96), content compatibility, signed
  discrepancy persistent across quality probes, spatial/descriptor corroboration,
  supported cells, connected segmentation. Defaults block32, threshold2, minimum3.
- Background consistency: trimmed central residual profiles, peer content distance,
  background scores combined explicitly with the existing score.
- Ghost corroboration: 71 qualities 30–100, one grid or all 64 phases, native maps,
  aggregate to biome cells, best score/quality/phase and peer count retained;
  minimum 16 comparable peers. Does not assert original JPEG quality or probability.
- Energy: 7×7 residual-energy blur; reference panels; exclude saturated pixels and
  gutters; log score scale .2 and floor .25; selected percentile bounds; low/high
  medians; grow weak connected support with strong seed and minimum area. Disjoint
  components may share the same panel/class, without filling intervening gaps.
- Profiles: Conservateur (`standard`) is fixed 1/99 and 5/5; Sensible
  (`conservative`) and Agressif (`sensitive`) are adaptive. These historical internal
  names must not be confused with visible labels. Manuel and user snapshots retain
  four slider values; editing does not overwrite a saved profile.
- Views: Biomes on ELA/image, Biomes only, Linear ELA, Disparities, Comparable zones,
  Low/High energy. Legacy/energy visibility and layers remain independent.
- Export: native NPZ contains numerical fields/metadata, not merely a screenshot;
  browser equivalents cannot claim this export from an RGB visualization alone.

## Learned detector outputs

CMSeg-Net generalization/addnoise plus seven MGCFDN variants: base, source/target,
16×16, EffNet16×16, MPDN16×16, TNT16×16, ViG16×16. Public Forgeryscope branches:
microscopy, full blots, overlap, lanes. Native adapter uses probability interpolation
bilinear, masks nearest, threshold .5; source/target channel order is **target,
source, background**. Candidate support, no panels, insufficient panels, empty and
confirmed support are distinct statuses. ViG ranking has already shown amplified
native MPS differences; passing a small tensor-error threshold cannot establish
matching classifications.

TruFor anomaly, confidence, Noiseprint++ and image score are distinct outputs.
SAFIRE source clusters/confidence, FOCAL clusters and probability/threshold masks
from CAT-Net/AdaIFL must keep their own meanings. Different color maps are not
interchangeable segmentation results.

## Weight receipt boundaries

`various.median` preserves the native feature formats8/24/96/128, window/level
ordering, extra black64 blocks and zero grid border. Its validity/decision masks
are block-grid data, distinct from the cropped linear64 RGB view. Score mode,
variance, threshold and optional3×3 score median are separately tested. Only the
existing local128-feature checkpoint has complete real-model browser evidence;
the other feature layouts do not establish the validity of arbitrary models.

Present paths and sizes are in `weights-inventory.json`; duplicate checkpoints
are listed as separate paths. The refreshed inventory has 193 component files:
40 model files and 51 TensorFlow index/data/meta sets (153 files), not193 models.
D2PRL's final checkpoint has now been received and independently hash-verified;
its OSN training checkpoint is also local but unnecessary for inference. Native
strict loading and inference have separate evidence. Complete browser CPU/GPU
and real multi-zone chains now pass their declared synthetic corpus. Final
common-worker delivery and WordPress integration remain separate gates; see
D2PRL-WEB-STUDY.md. Raw signed448 grids, filtered role masks and continuous union
maps have separate exported semantics, with no substitute class probabilities. No weight redistribution permission is inferred from receipt.

Two historical groups remain blocked: six exact luc_pub YOLO weights
(epoch20_0/42/123/456/789.pt and best.pt), and extra Forgeryscope competition
ensemble/segmentation components. Public Forgeryscope checkpoints do not resolve
its missing competition extras. No checkpoint was trained, synthesized or
relabeled as a substitute.
