# M3 sparse engines — delivery and implementation history

## Current delivery status

All assigned M3 implementations are delivered: historical BRISK, the14sparse
CM2 profiles, SAFIRE, FOCAL and AdaIFL. Main and worker APIs expose model
registration, analysis, separate view controls, native-shaped JSON/NPZ exports,
progress, cancellation and cache reuse. See [CONTRACT.md](../CONTRACT.md) and
[src/index.d.ts](../src/index.d.ts) for the integration contract. WordPress
assembly and publication belong to B and A; the six dense CM2 profiles belong
to M4 and are not counted as M3 deliveries.

CPU/WebGPU paths, useful independent ROI workers, bounded attention/distance
batches, staged model lifetimes and shared memory admission are implemented.
No calibration or benchmark runs before user computation. Segmented sources
can obtain full-resolution oriented RGB leases when source, output and native
workspace fit the budget; this is not unrestricted out-of-core inference.
The60MP segmented JPEG BRISK recipe completes under3GiB.

Proofs record concrete numerical limits, not new acceptance thresholds:
SAFIRE has up to8label differences per1024² on the tested regroupings; AdaIFL
CPU has1mask difference per4096, while its tested GPU mask agrees. FOCAL labels
agree on its CPU/GPU recipe. One XFeat+LighterGlue CPU recipe differs in289RGB
components. BRISK orientation boundaries and native/browser OCR versions can
change decisions. Native algorithms and thresholds remain unchanged; these
results do not establish universal bit parity or coverage of every device.

**The chronological lot notes below describe each delivery at its date.**
Statements such as “not registered”, “remaining” and “next” in older lots are
historical and superseded by later lots and the current public API section.
The current status is also recorded in `engine-registry.json`.

## Lot 1: exact SIFT G2NN matcher

Internal module `src/sift-g2nn.js`, independent WASM kernel
`vendor/sift-g2nn/sift-g2nn.{js,wasm}`. No public operation registered yet:
this is a qualified matching primitive, not a complete CM2 detector.

`await siftG2nnMatch(input, hooks)` consumes packed `Float32Array[N,7]`
points (original pixel coordinates: x, y, size, angle, response, octave,
class_id), native quantized `Float32Array[N,128]` descriptors,
`Uint8Array[N,zoneCount]` memberships, radius/minimum in pixels and ratio.
Optional `compare`, per-zone `radii`, compact `axes`, comparison `gap`,
`Uint8Array[N]` reflection frame identities follow native SIFT G2NN semantics.
Only genuine reflected-image descriptors may be assigned the mirrored frame.
`remapReflectedSiftPoints` maps already extracted mirrored points back.

Output: `Float64Array[M,4] pairs` = source index, destination index,
normalized descriptor distance, spatial distance; `Int32Array[M]
pairSearchRegions` = search zone or -1 for Compare; candidate comparison
count. Contexts remain independent before nearest-neighbour selection, and
repeated pairs in overlapping search contexts are preserved separately.
This makes provenance explicit for the validated v2 composition contract;
the old native global-extraction first-common-zone attribution is not copied.
Within a context the native symmetric pair deduplication/order is preserved.

Hooks require the shared owner's `reserveMemory(bytes)` admission callback;
`signal` and `onProgress(fraction)` support cancellation and real query progress.
No calibration/preflight is executed. Allocation is linear in inputs plus
accepted pairs, with top-four scratch storage, never a quadratic matrix.
The current implementation is a scalar WASM CPU primitive, not a GPU or
multi-worker performance claim. One query is the native cancellation unit.
A fresh module per call bounds retained heap lifetime; caller caches returned
matches by extraction identity plus all matching parameters. No render, model,
mask, export controller or standalone cache is provided in this lot.

Validation: ten native oracle cases (including real extracted SIFT descriptors,
spatial prefilter, comparison gap, overlapping contexts, compact axes,
reflection frames, ties, empty/short inputs), exact equality of every pair,
owner and comparison count. Tests also cover admission, cancellation/retry,
non-SIFT rejection, output limit and reflected metadata. 12 tests passed.
Fixture generator pins OpenCV 4.11.0 / NumPy 1.26.4 and native source hash.
All fixtures are generated public texture/arrays in `tests/m3-data`, no shared
fixtures modified. Build script uses Emscripten 4.0.15 and writes only here.

Next: faithful extraction SIFT per ROI, image normalization/resizing and masks;
then geometry, panels (`subimages.detect`), real Tesseract/OCR, sub-biomes and
complete API/controller qualification. No CM2/SAFIRE/FOCAL/AdaIFL availability
should be inferred from this first primitive.

## Lot 2: faithful text-box preprocessing (OCR inference not yet included)

