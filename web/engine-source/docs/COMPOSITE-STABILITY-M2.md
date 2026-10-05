# Composite — politique covariance-floor-v1 dans le navigateur

Le navigateur reprend la correction scientifique native autorisée du 1er octobre
2026. Les anciennes cartes dégénérées ne servent plus de cible : leur variation
selon les threads BLAS était le défaut à corriger. Les anciens rapports restent
conservés comme historiques. Les poids et résidus Noiseprint ne changent pas.

## Politique et portée

Avec `r = sqrt(eps(float64))`, la PCA conserve les 32 directions et blanchit avec
`max(lambda, r * lambdaMax)`. Les valeurs propres originales restent exportées.
Une absence de variation finie renvoie une erreur récupérable.

L'EM conserve l'ajout ULP historique, puis impose le plancher spectral
`r * max(lambdaMax(Sigma), varianceMaxInitialeGlobale)`. Cette dernière échelle
est calculée avant les pondérations sur **toutes** les cellules valides et reste
attachée à chaque modèle jusqu'à la sélection finale. Elle ne dépend pas de la
banque courante ni d'une composante qui s'effondre. La matrice suffisamment
conditionnée est rendue sans reconstruction ; les vecteurs propres ne sont
calculés que si une correction est nécessaire.

Les chemins contigu, bandes et banques appliquent tous cette règle à la PCA,
à l'initialisation et à chaque maximisation. Les dix réplicats, tirages graine0,
cent itérations maximales, outlier42 et portée globale sont conservés. Les gains
DSYRK/DGEMM float64 restent actifs. Aucun réglage utilisateur, calibration,
benchmark préalable, réentraînement ou réduction de dimensions n'est ajouté.

## Actifs, intégration et caches

Les trois fichiers de `native/noiseprint-stability/` sont les sources exactes du
lot natif figé. `provenance.json` conserve leurs SHA-256 publics ; aucune
modification n'est faite dans l'installation macOS. L'exporteur
`scripts/build-m2-statistics-runtime.py` les utilise prioritairement, inclut
`utility/stable_covariance.py` et émet un manifeste de schéma2 avec
`statisticsPolicy: "covariance-floor-v1"`. Les autres sources SPAM et l'adaptation
contrôlée `np.intp` restent inchangées.

Pour l'intégrateur : reconstruire ce paquet Python, livrer ses nouveaux
`noiseprint-statistics.zip` et `manifest.json`, puis actualiser
`statisticsRuntime.sourceSha256` et `downloadBytes` depuis le manifeste. Livrer
également les modules JS et les trois adaptateurs `native/composite-*.py` de ce
commit. Aucune reconstruction du binaire WASM/Pyodide ni aucun nouveau poids.
Le worker vérifie le SHA du ZIP et renvoie sa politique réellement chargée ;
le contrôleur refuse un marqueur incompatible.

Les clés des cartes contiguës incluent la révision de l'adaptateur, la politique
et le SHA des sources statistiques. Les clés des résidus excluent cette révision
statistique : un résultat Noiseprint compatible reste réutilisable. L'analyseur
segmenté possède un cache privé avec identité de politique ; les configurations
sont copiées et immuables pour sa durée de vie. Un rechargement de l'extension
charge le nouveau code ; aucun ancien objet de résultat déjà affiché n'est
réécrit sous les pieds de son lecteur. Relancer l'analyse pour actualiser la carte.

Métadonnées communes : `statistics_policy`, `covariance_regularizations` du modèle
retenu, `pca_regularized_components`, et, sur les adaptateurs stream/banked,
`covariance_reference_scale`. Les compteurs sont des Int32Array dans les champs,
des entiers dans les métadonnées et des scalaires int64 dans le NPZ. L'échelle
est float64. Le NPZ inclut aussi la politique dans `metadata_json`.
Les coordonnées, champs préexistants, vues et API d'annulation restent inchangés.

## Validation numérique

Les résidus exacts des trois fixtures publiques du lot natif sont réutilisés ;
il n'est pas nécessaire de répéter leur réseau inchangé. Les nouvelles références
figées sont reproduites exactement dans Python à deux threads avant export des
entrées du navigateur. Chrome154 / Pyodide exécute ensuite les vrais adaptateurs.

| Cas | Chemin | Erreur brute maximale | Erreur normalisée maximale | Écart raster |
|---|---|---:|---:|---:|
| Dégénéré petit | Contigu | 1,515 | 3,864e-9 | 0/255 |
| Dégénéré petit | Bandes | 2,556 | 3,922e-9 | 0/255 |
| Dégénéré petit | Banques | 2,503 | 4,023e-9 | 0/255 |
| Dégénéré chaîne | Contigu | 1,914 | 4,527e-9 | 0/255 |
| Dégénéré chaîne | Bandes | 3,520 | 6,422e-9 | 0/255 |
| Dégénéré chaîne | Banques | 2,049 | 4,469e-9 | 0/255 |
| Témoin stable | Trois chemins | ≤9,277e-11 | ≤3,653e-14 | 0/255 |

