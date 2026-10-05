# TruFor — composant M2

La voie source courante est décrite dans TRUFOR-SEGMENTED-M2.md : banques
RAM/OPFS, attention globale et rendu/export par fenêtres. La recette96MP complète
est acquise : trois champs96M, six vues, score et NPZ1,152Go, 5h46min24,54s.
Les limites denses ci-dessous concernent les adaptateurs
historiques et ne remplacent pas la qualification spécifique du chemin source.

Le graphe contient le modèle natif complet, avec les poids d'origine SHA256
`2845912ff57f33502abea6a2075eecacd093a553825515691598c04ca5e94c12` :
DnCNN Noiseprint++, encodeur multimodal SegFormer B2, deux décodeurs et score
image par pooling pondéré. RGB8 / **256**, taille source, minimum 29 × 29.
Aucune tuile d'image ni réduction du contexte dans l'attention.

## Voie contiguë historique

La voie livrée utilise `trufor-streamed/native-reference.json` et le programme
Noiseprint++ natif séparé. CPU et WebGPU passent les références complètes :
résidu max 5,29e-5 sur le corpus étendu, cartes/confiance/score sous 4e-6.
Le dernier chapitre décrit la correction arithmétique et les deux têtes par
bandes. Les anciennes preuves en échec ci-dessous sont conservées pour tracer
la correction, et ne décrivent plus la voie recommandée. Cette voie réserve
512 octets/pixel plus workspace fixe et portions, contre 4096 pour l'ancien
graphe. Les activations globales restent denses, donc grandes tailles soumises
à admission réelle ; aucune qualification 20 MP n'est annoncée.

## Export initial et mémoire

`export-trufor.py --unfused` conserve les normalisations ;
`bound-trufor-onnx.py` remplace les 32 attentions par des boucles ONNX de lignes
et les deux fusions pointwise par des boucles de lignes. Les opérateurs,
poids, clés et valeurs restent ceux du graphe original. Les budgets de lignes
sont des entrées de l'inférence utile, sans calibration. Le dernier morceau
reste de longueur réelle, sans padding supplémentaire.

Le worker ORT impose une vraie limite de mémoire WASM et est détruit lors
d'une annulation. Le budget commun couvre poids, copies, espace de travail,
sorties, cache et exports. L'admission actuelle des activations est conservatrice
(4096 octets par pixel plus les portions et espace fixe). Les grandes images
peuvent être refusées explicitement ; ce n'est pas une preuve 20 MP, ni un
abaissement silencieux de résolution. Les sorties restent denses.

## Preuves et qualification

Trois géométries 35×29, 96×64, 65×97. Avec les budgets de boucles forcés à 8192
octets pour exercer plusieurs portions, cartes/confiance/score restent sous
1e-4, CPU et backend WebGPU. **Le résidu Noiseprint++ dépasse le seuil existant :
maximum CPU 0,0006065071, WebGPU 0,0005527511.** Les preuves globales restent
`passed:false`. La variante fusionnée et la désactivation des fusions n'ont
pas éliminé cet écart. Aucun seuil modifié. WebGPU peut placer des opérateurs
sur CPU. Le modèle complet n'est donc pas activé dans le registre public.

Les trois rendus natifs sont exacts sur données aléatoires, constantes et
frontières de bins : palette RdBu_r 256 bins, confiance uint8, résidu ramené
aux percentiles 1/99. Le test de l'API réelle vérifie cache isolé des mutations,
rendus, export NPZ et zéro mémoire retenue après dispose.

## Contrat B

`createTruforAnalyzer({asset,runtimes,budget?,computeProfile?,resourceHints?})`,
puis `analyze(rgb8, {}, {backend,signal,onProgress})`.
`asset` décrit le graphe borné, taille/SHA/URL et `attentionLoops:32`,
`fusionLoops:2`, `graphOptimizationLevel:'disabled'`. Les runtimes viennent du
manifeste produit par `build-m2-neural-runtime.py`. Pas de paramètres scientifiques.

