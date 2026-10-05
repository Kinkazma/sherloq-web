# PatchMatch global paginé — lot M4 27

Ce lot ajoute une voie native à caches bornés. Le chemin résident rapide reste
inchangé. Il ne prétend pas encore raccorder toutes les vues et tous les profils
à cette voie : la préparation SIFT stockée et les consommateurs de champs
(cohérence, géométrie et détail) font partie de la reprise en cours.

## Contrats de calcul

`runPagedDenseField` (`src/dense-paged.js`) reçoit deux plans de descripteurs
float32 intercalés (12 Zernike ou 128 SIFT), le masque uint8 et éventuellement
deux axes float32. Chaque plan expose `byteLength` et `readInto(bytes, offset)`.
Il emprunte ces entrées, sans les libérer. Les paramètres minimum/rayon,
itérations, seed, duo et gap conservent les mêmes unités et règles que
`createDenseMath().field`. Les stores sont en coordonnées du champ global.

La sortie possède les stores `targets` int32 et `distancesSquared` float32,
`comparisons` BigInt, dimensions et métriques. Appeler `dispose()` après les
lectures/exports. Les IDs de cible et l'ordre des candidats sont exacts. Aucun
champ complet ne traverse la frontière WASM/JS. Les offsets des plans utilisent
64 bits ; les IDs restent ceux du natif int32 (au plus 2^31−1 positions).

Le module `vendor/dense-paged` contient le même parcours PatchMatch : initialisation
xorshift, propositions des voisins et extrapolation du premier ordre, recherche
aléatoire décroissante et propositions inverses. Les listes de candidats sont
stockées en ordre global croissant. Elles occupent au plus 8N octets externes,
pas de tableau de taille N dans le tas WASM. Les sommes float32 sans contraction,
les optimisations SIFT et la conservation du gagnant en cas d'égalité restent
inchangées. Les caches sont séparés ; une valeur est copiée avant toute éviction.

Asyncify suspend seulement les entrées/sorties et les points de contrôle. RAM,
OPFS synchrone et IndexedDB asynchrone utilisent le même algorithme. Les caches
sont dimensionnés d'après la mémoire disponible, avec priorité aux descripteurs ;
le masque et les champs plus petits reçoivent des caches réduits. Le tas commence
à 8 Mio, plafonné à 128 Mio, indépendamment de la taille des plans. Le budget
réserve les caches et l'espace de travail ; le stockage partagé comptabilise ses
propres caches et transactions. Les erreurs de stockage sont conservées et les
sorties partielles détruites. Aucune calibration ne précède le calcul utile.

`preparePagedZernike(image, options)` lit une surface RGB8 par fenêtres avec le
halo natif `3*patch+1`. La taille utile diminue si nécessaire pour admettre le
vrai calcul natif. Les bords de l'image ou de la région gardent leur sémantique.
Des workers indépendants préparent simultanément le maximum de fenêtres admises
par le budget, jusqu'à `maxWorkers`. Ils sont terminés avant de libérer leurs
réservations : leurs tas ne restent pas cachés au calcul suivant. Les sorties
sont deux plans 12-float32 par pixel (un seul sans miroir).

`runPagedZernike(image, mask, options)` chaîne cette préparation avec le matcher
global et libère les descripteurs après le calcul. `region`, facultatif, est
`[x,y,width,height]` en coordonnées de la surface. `mask` et `axes` appartiennent
au repère de cette région ; `origin` reste joint à la sortie. La segmentation
de préparation est permise par le support fini Zernike ; elle ne limite jamais
les candidats du PatchMatch aux mêmes fenêtres. Cette règle ne sera pas copiée
aux filtres SIFT, dont les axes complets doivent être conservés.

## Validation du lot

- `scripts/check-dense-paged.mjs` : huit cas 12/128 dimensions, mono/duo, axes
  compactés ou ordinaires et gap. Une seule page de 512 octets par cache force
  les évictions et les descripteurs traversant des pages. Champs et compteurs
  identiques octet pour octet au moteur résident. Annulation et erreur I/O
  injectée laissent le budget à zéro.
- `scripts/check-dense-paged-browser.mjs` : Chrome, véritables stores OPFS et
  IndexedDB, champs et 22 449 comparaisons exacts, fermeture des sessions.