`src/text-regions.js` ports Tesseract TSV word filtering, Python tie-to-even
padding, flat-background support, dominant contiguous band trimming, stable
confidence/overlap duplicate removal, polygon conversion and native 1536-pixel
tile coverage with 128-pixel overlap. `supportedTextBoxes` takes RGB8 and the
same shared admission/cancellation hooks. Only coordinates/confidences leave
these functions. It does not infer text or silently replace Tesseract.

Four tests pass, including exact comparison against native `text_regions.py`
on generated RGB texture, labels, upper/lower-case and Unicode text, confidence
boundaries, empty boxes and disjoint flat bands. The background scan uses a
256-bin histogram plus one row-count vector; no per-box grayscale/flat plane.
Tile/duplicate boundary and admission/cancellation checks also pass.

## SIFT extraction study: explicit remaining numerical gap

An actual OpenCV 4.11 SIFT WASM extraction was built separately and compared
against native on flat and two small generated BGR textures, retaining native
normalization and cubic x4 resize. Flat output and point counts match; texture
outputs differ in coordinates/response/angles/order and descriptor values.
On the odd-size case, count 401 matches but 173 descriptor entries differ,
with max packed-point difference 0.3073883056640625. Thus the extractor is
**not qualified or registered**, and the first lot's matcher qualification
must not be represented as complete image-to-CM2 parity. Study build outputs
are development artifacts, excluded from deliverable runtime assets.

## Lot 3: exact paired-endpoint biome components

`pairedBiomes(points, pairs, tolerance, hooks)` in `src/copy-biomes.js`
returns arrays of original pair row indices. It supports reversed pair
orientations and takes optional `Int32Array pairSearchRegions` to prevent
cross-context merging. It preserves the native geometric endpoint test,
float32 coordinate arithmetic and stable component ordering within each
context. A 4-D occupied-cell index discards visited links, bounding storage
linearly and avoiding a full adjacency matrix. Grid cells use the native
candidate sphere radius so float32 boundary candidates are not omitted.
Shared admission and cancellation are mandatory/available as in other lots.

Nine tests pass: eight native oracle cases (translations, reversed pairs,
independent contexts, disconnected small groups, large connected group,
empty input, coincident endpoints, tolerance boundary), and lifecycle/input
checks. There is no area cutoff. This primitive is reusable for regrouping
surviving geometry into sub-biomes; full model/color refinement remains later.

## Lot 4: real Tesseract OCR, bounded workers, external language data

Internal `TextRegionEngine(sharedBudget, {maxWorkers})` in `src/text-ocr.js`
provides `detect(rgb8, {language:{data,sha256}, signal, onProgress, backend})`.
`backend` is `auto` (real SIMD runtime, scalar fallback on unsupported WASM)
or `scalar`. The caller supplies the same budget used by other engines;
worker count starts at the admitted declared capacity, without a trial job.
Workers process full-resolution native tiles. Each tile initializes/ends the
native OCR API independently, preserving the native fresh-tile semantics.

The result contains `boxes`, `polygons`, detailed provenance/worker metrics,
and an idempotent `release()` for its owned output reservation. The caller must
release it on cache eviction, replacement or disposal. Progress reports actual
OCR progress and completed/total tiles. Cancellation terminates all owned
workers, including during initialization. Failed useful jobs reduce concurrency;
completed tiles are retained during retries. A genuine worker memory exhaustion
can increase its admitted heap while reducing concurrency. No preflight or
synthetic calibration exists. A running instance rejects a second job.

Only bounds/confidences cross the OCR worker boundary; recognized strings are
not returned. English traineddata stays external, is supplied explicitly and
verified by SHA-256. There is no default model CDN, language cache, download of
weights by WordPress, or inclusion of weights in Git. Runtime binaries/modules
are pinned in `vendor/text-ocr/PINNED.json`; this is runtime code, not model data.
The WASM memory section is capped to admitted pages before instantiation, with
no instruction or inference-math edits. Unit tests exercise growth rejection.

Chrome recipe `scripts/check-text-ocr-browser.mjs` (after
`scripts/generate-text-ocr-study.py`) used two actual overlapping tiles in two
workers, matched all ten final native exclusion bounds, and checked inference
cancellation, initialization cancellation, scalar execution and released
reservations. Peak reserved memory was about 436 MiB, including conservative
caps for two workers; largest observed WASM heap was 16.5 MiB per worker.
These are development observations, not a startup benchmark or a speed claim.
See `docs/m3-text-ocr-chrome-proof.json`.

Numerical/version limitation remains explicit: tesseract.js-core package 7.0.0
reports native `5.1.0-288-g2a9c1`, while the current local CLI is 5.5.3. On this
recipe confidence differences range approximately -0.83 to +0.64 points, with
identical accepted boxes. This does not establish identical decisions near
70/90 confidence cutoffs on all text. No new numerical tolerance is granted or
hidden in this delivery. The standalone OCR plumbing is real and reviewable;
the full Panels+Text profile still awaits extraction/geometry qualification and
integration, and remains unavailable in the public operation registry.

