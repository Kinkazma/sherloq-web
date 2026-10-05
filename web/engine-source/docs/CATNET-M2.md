# CAT-Net v2 — composant M2

La voie source courante utilise les opérateurs et banques segmentés :
CATNET-SEGMENTED-M2.md et CATNET-COMPANION-SEGMENTED-M2.md. JPEG et PNG96MP
ont leurs recettes complètes. Les limites denses ci-dessous décrivent les
adaptateurs historiques, qui restent disponibles.

La chaîne native complète est portée : RGB, coefficients DCT Y quantifiés stockés,
table JPEG, deux branches HRNet, fusion et tête, carte native puis agrandissement,
retrait du padding et orientation EXIF. Les poids restent externes à Git.

`createCatnetAnalyzer` est exporté par `src/index.js`. Fournir `assets.standard`
et `assets.bounded` (URL, taille, SHA-256 du graphe, checkpointSha256), `runtimes`
WASM/WebGPU du runtime M2, et `jpegFactory` issu de `build-catnet-jpeg.py`.
Le composant partage éventuellement le `Budget` de l'application.

- `analyze(rgb8, {sourceBytes?, memoryBounded?}, {backend?, signal?, onProgress?})`
  retourne `data.map` float32 pleine résolution orientée, `native_map` float32
  et `nativeShape` dans les coordonnées JPEG originales. Les métadonnées donnent
  les dimensions source/padding, l'orientation, le mode mémoire et la provenance.
- Fournir les octets JPEG originaux. Ils sont décodés et comparés aux pixels
  ouverts : une image modifiée est refusée. Sans JPEG, un compagnon qualité 100,
  sous-échantillonnage 4:4:4, est créé comme dans le natif. Son encodage a été
  vérifié octet pour octet contre Pillow/libjpeg.
- `render(image, result, 0|1)` produit superposition/carte INFERNO natives.
  `exportNpz(result)` conserve carte orientée, carte native et métadonnées.
- Résultats, rendus et exports ont `release()`. Le résultat est une copie isolée
  du cache. `clearCache()`, `dispose()` et `memory()` permettent de gérer la vie
  du composant. L'annulation termine le worker réel, y compris une inférence.
- Les progressions du pool indiquent téléchargement, création et inférence.
  Aucune calibration, image canari ou exécution préalable ne précède le travail.

Le graphe borné conserve les convolutions et l'interpolation globale originales,
avec traitement DCT par bandes de 128 lignes et tête par bandes de 32 lignes.
Il est choisi au-dessus de quatre millions de pixels rembourrés, ou explicitement.
Le format WebGPU **NCHW est imposé** : le format implicite ORT NHWC produit des
cartes incorrectes dans ce modèle. Les kernels non pris en charge peuvent rester
sur CPU ; la provenance ne promet pas une exécution exclusivement GPU.

Les entrées denses (24 canaux) et les caractéristiques HRNet restent en mémoire.
Le budget réserve les entrées/sorties, poids, mémoire réelle WASM et estimation
conservatrice du workspace GPU ; il refuse une image qui ne tient pas. Ce lot
ne qualifie pas encore 20 MP. Le traitement en bandes de la tête ne rend pas
l'intégralité du réseau constante en mémoire.

## Validation livrée

Les trois géométries 64×96, 97×131 et 264×64 couvrent padding et plusieurs bandes.
Erreur maximale : standard CPU 1,46e-7, GPU NCHW 2,39e-7 ; borné CPU 9,24e-7,
GPU NCHW 8,95e-7, sous le seuil existant 1e-4. La contre-preuve du format GPU
implicite est conservée. Préparation DCT/RGB/table et compagnon JPEG sont exacts.
Les huit orientations EXIF et les cinq rendus CAT/CFA sont exacts. Le test API
réel vérifie cache isolé, rejet d'un JPEG modifié, rendu, NPZ et mémoire libérée.
Preuves : `catnet-*-proof.json`, tests `catnet-orientation` et `research-render`.

Les scripts de construction/export écrivent uniquement dans `.build` de M2.
`export-catnet.py` exporte le modèle ; `bound-catnet-onnx.py` remplace les deux
sous-graphes par les opérations natives en bandes, sans entraînement ni nouveaux
poids. `build-catnet-jpeg.py` utilise libjpeg 3.0.3 existant en lecture seule.

Fichiers communs à fusionner : index JS/types, worker neuronal (preferredLayout),
NPZ. Le registre général n'active pas automatiquement ce composant : B raccorde
le panneau à cette API, A assemble les actifs et leurs manifestes.

## Entrée DCT compacte et bandes adaptatives

`compact-catnet-onnx.py` produit `catnet-compact.onnx` à partir du graphe borné.
Fournir `assets.compact` avec `compactDct:true,dctRowBudget:true` : cette voie est
choisie par défaut si disponible (`memoryBounded:false` force le graphe standard).
L'entrée conserve RGB float32 et les coefficients DCT absolus bornés à 20 en
uint8 ; les 21 bandes one-hot sont reconstruites dans chaque portion de calcul.
L'entrée passe de 96 à 13 octets/pixel, soit 1,66 Go évités pour 20 millions de
pixels rembourrés. Halo DCT de huit lignes, poids/convolutions et coordonnées
natives inchangés. Le nombre de lignes dépend du budget, sans essai préalable.

Les preuves compactes CPU/WebGPU couvrent les trois mêmes géométries avec plusieurs
bandes : erreur maximale <9,24e-7. Le vrai composant WebGPU vérifie préparation,
cache, rendu, NPZ, rejet des JPEG modifiés et libération totale. SHA du graphe :
`5c0a28385289e3fe5cc40c7bed90599ec200753f03ae357659ae1225ce97dc18`.
Les caractéristiques HRNet restent denses : ce gain d'entrée ne qualifie pas à
lui seul l'exécution d'une image de 20 MP. L'admission conserve cette limite réelle.
