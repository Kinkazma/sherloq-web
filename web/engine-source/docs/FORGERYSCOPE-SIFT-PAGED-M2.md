# Forgeryscope — SIFT paginé

Base M3 reprise par fichiers committés0aaf98a, jamais par fichiers WIP : pyramides
Gaussian CPU/WebGPU, bases globales RAM/OPFS, extrema et continuations globales,
descripteurs sur leur support natif. Pas de resize, échantillonnage ou limite
locale de points. Nouvelle famille interne Forgeryscope-SIFT préserve le wrapper
spécifique : quatre couches, contraste0,0066667, gris Kornia float32 tronqué,
retainBest4096 avant dédoublonnage par cellule, maximum réponse/minimum angle,
ordre OpenCV puis topk natif si nécessaire. Les coordonnées et angles utilisés
pour les descripteurs ne sont pas remplacés par les coordonnées/angles publics.
RootSIFT conserve le graphe existant ; pas la normalisation JS de SIFT-LightGlue.

Original, miroir horizontal, vertical et rotation180 sont des transformations des
pixels lus, avec coordonnées dans l'image transformée. L'adaptateur automatique
s'active au-dessus de262144pixels/panneau ; petits appels denses conservés.
Les banques volumineuses utilisent OPFS en laissant la place aux workers ; session
propre fermée au retour/échec. Concurrence admise sur le budget partagé, aucune
calibration. Le collecteur ne réduit pas la recherche globale en cas de manque RAM.

## Validation

- Deux références petites : points/réponses/échelles exacts ; RootSIFT max5,96e-8,
  angles9,54e-7rad. La preuve initiale est remplacée par le corpus dense ci-dessous.
- Quatre transformations d'une image1280×768, plus de5000candidats globaux,
  2743–2755points après la sélection native : CPU paginé et ancien dense présentent
  exactement les mêmes écarts à l'oracle Python. La preuve directe WebGPU paginé
  contre ancien dense CPU compare TOUS les tableaux : aucune différence dans
  points, descripteurs, réponses, tailles ou angles. Deux continuations globales
  sont effectivement nécessaires dans le premier cas. Deux workers, pic1,6405Go
  sous3Gio (comparaison comprenant les deux implémentations), final0.
- Écarts préexistants à l'oracle Python retenus comme contre-preuves false : points
  et réponses exacts, tailles4,77e-7 ; RootSIFT max0,003691 et un angle0,011953rad.
  Aucun seuil élargi pour rendre ces fichiers verts. Ce n'est pas une régression
  de la pagination ; parité numérique universelle avec la bibliothèque hôte
  non annoncée. La quantification des descripteurs reste native.
- Chaîne complète microscopie GPU, original et miroir : mêmes41matches/inliers,
  même transformation gagnante, score exact, affine<1e-15 ; budget final0.
-13 tests décisions/contrôle LightGlue/géométrie passent.

## Fusion M5

Les modules M3 auxiliaires sont repris identiques à0aaf98a. Fusionner une seule
fois src/sift-paged.js, worker et vendor. Le noyau ajoute uniquement l'export
m2_sift_forgeryscope_select ; les autres profils ne changent pas. Asset SHA
523bfdbc89410d09acd73e89a7a2053795b222aebdb5dcf832f8c6c03a69b576,
1379380octets ; rebuild avec build-sift-arithmetic-study puis
build-sift-paged-study --runtime, propres sorties .build/m3 et vendor.
Le choix RAM/OPFS garde désormais une réserve de travail lors de la création
initiale des grosses banques. Les sources OpenCV/SDK externes restent readonly.
Pas de nouveau paramètre UI ; mêmes profils et résultats/exports/coordonnées.

Recette96MP microscopie réussie sur deux panneaux48MP couvrant tout l'original
PNG12000×8000 ; SHA9f72134008628c8dfb7f2468e865f064cce4188c0ab0447ee3fddafbecd6c4f0.
Preuve charge/API/mémoire, sans oracle natif indépendant96MP.


Reconstruction complète reproduite : même SHA WASM. Un essai96MP a été arrêté
par la vérification d'intégrité lors de cette reconstruction simultanée : le
linker écrivait temporairement un WASM plus grand avant optimisation. Aucun
actif erroné n'a été exécuté. Le build utilise désormais un répertoire staging et
un remplacement atomique des fichiers terminés ; la recette est relancée sur
les actifs stables. Cet incident de développement n'est pas une erreur SIFT.


## Microscopie 96 MP — résultat complet

`forgeryscope-source-96mp-microscopy-webgpu-proof.json` : PNG original entier,
deux panneaux48MP sans zone omise ; cinq extractions SIFT complètes (source et
quatre transformations du second panneau), RootSIFT, LightGlue adaptatif natif,
RANSAC et polygones en coordonnées source.2584inliers, score0,959514,
transformation miroir retrouvée ; enveloppe géométrique96Mpixels, candidats0.
Trois champs complets relus, quatre fenêtres éloignées, NPZ576025276octets lu
après libération du résultat et du cache. Analyse502,10s, total512,84s avec autres
recettes concurrentes, dont49,86s de décodage PNG et une lecture/empreinte lente.
Pic2877329572octets sous3Gio, mémoire comptabilisée finale0. Le plafond4096 avant
unique reste natif ;2588points sont visibles dans la trace du miroir LightGlue.
Les panneaux couvrent tout l'original et ne remplacent pas l'image par un petit ROI.
Cette recette complète les parcours Auto/blots/ALIKED et pistes96MP déjà acquis.