Upstream runtime: https://github.com/naptha/tesseract.js-core . The vendoring
script consumes package 7.0.0 from an isolated development installation and
appends an ESM export; no shared node_modules is changed. The distributor must
include the accompanying upstream license with these runtime files.

## Lot 5: independent ROI feature preparation and arithmetic progress

`src/sift-regions.js` prepares native floor/ceil+1 clipped crops and local
exclusions, with independent x4/1 scale policy per region. Mirrored jobs use
reflected pixel-space crops and remap extracted metadata to original source
coordinates. `projectSiftRegion` assigns only its own search context, preserving
an enclosing ROI as independent evidence. `selectUniqueSift` reproduces NumPy
float32 six-decimal centre rounding, first-index uniqueness, stable response
ranking and native 100–20000 point limits. All allocations require the caller's
shared `reserveMemory` hook. Three tests cover these contracts, including a
300-feature NumPy oracle with duplicate centres and rounding boundaries.

The SIFT arithmetic study now reproduces native cubic x4 vertical SIMD order,
float Gaussian row/column FMA order, polynomial angles, magnitude, OpenCV
exponential table/polynomial, and orientation histogram accumulation. The source
is pinned to OpenCV 4.11 source SHA-256, generated objects stay in `.build/m3`.
On the two generated texture cases, gray/normalization/resize, point coordinates,
responses, octave/class IDs and all 128-descriptor entries now agree exactly.
Remaining differences are in a small number of keypoint sizes and angles
(maximum about 0.000031 degrees/packed units); see the study report for per-field
counts. No generic tolerance or complete SIFT qualification is inferred from
these two cases. The custom extractor stays in `experiments/m3`, outside the
public runtime. Subsequent image-to-matches/RANSAC qualification is still needed.

## Geometry and postprocessing (M3 continuation)

`verifyCopyGeometry(points, pairs, groups, options)` implements independent
seeded OpenCV 4.11 fits (Similarity/Affine RANSAC, Homography USAC_MAGSAC),
5,000 iterations, confidence .995, affine refinement 10, bidirectional residuals,
unique rounded spatial witnesses and iterative model peeling. Original pair rows
and source/destination point ids are retained. Options: model, threshold (original
pixels), minimum >=4, reflection, signal, onProgress, reserveMemory. Similarity
reflection composes an actual source reflection; it is not an orientation flag.
`createGeometryKernel` permits sharing one admitted 256 MiB hard-capped WASM heap
across fit and convex-overlap filtering within a task; dispose it on completion.
Run in an engine worker so a caller can terminate an in-progress native fit.
No calibration or probe fits occur. JS scratch is admitted separately.

`rejectSelfCopies` preserves raw pairs and records rejection reasons: convex-hull
intersection/smaller area >=.8, or model median displacement below the requested
minimum (native 1e-6 boundary). `copyPalette` and `refineCopyBiomes` return native
BGR bytes, base colours, post-verification connected components and parent/part
provenance. Connected parents keep their exact colours. These APIs are usable by
M4 through the coordinator too; no dense algorithm is implemented here.

Evidence: 13 Node tests and 11 native geometry recipes in Chrome; groups, ids,
colours, sub-biomes, overlap decisions exact. Affine/Similarity matrices and error
statistics are exact on these recipes. Homography groups agree but eight matrix
coefficients differ (maximum 7.39e-13), residual statistic maximum difference
2.84e-14; recorded in m3-copy-geometry-study.json without a new numerical tolerance
or a global homography parity claim. More complicated inputs may expose additional
floating point differences. The full image pipeline remains under integration.

## Feature worker and ordinary spatial matcher

`SparseFeatureEngine(budget, {maxWorkers}).extract(rgb8, options)` executes the
real OpenCV detectors in workers. `family` is SIFT, SIFT-G2NN, ORB, AKAZE or BRISK;
`limit` 100..20000, `regions`/`excluded` source polygons, `independent` G2NN ROI
budgets, `reflected` really reverses the pixels. Output: Float64 packed points,
Float32 or Uint8 descriptors, Uint8 memberships, totalFeatures, metadata, release.
Nonempty native pack_keypoints is **float64**: the previous primitive fixtures
used float32, which remains supported, but is not the native image output dtype.
ROI offsets, rounded-centre selection and mirror mapping now retain this dtype.
The masked, independent ROI and mirrored image recipes verify that distinction.