Résultat : `data.{width,height,map,confidence,noiseprint_pp,score,metadata}`.
Les trois tableaux float32 sont à la taille et aux coordonnées source ; le score
image est indépendant de leur rendu. `render(result,view)` retourne du RGB8,
`view` = map/confidence/noiseprint_pp. `exportNpz` conserve les clés natives
`map`, `conf`, `np++`, `score`, `imgsize`, plus métadonnées/provenance JSON.
Chaque sortie possède `release()`. `clearCache()`, `dispose()`, `memory()`.
Progression `model-load`, `inference`, `render` ; annulation par AbortSignal.
Cache lié au SHA des pixels, dimensions, modèle et backend. Poids/graphes externes,
aucune distribution ou publication effectuée.

## Correctif d'ordre natif et décodeurs en flux

La voie livrée suivante résout l'écart Noiseprint++ ci-dessus sans modifier les
poids ni le seuil. Les anciennes contre-preuves restent des archives.
`correct-trufor-batchnorm.py` conserve le coefficient affine natif (beta calculé
avec FMA, multiplication et addition d'activation séparées).
`export-trufor-npp-program.py` fournit le programme et les poids exacts. Les
convolutions suivent l'ordre float32/FMA natif, avec biais positionné suivant
les blocs SGEMM de la référence CPU. Le noyau SIMD WASM réutilise celui de CFA ;
le noyau WebGPU explicite conserve la même séquence FMA. Trois cas CPU/GPU :
maximum 2,80e-5 face au résidu PyTorch, sous 1e-4. WebGPU et WASM explicites
produisent les mêmes valeurs sur ces cas. Aucun changement de précision accepté
ni correction des valeurs à proximité d'un seuil.

`stream-trufor-heads.py` produit `trufor-native-npp.onnx` : véritable encodeur
multimodal et attention globale, puis deux décodeurs par portions de lignes.
Les projections linéaires précèdent toujours l'interpolation ; seules les lignes
sources nécessaires aux coordonnées globales sont projetées. Les convolutions
1×1, normalisations, prédictions et pooling du score sont conservés.
Les conversions de constantes littérales sont résolues lors de l'export car
ORT WebGPU ne fournit pas de Cast float64 ; aucune activation n'est repliée.

Ajouter `noiseprint:{asset:{url,bytes,sha256,program:{url,bytes,sha256}},
runtime:{executor:'noiseprint-plus',factoryUrl,wasmUrl}}` au constructeur. L'asset
principal porte `externalNoiseprint:true,streamedHeads:2,attentionLoops:32,
fusionLoops:2,graphOptimizationLevel:'disabled'`. `factoryUrl/wasmUrl` désignent
les opérateurs CFA recompilés avec `_cfa_conv_global`. Le reste du contrat B
reste identique. Le programme NPP est exécuté en CPU ou WebGPU selon la demande,
puis son **véritable résidu** alimente toutes les branches TruFor. La provenance
d'exécution donne les fournisseurs et portions NPP. Auto peut revenir au CPU
sur échec WebGPU pendant le travail utile.

NPP utilise un halo complet de 17 pixels et l'ordre de biais de l'image entière.
Quatre et huit portions de neuf lignes sont bit à bit identiques au calcul
WASM entier. L'admission et les échecs d'allocation ajustent uniquement la taille
des portions ; aucune réduction de résolution. Les workers indépendants suivent
le budget commun. Les deux grands décodeurs ne matérialisent plus les quatre
plans 512 canaux à la résolution du premier étage. L'admission du reste de
l'encodeur reste prudente (512 octets/pixel plus espace fixe et portions) ; les
features globales et cartes finales restent denses, **20 MP non qualifiés**.

Preuves de la voie contiguë : `trufor-native-{wasm,webgpu}-proof.json`,
`trufor-npp-{program,tiles}-proof.json`, `trufor-npp-explicit-webgpu-proof.json`,
`trufor-native-api-{wasm,webgpu}-proof.json`. Les trois cartes/résidus et le score
passent les trois références. Deux dimensions supplémentaires 128×129 et
257×385 passent via l'API WebGPU : carte max 3,94e-6, confiance 2,57e-6,
résidu 5,29e-5. Annulation d'une vraie inférence, cache isolé, vues et NPZ passent ;
aucune réservation après dispose. Les opérateurs CFA modifiés gardent leur
qualification des sorties publiques sur les 27 cas précédents.
