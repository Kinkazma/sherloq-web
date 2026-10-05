# D2PRL: complete browser chains and API qualification

The final checkpoint is now present and its local SHA256 has been independently
checked: `2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36`,
540,533,481 bytes. The separately verified native handoff ZIP has SHA256
`f191951e46bb8c0d66dd2b0c3e886678d4607da9d24ff45724ad135da35646a3`.
The native report records strict loading of all 1,337 keys and CPU/MPS inference.
OSN is a training asset and is not required for final-model inference.
No checkpoint, private transfer link, correspondence or private image is bundled
in the browser delivery. Receipt does not establish redistribution permission.

Current status: **0.29 runtime frozen; declared corpus qualified**.
The actual scientific model runs from original PNG/JPEG bytes to source-sized
maps and masks. CPU and hybrid WebGPU paths are qualified on the declared
synthetic corpus; this does not establish detector accuracy on arbitrary images
or physical devices. The fixed runtime/model identity is documented in
`CONTRACT.md`. The0.29 extracted runtime passes the actual GPU worker recipe,
38-operation smoke and explicit missing-model refusal. ELA0.28 remains immutable.
Other models in the AI Clone Detection panel remain unavailable.

The early failed candidates below are retained as study history, not as the
current implementation. The native CPU/MPS acceptance does not relax the browser
tolerance or permit changed final decisions.

## Contract to preserve

- RGB [0,1], tensor bilinear antialiased resize to 448×448; preserve the original
  inference protocol instead of the comparison fork's PIL bicubic training path.
- 40 PatchMatch iterations, seed22, original draws and ordering. Initialization
  consumes random values before inference, so a seed alone is not the full state.
- Three outputs: union probability, target residual, source residual. Roles use
  `>0`, not a softmax or a 0.5 class threshold. Preserve original fp16 quantization
  inside PatchMatch; adding new quantization elsewhere is not authorized.
- Union uses native rounding and a connected-object minimum initially500 on the
  model grid. The interactive minimum ranges0–5000;0 disables only small-object
  suppression. Role union uses the same minimum; remove strictly smaller
  components and retain native connectivity. A 50×50 constant-
  border filter determines role majority. Its anchor/arithmetic and zero ties
  need explicit tests; visually similar masks are insufficient.
- Continuous maps return by bilinear resize, categorical masks by nearest.
  Original image identity and independent zones remain explicit. The 448 grid
  is model resolution, not a claim of full native-resolution inference.
- GPU-default and CPU-choice UI should only be connected once the respective
  browser paths have actual declared validation; no silent service or substitute.

## Conversion and implementation work

The original model includes convolutional feature extraction, Zernike filters,
40 iterative randomized searches, fp16 grid sampling, channel-group comparisons,
softmax-weighted offsets, data-dependent union selection and convolutional role
heads. A single traced graph must not freeze the data-dependent union branch or
replace random draws with constants. Dynamic random/control behaviour requires
separate verification even if an exporter accepts the model.

Evaluate ONNX for the feed-forward blocks with explicit intermediate tensors;
audit a dedicated WebGPU/WASM implementation of iterative PatchMatch and RNG.
Qualify resize, half conversion, sampling, reductions, decisions and final masks
against generated public inputs before full-model activation. The CPU native
adapter deliberately interpolates quantized fp16 descriptors/grids in fp32 then
rounds back, while MPS follows its own sampler; retain separate reference labels.

Use local external weights only under hash gating and shared memory admission.
Measure loading, compilation, transfers, useful iteration work, output processing,
peak memory, cold/warm and the entire chain. No benchmark, canary, calibration or
stored performance profile belongs in the user path. No training or NAS access.
The 64 MP native panel cap and browser large-image policy remain separate work.

## First measured decision boundary

A 21-case synthetic postprocessing study compares native `filter2D` with the
exact integer majority sum from `boxFilter`. On the 448×448 checker role pattern,
the maximum filter difference is only 2.87e-13, yet **80,498 target/source pixels
change** because the next operation is `>0`. Horizontal and vertical split cases
change 433 and436 pixels respectively, with maximum filter errors below7.1e-11.
All sources are generated; no checkpoint or private image is involved.