The worker pool admits hard WASM heap caps before instantiation, starts useful
jobs immediately at available capacity, retries resource failures with a larger
admitted heap/fewer workers and preserves completed ROIs. No preliminary run.
Pinned WASM size/hash checked, streams bounded; workers terminated on cancellation.
The checked recipe reserves at most 245 MiB, finishes with zero active reservations,
and verifies idempotent result release. Heap reservation is not a claim about RSS.

ORB and AKAZE global/masked extraction matches native points, descriptors,
memberships and counts exactly on the generated RGB/copy recipe. SIFT and G2NN
(global, two independent ROIs and reflected pixels) match descriptors and source
coordinates after fixing native NORM_MINMAX float32 FMA. Angle metadata differences
remain (maximum 0.000038147 degree here). BRISK has angle/response differences;
its generic kernel remains an explicitly unqualified study, never a silent ORB
fallback. No complete public method is enabled by these extraction measurements.

`spatialCopyMatches` preserves the native Hamming or float32 L2 score and spatial
constraints before comparison, compact coordinates and comparison gap semantics.
Independent search contexts retain separate rows. A sparse grid avoids allocating
an NxN score matrix; accepted pairs are limited to 100,000. `normalizeSiftDescriptors`
implements native SIFT L2 or RootSIFT L1/square-root normalization, including NumPy
float32 pairwise reductions. Twelve tests compare binary/float/global/ROI/Compare/
compact/gap paths and descriptor normalization to native outputs without tolerance.

## Complete classical orchestration and presentation

`SparseCopyEngine(rgb8, sharedBudget, computeProfile).analyze(params, hooks)` now
composes real extraction, constrained matching, grouping, geometry and palette.
The Panels + Text variant adds existing `detectPanels`, envelope, Tesseract boxes,
exclusions, independent ROI budgets, actual reflected extraction, negative-
determinant geometry, self-match rejection and post-geometry sub-biomes. Empty
automatic panel detection returns `status: 'no-regions'`, following scope v2; it
does not silently execute a whole-image search. Explicit whole-image analysis is
represented by a source-sized region. OCR weights stay caller-provided.

Parameters use named fields (`sparseCopyParams`): algorithm, limit, radius,
minimum, threshold, tolerance, model, geometricThreshold, geometricMinimum,
regions, excluded, compare, reflections, autoRadius, compact, guides, independent.
Hooks: signal, onProgress({phase,fraction,completed,total}), language. Results keep
native snake-case provenance fields, Float64 points/pairs, Uint32 group rows,
Int32 pair_search_regions, models, BGR colours, preprocessing, rejected_biomes,
biome_partitions, original-pixel-centre coordinates and execution metadata.
Call result.release() on eviction; dispose() cancels owned workers and removes
its cache entries. Returned arrays are defensive copies. Features/matches/groups
are cached independently; changing geometry does not rerun these stages.

`renderSparseCopy(image, result, style, {signal,reserveMemory})` uses OpenCV drawing
and returns RGB8, visible rows, legend and selected groups. Style: low/high pixel
displacement, minimum distinct witnesses, chosen/hidden group ids, circles, lines,
points, areas, textExclusions. Visual changes consume cached evidence without
inference. Native hulls, half-size circles, AA lines, area fill and overlap filter
are preserved; WordPress controls and zoom ownership remain with B.

A positive-copy recipe exposed native neighbour order as a material contract:
SciPy single-point query_ball_point is unsorted. `copyTreeRanks` reproduces its
balanced compact-tree leaf permutation (pinned SciPy 1.17.1 source/LICENCE), then
the sparse grid emits candidates in that order. This replaced the premature
ascending-index order in the previous spatial matcher/reference generator.
Twenty-three native permutation cases include duplicates, identical coordinates,
leaf boundaries and real extracted points. No NxN matrix was introduced.

Chrome complete-pipeline proof: 22 cases, including positive ORB, AKAZE, SIFT,
RootSIFT, G2NN and Panels + Text reflection. Pairs, groups, colours, owners,
counts and complete RGB render agree exactly on those cases; cache reuse,
monotonic progress, cancellation and reservation release are checked. Positive
mirror case: 697 pairs, 5 surviving groups. This establishes those decisions and
renders, not universal bit parity: SIFT angle/size metadata, BRISK arithmetic,
homography coefficients and OCR confidence-version differences remain recorded.
The wrapper has no learned-detector fallback: not-yet-ported learned choices
raise UNSUPPORTED_OPERATION. Index/registry integration remains explicit work.

## XFeat — livraison progressive CPU et WebGPU

`SparseCopyEngine.analyze(params, {models:{xfeat:{data,sha256}}, backend,
signal,onProgress})` accepte désormais `algorithm:'XFeat'`. Les octets ONNX
restent externes ; `XFEAT_MODEL` publie leur taille/hash ainsi que l'identité du
checkpoint natif. `scripts/export-xfeat.py` reproduit le réseau, son resize,
NMS, masque, tri, interpolation bicubique et normalisation. Cas vide réel pris
en charge, sans inférence de calibration. Retour Float64[N,7], descripteurs
Float32[N,64], tri spatial natif. Les masques et memberships utilisent fillPoly
OpenCV et les centres source arrondis comme le natif.

