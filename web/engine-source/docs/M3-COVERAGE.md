# M3 delivery and large-source coverage

M3 implementation and its assigned large-source continuation are complete in
`work/m3-sparse`, delivery34 with the targeted axis correction in delivery35, on the isolated `web-engine-m3` worktree. Integration
base remains `063976d` (merge `4d37350`, API0.31.0-integration.3); only the common
OPFS helper is additionally taken byte-for-byte from stable M5 `d9f135f`.
The integration owner must reconcile the delivered branch with its current base.
No WordPress deployment, combined multi-engine qualification or publication is
claimed here. The API/UI handoff is in [CONTRACT.md](../CONTRACT.md), M3 section,
and [src/index.d.ts](../src/index.d.ts).

## Completed browser paths on 12000×8000 originals

Every record below completed real decoding and requested computation, original
coordinate windows, a cached view/refilter, complete scientific/result export and
resource release. All use one 6 GiB budget (6442450944 bytes); reported peaks are
shared-budget accounting, not process RSS. Times include load, view and exports,
on a shared development machine, and are not controlled speed comparisons.
All final retained/cache/active counts are zero. Proofs pin source SHA, controls,
backend and output hashes. The commit column identifies the proof's delivery;
`lot34` means the commit containing this document.

| Family / covered variants | Backend | Time, s | Peak bytes | Points / matches or pairs / groups | Proof commit |
|---|---|---:|---:|---|---|
| [Historical ORB](m3-historical-96mp-orb-webgpu-proof.json) | webgpu | 125.893 | 4966052794 | 501 detected, 500 selected / 214 / 153 | `c740394` |
| [Historical BRISK](m3-historical-96mp-brisk-webgpu-proof.json) | webgpu | 1615.873 | 5409905124 | 9721597 detected, 14811 selected / 14742 / 14726 | `890b8f8` |
| [Historical AKAZE](m3-historical-96mp-akaze-webgpu-proof.json) | webgpu | 116.933 | 6440481767 | 175544 detected, 72 selected / 72 / 26 | `lot34` |
| [CM2 SIFT / RootSIFT](m3-sparse-96mp-sift-webgpu-proof.json) | webgpu | 109.507 | 4070696782 | 6000 / 2998 / 1 | `0aaf98a` |
| [CM2 G2NN + RANSAC](m3-sparse-96mp-sift-g2nn-ransac-webgpu-proof.json) | webgpu | 69.557 | 4073391878 | 6000 / 2064 / 1 | `c740394` |
| [CM2 Panels + Text + mirrors](m3-sparse-96mp-sift-g2nn-ransac-panels-text-webgpu-proof.json) | webgpu | 573.155 | 5213432568 | 72000 / 7817 / 22 | `890b8f8` |
| [CM2 ORB](m3-sparse-96mp-orb-cpu-proof.json) | cpu | 49.539 | 2779150652 | 6000 / 4277 / 3 | `93d2782` |
| [CM2 BRISK](m3-sparse-96mp-brisk-webgpu-proof.json) | webgpu | 220.921 | 2779150652 | 6000 / 4997 / 2 | `c740394` |
| [CM2 AKAZE](m3-sparse-96mp-akaze-webgpu-proof.json) | webgpu | 107.670 | 6440615251 | 6000 / 15867 / 2 | `lot34` |
| [XFeat](m3-sparse-96mp-xfeat-webgpu-proof.json) | webgpu | 129.799 | 4723548678 | 6000 / 2162 / 11 | `4f118da` |
| [XFeat + LighterGlue](m3-sparse-96mp-xfeat-lighterglue-webgpu-proof.json) | webgpu | 65.266 | 4797999968 | 6000 / 23 / 1 | `890b8f8` |
| [ALIKED / rotation](m3-sparse-96mp-aliked-webgpu-proof.json) | webgpu | 95.242 | 3051434484 | 1932 / 55 / 2 | `5c2cb2c` |
| [ALIKED CPU](m3-sparse-96mp-aliked-cpu-proof.json) | cpu | 82.128 | 2851156468 | 1932 / 55 / 2 | `5c2cb2c` |
| [ALIKED + LightGlue / rotation](m3-sparse-96mp-aliked-lightglue-webgpu-proof.json) | webgpu | 425.944 | 3385057385 | 1932 / 515 / 8 | `b7974f6` |
| [SIFT + LightGlue](m3-sparse-96mp-sift-lightglue-webgpu-proof.json) | webgpu | 221.307 | 4968228218 | 6000 / 1714 / 1 | `890b8f8` |
| [SAFIRE](m3-research-96mp-safire-proof.json) | webgpu | 27.915 | 4263107794 | Native fixed grid; model-specific arrays | `7f197c1` |
| [FOCAL](m3-research-96mp-focal-proof.json) | webgpu | 55.805 | 2284701484 | Native fixed grid; model-specific arrays | `7f197c1` |
| [AdaIFL](m3-research-96mp-adaifl-proof.json) | webgpu | 68.388 | 2413351378 | Native fixed grid; model-specific arrays | `7f197c1` |

Historical and sparse runs include complete PNG plus JSON or NPZ. Every exported
288000000-byte RGB raster is independently compared with native drawing of the
exported arrays; the corresponding `m3-96mp-{historical,sparse}-export-*-proof.json`
records are separate from extraction/inference qualification. Research runs each
export all model-specific scientific arrays as NPZ, verified by NumPy without
pickle. The shared full-resolution research raster/export path is exercised by
FOCAL's complete PNG, with all288000000 bytes matching native render. SAFIRE and
AdaIFL reuse that surface/export implementation; their different native display
modes have separate small exact render comparisons.

