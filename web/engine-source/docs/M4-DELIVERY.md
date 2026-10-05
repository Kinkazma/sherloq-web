# Livraison M4 — moteurs denses et transformées

Les moteurs et contrats ci-dessous sont livrés progressivement sur
`work/m4-dense-transforms`, depuis la base
`80d4c92bab7517685d25568f49a9885f6c3ba50e`. Aucun déploiement ni changement
WordPress n'est effectué. Les anciens « non livré » des journaux de lots décrivent
leur date ; les preuves de grande taille sont centralisées dans
[M4-96MP-COVERAGE](M4-96MP-COVERAGE.md). La reprise M4 est terminée : les onze familles et les sept outils pixels
transférés disposent de leurs parcours grande source qualifiés. Dense couvre
le duo global complet et le détail96MP ; les variantes miroir/échelle/quart
de tour réutilisent les adaptateurs communs et leurs preuves natives, avec
cette portée explicitée dans le bilan. Aucun parcours sept passes96MP ni
archive>4Gio n’est revendiqué par la preuve finale du duo.
En particulier,
la divergence EM du lot17 est résolue et l'opération publique est livrée.

| Ligne | Livraison utilisable | Mémoire/exécution et contrat |
|---|---|---|
| 2:3 Reference Comparison | 20 mesures, quatre vues, références mixtes | Entrées/sorties segmentées, métriques globales indépendantes admises ; [contrat](COMPARISON-SEGMENTED-M4.md) |
| 3:2 Wavelet Threshold | 59 ondelettes, cinq seuils, reconstruction native | Axes entiers, extrema globaux, coefficients RAM/temporaires, cache et workers ; [contrat](WAVELETS-SEGMENTED-M4.md) |
| 3:3 Frequency Split | DFT globale, quatre vues et masque natifs | Axes segmentés, CPU utile, masque GPU qualifié, caches/leases ; [contrat](FREQUENCY-SEGMENTED-M4.md) |
| 4:0 RGB/HSV Plots | Nuages exacts, rendu2D/3D et exportsSVG/PNG | GPU persistant, caméra sans retransfert ni recalcul, admission des buffers ; [contrat](PLOTS-RENDERER-M4.md) |
| 4:2 PCA Projection | Base globale et tous composants/modes | Réductions ordonnées, projection/normalisation segmentées ; [contrat](PCA-SEGMENTED-M4.md) |
| 5:3 Wavelet Blocking | Gris original, db8, médiane/bruit et vues | Transformée globale, workers, cartes/tableaux paginés ; [contrat](BLOCKING-SEGMENTED-M4.md) |
| 5:4 PRNU Identification | Résidu, NCC/classement, import/exportHDF5 et construction multi-caméras | PocketFFT/Wiener globaux, empreintes segmentées, ingestion JPEG progressive ; [résidu](PRNU-SEGMENTED-M4.md), [bases](PRNU-STORAGE-M4.md) |
| 5:5 Noisesniffer | Statistiques, sélection/croissance, trois vues et NPZ complet | MoyennesFFT/DCT fidèles, tri global, stores/leases, NPZ paginé ; [contrat](NOISESNIFFER-SEGMENTED-M4.md) |
| 7:3 Image Resampling | EM3×3/5×5, ROI/composite, FFT cartes et sélections, Fourier original | EM global par région avec8192voisinages temporaires, axesFFT segmentés, caches/annulation ; [EM](RESAMPLING-ANALYSIS-M4.md), [Fourier](RESAMPLING-SEGMENTED-M4.md) |
| 7:4 CM2 — six profils denses | Zernike, SIFT, duo, étendu, miroir et étendu-miroir ; échelles et provenance | Recherche globale, cohérence/géométrie/détail/rendu, SIFT compact sans perte, Zernike à préparation bornée ; [contrat](DENSE-M4.md) |
| 9:3 Stéréogramme | Période/absence, quatre vues, Farneback natif | Recherche segmentée, flot global dédié, caches et tables paginées ; [contrat](STEREOGRAM-SEGMENTED-M4.md) |

Les moteurs commencent le calcul demandé immédiatement et admettent les workers,
stores et sorties dans le Budget partagé. Aucun benchmark, canary ou calibration
n'est exécuté chez l'utilisateur. La parallélisation conserve les dépendances
numériques globales. Les bornes de mémoire et les refus explicites ne modifient
ni les méthodes, ni les paramètres, ni les seuils de décision.