`LearnedFeatureEngine(sharedBudget,profile)` exécute la tâche dans un worker
terminable. Le backend auto choisit WebGPU lorsqu'exposé, admet la mémoire puis
exécute le vrai calcul. Repli CPU seulement sur refus d'admission ou échec du
calcul demandé ; erreurs conservées dans metadata.failures. CPU forcé conservé.
Heap WASM plafonné par instance, augmentation sur échec d'allocation utile ;
mémoire GPU estimée et admise séparément, ce n'est pas une limite matérielle GPU.
ORT 1.30 utilise son module asyncify pour WebGPU, avec nœuds CPU éventuels.
Pas de prétention « tout GPU ». Threads CPU selon profil et isolation d'origine.
Runtime vendored sans poids, WASM numérique intact ; CPU réutilise celui déjà
épinglé sous vendor/d2prl. Aucune modification des actifs D2PRL.

Preuves : `m3-learned-feature-worker-proof.json` (6 cas CPU/GPU, masque, entrée
vide, annulation et refus mémoire réutilisable) ; `m3-xfeat-pipeline-proof.json`
(6 chaînes image→paires→géométrie→rendu). Points, identités/ordre des paires,
provenance et groupes exacts sur les recettes. Les recherches qui se chevauchent
conservent chaque contexte selon le contrat v2 : oracle composé avec primitives
natives, pas déduplication inter-ROI de l'ancien contrôleur. Le rejet natif des
biomes se recouvrant est appliqué aux variantes apprises.

Limite numérique mesurée : scores/descripteurs flottants diffèrent. Écart max
score de paire CPU 3,653764724731445e-5 ; WebGPU 4,470348358154297e-6 sur ces
recettes. Rendu comparaison CPU : 355 composantes RGB différentes ; 5 autres
rendus exacts. Aucune nouvelle tolérance ni qualification générale déclarée.
Les contrôles d'extraction détaillés sont dans `m3-xfeat-wasm-proof.json` et
`m3-xfeat-webgpu-proof.json`. Coordonnées source calculées avec facteurs float32
préparés sur CPU ; le tri spatial est comparé après réassociation des lignes.

Cycle de vie : dispose annule aussi les étapes asynchrones du contrôleur et
empêche une insertion tardive dans son cache. Les modèles géométriques mixtes
(mode None normal + réflexion vérifiée) conservent un emplacement null pour
chaque groupe sans modèle, afin de garder les indices alignés au filtrage et au
partitionnement. Cette représentation est à préserver côté UI/export.

## ALIKED et ALIKED rotation — livraison progressive

Deux profils supplémentaires dans `SparseCopyEngine` : `ALIKED` et
`ALIKED rotation`. Fournir `hooks.models['aliked-n16']` ou
`hooks.models['aliked-n16rot']`, chacun `{graphs:{dense,detect,localize,describe}}` ;
chaque entrée contient `{data:Uint8Array,sha256}`. Les identités fixes sont dans
`ALIKED_MODELS`. Export reproductible à partir des poids CM2 originaux avec
`export-cm2-aliked-{dense,heads}.py`. Le procédé d'export M2 (1040c53) est réutilisé
et attribué ; les modèles Blot spécialisés ne sont jamais substitués.

Prétraitement RGB/255 commun CPU, resize Kornia au côté long 1024, antialias
séparable gaussien en réduction, FMA PyTorch explicites. Quatre recettes :
9 676 800 composantes float32 identiques, tri natif de 20 000 points avec ex æquo
identique. Le masque autorisé intervient après la décision de seuil NMS, comme
le natif ; les exclusions sont vérifiées de nouveau aux centres source.
L'extracteur garde son plafond natif de 20 000 propositions et le décompte avant
le plafond utilisateur. Sous-pixels double précision lors du retour à la source.

Le descripteur de chaque point est indépendant : calcul seulement des points
retenus, par lots bornés de 512, avec les vraies opérations et les mêmes poids
SDDH. Carte de features conservée sur GPU lorsque le backend le permet, puis
réutilisée entre les lots. Pas de matrice de descripteurs intermédiaire pour
chaque point rejeté. Budget commun, CPU forcé, GPU hybride explicite et annulation
par terminaison du worker, comme XFeat. Capacités mémoire estimées avant la tâche,
heap effectif plafonné ; préparation contiguë encore soumise à sa propre limite.