- `scripts/check-dense-paged-zernike-browser.mjs` : Chrome, RGB source, masque,
  descripteurs, champs et listes sur OPFS, miroir Zernike 512×384, patch 8,
  deux itérations. 5 021 062 comparaisons et les deux champs exactement égaux
  au calcul résident. Budget 64 Mio ; pic comptabilisé 54 682 866 octets ;
  préparation 32 Mio de tas par worker, matcher 24 117 248 octets de tas.
  Le parcours a pris environ 7,2 s lors de cette qualification locale, sans
  passage préparatoire de réglage. La référence indépendante est exécutée après
  destruction des ressources mesurées, hors de ce budget de qualification.

Erreur max/moyenne des distances carrées float32 : 0 / 0 dans ces cas.
Changements d'ID de correspondance : 0. Les masques finaux, paires géométriques
et vues ne sont pas encore consommés par ce nouveau parcours ; aucune nouvelle
preuve sur ces étapes n'est revendiquée par ce lot.

## Lot 28 : SIFT compact stocké

`preparePagedSift` reçoit la même surface RGB segmentée et une région facultative,
avec `patch`, `support`, `mirror`, `quarter`, budget et stockage. Les gradients
utilisent un halo fini ; les convolutions triangulaires conservent chacune les
axes complets et l'ordre d'intégration VLFeat. Une transposition bloquée relie
les deux axes. Les normalisations/cadrages sont indépendants par descripteur.
La taille de la source et la résolution ne changent pas.

La sortie `kind: 'compact-sift'` possède les stores `hist` (8 float32/pixel),
`norms` (3 float32/descripteur), `turns` et `diverse` (uint8), quatre poids et la
métadonnée de support/miroir/cadrage. `runPagedDenseField` accepte directement
ces objets en `first`/`second`, avec `width/height` égaux à `viewWidth/viewHeight`.
Il reconstruit les 128 composantes exactement, à la demande, dans le moteur
natif. Les stores ne sont pas convertis en fichiers de 128 flottants/pixel.
Deux caches de 512 descripteurs reconstruits évitent les recalculs récurrents.

Si le cadrage par quart de tour nécessite la diversité, le matcher copie le
masque d'entrée dans un store propre et y applique le filtre natif. Il retourne
`allowed` avec `ownsAllowed: true`; `dispose()` le ferme. Sans ce filtre, `allowed`
est emprunté avec `ownsAllowed: false`. Les entrées compactes restent propriété
du producteur : les libérer après les calculs qui les utilisent.

