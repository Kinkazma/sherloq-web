# Forgeryscope — source et ALIKED segmentés

Le nouvel adaptateur accepte l'original JPEG via analyzeBlob('forgeryscope',...).
Il admet une copie RGB entière pour les préparations natives YOLO/embeddings et
les découpes de panneaux, puis la libère après l'analyse. Les six couches Auto
occupent six octets/pixel, conservées une seule fois et exposées en lecture seule.
La carte float32 est la conversion native du masque, produite par fenêtres : pas
une nouvelle carte ni une archive complète supplémentaire en mémoire. Les petits
appels contigus gardent l'API historique. Le NPZ segmenté conserve les mêmes octets.

## ALIKED

`export-forgeryscope-aliked-segments.py` exporte23 graphes des vrais poids blots,
2,75Mo, sans fusion BN. Seuls les Cast de constantes sont repliés pour éviter un
échec de partitionnement ORT WebGPU. Ni poids, ni seuils ni réseau changés.
Reconstruction des quatre échelles natives ; première projection recalculée
sur demande pour éviter la carte128canaux entière. Les banques intermédiaires
utilisent RAM/OPFS selon budget, les resizes align_corners restent globaux.
Les couches déformables calculent leurs vrais décalages, puis lisent le support
requis, même au-delà d'une portion. Limite native du décalage calculée sur la
forme globale. Déformation CPU native ONNX ; autres graphes CPU/WebGPU.

NMS avec halo10, seuil natif0,2 et repli sur moyenne globale, même tri C++ et512
points globaux. Localisation DKD, offsets SDDH et échantillonnage sur les quatre
échelles à coordonnées globales. Aucun nouveau resize1024 : le natif Forgeryscope
utilise resize=None. La moyenne est accumulée en float64 puis convertie float32 ;
les références testées ont des points au-dessus de0,2 et n'utilisent pas ce repli.
Les cas dégénérés sur égalités numériques restent explicitement non universels.

## Consommation

Fournir `methods.forgeryscope.alikedSegments` (manifest, URL des assets résolues)
en plus des actifs et runtimes habituels. Reconstruire build-forgeryscope-prepare
pour `_fg_aliked_candidates`. Les sources utilisent ce chemin ALIKED ; les appels
contigus l'utilisent au-delà de262144pixels/panneau si configuré. Sans manifeste,
le chemin contigu existant reste disponible, avec son admission mémoire réelle.
Lire mask/map/candidates/geometric/branch_* par readArray ; les polygones restent
dans metadata. B/M5 garde les couleurs/identités/overlays. NPZ asynchrone requis
pour les champs segmentés. Résultat/export partagent les ressources avec comptage
de références ; release/cache avant la fin d'un export ne détruit pas ses données.

## Preuves

- Trois géométries128×96,128×160,129×97 avec portions forcées : features max2,98e-7,
  scores max3,25e-6. Extraction complète : mêmes512points par cas ; quatre
  permutations de scores proches dans un cas, aucune perte/ajout. Après
  alignement par indice spatial : coordonnées max1,526e-5pixel, confiance2,623e-6,
  descripteurs1,818e-6. Budget libéré intégralement.
- JPEG original2008×1444, Auto complet WebGPU/hybride : huit panneaux, une paire,
  mêmes272inliers, score écart1,729e-6, polygones max6,104e-5pixel. Sept champs
  exacts,78640pixels positifs. Export29028060octets lu après release/cache,
  huit fenêtres de quatre champs dans deux régions.49,07s, piccomptabilisé
  3200521180octets sous3Gio ; final actif/cache0, codec16Mio jusqu'àdispose.
- Onze testsNode export/binaire passent, dont conversionfloat à offsets non
  alignés et NPZ segmenté identique aux octets historiques.

La branche microscopie dispose désormais du SIFT paginé (FORGERYSCOPE-SIFT-PAGED-M2) ;
l'Auto positif ci-dessus exerce la branche blots. Les296pixels du cas synthétique
dupliqué dégénéré précédemment documenté ne sont pas déclarés corrigés.


## Recettes originales 96 MP

Trois parcours Chrome WebGPU, profil temporaire sur disque propre, budget3Gio,
source JPEG12000×8000 entière ; aucun ROI réduit substitué à la source.
Les preuves JSON source-96mp sont des recettes de charge/API/mémoire, pas une
nouvelle comparaison indépendante avec le natif à96MP.

| Parcours | Résultat natif de la chaîne | Durée | NPZ |
| --- | --- | --- | --- |
| Auto, figure agrandie | 8panneaux, paire3/7,4inliers ; candidate embedding | 192,240s | 960032316octets |
| Auto, copie texturée | 8panneaux, paire3/7,24inliers ; candidate embedding | 209,713s | 960033520octets |
| Pistes, figure agrandie | 36pistes,3paires,2649692pixels candidats | 19,925s | 576026216octets |

La copie texturée2650×380 entre(1710,1610) et(1710,7360) conserve le même grain
RGB seed2751. Son score0,530806 ne franchit pas0,73 : le masque accepté compte
2284780pixels candidats, le support géométrique reste nul selon la politiqueAuto.
Les deux ALIKED512points et le LightGlue complet sont exécutés. Les sorties pistes
conservent également leur distinction native entre candidats et masque accepté.
Champs complets relus, fenêtres éloignées et NPZ consommés après release/cache.
Pic maximal3219602344octets sous3Gio ; actif/cache0 à la fin, codec résident
jusqu'àdispose. Timings avec d'autres recettes concurrentes, pas un benchmark isolé.
