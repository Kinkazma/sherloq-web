# PRNU : empreintes segmentées et NCC borné

`loadPrnuDatabase` conserve son entrée HDF5 bytes et ses métadonnées. L'ingestion
lit maintenant les empreintes float64 par hyperslabs de8192 valeurs au plus,
vérifie les mêmes contraintes natives puis les dépose en stockage segmenté.
`fingerprintStorage:'auto'` (défaut), `'memory'` ou `'temporary'` permet de choisir
le stockage ; auto suit le Budget commun. Le résultat publie
`metrics.fingerprintLayout:'segmented'` et `temporaryBackend`.

L'import HDF5 conserve le fichier encodé et le workspace HDF5 en RAM ; ce lot
n'est pas un lecteur HDF5 externe sans limite de taille. La totalité des
empreintes décompressées n'a plus besoin de trois copies simultanées en RAM.
OPFS/IndexedDB et leases suivent le moteur ; unload/dispose et échec d'import
ferment les fichiers. Le worker enregistre la session avant les écritures pour
permettre son nettoyage après annulation forcée. L'export HDF5 restitue les
octets de la base importée sans modification.

Le NCC visite le rectangle commun supérieur gauche dans l'ordre natif et
reproduit les blocs NumPy8192 avec réduction pairwise interne. Il utilise au
plus trois tableaux de8192 float64 (192Kio), indépendamment de la taille des
empreintes ; moyenne puis produits centrés se font en deux parcours globaux.
Les scores, rangs, seuils historiques, arrondis et provenance restent identiques.
L'admission PRNU supprime les cinq tableaux NCC pleine taille remplacés par ce
workspace. Le module `prnu-ncc.js` accepte arrays ou stores et contrôle
l'annulation entre blocs.

Contrat B inchangé pour `noise.prnu`, sélection des caméras, classements,
CSV/JSON/HDF5 et exclusion de la requête du jeu d'entraînement. B peut afficher
le backend temporaire dans les diagnostics. Les résidus Wiener/FFT restent la
voie native contiguë qualifiée ; leur extension aux grandes images, le stockage
progressif de construction multi-caméras et la concurrence restent des travaux
séparés. Ce lot ne prétend pas terminer toute la ligne PRNU.

Validation : scores natifs existants inchangés (corpus résidus/NCC/classement/
empreintes/HDF5), références de réduction aux frontières8192 et crops, annulation
sans fuite ; import en hyperslabs et nettoyage. Chrome : parcours API public
avec imports forcés OPFS, scores exacts, legacy, exclusion, caches, construction
JPEG préexistante, export et libération. Voir `prnu-storage-browser-proof.json`.

## Construction progressive des snapshots

`buildPrnuDatabase({id,queryImageId,files,singleCamera?,fingerprintStorage?})`
utilise désormais une seule image JPEG décodée à la fois et conserve les moyennes
par caméra dans des magasins RAM/OPFS/IDB. `fingerprintStorage` accepte `auto`
(défaut), `memory` et `temporary`. Le regroupement des noms, ordre des images,
exclusion SHA de la requête, images corrompues ignorées, minimum de deux images
et formule incrémentale/recadrage restent natifs. Les calculs FFT utilisent le
pool PRNU sous budget ; aucun calibrage utilisateur.

L'export HDF5 écrit les empreintes par hyperslabs de8192 valeurs au plus, sans
reconstituer toutes les empreintes en tableaux contigus. Le fichier HDF5 encodé,
son espace de travail et la copie exportée restent admis en RAM : il ne s'agit
pas d'un export HDF5 de taille illimitée vers le disque. Les valeurs et métadonnées
relues sont exactes ; l'identité octet pour octet de l'encodage HDF5 n'est pas une
promesse. Le snapshot publié possède ses magasins et sa session ; attendre
`unload`/`dispose`, qui sont asynchrones dès qu'une session existe.

Progression : `fingerprints` pour la fraction de fichiers traités, phases
`prnu-*` pour le calcul courant avec `camera`, `fileName`, `fileIndex`,
`fileCount`. La fraction des phases internes concerne cette étape. Les métriques
annoncent `fingerprintLayout:'segmented'`, backend temporaire et workers utiles.
Les sessions sont enregistrées côté client avant le premier fichier afin que
l'annulation forcée puisse nettoyer aussi les images de travail et moyennes.
Aucun snapshot incomplet n'est publié.

Validation : cycle public existant complet (deux caméras, ordre/recadrage,
exclusions, JSON/CSV/HDF5, trois imports), empreintes natives exactes après
export progressif. Chrome256Mio avec deux images jusqu'à1600×1100 et une seconde
caméra : deux SHA d'empreintes exacts, trois workers/250 travaux, pic225,30Mo,
OPFS libéré. Annulation après un fichier stocké : fermeture avant terminaison
du worker et zéro fichier restant. Preuves `prnu-build-stream-browser-proof.json`
et `prnu-storage-browser-proof.json`. Dossier/branche M4 uniquement, aucune
publication ni modification native.