Preuves : `m3-aliked-{wasm,webgpu}-proof.json` contrôle les quatre graphes sur
3 tailles × 2 variantes × 2 backends ; `m3-aliked-extract-proof.json` contrôle le
raccordement image/masques (144 et 799 points, memberships identiques).
`m3-aliked-pipeline-proof.json` : 4 chaînes complètes, 77/505 paires et 6 biomes
par variante ; identités des paires, groupes, provenance et rendus RGB exacts.
Il reste des écarts flottants de sous-pixel (max 6,103515625e-5 pixel) et de
descripteur (max 1,1477619409561157e-5) sur ces recettes. Pas de nouvelle tolérance
ou de qualification universelle. Pic admis environ 927 Mio ; aucune réservation
restante. Le partage avec les choix LightGlue reste à raccorder.

## SAFIRE — graphes et post-traitement (lot intermédiaire)

`scripts/export-safire.py` exporte les vrais encodeur SAM/adaptateurs et décodeur
avec poids vérifiés, sans poids dans Git. Le passage fréquentiel utilise DFT/IFFT,
le masque passe-haut et les deux normalisations natifs. Les deux graphes tournent
sous ORT 1.30 CPU et WebGPU : voir `m3-safire-{wasm,webgpu}-proof.json`.
Les logits ne sont pas exacts : deux signes changent sur 262 144 valeurs du lot
de quatre prompts. Leur effet sur la chaîne complète reste à mesurer.

`native/research-post.cpp` reconstruit les masques par interpolation native,
calcule les descripteurs de propositions en flux, regroupe par k-means/DBSCAN
et produit probabilités, labels et cartes binaires/multisources. Les cartes
et moyennes sont exactes sur les références 1/2/4 sources. L'initialisation
NumPy seed 1701 est exacte pour 1 à 1024 propositions ; les labels sont exacts
sur les 35 recettes de regroupement (4 à 1024 propositions). Le calcul des
moyennes de centres conserve la réduction en cascade PyTorch, déterminante
pour les propositions proches. Ces preuves ne qualifient pas tous les jeux
possibles aux frontières des clusters. DBSCAN évite la matrice N² persistante.

Ce lot est interne : orchestration du modèle, budget partagé, cache de
propositions et contrat public SAFIRE restent à raccorder avant activation UI.
Aucun calcul d'essai n'est ajouté au parcours utilisateur.

## Apparieurs appris et SIFT + LightGlue

Les 14 profils de `SPARSE_COPY_ALGORITHMS` sont maintenant raccordés dans
`SparseCopyEngine`. Les variantes Glue ajoutent `models['xfeat-glue' |
'aliked-glue' | 'sift-glue'] = {data: Uint8Array, sha256}` ; les identités
strictes sont exportées par `SPARSE_GLUE_MODELS`. ALIKED rotation emploie
l'extracteur n16rot et le même apparieur ALIKED que le natif.

Les candidats spatiaux sont calculés avant l'attention croisée et gardent
l'ordre cKDTree natif. Les recherches ROI restent indépendantes, y compris
leur dédoublonnage final. Toutes les couches sont conservées : 6 LighterGlue,
9 LightGlue. L'attention propre utilise des blocs de 128 requêtes ; les
rassemblements d'arêtes et accumulations sont bornés à 16384/8192. Limites
natives explicites : 6000 points par côté/zone, 4 millions d'arêtes par zone.
Le budget partagé admet les copies, temporaires, heap WASM plafonné et
estimation GPU ; repli CPU sur admission/échec utile, sans test préalable.
Les jobs ROI sont actuellement exécutés successivement ; aucun profil réduit
ou suppression de couches n'est utilisé pour tenir en mémoire.

SIFT + LightGlue a son propre extracteur : gris flottant Kornia, SIFT
4 couches/.0066667, dédoublonnage score/angle, RootSIFT avec plancher 1e-6
et renormalisation L2. Sur sa recette image, coordonnées, réponses et
descripteurs sont exacts ; une taille et 201 angles diffèrent (max 2.39e-7 px
et 3.06e-5 degrés). Ces résidus proviennent du noyau SIFT déjà documenté.

Douze recettes complètes CPU/GPU ont paires, provenance et biomes identiques,
11 rendus RGB exacts. XFeat+LighterGlue CPU comparaison diffère de 289
composantes RGB, score maximal 6.09e-4 ; ce résidu est visible dans les preuves,
sans nouvelle tolérance inventée. Cache et annulation/dispose contrôlés ;
pic admis 1 523 998 780 octets, réservations finales nulles. Les preuves
sont `m3-glue-pipeline-proof.json` et les comparaisons de graphes par modèle.
Le registre public/API général reste à intégrer ; ce contrat est importable
directement depuis les modules M3.

## SAFIRE complet — contrat direct

