# Composite — source et statistiques segmentées

État courant : [covariance-floor-v1](COMPOSITE-STABILITY-M2.md) reprend désormais
la correction native autorisée, sur les trois chemins navigateur. Les mentions
ci-dessous de singularités non résolues ou de régularisation ULP seule décrivent
la politique **historique** et ses preuves conservées. Les gains BLAS restent actifs.


Le chemin source conserve Noiseprint natif (51 modèles, halo34), les poids SPAM,
la covariance/PCA globale32 et les dix ajustements EM complets. Les banques RAM
ou OPFS ne changent pas les cellules participantes. Les postérieurs sont stockés
par portions, les réductions et la covariance centrée utilisent toutes les lignes.
La régularisation native reste inchangée, y compris sur les cas mal conditionnés.
Les réplicats indépendants occupent les workers admis par le budget partagé.

La qualité automatique calcule réellement les100 recompressions JPEG natives du
gris original. Elle n'est pas déduite d'une table JPEG. Le gris uint8 temporaire
est le seul tableau global supplémentaire de cette étape (un octet/pixel).
Aucune calibration ni recherche de taille optimale avant le calcul utile.

## Contrat

Même configuration assets/runtimes/statisticsRuntime que Composite historique.
`analyzeBlob('composite', originalBlob, {quality:0|51…101, stage:'noise'|'map'})`
utilise la source commune. Aucun nouveau poids ni runtime à reconstruire ; les
nouveaux modules Python sont chargés depuis le paquet moteur.
`segmentedStorage:'auto'|'memory'|'temporary'` permet un choix explicite de stockage.
Le chemin contigu reste disponible ; une surface exige le calcul mémoire borné.

`readArray` conserve les types natifs : gray/noise Float32Array ; map, L, Sigma,
mu, eigs et ranges Float64Array ; valid/raster/rendus Uint8Array. Chaque champ
segmenté expose son stockage. `renderWindow(id,'noise'|'map',rect)` retourne RGB8
et l'origine source. Rendus et exports réutilisent les résultats conservés.
Le NPZ asynchrone garde les types/formes/champs scientifiques ; les ressources
restent épinglées jusqu'au dernier export. Attendre release/clearCache/dispose.
Le passage noise→map réutilise le résidu conservé. Un échec de statistiques
renvoie mapError avec le bruit disponible, conformément au contrat historique.

## Vérifications acquises

- Banque générique float64/float32/uint8 : offsets non alignés, annulation et NPZ
  identique aux octets historiques ;11 tests Node ciblés passent.
- Statistiques segmentées seules : carte max1,0914e-10 ; validités exactes,
  L max3,49e-13, Sigma max2,26e-14, mu max1,95e-13 ; deux EM parallèles.
- Vrai JPEG512², Noiseprint95, Chrome154 WebGPU : chaîne36,38s, carte max1,965e-10,
  validités/raster/couleurs carte exacts ; bruit max2,289e-5. Affichage bruit :
  63 composantes/786432 diffèrent de1/255. Quatre vues distantes, NPZ4112060octets.
  Pic comptabilisé2790620996octets sous budget3Gio ; actif/cache0 après libération.
- Les vecteurs propres ont un signe libre. Le test conserve les erreurs brutes
  et compare aussi L/mu/Sigma dans la même base (signes estimés par produits
  scalaires des colonnes). Erreurs alignées max8,873e-13/1,621e-12/5,909e-14.
  Cet alignement est exclusivement diagnostique : ni moteur ni export modifiés.
- Le rapport temporaire précédent reste false à cause de cette comparaison brute
  de base PCA ; sa carte et ses rasters sont identiques au natif. Il documente
  néanmoins export après release/cache, annulation effective et répertoire OPFS
  vide. Le contrôle numérique corrigé est composite-source-webgpu-proof.json.

Ces comparaisons natives restent distinctes de la recette96MP acquise ci-dessous
et ne qualifient pas WordPress. Les cas presque singuliers gardent leurs
contre-preuves ; COMPOSITE-NATIVE-SENSITIVITY-M2.md établit désormais leur
instabilité dans le code natif lui-même en changeant seulement les threads BLAS.


## Recette originale 96 MP

`composite-source-96mp-webgpu-proof.json` réussie sur f304a90, source JPEG
12000×8000 entière. Qualité0 : cent recompressions globales réelles, modèle90.
Noiseprint96M valeurs, SPAM1470144cellules, covariance/PCA globale512→32,
dix EM avec convergence native, carte et validité complètes. Les17champs
scientifiques/rendus sont relus par fenêtres, quatre vues dans deux coins éloignés,
NPZ1453406850octets consommé après release/cache. Les cellules ne sont pas
sous-échantillonnées pour la PCA ou l'EM.

Analyse3330,32s, total3350,00s avec recettes concurrentes ; covariance dominante.
Pic3196072372octets sous3Gio, final actif/cache0, codec103546880octets jusqu'àdispose.
Cette recette prouve charge/API/mémoire, sans oracle natif indépendant96MP ; les
comparaisons numériques natives de tailles réduites restent les preuves de parité.
Les contre-exemples presque singuliers documentés ne sont pas déclarés corrigés.

## Calcul matriciel accéléré

[COMPOSITE-BLAS-M2.md](COMPOSITE-BLAS-M2.md) décrit le raccord DSYRK/DGEMM
float64, ses mesures locales et les cartes finales vérifiées. Même stockage
et budgets ; aucun nouveau temps complet96MP revendiqué ni calibration produit.

## Politique corrigée qualifiée à96MP

La recette de [covariance-floor-v1](COMPOSITE-STABILITY-M2.md) est terminée :
même source12000×8000 entière, qualité90automatique, PCA32/dixEMglobaux,
quatreworkers, rendu et NPZ1 453 408 114octets. Calcul567,33s, parcours581,25s ;
piccompté3 128 537 524octets sous3Gio, temporaires4 737 772 800octets sous10Gio.
Ce grand témoin n’exige pas de correction spectrale ; les deux cas dégénérés
corrigés ont leurs rendus exactement comparés au nouveau natif séparément.
La preuve96MP historique ci-dessus reste conservée sous sa politique antérieure.