Les distances brutes ne sont pas bornées : quelques unités sur une échelle de
5e8 ne représentent pas quelques niveaux de rendu. Le rapport conserve erreur
absolue, relative globale, relative par cellule, normalisée et raster séparément.
Validités exactes ; mémoire finale0. Pic compté1,205Go sous3Gio.
Preuve : `composite-stability-wasm-proof.json`.

Le contrat de plancher est exercé séparément dans WASM : PCA de rang5 conservant
32 composantes dont27 régularisées ; covariance EM qui s'effondre entièrement,
mais garde l'échelle initiale2 et son plancher2,9802322387695312e-8 ; erreur explicite
pour une PCA sans variation. Preuve : `composite-floor-contract-wasm-proof.json`.

Chaîne source JPEG512² / WebGPU et stockage OPFS forcé : carte max2,111e-10,
validité/raster/couleurs carte exacts ; bruit max2,289e-5, affichage bruit63composantes
à1/255 comme auparavant. Quatre vues, NPZ4 113 368octets avec nouveaux champs,
export épinglé après release, annulation et temporaires nettoyés passent. Pic
2 788 043 944octets sous3Gio ; actif/cache0, codec16Mio libéré par dispose attendu.
Preuve : `composite-source-stability-webgpu-proof.json`.

## Qualification navigateur96MP — code cd78aff

Preuve : `composite-source-stability-96mp-webgpu-proof.json`. Même originalJPEG
12000×8000 de86 050 184octets, SHA-256
`f0b7febc57f625bf078dfeb746f5775f4c6efa7379e0f1c469a9330eb094f254`.
Décodage entier par lignes, sans interpolation. Chrome154, WebGPU pour le réseau
avec opérateurs CPU possibles, statistiques globales Python/WASM.

- Cent recompressions natives de qualité sur le gris complet, sélection90.
- Noiseprint réel :3174appels, quatreworkers, tous les96millions de pixels.
- SPAM988×1488×512,1 470 144cellules dont1 150 629valides. Features enOPFS,
  covariance/PCAglobales32, échelleinitiale globale1,0000000000000613.
- DixEM complets, quatreworkers admis, réplicat1 retenu ; sept à dix maximisations
  selon le réplicat et arrêt natif de convergence (maximum100 conservé).
- Politique vérifiée `covariance-floor-v1`. Ce grand témoin est bien conditionné :
  compteursPCA/EM0, condition1,653315. Le plancher est donc vérifié sans reconstruire
  inutilement ses matrices ; les cas dégénérés et l'effondrement ont leurs preuves
  actives distinctes ci-dessus.
- Carte1 470 144float64 et rendus96MP tous lus, finis/non constants. Quatre vues
  aux coins opposés, tailles/origines exactes. NPZ1 453 408 114octets préparé et
  transféré entièrement, avec nouveaux champs et métadonnées de politique.
- Pic mémoire **comptabilisée**3 128 537 524octets sous3Gio ; pic temporaire
  OPFS4 737 772 800octets sous10Gio. Actif/cache0 après release/clearCache ;
  heapcodec103 546 880octets jusqu'au dispose attendu. Profil navigateur propre
  supprimé. L'inventaireOPFS final n'a pas été réinterrogé dans ce grand essai ;
  il l'est dans la recette512² couvrant la même libération, l'export épinglé et
  l'annulation. Pas de revendication de RSS nul ou de comptage intégral des Blob.

Calcul567,33s ; parcours incluant lecture des champs et export581,25s (9min41,25s).
Le temps inclut la qualité automatique (~240s). Il ne se compare pas directement
aux118,11s du natif sur une autre source/qualité et un autre budget mémoire.
La recette navigateur historique du même original avait pris environ3350s ;
les gainsBLAS conservés sont visibles dans ce parcours, mais ces mesures sur
poste partagé ne constituent pas un benchmark isolé.

La comparaison scientifique utilise les neuf cas natifs ci-dessus ; ce parcours
96MP qualifie capacité, calcul global, résultats, export et cycle de vie. Il n'est
pas un oracle natif indépendant96MP, ni une qualification de l'UIWordPress.
L'intégration au paquet distribué reste du ressort de l'intégrateur ; aucun
site, dépôt distant, autre worktree ou code macOS n'a été modifié par ce lot.
