# Forgeryscope public browser port — M2

Status: public pipeline callable through an explicit component API, with the
numerical limits below. No complete detector is enabled in the common registry.
The native public pipeline
is the reference; competition extras remain separate.

## État courant de la livraison

Les cinq profils ont leur chaîne publique réelle et le contrat worker commun
est livré dans `M2-WORKER-CONTRACT.md`. Les preuves complètes incluent Auto positif
sur une figure publique 2008×1444 et microscopie miroir, CPU/WebGPU, toutes couches
finales exactes. Chevauchements et pistes ont aussi leurs cas positifs exacts.
Les parcours source96MP Auto/blots, pistes et microscopie sont maintenant qualifiés
pour charge/API/mémoire : voir FORGERYSCOPE-SEGMENTED-M2.md et
FORGERYSCOPE-SIFT-PAGED-M2.md. La limite duplicate dégénérée reste **296 pixels
de bord différents** avec ALIKED sans fusion BN (196 avec l'ancien export et
l'affine corrigé) ; YOLO garde des écarts float bruts décrits
plus bas. Ces limites empêchent une affirmation de parité intégrale universelle.

Les sections numérotées suivantes retracent les livraisons : leurs mentions de
travaux « à faire » décrivent leur date. Les sections finales et ce résumé donnent
l'état actuel. Registre public, publication et panneau WordPress restent à intégrer
par leurs responsables ; aucun complément privé du concours n'est fourni.

## Delivered decision stages

`src/forgeryscope-decisions.js` preserves five profiles, panel label/exclusion
selection, the three embedding thresholds, maximum-score duplicate/overlap union,
strict two-axis intersection margin, and Auto's lane gate before intersection
filtering. Geometric support requires no fallback key, at least 8 inliers and
mean match score >=0.73. Standalone profiles keep unsupported masks as candidates;
Auto accepts blot similarity evidence and rejects unsupported microscopy.

Lane stages preserve transitive same-panel overlap groups (intersection area
strictly >25), best score per group pair, first candidate on ties, source pixel
coordinates, and >50% whole-panel expansion counting match occurrences. Mask
writes use native truncation/slicing and remove excluded pixels. The union is
written into one caller-owned admitted buffer rather than one full image per
panel pair. Similarity values are supplied by the network backend; this module
does not approximate the normalized dot products. Grouping uses linear storage;
matching does not materialize the quadratic similarity matrix. Cancellation yields
between rows, with no partial-success return after cancellation.

Validation: `node --test tests/forgeryscope-decisions.test.mjs` passes eight tests.
Seven synthetic cases execute the unchanged native lane functions, comparing
all matches, groups and final union pixels exactly. The fixture records its source
hash and NumPy 1.26.4. Other tests cover Auto's lane gate, profile distinctions,
exclusions, thresholds and cancellation. These are decision tests, not neural
inference or scientific accuracy evidence. Regenerate only with
`scripts/generate-forgeryscope-decisions.py`; output is worktree-local.

## UI component contract (common registry not enabled)

- Profiles: `auto`, `microscopy`, `duplicate`, `overlap`, `lanes` map to the five
  native names. Auto uses detected panels in the active global envelope. Manual
  paired panels belong to the standalone profiles. Exclusions touching a panel
  remove it before embedding/matching.
- Coordinates: original image pixel coordinates, float detector boxes, integer
  truncation only at crop/mask stages. Keep source image identity and envelope
  origin when projecting local results. Never turn separate ROI jobs into a
  cross-job panel comparison.
- Results: mask, float map, candidate evidence; Auto additionally geometric
  evidence and microscopy/blots/lanes masks. Export panel IDs, embedding scores,
  geometric support, inliers, match scores, polygons, transforms/fallbacks,
  lane pairs and clique groups. These maps are not calibrated probabilities.
- Branch visibility/filtering uses stored branch masks and does not rerun models.
  Cache invalidation must include original SHA, source scope/exclusions, model
  identities and preprocessing identity. AbortSignal and real stage progress are
  required throughout. No calibration, canary or benchmark before useful work.

Remaining for a fully qualified detector: microscopy chain and positive Auto
qualification, the duplicate-mask boundary discrepancy below, large-image result
surfaces and common-worker operation registration/distribution.
The following deliveries qualify network components independently. No UI availability or complete engine claim follows
from the primitive delivery.

## Seventh delivery: ALIKED heads, geometry and clique grouping

The tuned DKD/SDDH heads export with dynamic image sizes and point counts.
Local score patches are gathered directly, preserving the native equations while
avoiding its 25-times-image unfold buffer. The wrapper matches unmodified native
Torch exactly before conversion. NMS selection retains threshold fallback,
border removal, 512-point limit and native C++ unstable score ordering.

Isolated heads preserve all 512 selected indices for each of three cases on CPU
and mixed WebGPU. Maximum descriptor error is below 2.1e-6, offsets below 2.9e-5.
The composed dense+heads WebGPU study passes its existing 1e-4 bound. CPU keeps
exactly the same point **sets**, but exchanges the order of 2/8 points on the first
two periodic textures. Its order-sensitive proof remains `passed:false`; final
LightGlue/geometry qualification is still required. The score-map proof alone
must not be interpreted as complete extractor equivalence.

The native Forgeryscope matcher explicitly calls extraction with `resize=None`.
Consequently its crops stay at original resolution: the ALIKED class default of
1024 is overridden and must not be applied by this adapter.

Native OpenCV 4.11 `estimateAffinePartial2D` RANSAC and `estimateAffine2D`
USAC_MAGSAC run in the WASM preparation module. Five point-pair cases include
outliers and all microscopy transforms. Inlier counts/mean scores match exactly;
maximum affine difference is 2.44e-5 for MAGSAC. Polygon overlap uses the affine
rectangle geometry, retaining float32 projection and the native W/H flip offsets.
Twenty bbox/polygon mask comparisons against Shapely/skimage are pixel-exact.
The native score reductions, full-box blot fallback, crop bounds, translations
and inclusive polygon versus exclusive bbox borders are retained.

Clique metadata preserves maximal cliques, largest-first priority, first-group
ownership of shared edges, duplicate-pair overwrite and original pair indices.
CPython 3.11 integer-set iteration is reproduced because JS insertion order
changes group ownership. Three native graphs include shared triangles, sparse
colliding IDs and duplicate pairs. Storage consists of pair polygons and indices;
no full-image mask is allocated for every pair or clique. Sixteen focused Node
tests pass; `forgeryscope-geometry-wasm-proof.json` records actual estimator runs.

## Eighth delivery: actual composed runtime and explicit component API

`createForgeryscopeAnalyzer` is exported from `src/index.js`. It accepts explicit
model assets (URL, SHA-256, byte count and preprocessing metadata), bounded ORT
runtime URLs, the preparation factory, and optional shared SIFT factory/identity.
The local manifest generator supplies these identities without embedding weights.
`analyze(rgb8, {profile, panels?, exclusions?}, {signal, onProgress, backend})`
returns native `mask/map/candidates`, Auto's separate `geometric/branch_*` maps,
panel/comparison/group/lane metadata and a `release()` for the result allocation.
Coordinates stay in the supplied source image. Input must be the full analysis
envelope; independent regions must remain independent calls. `clearCache()` and
`dispose()` release sessions and caches. No five-profile availability declaration
is inferred from the presence of this API.

Actual model downloads check exact byte counts and SHA-256. ORT instances live in
terminable module workers with a real admitted WebAssembly memory maximum; no
numerical WASM bytecode is patched. Useful jobs begin immediately, up to the CPU
and shared-memory capacity. Memory admission reduces embedding batches from the
native maximum of eight, or grows an admitted heap after a real allocation failure.
GPU failures can retry the same useful job on CPU. No warmup, synthetic inference,
calibration or benchmark runs in this runtime. Idle model sessions are reclaimable.
Result caching includes source pixels/dimensions, parameters, backend, model and
SIFT identities. Similarity matrices stream by rows. Final dense maps still need
admission in RAM; a segmented result-surface adapter remains to do.

CPU and WebGPU browser lifecycle studies pass: two useful jobs execute, real
inference is cancelled by worker destruction, a following job succeeds, and all
leases/retained workers return to zero. Unit tests cover queued cancellation,
admission refusal, identity failure, output lifetime and one bounded-memory retry.
The WebGPU path uses ORT 1.30's asyncify factory, with CPU-assigned nodes explicit.

The actual CPU blot chain returns the native 512/512 and 375/349 match/inlier
counts for two cases. Mean-score error is 5.96e-8; affine error at most 8.525e-5.
The full public-profile study passes the positive overlap mask exactly (13993
pixels) and the positive lane candidates exactly (116056 pixels, four matches).
Auto's lane-search case matches every output map and decision (empty result).
**The positive full-duplicate case has 296 mask/map border-pixel differences**
despite the same positive comparison/status. The strict public proof remains
`passed:false`. Tiny affine differences followed by native integer bbox truncation
must be resolved or explicitly adjudicated before claiming complete equivalence;
no epsilon snapping or broadened mask tolerance was introduced.

SIFT reuses M3's arithmetic object read-only, recording its SHA in the local build
manifest. This adapter has Forgeryscope's own settings: no resize, RGB/255 float32
Kornia grayscale with uint8 truncation, OpenCV 4096 points/4 octave layers/.0066667
contrast/10 edge threshold, response/angle duplicate filtering, radians, and true
RootSIFT. Two native references preserve all 41/79 points, coordinates, responses
and scales exactly; four angles differ by at most 9.54e-7 radians and normalized
descriptors by 5.96e-8. This does not generalize M3's entire SIFT qualification or
yet qualify the complete microscopy chain.

Common file changed: `src/index.js` adds one named export. The operation registry,
main worker messages and distribution manifests are unchanged. The coordinator
must merge this export once and carry the M3 numerical-object dependency when
assembling. B must keep the complete profiles unavailable until their outstanding
boundaries are resolved. Sources and scripts are ready for review now.

## Second delivery: actual embedding networks and preprocessing

The four verified public NextViT checkpoints now have reproducible ONNX exports
(opset 18, dynamic batch, normalized 1024-component embeddings). The microscopy
attention pooling and all three blot/lane networks are preserved. Export scripts
write into this worktree's `.build/forgeryscope`; weights are not in Git.

Chrome 154 study: twelve real CPU/WASM inferences, maximum absolute embedding
error 1.8440186977386475e-7; twelve WebGPU inferences, maximum 1.4156103134155273e-7.
Twelve image-pair score decisions per backend are unchanged on these synthetic
inputs. The pair study uses the same double dot reduction on both sides to isolate
network conversion; it does not qualify the final Torch/NumPy similarity reduction.

The C++/WASM preprocessing implements native uint8 OpenCV linear resize,
LongestMaxSize using Python ties-to-even rounding, centered zero padding, final
resize, and Albumentations float32 normalization. All twelve native input tensors
match exactly (967680 float values). The overlap preprocessing intentionally
resizes a square intermediate to 320x64 when required by the published transform;
it is not replaced by a different aspect-preserving transform.

Proofs: `forgeryscope-embeddings-{wasm,webgpu}-proof.json`,
`forgeryscope-prepare-proof.json`. These studies qualify components, not a complete
Forgeryscope detector or all possible image pairs. YOLO, feature matching,
geometric verification, composed masks, memory lifecycle and product API remain.

Reproduce with the native clone-detector environment, `PYTHONDONTWRITEBYTECODE=1`,
`NO_ALBUMENTATIONS_UPDATE=1`, local YOLO config, and local ONNX Python modules:
`export-forgeryscope-embeddings.py`. Set `EMSDK` and use
`build-forgeryscope-prepare.py --opencv-build <existing-read-only-build>`.
Use `EM_FROZEN_CACHE=1` to prevent SDK cache writes. Browser studies read ORT from
`FORGERYSCOPE_ORT_DIST`; servers use an available ephemeral loopback port and stop
their own instance. No existing server is stopped and no shared assets are written.

## Third delivery: YOLO preparation and decisions; numerical boundary explicit

Both public YOLOv11 checkpoints export with dynamic rectangular input dimensions.
`src/forgeryscope-yolo.js` ports native best-class selection, class-offset NMS,
confidence thresholds (.7/.3), overlap thresholds (.4/.1), detector order,
source-coordinate projection, excluded labels and minimum crop side.
Six native synthetic NMS cases pass exactly, including confidence ties and class
separation. Eleven decision tests now pass in total.

The extended Chrome study starts from RGB bytes, including two existing public
Forgeryscope examples. Eight CPU/WASM and eight WebGPU inferences retain the same
boxes/classes: the positive cases include 20 microscopy panels and four blot
lanes. All input tensors are exact. All postprocessing outputs are exact when
fed the native prediction tensors. Model-conversion differences reach
0.000244140625 source pixels (WASM), 0.0001220703125 (WebGPU). Both strict <=1e-4
studies remain **passed:false**; no tolerance has been widened. There are zero
integer crop-coordinate changes in these cases. This does not prove absence of
changes near every possible pixel/threshold boundary. Full raw box errors and
score errors are preserved in the proofs; subthreshold anchors can differ more.

The native ndarray call reverses channels inside Ultralytics even though the
Forgeryscope caller supplied RGB. The port preserves that behavior explicitly;
correcting it would change the model's input and requires a separate decision.

The source/example tensors and weights remain external. Native script config and
build outputs stay under the worktree. The initial YOLO conversion triggered an
Ultralytics temporary-config fallback before its directory was created; subsequent
scripts create the worktree config directory before importing Ultralytics.

These are component deliveries, not permission to enable Auto or the four
standalone profiles in the product. Remaining feature extraction and LightGlue
geometry are substantive dependencies. M3 is investigating SIFT numerical parity;
M2's LightGlue work preserves the distinct tuned blot checkpoint and adaptive
microscopy decisions. No other chat was messaged.

## Fourth delivery: tuned blot LightGlue graph

The tuned matcher inside `aliked_wblot.pth` now exports through the dynamo path,
with dynamic feature counts and all nine transformer layers. Blot profiles natively
use depth_confidence=-1 and width_confidence=-1; microscopy .9/.9 remains separate.
The wrapper omits only unused compact-index bookkeeping and unused dustbin values,
keeping the exact core log assignments and native mutual-match/score decisions.
Its matches and scores are bit-identical to the unmodified native model in Torch.
This avoids two exporter defects (legacy rank canonicalization and dynamic scatter
into unused dustbin slots), without modifying native sources or model weights.

CPU/WASM on native synthetic descriptors of 32x40 and 73x51 points: 16 and 25
matches retained exactly, score error <=1.7881393432617188e-7. See the CPU/GPU
LightGlue proof files for the measured provider results. This qualifies the
matcher component on those inputs, not ALIKED feature extraction or geometry.
The independent local exporter dependencies are `onnxscript==0.4.0` and
`onnx_ir==0.1.9`, installed only in `.build/m2-export-deps` (not shared node_modules
or the native environment). Empty feature sets must bypass this nonempty graph.

Provider qualification: all three WebGPU study families report some ORT node
assignments on CPU. They are **mixed WebGPU/CPU executions**, not GPU-only proofs.
The same 16/25 blot matches and <=1.78814e-7 score errors pass with this provider.
No speedup is inferred from study timings. CPU remains a separately tested path.

## Microscopy adaptive control

`src/forgeryscope-lightglue-control.js` ports all eight intermediate confidence
thresholds, early stopping **before** pruning, original-point denominator after
pruning, low-confidence protection and original index/prune-count tracking.
The ninth layer does not stop/prune. It preserves CPU/MPS native pruning policy
regardless of the selected browser provider, rather than silently adopting CUDA's
1024-point shortcut. Twenty-four native boundary/control oracles are exact,
including values immediately above/below thresholds and already-pruned totals.
Thirteen decision tests now pass. Neural microscopy layers and remapped match
assembly remain to connect; this module alone is not a microscopy detector.

## Sixth delivery: composed adaptive matcher and real ALIKED dense maps

Microscopy LightGlue is split into nineteen graphs (initial projection/encoding,
nine transformer layers, nine layer-specific assignment heads). The development
composition in `experiments/forgeryscope/micro-matcher.js` applies the tested native
controls and preserves original point IDs. It loads one graph session at a time;
this is not yet a qualified production memory policy or performance optimization.

Three native synthetic feature pairs exercise real pruning and early termination:
4/4/6 layers, 15/46/6 retained matches. CPU/WASM and mixed WebGPU/CPU preserve
all matches, stop decisions and prune counts. Maximum score error is 3.528595e-5
(CPU) and 3.659725e-5 (mixed). SIFT extraction and geometric verification remain
separate; no fixed-depth proxy replaces the adaptive matcher.

The tuned blot ALIKED dense graph uses the actual ONNX DeformConv operator,
including learned offsets and all native convolution weights. Dynamic offset
clamping preserves max(height,width) for both portrait and landscape tensors.
Native replicate padding/unpadding remains in the graph. CPU/WASM tests cover
96x128, 160x128 and odd 97x129 tensors: feature error <=5.514e-7, score-map error
<=1.377e-5. This is the dense encoder, not final keypoint/descriptor parity.
The NMS/subpixel detector, learned descriptor head, Kornia image preprocessing,
source coordinate remapping and end-to-end matching still need implementation.

All graph files remain in the worktree build directory. The source/proof delivery
contains no weights or example images. Neither this work nor the preceding lots
changes the public operation registry or enables an unfinished UI panel.

The same three ALIKED dense cases pass with mixed WebGPU/CPU execution:
feature error <=5.477e-7 and score-map error <=1.395e-5. This does not yet establish
keypoint selection parity at every threshold or descriptor/mask equivalence.

## Microscopy chain and final component contract additions

The complete SIFT → adaptive LightGlue → affine/overlap chain now passes on CPU
and mixed WebGPU for a real extracted random texture and its horizontal mirror.
Both cases retain all 41 native matches/inliers and the correct transform; CPU
mean-score error is 1.79e-7, mixed GPU score is exact, affine error <9e-16. See
`forgeryscope-micro-chain-{wasm,webgpu}-proof.json`. This replaces the earlier
"microscopy chain remains" limitation for these component cases. Positive Auto
with detected panels and the duplicate-mask boundary remain separate.

The adaptive matcher is now a production source module under `src/`, so it does
not require serving development experiments. Result width/height and typed APIs
are explicit. `exportNpz(result)` preserves map, mask, candidates and every Auto
branch, native comparison metadata and browser provenance. It returns a lease.
Configuration is copied at construction and runtime/layout/optimization identities
are included in cache keys, preventing reuse after a changed runtime configuration.

## Public Auto positif, microscopie complète et ordre affine

Deux profils supplémentaires passent de bout en bout CPU et WebGPU :
microscopie sur une texture et sa réflexion horizontale (25 026 pixels positifs),
et Auto sur la figure publique `kaggle_test_img_45.png`, 2008×1444. Auto détecte
huit panneaux, produit la même comparaison positive et exactement les mêmes
78 640 pixels dans toutes les couches natives ; le contrôle des pistes prend
la même branche. Aucune détection ni aucun embedding injecté dans ce test.
Références/proofs : `generate-forgeryscope-positive.py`,
`study-forgeryscope-positive.mjs`, `forgeryscope-positive-*-proof.json`.

`build-forgeryscope-affine.py` rend explicite le FMA float32 puis float64 du
solveur minimal affine OpenCV 4.11. Il conserve USAC/MAGSAC, échantillonnage,
score, dégénérescence, affinage et seuils. La bibliothèque partagée est lue
uniquement ; l'objet corrigé est compilé et lié dans le worktree. Les SHA du
fichier amont, fichier produit et objet figurent dans `affine-build.json`.
Sur les 512 points identiques du diagnostic, le solveur WASM corrigé donne la
même matrice que le vrai OpenCV natif recevant ces mêmes points.

La contre-preuve du duplicata synthétique est affinée : les 296 pixels de bord
différents deviennent **196** après cette correction ; l'ancienne preuve n'est
pas réécrite. Le reste provient des arrondis des coordonnées ALIKED en entrée,
qui modifient la matrice près de l'identité puis les signes de coordonnées
quasi nulles avant troncature. Le calcul géométrique recomposé sur les points
navigateur donne les mêmes polygones que le natif sur ces points. Ce cas reste
en échec (`forgeryscope-affine-public-wasm-proof.json`) : ni snapping, ni epsilon,
ni changement de masque pour dissimuler ce résultat. Les profils positifs réels
ci-dessus sont qualifiés sur leur corpus, sans promesse de parité des bords
sur ce cas dégénéré.

Le client hôte M2 peut garder masques et cartes dans le worker et les exposer
par fenêtres (`M2-WORKER-CONTRACT.md`). Les sorties du calcul interne restent
denses et admises ; une lecture segmentée ne qualifie pas à elle seule toutes
les tailles. Aucun complément privé du concours n'est annoncé.

## Reprise : correction du cas réel M5 par ALIKED non fusionné

Le manifeste utilise maintenant `aliked-blot-dense-unfused.onnx`, export sans
repli des BatchNorm dans les convolutions et `graphOptimizationLevel:'disabled'`.
Les poids, couches, NMS, limite native 512 et matcher restent inchangés. Le vieux
export fusionné est reproductible avec `--legacy-fused` ; il n'est plus le défaut.
`export-forgeryscope-aliked-heads.py` lit les références de la voie non fusionnée.

Cause isolée du cas public M5 : un point NMS du second panneau changeait après
fusion arithmétique, ce qui modifiait le contexte global du matcher et son score.
La voie corrigée conserve tous les points natifs (quelques permutations de scores
presque ex aequo restent), puis toutes les correspondances une fois les indices
alignés. Score : écart 1,073e-6 au lieu de 1,432e-3. Polygones : max 9,35e-5 pixel
au lieu de 0,04523 pixel ; premier polygone max 7,52e-6 pixel. Même paire, mêmes
280 inliers, sept couches raster exactes, 78 640 pixels positifs. M5 reste seul
propriétaire des identités/couleurs de vue ; aucune identité attendue n'est injectée.

Le contre-exemple duplicate synthétique reste numériquement dégénéré : mêmes
512 correspondances, même score, coordonnées max 4,11e-5 pixel, mais **296 pixels
binaires de bord** différents sur cette voie (contre 196 avec l'ancien export
et le solveur FMA corrigé). Intersection/union des masques : 19 100 / 19 396,
IoU 0,984739. Ce n'est pas présenté comme une erreur flottante acceptée d'un
label binaire ni comme un test passé. La géométrie près de l'identité amplifie
les arrondis à la troncature entière. Aucun snapping ni nouvel estimateur.
Les deux cas restent rapportés ensemble pour ne pas dissimuler ce compromis.

Preuves et reproduction : `diagnose-forgeryscope-native.py`,
`diagnose-forgeryscope-browser.mjs --variant=unfused` et
`forgeryscope-diagnostics-unfused-wasm-proof.json`. La preuve standard archivée
explique la première divergence de sélection et les 511 correspondances communes.
Les références binaires se régénèrent dans .build, pas dans les fixtures partagées.

## Extension source/ALIKED

Voir [FORGERYSCOPE-SEGMENTED-M2.md](FORGERYSCOPE-SEGMENTED-M2.md) pour le nouveau
chemin source original, les banques ALIKED et les résultats/export sans copies
complètes. Les limites SIFT et bords dégénérés restent explicites.