This rejects silently replacing the native filter with an integral/box majority
kernel despite its mathematical equivalence. Preserve the native arithmetic path
or obtain a separately justified contract change after presenting real final-mask
comparisons. No native algorithm, threshold or browser capability was changed.
See `d2prl-postprocess-boundary-study.json` and `scripts/study-d2prl-postprocess.py`.

## Feature-block conversion observations

Two local-weight ONNX candidates execute in Chrome154/ONNX Runtime Web1.30:
Zernike features (12×448×448) and the convolutional descriptor head (32×448×448).
Each has one generated input, with graph optimization disabled/all. Model bytes,
inputs and native output hashes are retained in the private study; generated
models remain excluded from delivery. Scripts import the existing native adapter
and refuse weight downloads, without changing the native environment or sources.

Maximum absolute errors versus native CPU were 2.48e-5/1.45e-5 for WASM and
2.87e-5/2.34e-5 for the requested WebGPU provider (Zernike/CNN respectively).
Nevertheless the required fp16 descriptor conversion changes1856/29672 values
for WASM and3845/40133 for WebGPU. These are native fp16 descriptor differences,
not a new quantization optimization. Their effect on iterative matches and final
masks remains unmeasured, so no callable D2PRL operation is enabled.

No node-by-node provider assignment is yet recorded; requested WebGPU is not a
claim of an entirely GPU graph. Timings in the raw report are functional runs,
not an isolated speedup benchmark. See `d2prl-feature-conversion-study.json`,
`export-d2prl-feature-study.py` and `study-d2prl-features.mjs`.

## Interactive filter contract received

The native interactive-filter handoff SHA256 was independently checked:
`c7899526e93cc2a0c938cc7774da65b5824f8adba57305e5fa89ce7c8ba2fff1`.
The UI minimum is0–5000 on448×448, initially500. Native postprocess supports a
broader internal bound; the web-facing slider must preserve the UI contract.
Minimum0 changes only component removal. Union probability rounding and the
50×50 role filter remain unchanged.

Keep raw native grids for every independent zone. Refilter into fresh mask,
source and target arrays, resize categorical masks nearest and combine zones by
union in original coordinates, finally intersect with analyzed support. The raw
probability-map view stays unchanged. Cache keys must separate inference from
this minimum; slider changes cannot rerun the network or any calibration. Track
job generations, suppress stale results and disable export while filtering so
an export cannot combine old masks with a newer displayed parameter.

Native default500 tests still reproduce the previous reference. The earlier
postprocessing boundary report retains the source hash actually measured before
this parameter was added. Browser implementation and validation remain pending.

## Explicit evaluator qualification

The portable C++/WASM evaluator now matches164 generated native cases in
Chrome154, Firefox155 and WebKit26.6, with native reference layouts of1,2 and8
threads. These layouts describe arithmetic boundaries, not browser worker counts.
Admission refusal, cooperative cancellation, retry and wrapper disposal are tested.
See `d2prl-evaluator-*-proof.json`; the generator recreates the large synthetic
corpus outside delivery, with exact input/output identities in the reports.

The two original448 failures came from reciprocal multiplication instead of
float32 division, and one exponential ULP crossing a half rounding midpoint.
The scalar tails also require intermediate half conversion and a different
ordered sum of weighted offsets. These are arithmetic fixes, not widened
thresholds or exceptions for specific pixels. The bounded negative exponential
is adapted from SLEEF with its Boost license and pinned source identities.
2,097,160 exponential values and458,752 half-softmax distributions match native
references in Node and the three browsers; see `d2prl-softmax-*-proof.json`.

