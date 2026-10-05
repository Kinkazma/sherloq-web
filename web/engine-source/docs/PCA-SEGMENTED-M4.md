# PCA segmentée — contrat M4

`colors.pca` accepte désormais les sources JPEG segmentées retournées par
`loadBlob`. Les paramètres restent `component:0..2`,
`mode:'distance'|'project'|'crossprod'`, `invert:boolean`, `equalize:boolean`.
La sortie conserve les dimensions orientées de la source, sans réduction.

Le résultat public a `layout:'surface'`. Lire `surface.id` avec sa `revision`
par `readWindow`, exporter par le protocole habituel des surfaces puis appeler
`releaseSurface`. `data` contient moyenne, vecteurs et valeurs propres en BGR.
Les phases de progression sont `mean`, `covariance`, `projection`, `normalize`,
`equalize`, avec `completed`, `total` et `fraction` par phase. L'AbortSignal est
contrôlé entre blocs ; une erreur ou annulation détruit les sorties temporaires.

La moyenne et covariance parcourent tous les pixels dans l'ordre orienté natif,
avec les mêmes accumulations float64/FMA et les mêmes signes propres. Cette
réduction ordonnée reste sérielle pour préserver les résultats. Projection,
extrema et histogrammes sont globaux : aucune normalisation par tuile. Les
projections float64 intermédiaires et la sortie RGB utilisent le stockage
segmenté commun RAM/OPFS/IndexedDB sous Budget partagé. Le bloc s'adapte à la
mémoire disponible, au maximum 65 536 pixels par défaut. Aucun prétest utilisateur.

La base de 120 octets est réutilisée entre composants/modes et invalidée au
retrait de la source ; `metrics.basisCached` le signale. Les surfaces publiées
restent sous propriété du registre commun. Cette voie ne change pas la PCA des
sources contiguës. Pas de nouveau contrôle UI spécifique requis par B.

Validation : 90 rendus exacts contre la voie qualifiée sur petites dimensions,
orientations et modes ; annulations aux cinq phases et erreur d'écriture sans
fuite. Chrome, API worker publique : JPEG 1600×1100 sous 64 Mio, deux SHA-256 de
rendus complets et base identiques au Python natif ; réemploi de base et passage
OPFS, aucun artefact après nettoyage. Voir `pca-stream-browser-proof.json`.

Construction : `scripts/build-pca-stream.py`, Emscripten 4.0.15 ; cache et sorties
propres au worktree. Fichiers communs modifiés : `src/index.js` (routage,
capacité, cache, comptabilité WASM), générateur et manifeste runtime. Fusion
unique par le coordinateur, sans déploiement. Les autres transformées globales
ne sont pas couvertes par cette livraison.