## Validation et limites réelles

Les preuves propres à chaque famille sont référencées dans ses contrats. Les
recettes couvrent les sorties natives, les jonctions de bandes, les caches,
les leases, l'annulation et le nettoyage temporaire. Les nouveaux lots finaux
ajoutent notamment190cas EM exacts en validité et en cartes, un parcours Chrome
JPEG1024² sous64Mio, les poids forcésOPFS, et la comparaison bit à bit des
fournisseurs SIFT compact/Zernike résident avec leurs fournisseurs complets.
Le parcours dense complet reste exact sur ses sept recettes et21rendus.

Ces résultats ne prétendent pas qualifier chaque image, navigateur ou plateforme.
Les limites suivantes font partie du contrat livré :

- Les descripteurs/champs denses sont paginés : correspondances à toute distance,
  préparation Zernike/SIFT, cohérence globale, géométrie/détail et refiltres. Le
  duo Zernike/SIFT96MP et le détail96MP sont qualifiés, avec réemploi documenté
  pour les variantes. L’archive complète de2,687Go est relue indépendamment.
  Les lectures aléatoires globales ont un coût important sous RAM contrainte.
- La géométrie commune est injectée depuis M3. La preuve M4 utilise le commit
  M3`4046116` et Similarity. La limite numérique Homography déclarée par M3 et
  les petits écarts Zernike déjà documentés restent explicites. Aucun nouveau
  seuil de tolérance n'est ajouté.
- Les métriques complexes de comparaison, le tri Noisesniffer et les pyramides
  Farneback disposent de vrais espaces globaux paginés. Le HDF5 PRNU encodé peut
  être lu/écrit sur disque. Les exports scientifiques utilisent le ZIP64 commun
  fourni par M5 ; il n'existe pas de second format M4. Les qualifications96MP
  et leur portée sont détaillées dans le bilan lié ci-dessus.
- Le SVG3D exporte une projection vectorielle dans l'ordre défini, sans tampon
  de profondeur ; PNG conserve le rendu GPU. Les formats segmentés actuels
  sont ceux des décodeurs livrés, principalement JPEG pour ces adaptateurs.
- EM utilise l'arithmétique binaire64 et les constantes du natif ARM64 manifesté,
  sans revendiquer une identité universelle entre toutes les bibliothèques math.
  Une annulation redémarre l'ajustement ; elle ne reprend pas une itération partielle.

## Intégration par le coordinateur

Fusionner les commits de cette branche sans copier le moteur vivant de M1.
Les modifications communes concernent `src/index.js`, les sources/résultats,
workers/clients, opérations/export, `CONTRACT.md`, `NOTICE.md` et les manifestes.
Le coordinateur résout leur fusion unique avec les autres moteurs et régénère
les manifestes sur l'arbre intégré. Le générateur de sources inclut désormais
tous les répertoires WASM et sources natifs ajoutés par M4.

B raccorde ses panneaux aux opérations et aux classes documentées. CM2dense
reste une API `DenseCopyEngine` avec l'adaptateur de géométrie M3 explicite ; les
six choix ne doivent pas être confondus avec ORB historique ou PatchMatch D2PRL.
Le graphe persistant se raccorde via `createPlotRenderer`. M5 peut consommer les
paires, modèles et contextes denses pour ses compositions automatiques sans
relancer les descripteurs. A conserve l'assemblage et la publication.

Les fixtures et dépendances partagées n'ont été utilisées qu'en lecture. Les
oracles nouveaux, données de tests et sorties de construction sont dans `.build`
de ce worktree. Aucun fil voisin n'a été sollicité ou réveillé.

## File pixels transférée après reprise

M1 gradient, conversion couleurs, loupe, illuminant, contraste, séparation et
ajustements sont consommés depuis225eab8. Workers utiles, caches temporaires et
loupe globale bornée sont livrés avec leur [contrat](PIXEL-STREAM-M4.md).
Quatorze vues96MP et leurs PNG sont exacts au natif après lecture indépendante.
PRNU ajoute [import/construction/export paginés](PRNU-PAGED-API-M4.md) avec durées
de vie indépendantes. Ces ajouts communs sont à fusionner une fois par M5.