Sparse/classical/historical sources use deterministic full-resolution RGB noise
with an entire6000×8000 half copied at dx6000. ALIKED uses a multiscale textured
copy source (native1024 analysis grid). Panels/Text uses three3840×7840 rich panels,
white gutters, text and an actual horizontal reflection; OCR visits54 tiles,
returns29 boxes and retains native exclusions. Research sources have full-resolution
noise and two distant copied patches including a reflection. Exact hashes and
parameters reside in each proof. No low-resolution preview substitutes for loading
the original. Native research/ALIKED1024 preparation remains part of those methods.

## Shared variant coverage and arithmetic scope

- SIFT and RootSIFT share global octave fields, global NMS/Newton continuations,
  native rank/masks and bounded descriptor storage. RootSIFT adds its existing
  per-descriptor normalization without a new image-sized allocation. Its native
  small pipeline oracles cover that arithmetic; SIFT96 MP covers the common memory
  path. G2NN retains native ROI scaling, global top-four comparisons and dedup order.
- Standard/rotation ALIKED use different registered weights and exactly the same
  row preparation, network shapes, feature buffers and coordinate mapping. Both
  retain small native pipeline comparisons; ALIKED CPU/GPU96 MP covers their
  common memory adapter. Their CPU/GPU point residuals are measured separately.
- The original ALIKED+LightGlue full graph has its own completed96 MP run. The new
  paged ALIKED/rotation LightGlue shares the9-layer,4-head,256-channel attention
  adapter exercised at35993944 global edges by SIFT+LightGlue96 MP. All three
  learned families have distinct native confidence and complete small pipeline
  comparisons; XFeat's6-layer,1-head adapter has its own35992512-edge96 MP run.
  No candidate pruning or independent-tile attention is introduced.
- Historical AKAZE describes all175544 detected points before its native response
  filter; CM2 ranks its6000 requested points first. These are distinct qualified
  memory paths. Historical BRISK likewise has its own full-population detection
  and response-selected native descriptors; its14742 matches/14726 overlapping
  groups exercise stored JSON and repeated native drawing at real large load.
- Independent regions, compare, overlap ownership, original-coordinate polygons,
  masks/exclusions, reflected extraction, caches and cancellation retain their
  targeted native/API corpora. Panels/Text additionally exercises their combined
  path at96 MP. This is not an exhaustive96 MP matrix of every setting or browser.

[Method delivery](M3-SPARSE-DELIVERY.md), [resource continuation](M3-RESOURCE-REPRISE.md),
[paged SIFT](M3-SIFT-PAGED.md), [paged AKAZE](M3-PAGED-AKAZE.md),
[paged attention](M3-PAGED-ATTENTION.md), [Panels/Text](M3-PANELS-TEXT-LARGE.md),
[historical methods](M3-HISTORICAL-LARGE.md) and [stored JSON](M3-LARGE-RESULT-FILES.md)
detail implementation, native references and numerical effects. The resource
continuation document is chronological: earlier open limitations are superseded
only by the later explicit proofs listed here.

Classical ordered integer/Hamming decisions remain exact on the relevant corpus.
Accelerated learned floating computations are not universally bit-exact. Paged
Glue small confidence maximum errors reach5.74e-4 GPU/9.11e-5 CPU; the full XFeat
pipeline score maximum is8.88e-4 GPU. All tested final pair/group/RGB decisions
remain the same. AdaIFL's separate CPU qualification has one differing binary mask
pixel among4096 at the unchanged0.5 threshold (GPU mask exact on that case).
The linked method proofs give max/mean, units, platform and retained CPU reference;
continuous tolerances are never applied to a binary label or identity. New AKAZE
relaxed SIMD was exact on36044800 compared values on qualified Chromium/ARM64;
that platform observation is not a universal fused-rounding guarantee.

## Integration and remaining physical constraints

The14 assigned CM2 variants, historical BRISK/ORB/AKAZE, SAFIRE, FOCAL and AdaIFL
are available through main/worker APIs with typed controls, provenance, progress,
cache/view separation, cancellation and exports. M3 has not taken the dense CM2
or CMSeg/MGCF families owned elsewhere. Models stay external and pinned; new
`xfeat-paged` and `*-glue-paged` identities must be registered explicitly to use
those paths. Missing models/storage/memory return concrete errors, not substitute
algorithms. There is no runtime calibration, canary or synthetic benchmark.

Removal of artificial populations does not promise unbounded computation. Native
postprocessing/output arrays and full-resolution sparse drawing still need real
admission. The large AKAZE proofs approach6 GiB tightly and use OPFS; browser
quotas and available GPU/CPU/WASM resources remain physical constraints. Native
historical BRISK overlapping drawing is expensive (1033s of its1616s full run),
and remains unchanged. Actual failed useful jobs can reduce concurrency/batches;
finished scientific data and global domains are preserved. UI integration and
cohabitation with other engines under a shared product budget belong to the
separate integration/WordPress acceptance stage.


The targeted post-closure correction in [M3-ELONGATED.md](M3-ELONGATED.md) removes
the residual16384 axis refusal throughout historical/source/CM2 entry points.
Its positive24000×4000 AKAZE pipeline and inverted-axis native controls complement
the original records above; they do not replace or rerun the18 acquired paths.