`new SafireEngine(rgb8Image, budget, profile).analyze(params, hooks)` est
importable depuis `src/safire.js`. `params` : side=4/8/16/24/32 (16 par
défaut), groups=1..16 (3), kind=kmeans|dbscan, eps=.2, minimum=1, binary=false.
`hooks.model.graphs.encoder/decoder` fournit les octets et SHA des graphes
`SAFIRE_MODEL` ; utiliser l'encodeur **bounded**, distinct du premier export
monolithique. backend auto/cpu/webgpu, signal et onProgress sont pris en charge.
Le cache conserve les propositions par grille/backend ; changer le regroupement
ne relance pas le réseau. `dispose()` annule le travail et évacue ce cache.

Le résultat loué (`release()`) contient map Float32[1024²],
source_probabilities Float32[C,1024,1024], source_labels Uint8[1024²],
prompt_features Float32[N,256], prompt_confidence, prompt_clusters et
points Float32[N,2]. Les points sont en coordonnées de la grille d'analyse
1024×1024 ; metadata.image_shape permet le raccordement à l'image originale.
Les sources suivent l'ordre natif des prompts choisis, pas leur confiance.

La chaîne réelle garde FFT/IFFT, SAM/adaptateurs, grille et décodeur,
moyennes de propositions, clustering, softmax et reconstruction native.
L'attention globale est calculée par blocs de 128 requêtes et toutes les clés.
L'encodeur monolithique dépassait le plafond WASM de 2 Gio ; le graphe borné
réussit avec heap observé 1.46 Go CPU / .88 Go GPU. Modèles, copies, résultats,
heap et estimation GPU sont admis dans le budget partagé. Seuls les échecs
du travail utile déclenchent un repli ; aucun calcul de calibration.

Trois regroupements CPU et GPU sur la même image : clusters/prompts/points
identiques au natif, cache/annulation/libération confirmés. Les cartes restent
flottantes : max 8.74e-6 CPU / 4.39e-6 GPU, et respectivement 8/3/2 ou 8/4/1
labels différents selon regroupement sur 1 048 576 pixels. Pas de parité bit
à bit revendiquée. Prétraitement OpenCV exact sur 3 tailles pour SAFIRE et FOCAL
(18 874 368 valeurs). Preuves `m3-safire-pipeline-{cpu,webgpu}-proof.json`.
Le raccordement au registre public général et aux exports communs reste à faire.

### FOCAL, module direct

`FocalEngine(image, budget, profile).analyze({}, {model, backend, signal,
onProgress})` accepte `backend: auto|cpu|webgpu`. Chaque entrée
`model.graphs[stage]` fournit `{sha256, url}` ou `{sha256, data: Uint8Array}`
selon `FOCAL_MODEL.graphs`. Les 29 graphes restent externes, chargés à la demande :
embedding, 24 blocs ViT-L, neck, HRNet, fusion, clustering. Les scripts
`export-focal.py` et `export-focal-cluster.py` régénèrent les identités épinglées.

Résultat : `map: Float32Array[4096]` (labels 0/1 à 64×64),
`features: Float32Array[4096*288]` (points en ordre ligne, canaux ViT256+HRNet32),
`metadata`, `release()`. Le label 1 désigne la région minoritaire selon le natif.
Aucun paramètre artificiel : deux groupes, huit initialisations, seed123,
arrêt natif du clustering et normalisation par branche conservés. Le cache évite
une nouvelle inférence ; `dispose()` annule aussi le calcul en cours.

ViT-L conserve les tenseurs GPU et leur session productrice jusqu'à consommation.
Les poids sont relâchés par étage. Le clustering natif s'exécute dans le runtime
WASM complet (le paquet GPU omet certains noyaux Cast CPU). Le heap initial
borné est 512 MiB, augmenté seulement après échec du vrai calcul, maximum 2 GiB.
Réservation commune : heap, préparation, transferts, poids courants, résultats,
et estimation GPU 768 MiB ; aucun essai préliminaire. Mesures de développement
avec cap initial antérieur 1 GiB : heap CPU349.44MB/GPU293.21MB, cartes CPU et GPU
4096/4096 identiques au natif sur la recette, caractéristiques maximum2.93e-6
CPU/1.73e-6 GPU. Ce n'est pas une revendication de parité universelle des flottants.
Les preuves incluent réemploi, arrêt et absence de réservation résiduelle.

### AdaIFL, module direct

`AdaiflEngine(image, budget, profile).analyze({}, {model, backend, signal,
onProgress})`, `dispose()` et `release()` suivent FOCAL. `ADAIFL_MODEL.graphs`
épingle14étapes externes : embedding,12blocs, décodeur. Chaque graphe est fourni
par `{sha256,url}` ou `{sha256,data}`. Aucun routage appris n'est figé : trois
régions triées par score, nombres de clusters variables, DPC-KNN, deux experts
FIA par image, deux experts MoE par token, puis expert du décodeur. Les tirages
CPU seed1701 sont des constantes uniquement parce que leurs32768positions sont
fixes et indépendantes des valeurs d'image. Toutes les décisions restent calculées.
Le produit cdist augmenté conserve le chemin MM natif ; les additions pondérées
utilisent ScatterElements(add), sans remplacement par une moyenne non pondérée.

