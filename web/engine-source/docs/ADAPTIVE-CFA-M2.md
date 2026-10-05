# Adaptive CFA — trois réseaux natifs

`createCfaAnalyzer` exécute les poids intacts Original, JPEG 95 et Sans JPEG.
Le graphe conserve les convolutions directionnelles/dilatées, les connexions de
saut, les quatre permutations CFA, toutes les couches causales, le pooling et
le LogSoftmax. Les programmes JSON et poids float32 sont exportés sans perte
par `export-cfa-native.py` puis `export-cfa-program.py`, dans `.build/cfa-m2`.

La conversion ORT initiale changeait des décisions de grille. Le composant utilise
un exécuteur WASM dédié. Les additions fusionnées, placement du biais, réductions
matricielles et activations suivent l'arithmétique du CPU PyTorch/Accelerate de
référence (Torch 2.8, deux threads pour les oracles). Les activations vectorielles
emploient SLEEF 3.8, licence jointe. Les quatre FMA SIMD calculent en double exact
et traitent les rares cas de double arrondi avec `fmaf` ; aucune contraction
« relaxed SIMD » dépendante du processeur n'est requise. Cette arithmétique ne
constitue pas une garantie de bits identiques à toute version de BLAS native.

## Contrat B

Fournir `assets[variant]` avec URL/taille/SHA des poids, `program` avec
URL/taille/SHA du JSON, `checkpointSha256` et `wasmMaximumBytes:2147483648`.
`runtimes.wasm` contient `executor:'cfa'`, `factoryUrl` et `wasmUrl` produits par
`build-cfa-operators.py --sleef <source SLEEF 3.8> --emsdk <SDK 4.0.15>`.
Les actifs lourds et les environnements ne sont pas inclus dans Git.

- `analyze(rgb8,{variant='Original',block=32,tile=512},hooks)` : bloc pair ≥8,
  aucune réduction d'image ni recompression. Les dimensions impaires sont
  tronquées comme dans le natif. `tile:0` conserve le mode natif sans tuilage.
- Sorties : `probabilities` float32 [4,4,ny,nx], `grids` [4,ny,nx], `local_grid`
  uint8 [ny,nx], `suspicion` float32 [ny,nx], `gridShape:[ny,nx]`. Métadonnées :
  meilleure grille, bloc, origine [4,4], zone valide, dimensions source, tuiles.
- `render(image,result,0|1|2)` : superposition, carte INFERNO, couleur de grille.
  Les marges non analysées conservent l'image native. `exportNpz` garde les quatre
  tableaux scientifiques et les métadonnées ; aucun pickle.
- Les sorties/rendus/exports ont `release()`. Cache isolé par copie, annulation
  du worker réel, `clearCache`, `dispose`, `memory`. Les progrès couvrent chargement,
  inférence et tuiles terminées. Aucun calcul préparatoire chez l'utilisateur.

Les tuiles utiles démarrent sur plusieurs workers selon le profil et le budget
partagé. Chaque worker a une vraie limite WASM et libère les tenseurs morts du
graphe. Une admission insuffisante subdivise la tuile sur des frontières de blocs,
avec le même halo spatial de huit pixels et les permutations inchangées. Les
rectangles réellement calculés sont conservés. Le découpage peut modifier les
arrondis des kernels BLAS ; les décisions ne sont jamais « stabilisées » par un
epsilon ajouté. Le mode sans tuilage refuse proprement une admission impossible.

La voie hybride CFA est maintenant disponible : `auto` demande immédiatement
le GPU haute performance ; `webgpu` le demande explicitement ; `cpu` garde la
référence SIMD. Les conversions ONNX divergentes ne sont pas utilisées. Les
convolutions assez grandes suivent sur GPU la même séquence FMA float32 et le
même placement du biais ; SLEEF, pooling, petits GEMV et post-traitement restent
CPU. `runtimes.webgpu` peut reprendre le runtime `executor:'cfa'` WASM ; il est
renseigné automatiquement s'il manque. La provenance liste les fournisseurs
réellement utilisés. Cache séparé par backend, vraies réservations GPU et CPU,
subdivision des tuiles sur dépassement d'allocation, repli CPU en mode Auto.

## Validation et limites

Le corpus des 27 cas couvre les trois variantes, aplats, zéros, blancs, bruit,
image impaire, gradient et damier. Les décisions locales/globales sont exactes
avec les opérateurs corrigés. Les erreurs de probabilités/grilles/suspicion sont
comparées au seuil inchangé 1e-4. Deux tenseurs **internes** de log-probabilités
ont encore un écart supérieur à 1e-4 (maximum 1,8311e-4) : le rapport garde
`passed:false` pour cette vérification stricte et distingue `publicOutputsPassed`.
Les log-probabilités ne sont pas une sortie de l'API native `predict`.

Neuf cas navigateur supplémentaires couvrent blocs 8/16/64, plusieurs tuiles,
les trois variantes : décisions exactes, probabilité ≤1,38e-5, suspicion ≤3,46e-6.
Le test API réel vérifie isolation du cache, rendu, NPZ, annulation pendant une
inférence et retour de toutes les réservations à zéro. Les rendus sont pixel-exacts
contre le panneau natif. Voir `cfa-program-wasm-proof.json`, `cfa-tiles-wasm-proof.json`
et `cfa-api-wasm-proof.json`. Cela ne qualifie pas encore le débit 20 MP.

## Reprise : accélération hybride sans changer les décisions

`cfa-hybrid-webgpu-proof.json` passe les 27 cas : probabilité maximale 6,23e-6,
toutes les décisions publiques identiques. Les activations intermédiaires ne sont
pas un préalable bit-exact imposé ; sur l'essai de débit 264×264, le résultat de
la voie hybride est néanmoins identique au CPU explicite. CPU 2906 ms, hybride
408,8 ms, soit 7,1× dans cet essai de développement (pipeline déjà compilé par les
vrais cas précédents). Ce n'est pas une promesse universelle de débit, et aucun
essai équivalent ne précède le calcul utilisateur. Le premier vrai travail inclut
sa compilation de shaders. Les opérateurs se libèrent après chaque convolution.

L'API WebGPU réelle passe cache isolé, rendu, export, annulation sur inférence et
budget final zéro (`cfa-api-webgpu-proof.json`). La nouvelle latitude numérique
1e-3/1e-2 n'est pas nécessaire pour ces résultats : leur erreur reste <1e-5.

Source segmentée : `analyze({surface,sha256},...)` consomme les fenêtres RGB8
originales et garde le contexte natif. `renderWindow(image,result,mode,rect)`
garde coordonnées/bordures. Le worker propose `analyzeBlob('cfa',...)`. La preuve
96MP et la comptabilité du codec sont détaillées dans M2-WORKER-CONTRACT.md.
