# Composite : covariance et projection BLAS float64

État courant : [covariance-floor-v1](COMPOSITE-STABILITY-M2.md) reprend désormais
la correction native autorisée, sur les trois chemins navigateur. Les mentions
ci-dessous de singularités non résolues ou de régularisation ULP seule décrivent
la politique **historique** et ses preuves conservées. Les gains BLAS restent actifs.


Les opérations matricielles des chemins `memoryBounded` et source segmentée
utilisent maintenant le BLAS SciPy fourni par le runtime Pyodide existant.
`DSYRK` calcule la covariance centrée symétrique ; `DGEMM` projette les mêmes
features sur les 32 composantes PCA. La covariance de chaque EM paginé utilise
le même produit symétrique. Moyenne, masque de validité, ordre des portions,
PCA globale, dix réplicats, itérations et régularisation restent inchangés.
Le chemin contigu natif de référence reste disponible.

Le bloc supérieur calculé par DSYRK est reflété dans le bloc inférieur. Tous les
échantillons participent au produit float64 ; aucun sous-échantillonnage ou
abaissement de précision. Les petites différences d'ordre d'accumulation sont
mesurées sur les sorties finales, pas masquées par un seuil plus permissif.

## Coût local mesuré

Dans la trace 96 MP acquise, la covariance occupe environ 2 444 s entre ses
premier et dernier événements (journal limité à un événement périodique ; ce
n'est pas un chronométrage isolé exact de la phase). Un sous-calcul navigateur
sur 12 000 lignes SPAM natives, répétées pour exercer la forme des fenêtres
pleine taille, compare les produits sur les mêmes valeurs centrées :

| Produit 12000×512 | Temps | Écart max au produit NumPy |
| --- | ---: | ---: |
| NumPy `a.T @ a` | 27,399 s | 0 |
| SciPy DSYRK | 0,549 s | 2,638e-13 |
| SciPy DGEMM | 1,013 s | 2,638e-13 |

[Preuve locale](composite-covariance-cost-wasm-proof.json). DSYRK est environ
49,9 fois plus rapide sur ce sous-calcul. Une première mesure donnait
18,969 s / 0,379 s ; le poste est partagé, les temps ne sont pas un benchmark
isolé ni une accélération mesurée de toute la chaîne 96 MP. Cette mesure de
développement ne devient jamais une calibration dans le produit.

## Sorties et ressources vérifiées

- [Statistiques complètes](composite-banked-blas-wasm-proof.json) : carte max
  2,592e-11 face au natif, validité exacte, deux workers EM, réservations finales 0.
- [Vraie source JPEG 512²](composite-source-blas-webgpu-proof.json) : carte max
  2,110e-10 ; validité, raster et couleurs de carte exacts ; quatre vues et NPZ
  complet 4 112 072 octets. Le bruit garde ses écarts antérieurs (max 2,289e-5,
  63 composantes de rendu différentes de 1/255). Actif/cache 0, codec jusqu'à dispose.
- [Chemin contigu borné](composite-stream-blas-webgpu-proof.json) : carte max
  4,133e-9, validité/raster/couleurs exacts, dix EM avec trois workers ; annulation
  réelle puis mémoire finale 0. Le script historique attend désormais les méthodes
  `clearCache`/`dispose` devenues asynchrones lors du raccord source précédent.

Les banques, tailles de portions, workers, plafonds et contrat d'export ne
changent pas. La copie Fortran éventuelle utilisée par BLAS tient dans l'espace
de travail déjà admis ; la preuve locale utilise un heap de 266 207 232 octets.
Les contrôles API et mémoire ci-dessus passent avec les budgets existants.
La recette 96 MP acquise est donc réutilisée pour le chemin de stockage inchangé ;
aucun nouveau temps complet 96 MP n'est annoncé.

Les rendus presque singuliers restent sensibles aux derniers bits. La
[vérification native](COMPOSITE-NATIVE-SENSITIVITY-M2.md) établit cette instabilité
en variant seulement les threads BLAS du code natif. Cette optimisation ne
change pas la régularisation pour forcer leurs cartes à une référence arbitraire.

## Raccordement M5/B

Distribuer les deux modules Python `composite-stream-runtime.py` et
`composite-banked-runtime.py` de ce lot. NumPy/SciPy/BLAS sont déjà présents dans
Pyodide ; aucun poids, runtime, paramètre UI ou manifeste de réseau à reconstruire.
Les champs et API restent identiques. M5 garde seul les catalogues et la fusion.