Sorties `map:Float32Array[4096]`, `mask:Uint8Array[4096]`, `metadata` ; dimensions
64×64, seuil strict `>.5`. Entrée PIL bilinéaire RGB8 à1024, arrondis22bits des
deux passes puis ToTensor : 3145728valeurs de la recette identiques au natif.
Les quatre caractéristiques de stages restent résidentes pour le décodeur GPU.
Heap initial512MiB, adaptation sur échec utile seulement jusqu'à2GiB. Budget
commun inclut préparation, transferts, poids courants, caractéristiques et
estimationGPU1GiB. Mesures avec cap initial antérieur768MiB : heapCPU404.1MB,
GPU257.1MB ; réservations maximales1.22/2.29Go, cache/annulation/libération OK.

Sur la recette complète : carte CPU max4.465e-5/moyenne6.376e-6,1pixel de masque
sur4096 différent ; GPU max7.242e-6/moyenne1.229e-6, masque identique. Le seuil n'a
pas été déplacé. Ces résidus numériques mesurés ne sont pas une garantie de
parité universelle des décisions du routage ou du masque. Scripts export et
références bloc par bloc permettent d'examiner une divergence concrète.

### Hamming historique sur WebGPU

Les trois opérations historiques ORB/AKAZE/BRISK acceptent désormais
`backend:auto|cpu|webgpu`. Les distances entières sont calculées par lots64×N,
avec padding nul des61octets AKAZE, puis tri LLVM natif sur CPU (y compris la
place du self-match avant retrait). Aucun changement de seuil ni ordre d'égalité.
Admission commune des buffers GPU, staging et lectures ; libération en fin de
calcul, repli CPU sur échec réel en modeauto. Les24cas adverses à égalités,
plus les6chaînesBRISK, ont les mêmes matches ordonnés et sorties finales.
Aucune accélération chiffrée n'est annoncée sans mesure comparative dédiée.

### G2NN WebGPU sans changement de métrique

Les descripteurs SIFT quantifiés utilisent désormais les sommes de carrés
entières WebGPU par lots64×N. Le filtrage spatial en float64, le top4, la racine
float32 native, le test de rapport et l'ordre de déduplication restent dans le
noyau qualifié. Aucun tableauN×N n'est conservé. Le modeauto revient au CPU sur
échec du vrai calcul ; webgpu explicite signale l'échec. Les22chaînes classiques
ont les mêmes paires/groupes/rendus ; les tests ciblés couvrent toujours les
frontières de rapport, égalités, zones, miroirs et coordonnéescompactées.

### Public API, render and exports

The public contract is in CONTRACT.md and index.d.ts. Main/worker engines now
expose M3 model registration, four operations, independent view controls and
native-shaped NPZ. `docs/m3-api-chrome-proof.json` exercises all four in the real
worker with URL models and GPU, caches, cooperative cancellation and source
retention. Final retained/cache/active reservations are zero. NumPy reads every
export with `allow_pickle=False` (`m3-npz-proof.json`). Eight native research
render modes agree in every RGB byte; four additional PIL dimensions, including
17×4097vertical-first reduction, agree in12,582,912float values.

Automatic Panels+Text plus real mirrored extraction is now covered jointly:
2panels,3supported OCR boxes,362pairs,7groups, same regions, text exclusion bounds,
pairs, provenance, groups and full RGB as native. Three extraction workers start
useful jobs under shared admission. OCR confidence remains version-dependent;
no claim that future native/browser OCR boxes always agree is implied.

M3 does not modify WordPress or publish distributions. The registry's CM2 row
records these14profiles; six dense choices remain the separately owned M4 merge.

Segmented-source bridge: M3 and historical source/mask inputs now use admitted
full-resolution oriented surface leases. No tile is treated as an independent
image, and no scientific scale changes. Temporary pixel pointers are removed
from cached engines after each call. All8orientations, downstream failure and
partial admission refusal release their leases. This improves layout coverage;
it does not claim that every image fits every browser. Final RGB output and
global native workspace still require admission, with explicit MEMORY_LIMIT.

The real worker also completes historical BRISK on a60MP JPEG loaded through
segmented scanlines: native zero-point result, all180,000,000RGBbytes unchanged,
peak admitted2.701GB under3GiB, original/mask/source leases and caches zero after
unload. This fixture isolates layout and admission; it is not a claim of dense
60MP correspondence speed. See `m3-segmented-source-proof.json`.