Reference details are supported by the
[PyTorch2.8 softmax kernel](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/SoftMaxKernel.cpp),
[sum kernel](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/SumKernel.cpp)
and [pinned SLEEF source](https://github.com/shibatch/sleef/tree/5a1d179df9cf652951b59010a2d2075372d67f68).
No complete-model inference or final-mask parity follows from these units.

## Random stream and ongoing PatchMatch

A portable MT19937 uniform generator now reproduces25 native states and the
64,225,280 draws in the full40-iteration order, including the state consumed by
model construction before weights are loaded. Only numeric RNG states and hashes
are supplied, not initialized model parameters or checkpoints. Native source and
static-filter identities are recorded. Refused or cancelled draws restore the
stream, and concurrent use is rejected. Node and three-browser proofs:
`d2prl-random-*-proof.json`.

The complete iterative search/propagation, descriptor feed-forward blocks, network
heads and interactive final masks remain work in progress. D2PRL is not exposed
as a callable engine. Forgeryscope Auto stays queued until this work is handled.


## Candidate transforms and complete loop

Seven candidate transformations pass147 checks over21 generated offset fields
in Node, Chrome154, Firefox155 and WebKit26.6. Two successive float32 remainder
stages are required at coordinate boundaries, including tiny negative values;
a single mathematically equivalent wrap is not numerically equivalent.

The full control flow matches1001 native intermediate evaluations in seven
cases, including five40-iteration runs, on all three browsers. Admission,
cancellation after useful work, busy rejection, deterministic retry and released
reservations pass. The448×448 full40 reference has been generated; its browser
qualification is still running. See `d2prl-patchmatch-*-proof.json`. Smaller-grid
runs do not establish the full448 qualification or final detector parity.

## Role postprocess and deformation errors

The original four-connected component removal and signed50×50 filter now match
180 cases bit for bit in Node and all three browsers, including every float32
filtered value and categorical role output. The OpenCV4.11 DFT implementation
uses the existing explicitly fused portable arithmetic; no native library is
loaded. Minimum0/1/17/500/5000 and zero/sign/rounding boundaries are covered.
See `d2prl-postprocess-*-proof.json`; this remains separate from model inference.

Unqualified ONNX CPU deformation convolutions produced raw error differences up
to6.75 and normalized score differences up to2 on one synthetic model source.
The learned head amplified these errors:1461 union threshold decisions changed
even with exact native PatchMatch inputs. Disabling constant folding alone did
not fix it. The correct reference is ordered float32 FMA in each convolution,
followed by the original separately rounded squares/sums and sigmoid.

The portable DLF7/9/11 implementation now matches both raw errors and normalized
scores in18 cases at448×448 on Node and all three browsers. Six coordinate
patterns use the verified checkpoint's filter parameters; these parameter bytes
remain outside delivery. `d2prl-dlf-*-proof.json` and its reference metadata
record exact comparisons. There is no precomputed image-specific correction.

## Multiscale resize and remaining neural drift

On the generated389×521 RGB source, plain multiscale ONNX descriptors exceeded
1e-4 maximum absolute error. The large-output contiguous NCHW interpolation
primitive, preserving native float32 coordinate and fused-operation ordering,
passes24 cases on Node and three browsers. A separately tested ONNX Float64
intermediate emulation passes the same24 cases in the three browsers. This is
explicit emulation of float32 rounding, not a change of delivered tensor type;
small-output, channels-last, antialiased and arbitrary extreme-value cases are
not covered by that qualification.

Replacing the six large-output Resize nodes reduces maximum descriptor errors
to3.43e-5 (Zernike) and5.34e-5 (CNN) in the measured WASM case. Nevertheless4062
and85548 half values still differ, respectively. With exact deformation scores
injected into the output heads, the large union-mask divergence disappears on
this source, but maximum probability errors remain above1e-4 and five positive-
role decisions change. Remaining convolution/interpolation arithmetic is being
isolated; none of these split graphs qualifies a complete browser detector.

Details, original/rewritten model identities and functional observations are in
`d2prl-full-block-conversion-study.json`. Timings obtained during concurrent
functional validation are not benchmarks. No ONNX weight file is included.

## Composed descriptors: first exact browser case

Ordered WebGPU convolution now matches all21 complete convolution boundaries
on the three model scales, with the actual verified checkpoint. Bias placement
ranges describe the fixed native arithmetic reference and are derived offline
from independent constant tensors (`fixtures/d2prl/gemm-layout-all.json`). They
are not image corrections, device detection or runtime calibration. Wider input
coverage and stability on other reference machines still require qualification.

BatchNorm parameters use float32 sqrt/reciprocal, a fused negative-mean bias
adjustment and an unfused output multiply/add. The24 affine/ReLU comparisons
pass exactly in Node, Chrome154, Firefox155 and WebKit26.6. The browser composed
feature graph then passes47 intermediate/final checks on the generated RGB448
source: scaling, reflect padding, all CNN layers, complex Zernike magnitude,
return interpolation and complete36/96-channel FP16 outputs. No native expected
activations are injected into this path. Proof:
`d2prl-descriptors-composed-chrome-proof.json`.

This is still an experimental feature graph on one synthetic input, not a full
detector. Original RGB antialiased preparation, CPU convolution alternative,
full PatchMatch composition and output-head/final-mask parity remain open. The
functional16433.3ms run overlapped other validation and is not a benchmark.
Peak accounted engine bytes1409607680 excludes the external reference comparator
and is not process RSS. All engine reservations were released.

## Complete descriptor-to-PatchMatch composition and bounded CPU workers

The first composed generated-source run now matches all55 checks in Chrome154:
47 descriptor boundaries and the8 complete PatchMatch outputs using the actual
verified checkpoint. No native descriptor or PatchMatch activation is injected.
The input is still a native-prepared RGB448 tensor; byte decoding/antialias input
preparation, neural output heads and final masks are outside this proof. See
`d2prl-feature-patchmatch-composed-chrome-proof.json`.

The single CPU worker pool starts useful work immediately, retains at most three
descriptor sets, transfers compact candidate tiles and keeps the full global
indices for native numerical thread-tail rules. Each WASM worker is single-threaded;
worker count is bounded by useful tiles, advertised CPU concurrency and the same
engine memory budget. No runtime calibration, nested pool or change in40 iterations.
The seven-case1001-evaluation corpus passes Chrome/Firefox/WebKit, including
cancellation between evaluations, BUSY, refusal, retry and disposal. Chrome also
passes all198 full448 intermediate evaluations and all8 outputs with10 workers.
A separate mid-tile cancellation qualification is still required.

For the actual feature-to-PatchMatch composition, peak accounted bytes1917063168
under a2GiB budget includes retained outputs and worker heaps; it excludes the
external expected-tensor comparator and is not RSS. Functional times21.95s for
features and197.96s for PatchMatch overlapped other work and do not establish a
benchmark speedup. The full random-descriptor corpus required315.93s in this
functional run; the distribution of descriptor values materially changes compute.

## Native output-head interpolation arithmetic

The small-output path differs from generic NCHW bilinear interpolation. Its
four-channel vector prefixes use separately rounded products and right-associated
sums. Scalar tail channels use a specific left-associated FMA sequence.24 generated
cases, including mixed five-channel vector/tail cases, and11 actual native head
boundaries now pass bitwise in C++/WASM and explicit-rounding ONNX under all three
browsers (`d2prl-head-resize-*-proof.json`). Float64 emulation is qualified on these
cases; it is not claimed as universal float32 FMA for arbitrary extremes/ties.
The full heads graph with corrected DLF and11 corrected interpolations is the
next measured candidate; no final-mask improvement is inferred from unit parity.

## Full worker loop in three browsers; head error localized

The198-step448/40 worker reference now passes Chrome154, Firefox155 and WebKit26.6
with10/10/8 single-thread workers. Separate mid-tile cancellation tests stop the
pool with other jobs in flight, preserve input bytes, release reservations and
retry exactly; a128MiB shared budget limits the requested10 workers to2. See
`d2prl-patchmatch-pool-full-*-proof.json` and `d2prl-pool-lifecycle-*-proof.json`.

On the one generated case, corrected DLF and head interpolation give zero native
mask differences for minimum0/17/500/5000. Role maxima fall to4.17e-7 and5.36e-7,
with no sign changes. Union probability still differs by8.64e-4 and the candidate
is rejected. Diagnostic outputs localize the largest difference to the UNet
(max1.05e-3); the dedicated union head differs by4.04e-5. Diagnostic intermediate
sigmoid zero-threshold counts are not final detection thresholds. Replacing170
BatchNormalization operations with native rounded affine constants alone leaves
union error1.00e-3, also rejected. No tolerance is relaxed.

The native contiguous global-average reduction uses a four-lane cascade sum
followed by float32 division. Reciprocal multiplication is numerically different.
All54 actual UNet boundaries plus18 generated reductions pass bitwise in C++/WASM
and the explicit-order ONNX graph in the three browsers. See
`d2prl-mean-*-proof.json`; source reference is PyTorch2.8 SumKernel.cpp, with the
retained PyTorch BSD notice. The full-head candidate including these reductions
is being measured independently; unit parity does not establish full-model parity.

## UNet convolution qualification remains incomplete

The head candidate with54 exact means and170 explicit BN affine operations still
has union max error8.51e-4; it remains rejected. The grouped/strided ordered GPU
convolution extension passes the26 earlier feature/union maps. Of161 zero-bias
UNet maps,144 initially matched bitwise,15 differed only in signed zero, and2
showed nonzero differences confined to the final16/4 spatial positions. Preserving
the first product when the native layer has no bias fixes all signed-zero cases:
159/161 complete maps now match bitwise. The remaining downsample maxima are
8.01e-5 and1.07e-4, so full-model acceptance is not inferred.

The native UNet has279 convolution boundaries on the generated RGB448 source.
108 pointwise-on-1x1 feature maps and2 decoder tails use reductions outside the
simple sequential FMA before/after-bias profiles. Those arithmetic candidates
are explicitly rejected. Experimental dot-product probes on a few positions
are diagnostic only; a coincidental match does not qualify an algorithm.
The original qualified feature/union GPU implementation remains separate from
this experimental extension. No D2PRL operation is exposed in the engine registry.


### Préparation RGB et UNet composé en cours de qualification

La préparation RGB uint8 HWC → normalisation float32 NCHW → bilinéaire antialias
448 reproduit23cas natifs, notamment axes de taille1, agrandissement, réduction,
axe inchangé et source synthétique du modèle. La normalisation divise par255 ;
les deux passes séparables conservent l'ordre natif des FMA. Le candidat sans FMA
est rejeté. Les23sorties et le cycle annulation/BUSY/refus/reprise passent dans
Chrome, Firefox et WebKit. Aucun décodeur, ICC, alpha ou orientation nouveau n'est
validé par cette étude. La composition RGB→préparation→descripteurs passe48points
de contrôle Chrome. Preuves `d2prl-prepare-*-proof.json` et
`d2prl-descriptors-prepared-composed-chrome-proof.json`.

L'exécuteur expérimental UNet charge les paramètres à la demande avec admission
mémoire préalable, libère les valeurs à leur dernier consommateur et conserve
les sauts du réseau jusqu'à leur utilisation. Aucun tenseur attendu n'entre dans
le calcul. Premier candidat score max2,1356e-4 ; deuxième candidat avec réduction
FC choisie sur64cas indépendants max1,3611e-4 : tous deux rejetés (>1e-4), malgré
l'absence de changements du seuil0,5 sur cette source. Les 108FC et4fins de
convolution restent explicitement en qualification. Les44cas des autres auxiliaires
et leur cycle de ressources passent sur3navigateurs. Poids et graphes privés,
aucune redistribution implicite, aucun résultat de détecteur complet revendiqué.


### UNet composé exact sur la source synthétique

La correction de l'ordre K16 pour le canal0 de chaque groupe de8sorties rend
les16géométries FC exactes sur64cas indépendants. Les108frontières réelles passent
aussi :172cas bit à bit dans Chrome/Firefox/WebKit, preuve `d2prl-point-*-proof.json`.
Pour les quatre fins de convolution, les sondes constantes indépendantes isolent
une sommation séquentielle par blocs1024, avec arrondi entre blocs. Cette route
reproduit les4cartes complètes dans Chrome. Le graphe UNet composé reproduit ses
279cartes de convolution et sa sigmoid finale exactement (280contrôles) :
`d2prl-unet-composed-point-ordered-tail-block-chrome-proof.json`.

Portée :un tenseur RGB448 synthétique, vrais poids vérifiés, Chrome/WebGPU et
auxiliairesWASM. Pas encore une détection complète depuis un fichier, ni une
qualification universelle des appareils ou sources. Aucun tenseur attendu n'est
injecté dans le calcul ; le comparateur est séparé du moteur et de son budget.
La composition avec DLF, les autres têtes et le posttraitement reste à terminer.


## Première composition complète depuis les fichiers synthétiques

Le chemin expérimental est maintenant exécuté sans injection d'activations
natives : décodage des octets originaux par le worker existant, RGB8→AA448,
descripteurs réels, PatchMatch40 en pool, DLF, union dédiée et UNet entier,
sommation/décision d'union, rôles ONNX, posttraitement et retour aux dimensions
sources. PNG et JPEG :50contrôles chacun dans Chrome, union/décision/cartes
exactes et masques exacts aux minimums0/17/500/5000. Les rôles respectent1e-4
et ne changent aucun signe sur ces cas. L'image uniforme est encore en recette.
Preuves `d2prl-composed-file-to-source-masks-chrome-proof.json` et
`d2prl-composed-bounded-ort-jpeg-file-to-source-masks-chrome-proof.json`.
Ce corpus n'établit pas une parité universelle ni une intégration WordPress.

Sommation globale :80cas bit à bit Node et3navigateurs. La référence PyTorch2.8
locale utilise OpenMP ; le nombre de tâches vaut min(8,ceil(N/32768)), puis les
partitions ont ceil(N/tâches) éléments. La réduction finale utilise la même
cascade. L'ancien candidat du backend ParallelNative était incorrect et reste
documenté comme rejeté. Références :
[SumKernel.cpp](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/SumKernel.cpp),
[ParallelOpenMP.h](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/ParallelOpenMP.h),
[TensorIteratorReduce.cpp](https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/TensorIteratorReduce.cpp).

Retour spatial :100cas exacts Node/Chrome/Firefox/WebKit. Les produits horizontaux
du préfixe vectoriel restent séparés, les queues scalaires sont fusionnées,
l'étage vertical conserve sa FMA ; la réduction2× utilise les paires de lignes
du préfixe vectoriel. Les candidats non fusionné et partiellement fusionné sont
conservés comme rejetés. Le choix est fixe d'après les sources et le corpus,
jamais calibré dans le parcours.
[Référence OpenCV4.11 resize.cpp](https://github.com/opencv/opencv/blob/4.11.0/modules/imgproc/src/resize.cpp).

Les workers rôles/posttraitement passent sur3navigateurs : arrêt pendant le vrai
calcul, BUSY, reprise déterministe, refus, entrées préservées, réservations
libérées ;180cas de posttraitement exacts. Le runtime ORT borné limite uniquement
la mémoire linéaire instanciée à512Mio (ancien plafond4Gio), sans modifier le
WASM de calcul. Comparaison avant/après bit à bit identique sur3navigateurs ;
capacité WASM observée170524672octets sur cette source, pas une mesureRSS.
`d2prl-worker-heads-bounded-*-proof.json` conserve les identités du code et du
WASM inchangé. Aucune réservation512Mio n'est présentée comme RAM réellement
allouée. Les sorties de conversion et paramètres restent dans.build horslivraison.

Zones :28cas Chrome exacts du vrai refilter natif sur grilles mises en cache,
avec chevauchements, exclusions, zones disjointes, 0/17/500/5000 et refus avant
allocation. La recette des autres navigateurs est en cours. Ce composant ne
prétend pas effectuer l'inférence des zones ; il projette/filtre des grilles
réelles et ne doit pas être exposé seul comme détecteur. Les exclusions D2PRL
s'appliquent aux résultats, conformément au natif, pas aux pixels du crop.

Restent : chemin d'inférence indépendant par zone, cache et générations UI,
alternative CPU complète, autres appareils, benchmarks isolés et intégrationB.
ELA0.28 reste figée ; aucun0.29 publié, Forgeryscope Auto reste en attente.


## Source chains and CPU foundation — continued qualification

The flat encoded source passes all50 checks in
`d2prl-composed-bounded-ort-flat-file-to-source-masks-chrome-proof.json`.
Its union decision takes the other native branch (`combineMaximum=false`),
with exact scores, decision and masks. JPEG and PNG take the maximum branch.
These three synthetic source chains do not establish universal model accuracy.

`d2prl-zones-v2-{chrome,firefox,webkit}-proof.json` covers32 native refilter
cases, including a2×3 whole-image input, overlapping/disjoint regions,
exclusions and four component minima. Explicit selected regions still require
at least8×8, matching the native region normalization. Source-only admission
was requalified on24 cases in the three browsers after accounting the selected
codec ceiling; see `d2prl-source-admission-*-proof.json`.

The CPU convolution candidate uses ordinary WASM SIMD with float64 intermediates
for exact binary32 products; midpoint, subnormal and overflow lanes call scalar
`fmaf` to avoid double-rounding errors. It uses no relaxed-SIMD assumptions.
The independent host math-library oracle tests2638464 finite-input triples,
including signed zero, subnormal output, overflow and targeted double-rounding
midpoints. Node and all three browsers pass bitwise (`d2prl-fma-simd-*-proof.json`).
This is corpus evidence, not a proof for all possible inputs.

Across197 spatial layers,104896 selected native convolution values are exact,
including row/channel/bias-domain/tail boundaries. Four complete tensors and
pool lifecycle pass in Chrome/Firefox/WebKit, with actual useful-compute
cancellation, BUSY, retry, refusal and reduced worker admission. Each worker
has one thread and a256MiB compiled ceiling; the shared budget also accounts
transport copies. Idle workers can be released before another engine pool runs.
The complete CPU source chain remains under test. No speedup or RSS claim is
inferred from these concurrent functional studies.


## Actual model API, zones and worker integration

The complete CPU chain passes329 Chrome checks, including all279 UNet
convolutions. The actual model/session API, separate from the comparator, passes
CPU and GPU original-PNG inference and four component minima (0/17/500/5000).
The union is exact; native-role residual errors stay below4.77e-7 with unchanged
signs and projected masks. Generated JPEG and flat sources exercise both union
branches. These are separate declared source cases, not a universal claim.

Two distinct real ROI inferences plus the active envelope pass against native
CPU results. All six source-coordinate arrays match for four minima, exclusions
and removal of the envelope. The latter uses the two cached ROI grids with no
new inference. The six arrays in actual model API NPZ exports are independently
read by NumPy with `allow_pickle=False` and are exact. Proofs:

- `d2prl-model-api-{cpu,gpu}-whole-chrome-proof.json`
- `d2prl-model-api-gpu-zones-chrome-proof.json`
- `d2prl-model-npz-{cpu-whole,gpu-whole,gpu-zones}-proof.json`

The common module-worker path passes real model inference at3GiB on GPU,
lazy verified manifest loading, no parameter preloading, defensive result
ownership, cached refilter, cancellation during actual inference and filter,
recovery without inference, JSON/NPZ, source preservation and unload to zero
reservations. Its first proof is `d2prl-worker-engine-chrome-proof.json`;
newer backend-specific proofs cover subsequent additive API changes.
No WordPress integration is implied; B owns that recipe.

The slider API is explicit: `refilterOf` refers to a stable analysis identity,
while view revisions remain distinct. Cache eviction produces `CACHE_MISS`,
never a replacement inference. The independent raw-grid API preserves signed
residuals and exports the three448×448 planes per zone. Current source-sized
source/target arrays are postprocessed masks, not these raw residuals.

The first common-worker CPU trial at3GiB refused allocation during descriptors.
The pool retained idle compiled heaps needed by subsequent math operations.
The shared budget now reclaims idle D2PRL workers on actual allocation pressure,
before evicting scientific cache entries. It never removes a worker while its
useful convolution is running. The full3GiB CPU recipe now passes, including exact source masks, owned raw
arrays, both cancellations, refilter without inference and complete cleanup.
Its peak conservative accounting is3,220,575,215 bytes; the GPU recipe peaks at
2,259,084,271 bytes. Neither number is process RSS. No speed claim is based on
the refused trial.

The separate converted parameter package has1062 deduplicated assets,
541,513,527 bytes. Its model manifest is1,173,784 bytes, SHA256
`8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b`.
It contains no expected activations; weights remain separate from the runtime
and source archives. Runtime loading admits exact sizes and verifies every
SHA256. No native macOS library, training or remote inference is used.


## Qualification map and reproducible recipes

| Component | Reference and check | Current evidence / limits |
| --- | --- | --- |
| Original bytes / RGB / AA448 | Native decoded RGB and Torch antialias | PNG/JPEG generated originals; preserved bytes,24 codec-admission cases and100 spatial cases across three browsers |
| Descriptors / float16 boundaries / PatchMatch40 | Native fixed seed22, exact ordered arithmetic | Complete448/40 chain; rejected direct-ONNX conversion is retained in study history |
| UNet / dedicated union / branch | Torch2.8 CPU/OpenMP8 | 279 convolutions, ordered reductions and both union branches; complete CPU329checks |
| Role residuals | Native signed outputs before filtering | Max4.77e-7 on positive sources, no sign changes; uniform branch exact |
| Postprocess / source masks | OpenCV4.11 native filter/rounding/resize | 180postprocess cases and32zone cases; full source masks exact at0/17/500/5000 |
| Independent regions / envelope | Two native crop inferences plus full envelope | Actual three-pass browser result exact, exclusions preserved, envelope removal without inference |
| Strict slider / stale replies | Stable analysis token, changing view revision | Current controller passes Chrome/Firefox/WebKit; eviction refuses without calling infer |
| Raw / projected exports | Independent NumPy, no pickle | Six projected arrays exact; raw union exact and two signed residuals within bound |
| CPU pool / shared budget | Useful requested convolutions | Four full tensors and lifecycle across three browsers; idle heaps reclaimed under pressure while scientific cache survives |
| Common-worker / WordPress | Actual source and model, no comparator injection | Backend-specific worker proofs; WordPress integration remains B's separate gate |

Generators and studies are portable repository-relative scripts. They expect the
pinned native checkout/checkpoint and previously generated boundary references;
these private build inputs are not placed in the runtime archive. The source
archive contains generators and proof JSON, not model parameters or private
images. The converted parameter package is separately allowlisted by
`scripts/package-d2prl-model.py`.

Useful final recipes from the `web-engine` directory:

```sh
node --test tests/*.test.mjs
node scripts/study-d2prl-worker-engine.mjs --cpu
node scripts/study-d2prl-worker-engine.mjs
../venv/bin/python scripts/check-d2prl-worker-raw.py cpu
../venv/bin/python scripts/check-d2prl-worker-raw.py webgpu
node scripts/study-d2prl-model-api.mjs --zones
../venv/bin/python scripts/check-d2prl-model-npz.py --tag gpu-zones
node scripts/benchmark-d2prl-worker.mjs
```

The worker recipe and benchmark also accept `--runtime-root=PATH` to execute
only the extracted runtime's code/binaries while reference fixtures remain in
the separate development tree. Reference tensors enter the comparator only.
The benchmark executes requested jobs, includes the first cold job and starts a
new engine for warm-browser-cache inference; it is never imported by the product.
Reserve the shared development benchmark slot before invoking it. Keep model,
resolution, minimum and output checks unchanged between CPU and GPU samples.


The current common-worker proofs are
`d2prl-worker-engine-cpu-chrome-proof.json` and
`d2prl-worker-engine-webgpu-chrome-proof.json`. Independent raw-grid NPZ reads
are `d2prl-worker-raw-{cpu,webgpu}-proof.json`. All four full convolution tensors
and idle-pressure lifecycle checks pass again in Chrome/Firefox/WebKit after
adding reclamation; the current session controller also passes all three.
The general Node regression passes179tests. Final immutable-archive execution
and separate development timings are recorded alongside the release receipt.


## Frozen0.29 delivery boundary

Runtime:233files,12,872,691-byte ZIP, SHA256
`3c0be0e94e8206bcd3cd057a808c875be27a1d924ed1b4ea33e598243cf38155`.
The extracted archive passes the actual GPU whole-file model, signed raw-grid
export, strict refilter, both cancellations and complete cleanup:
`d2prl-worker-engine-webgpu-extracted-chrome-proof.json`.
The38 existing operations and missing-model refusal pass in
`runtime-smoke-proof.json`;179Node tests pass in `regression-0.29.0.json`.
This is a usable engine increment, with the model package kept separate.
The CPU common-worker corpus is qualified at the same3GiB budget; numerical
code is identical in the frozen archive. Separate cold/warm measurements are
an additive development report, not an undisclosed precondition in the runtime.
No D2PRL WordPress integration or speed guarantee is claimed by this delivery.