Les workers de préparation sont réutilisés entre étapes et terminés avant le
retour. Les bandes d'axes diminuent selon le budget ; une colonne complète reste
nécessaire à ce stade (borne mémoire explicite linéaire dans le plus grand axe,
pas dans l'aire). 12000×8000 entre dans cette borne de travail, mais **le parcours
≥94 MP n'est pas encore qualifié**. Le refus d'une colonne trop grande n'est pas
une limite scientifique et reste une contrainte à étendre si elle est atteinte.

`scripts/check-dense-paged-sift-browser.mjs` : Chrome/OPFS, 157×139, deux chemins
(simple 8→8 et miroir 8→10 avec quart de tour), coutures de fenêtres, trois workers,
budget 64 Mio. Les champs float32 et int32, le masque de diversité et les comptes
486321 / 428431 sont identiques à `compactPrepare`/`compactField` natifs. Erreur
max/moyenne des distances carrées : 0/0 ; changements de cibles et de masque : 0.
Pic partagé observé : 64 153 452 octets ; tas par worker 8 Mio ; environ 3,8 / 4,1 s
lors du contrôle local. Ces durées sont celles du parcours modifié, pas une
calibration du produit. La référence est un contrôle de développement distinct.

Les consommateurs de cohérence/composantes, correspondances et détail sont le
lot suivant. Aucune conclusion sur la couverture 94 MP ou l'UI ne découle de ces
petits cas.

## Lot 29 : cohérence et composantes globales

`runPagedDenseCoherence(field, options)` emprunte `targets`/`distancesSquared` et
retourne `selected` uint8, `errors` float32, métriques et `dispose()`. Les paramètres
threshold/errorThreshold/radius/minimum ont le même sens que le moteur résident.
Les champs peuvent rester dans RAM, OPFS ou IndexedDB tout au long du calcul.

Les sommes locales exactes utilisent un anneau de préfixes dans une bande de
512 colonnes plus halo. Il n'y a pas de normalisation ni de décision par tuile.
Pour les axes au plus 2^20, la borne des sommes entières garantit leur exactitude
en float64 ; le résidu reprend l'ordre arithmétique natif. Au-delà, le parcours
original par voisins est conservé. Les composantes 4-connexes utilisent un arbre
d'union global stocké, des tailles saturées au seuil utilisateur et des étiquettes
stockées. Seuls les runs de deux lignes restent résidents. Trois stores temporaires
4N servent à ce filtre ; ils sont fermés avant le retour. Même un seuil de taille
très élevé ne provoque plus une liste résidente de tous les pixels de la composante.

`scripts/check-dense-paged-coherence.mjs` compare quatre champs de largeur jusqu'à
1079, rayons 1/3/6 et seuils de composantes 1/6/30000, avec deux pages de 512 octets
par cache. Les sélections non vides (2583, 19328, 12231 pixels), l'élimination par
un grand seuil et les erreurs float32 sont identiques octet pour octet au natif.
Le test SIFT navigateur inclut désormais cette consommation des champs OPFS :
masques et erreurs restent exacts sur les deux chemins. La recette ≥94 MP demeure
à accomplir avec éligibilité, correspondances, géométrie/détail, vues et exports.

## Lot 30 : éligibilité ROI/texture sur une source stockée

`createPagedRegionsMask` rasterise les régions/exclusions sur un store uint8 de
la grille des descripteurs. Le clipping entier, le parcours LINE_8 et les arêtes
fixes OpenCV sont conservés, sans image de masque pleine résolution dans le tas.
Les intersections sont évaluées dans le repère global. L'arrondi pair des centres
SIFT demi-pixel est respecté, y compris lorsque plusieurs centres échantillonnent
le même pixel du masque. Source/notice OpenCV épinglées dans
`vendor/dense-paged-source` ; licence historique Intel conservée.

`preparePagedEligibility(image, options)` ajoute le filtre de texture natif,
avec régions déjà exprimées dans le repère du crop facultatif `[x,y,w,h]`.
Des workers lisent des fenêtres à halo suffisant, calculent le même boxFilter
OpenCV et combinent son résultat avec les bits du masque stocké. Les origines
internes restent paires pour conserver les arrondis demi-pixel. Le plan de
stockage laisse de la mémoire au filtre avant d'admettre le masque en RAM.

96 cas de polygones (bord, clipping, intersections, chevauchements, exclusions,
centres entiers/demi-pixel) sont identiques au remplissage natif. Cinq parcours
Chrome OPFS 279×231, Zernike/SIFT, patchs 3/5/8/32, texture faible ou forte et
polygones superposés sont identiques au masque natif, avec deux workers sous
128 Mio. Ce sont des contrôles locaux de fidélité ; ils ne remplacent pas la
recette source ≥94 MP et sa charge de structures.

## Lot 31 : contrôleur, refiltres et consommation géométrique

`DenseImageEngine` accepte désormais un record `image.surface` RGB8 (avec session
ou `ensureTemporarySession` si le stockage temporaire devient nécessaire). Il
délègue à `PagedDenseImageEngine`; les entrées `image.data` conservent leur chemin
résident. `DenseCopyEngine` transmet également ces records, en conservant les
coordonnées de la surface. Les destructions/libérations peuvent être asynchrones
et doivent être attendues avant de fermer la session du propriétaire de source.

Chaque champ paginé annonce `paged: true`. `targets`, `distancesSquared`,
`allowed`, `selected` et éventuellement `errors` sont des stores à accès par
`readInto`, pas des tableaux à indexer. Ils restent disponibles en entier.
`displayRows` reste un Int32Array, avec le même plafond **utilisateur natif** et
le même échantillonnage de rang ; `uniqueLinks` et `denseCount` sont globaux.
`samplePagedDenseLinks` élimine les liens réciproques selon les mêmes distances,
égalités et IDs, puis stocke les lignes retenues. `gatherDenseValues` lit seulement
les valeurs nécessaires au consommateur de géométrie, dans l'ordre demandé.
`packDenseCorrespondences` prend en charge les deux formats de champ et produit
les mêmes points Nx7, paires Nx4, appartenances et provenances.

Le contrôleur conserve les champs bruts lors des changements de seuil,
cohérence ou nombre de liens affichés. Les sorties d'un ancien refiltre gardent
leurs propres stores jusqu'à leur libération. Les histogrammes/normes SIFT
communs sont réutilisés entre passes : le support et l'activation du cadrage sont
des vues de la représentation compacte, sans refaire les gradients. Les
préparations restent communes à un crop, patch et orientation précis ; deux
contextes de recherche ne perdent pas leur identité. Les stores de préparation
sont fermés après les champs, ceux de résultat/cache selon leurs leases.

Validation : quatre plafonds de liens (1/6/6000/tous) donnent les mêmes 8951 liens
uniques et 4760 candidats au seuil qu'en RAM. Chrome compare les champs complets,
les liens et le packing pour Zernike/duo avec refiltres ; les données restent
vivantes après fermeture du cache et toutes les réservations sont restituées.
Le parcours source OPFS→éligibilité→descripteurs→champ→cohérence→géométrie
Similarity retrouve exactement les points, paires, groupes, modèles et couleurs
natifs sur trois profils de base : 1/1/2 groupes non vides, 241/65/306 paires.
Cette recette utilise 512 Mio car le noyau M3 épinglé réserve encore 264 Mio à
l'instanciation ; le premier essai sous 128 Mio a correctement refusé cette étape.
Le plafond M3 n'est pas modifié par M4. Les références de champs seuls sous
64/128 Mio restent acquises.

Le détail complémentaire, les guides de miroir et le rendu pleine image des
records segmentés sont les prochaines étapes. La recette ≥94 MP source/calcul/
consultation/refiltre/export reste à effectuer. Ce lot n'annonce donc ni toutes
les vues segmentées ni la couverture de taille finale.

## Lot 32 : détail local exact et guides clairsemés

Les profils complémentaires consomment maintenant le RGB stocké sans fabriquer
un high-pass de taille N. `createPagedDetailSampler` calcule à la demande les
fenêtres 64×64 avec cinq pixels de halo gaussien et un pixel pour l'interpolation.
Il utilise les kernels natifs high-pass/remap et leur FMA, avec la même grille
1/32 ; les bords réels gardent REFLECT_101. Les valeurs locales sont un cache
évictable du budget commun. `DenseCopyEngine.clear/dispose` le libère. Les appels
de corroboration acceptent les samplers synchrones et asynchrones.

`pagedGuideLabels` évalue les points sur le raster global des guides sans créer
un masque pleine image. Il conserve les collisions entre guides et ignore les
visites multiples d'un même point à l'intérieur du même guide. Le coût mémoire
dépend des points et sommets, pas de l'aire RGB.

Deux séries de 2592 échantillons couvrent bords, coutures et demi-pas de la grille
1/32 : erreur float32 max/moyenne 0/0. Seize jeux de guides, points hors image et
recouvrements : labels identiques au natif. Le parcours Chrome OPFS complet jusqu'à
la géométrie et la corroboration passe sur les profils étendus et miroir, dont
une vraie réflexion : groupes/modèles/couleurs/points/paires exacts, 2 groupes et
321/306/321/239 paires selon les quatre cas. Ces contrôles utilisent 512 Mio
avec le noyau M3 de 264 Mio ; pic comptabilisé maximal 328 129 912 octets.

Le contrôleur réutilise aussi la préparation Zernike normale de la paire miroir
lorsque les deux sont demandées. Le candidat de rang r vaut directement r lorsque
tout le champ est éligible, évitant les lectures aléatoires inutiles de la liste
externe ; des contrôles supplémentaires 12/128 composantes couvrent ce cas.
Aucune proposition ni aucun ordre de comparaison n'est changé. Le rendu de la
surface et l'export complet, puis la qualification ≥94 MP, restent à terminer.

## Lot 33 — rendu natif depuis surface

`renderDenseCopy(image, result, style, {budget, signal, onProgress})` accepte
`image.surface`. Il retourne `surface` au lieu de `pixels`, avec les mêmes
`visible`, `legend`, `selectedGroups` et `style`. Attendre `release()` après
consultation/export. La source et le résultat restent empruntés.

Un worker de dessin reçoit le RGB par pages de 4 Mio, applique les primitives
OpenCV natives et restitue des pages vers un store RAM ou temporaire. Les
coordonnées globales, anticrénelage, ordre des groupes, mélanges et politique de
recouvrement miroir sont inchangés. Le worker est détruit avant de libérer sa
réservation ; l'annulation le termine et détruit la sortie partielle. Progression
`dense-view-source` / `dense-view-output` en lignes / octets utiles.

Le framebuffer natif reste contigu (3 octets/pixel), mais les copies complètes
JS source/sortie disparaissent. La réservation tient compte du plus grand
rectangle d'overlay réellement demandé, des métadonnées et du staging. Ce lot
ne prétend donc pas dessiner sous un budget inférieur au framebuffer natif.
La sortie peut être consommée par fenêtres et par les exports de surfaces M5.

Validation Chrome OPFS : `check-dense-paged-view-browser.mjs` rejoue les sept cas
non vides (six profils et réflexion), soit 21 vues natives, y compris changements
de sélection, distances, styles et groupes cachés. Tous les octets RGB, légendes
et groupes visibles sont exacts ; mémoire finale nulle. Preuve détaillée :
`dense-paged-view-proof.json`. Il s'agit encore du corpus 74×62, pas de la
qualification >=94 MP.

## Lot 34 — archive complète et helpers communs

Consommation exacte de `f18fe7d` (propriétaire M5) : `opfs-storage.js` avec
fichiers physiques de 1 Gio, `scientific-zip.js`, `scientific-json.js` et
`scientific-npz-stream.js`. Alias public `npyHeader` identique à l'intégration.
Aucun ZIP64 concurrent. Ces fichiers sont à réconcilier une seule fois à la
fusion, leurs versions M5 déjà intégrées ne sont pas à remplacer par une autre
implémentation.

`exportDenseNpz(result, request, {budget, signal, onProgress})` assemble les
points/paires/couleurs/provenances, chaque groupe, tous les plans complets
(targets, distances_squared, allowed, selected, errors si disponible), les rangs
d'affichage et les métadonnées de paramètres/modèles/contextes/transformations.
`request` reprend stockage/limite/provenance du scientifique commun. Lire le
`store` par pages ; attendre `release()`. Le résultat doit rester vivant pendant
l'assemblage ; l'archive achevée est indépendante de la source et du moteur.

Chrome OPFS sur résultat Zernike positif : archive ZIP64 forcée pour exercer le
format, 14 entrées, 106204 octets. Relecture après libération moteur/source,
SHA intégral identique ; Python zipfile valide tous les CRC, NumPy valide les
cinq plans complets par hash et les points/paires/couleurs/provenance par la
référence native. Preuve `dense-paged-export-proof.json`, scripts navigateur
puis `check-dense-export-reader.py`. Ceci qualifie le raccord du consommateur,
pas encore la taille 96 MP (recette en cours séparée).

## Lot 37 — rang/sélection compact et accès évités

Le matcher choisit des bitsets de candidats résidents lorsque leur taille exacte
et les caches tiennent dans le budget (option technique `residentPool` pour
qualification). Le même rang aléatoire désigne le même ID natif ; appartenance
aux deux régions et ordre restent inchangés. Le repli sur listes externes reste
actif pour les tailles/budgets qui ne permettent pas ces bitsets. À96MP, le plan
admet environ24,75Mo de bits/préfixes et évite deux listes externes de384Mo ainsi
que leurs lectures aléatoires et les relectures d'appartenance du masque.

Une distance déjà nulle ou un candidat déjà gagnant ne peut améliorer la somme
de carrés : le matcher Zernike rejoint le court-circuit exact déjà utilisé SIFT,
sans modifier le compteur natif ni la règle stricte des ex æquo. Le heap grandit
par pas de1Mio afin de contenir sa surallocation dans la réservation. Progression
explicite `stage` eligibility/initialization/propagation/reverse et iteration.

Vingt cas à caches512octets comparent les deux voies au natif : cibles, distances
et compteurs exacts, mono/duo/axes/12ou128dimensions, annulation/I/O propres.
ChromeOPFS192×160 avec masque non plein et copie distante : mêmes1 034 228
comparaisons et SHA complets, lectures552228→72629, temps95,9394→14,627s. Ce gain
mesuré sur petit cache n'est pas extrapolé au96MP. Preuve
`dense-pool-storage-proof.json`. Le premier essai96MP, très coûteux en I/O, a été
interrompu pour reprendre avec cette amélioration ; son relevé partiel conservé
`dense-96mp-first-attempt.json` n'est pas une qualification réussie.

### Initialisation groupée (lot 39)

Les candidats initiaux sont indépendants entre pixels : mêmes PRNG, tentatives,
contraintes et distances natives, lus par destination triée dans un lot borné.
La propagation et le passage inverse conservent intégralement leur ordre natif.
`initialBatchPixels` permet le chemin de référence (`0`) ; par défaut les grandes
sources utilisent la mémoire réellement disponible, jusqu’à 4 194 304 pixels.
Le lot réserve des descripteurs sources, destinations, scores et candidats, plus
8 Mio de cache de lecture. Le heap WASM croît par Mio, maximum 1 Gio ; cela
n’augmente pas le budget utilisateur. Les débordements de distances reprennent
exactement les tentatives restantes.

42 cas champs/compteurs exacts, dont masque/duo/axes et débordements float32 ;
SIFT compact miroir-échelle/quart de tour exact dans Chrome. Sur le cas OPFS
192×160 déjà employé : 23,69 s → 9,32 s, 72 629 → 37 758 lectures, résultats
et 1 034 228 comparaisons identiques. Mesures concurrentes de développement,
non extrapolées au cas 96 MP. `docs/dense-initial-batch-proof.json`.

## Traversée synchrone et reconstruction SIFT partielle

Les résultats des lots suivants dans `M4-96MP-COVERAGE.md` remplacent les limites
historiques ci-dessus : chaîne paginée complète, caches d'initialisation admis
jusqu'au tas natif1Gio, export ZIP64 commun et Zernike96MP acquis. Le duo global Zernike/SIFT et le détail96MP sont désormais qualifiés ;
la portée commune des variantes est explicitée en fin de ce document et dans
`M4-96MP-COVERAGE.md`.

Le pont natif reconnaît désormais une lecture/écriture synchrone terminée sans
suspendre la pile WASM. Les stores RAM et les handles OPFS synchrones conservent
leurs contrôles de plage, erreurs et comptages. Une vraie Promise (IndexedDB ou
point de contrôle coopératif) utilise Asyncify. Le moteur continue de céder la
main aux points de contrôle20ms ; aucune attente utilisateur de calibration.
Le tri NumPy global utilise également ce pont avec ses stores synchrones.

Pour SIFT, la source complète est cachée comme auparavant. La cible est reconstruite
par groupes de seize composantes, dans l'ordre natif, seulement jusqu'au rejet
certain par somme partielle non négative. Le cache garde un masque des groupes
calculés. Initialisation, PRNG, comparaisons, égalités et score gagnant restent
identiques ; aucune proposition n'est supprimée et aucun seuil n'est modifié.

42cas de champs12/128 dimensions (axes, zones, initialisation, overflow),
annulation et erreurI/O restent exacts ; Chrome OPFS/IndexedDB conserve les22449
comparaisons et tousoctets. SIFTcompact157×139,8→8 et8→10miroir/quart, champs,
masques, cohérence et486321/428431comparaisons restent exactement natifs.
Les essais prolongés de développement figent désormais leurs ressources runtime,
pour ne pas associer un ancien ESM avec un WASM recompilé pendant l'essai.

Comparaison OPFS à cache volontairement réduit (deux pages), source128×112 :
champs/masques et197146/170272comparaisons identiques avant/après, sans fuite.
Simple :176,80→108,84s et678861→615289lectures ; miroir/échelle/quart :
303,94→209,81s et1486752→1298929lectures. Ce cas force les évictions pour vérifier
les chemins ; ses temps ne sont pas extrapolés au96MP ni à un cache habituel.
`dense-lazy-target-proof.json` conserve les mesures et SHA des champs complets.


## Bornes SIFT exactes et durée de vie des préparations

Les grands histogrammes externes peuvent ajouter des intervalles conservateurs
par composante pendant leur préparation utile. Ces intervalles servent uniquement
à rejeter un candidat dont la distance ne peut pas battre le score courant.
Les candidats restants gardent le calcul float32 natif ; descripteurs, scores,
champs, compteurs, PRNG et règle d'égalité restent inchangés. Les bornes ne sont
pas une nouvelle représentation scientifique des descripteurs utilisés.

Le cache résident optionnel coûte quatre octets par position cible, admis selon
le budget et le plafond du tas. Quatre composantes forment une orbite de rotation ;
leurs intervalles à sept bits portent aussi le quart de tour. Le plan externe
optionnel coûte 128 octets par position, avec des intervalles à huit bits. Il
reste canonique : les vues normales/quarts de tour partagent les mêmes données,
avec les positions miroir et offsets de support natifs. Chaque terme minoré et
son accumulation float32 sont monotones ; aucune distance pouvant améliorer le
champ n'est supprimée. Une valeur hors intervalle représentable reste inconnue.

La table complète est préparée par défaut seulement pour un histogramme externe
de plus de 16 Mio, puis utilisée s'il déborde du cache natif. Un histogramme en
RAM garde sa voie directe. Les tables sont libérées après leur dernière recherche
cible ; les préparations encore nécessaires comme source sont conservées. Un
quota ou une allocation mémoire refusée pour ces accélérateurs entraîne leur
abandon propre et la poursuite avec les descripteurs exacts. Le même repli couvre
les erreurs de quota à l'écriture et au flush. Aucun prétest utilisateur.

Contrôle ciblé : 42 champs natifs génériques et erreurs/annulation conservés ;
SIFT 157×139 simple et miroir 8→10, normal consommant une préparation à quart de
tour, 486321/428431 comparaisons, champs et cohérence exactement natifs. Le second
cas force l'absence du cache résident. Quatre pannes de quotas injectées gardent
les champs exacts et libèrent les tables. Les quatre parcours d'intégration
supplémentaires conservent groupes, modèles et paires après la libération anticipée.
Le tri Noisesniffer partagé garde ses quatre cas Chrome natifs et sa mémoire finale
nulle. Preuves : `dense-sift-bounds-proof.json`, `dense-sift-bounds-quota-proof.json`,
`dense-paged-supplemental-proof.json`, `noisesniffer-paged-proof.json`.

Avec deux pages de cache forcées sur 128×112, les lectures passent de 615289 à
356576 (simple) et de 1298929 à 601673 (miroir/échelle), pour les mêmes champs
et compteurs. Les temps observés sont 108,84→130,30 s et 209,81→109,84 s :
les charges concurrentes diffèrent et la réduction des lectures n'est pas une
promesse universelle de temps gagné. `dense-sift-bounds-storage-proof.json`.
L'essai 96 MP précédent a été interrompu après plus d'un téraoctet de lectures
pour une fraction de la propagation SIFT ; il est conservé comme essai incomplet.
La recette complète reprend avec cette optimisation, sans changement de source,
de ROI ou de paramètres scientifiques.


## Repli sur coût de lecture utile (lot55)

Le matcher observe une lecture réelle de page sur seize, séparément pour les
histogrammes/normes et pour la table externe optionnelle. Après au moins32
observations de chaque voie, une table dont la lecture moyenne coûte plus de
huit lectures de référence est désactivée pour le reste du champ. Les bornes
résidentes restent actives et les candidats poursuivent le calcul natif exact.
Le propriétaire libère ensuite la table retirée avant les passes suivantes.
Aucune lecture supplémentaire ni calibration préalable. Les statistiques et
`siftBoundsFallback` sont disponibles dans les métriques/progrès du champ.

Le contrôle de repli impose une latence sur la seule table et garde les
histogrammes en mémoire pour isoler ce cas de la contention disque du poste.
Miroir/échelle3→5 et quarts de tour : désactivation après504 lectures, champs,
cohérence et61355 comparaisons exactement natifs, budget final nul.
Preuve : `dense-sift-bounds-adaptive-proof.json`.

Le troisième essai96MP est conservé comme incomplet : sa propagation était
plus lente sous charge concurrente, malgré moins de lectures. Il ne sépare
pas la contention du poste du coût propre de la grande table. Le repli de
latence évite un coût relatif excessif observé ; il ne promet pas un débit
minimal ni un gain universel. La qualification complète reste à terminer.


## Portée proportionnée de la qualification grande source

La reprise commune autorise une preuve96MP par adaptateur mémoire partagé.
La recette finale retient donc le duo normal complet : Zernike et SIFTcompact,
sous1536Mio, source12000×8000 riche et copies à6000px, champs globaux et NPZ
intégral. Elle force le format ZIP64 mais ne revendique pas une archive>4Gio.
Les variantes miroir/échelle/quart de tour réutilisent ces mêmes préparateurs,
stores, matcher, cohérence, vues et export ; leurs décisions, compteurs,
coordonnées et parcours multipasses restent couverts par les preuves natives
acquises, notamment `dense-sift-bounds-proof.json` et
`dense-paged-supplemental-proof.json`. Cela ne constitue pas une exécution des
sept passes étendues à96MP. Le quatrième essai est conservé séparément comme
interrompu pour ce recentrage, sans erreur numérique ni mémoire observée.
Le lecteur indépendant exige des copies lointaines dans chacun des deux champs,
ainsi que SHA, CRC et lecture intégrale de toutes les sorties exportées.


## Détail supplémentaire sur original96MP (lot57)

Le détail est un chemin distinct du matcher global : son échantillonnage fini
porte uniquement sur les voisinages prévus par la méthode native. Une recette
Chrome dédiée décode le même original12000×8000 sous256Mio, puis vérifie2592
échantillons répartis sur toute l’image, y compris les bords et frontières de
blocs. Chaque float32 est identique au remap de l’image de détail native complète.
Une seconde consultation ne relit pas la source. Trois modèles sur80centres
(32retenus par la règle native) produisent exactement les scores natifs : copie
à6000px acceptée/NCC1 ; réflexion et échelle incorrectes rejetées, NCC
0,19836191833019257 et0,20984899252653122. Aucun matcher simulé.

NPZ12350octets relu intégralement après libération de l’image, SHA/CRC et tous
échantillons/scores natifs exacts. Pic123381029octets, final0,122,547s ; référence
native pleine image1,144s. Le temps navigateur inclut2590fenêtres dispersées,
consultation/cache, changements de modèle et export. Preuve
`dense-detail-96mp-proof.json`, générateur/recette/lecteur `*dense-detail-96mp*`.
La couverture de ce contrôle interne complète celle du duo global ; elle ne
prétend pas exécuter sept matchers ni fournir une nouvelle vue plein cadre.


## Clôture grande source — duo et couverture commune

Cinquième recette complète passée : Chrome, original12000×8000 riche, champs
Zernike96M et SIFT95 820 081positions, recherche globale, 60groupes puis55au
refiltre,12000paires exportées toutes à6000px. Les deux vues sont produites ;
le refiltre0,3→0,2 réutilise les champs. NPZ commun ZIP64 forcé2 687 035 830octets,
74tableaux, SHA/CRC et tous les plans relus après libération du moteur/source.
Le lecteur compte85 739 989cibles Zernike et92 145 662cibles SIFT correspondant
exactement à la copie distante connue. Pas de revendication bit-exact96MP face
à un second matcher natif ; les cas natifs ciblés restent acquis.

Pic comptabilisé1 336 575 492octets sur1536Mio, final0 ; parcours5 350,001s.
La table externe lente a été retirée pendant le vrai calcul (0,184375ms contre
0,002249ms par lecture observée), sans changer les décisions. Les lectures
logiques globales restent coûteuses et les chiffres ne sont pas un plafond RSS.
Preuve `dense-sift-96mp-proof.json`, réemploi des variantes/détail et limites
dans `M4-96MP-COVERAGE.md`. Les anciennes mentions « en cours » de ce journal
sont historiques ; la mission moteur/API M4 est achevée. L’intégration UI et la
publication restent aux responsables désignés.
