# Noiseprint et Composite Splicing — M2

État courant : [covariance-floor-v1](COMPOSITE-STABILITY-M2.md) reprend désormais
la correction native autorisée, sur les trois chemins navigateur. Les mentions
ci-dessous de singularités non résolues ou de régularisation ULP seule décrivent
la politique **historique** et ses preuves conservées. Les gains BLAS restent actifs.


La voie source courante et sa recette complète96MP sont décrites dans
COMPOSITE-SEGMENTED-M2.md. Les limites numériques presque singulières sont
toujours ouvertes ; le stockage segmenté ne change pas la régularisation native.

La voie source et banques segmentées est désormais livrée ; voir
[COMPOSITE-SEGMENTED-M2.md](COMPOSITE-SEGMENTED-M2.md). Les paragraphes ci-dessous
décrivent aussi la voie contiguë historique, conservée pour compatibilité.

Les 51 checkpoints Noiseprint 51…101 sont convertis sans réentraînement :
17 convolutions, normalisation et biais distincts, ReLU sauf dernière couche.
Le graphe utilise les tenseurs HWIO d'origine transposés en OIHW. Les modèles
sont externes, SHA du checkpoint et SHA/taille du graphe manifestés.

La préparation et les statistiques exécutent les fonctions Python natives dans
Pyodide 0.26.4, NumPy 1.26.4, SciPy 1.12.0, OpenBLAS 0.3.26, OpenCV 4.9.0 et
Pillow 10.2.0. Seule adaptation de `spam_np_opt.py` : les codes `bincount` sont
convertis en `np.intp` après contrôle de plage, car WASM a des pointeurs 32 bits.
Histogrames et statistiques ne sont pas remplacés par un détecteur simplifié.
Le manifeste contient les SHA avant/après cette adaptation. Packages Pyodide
vérifiés contre leur lock ; archive des sources vérifiée avant import.
Documentation de l'hôte Python : https://pyodide.org/en/0.26.1/usage/api/js-api.html

## Preuves

- Cinq modèles 51/90/95/100/101 face au vrai TensorFlow CPU : erreur résiduelle
  maximale CPU 2,289e-5, backend WebGPU 3,815e-5 (<1e-4).
- Préparation : grayscale exact, deux courbes de 100 qualités exactes, modèles
  automatiques 100 et 90 exacts ; deux affichages du bruit exacts.
- Statistiques seules : 737280 features SPAM exactes, 1440 validités exactes,
  carte EM max 7,527e-11 et 479232 composantes couleur finales exactes.
- API réelle : bruit conservé après refus natif d'une carte trop petite,
  isolation du cache et zéro mémoire retenue après dispose.
- **Limite conservée** : cas synthétiques presque singuliers (petit oracle
  statistique et chaîne complète sur bruit RGB) amplifient de minuscules écarts
  de covariance/résidu en différences importantes de carte. Ces cas complets
  ne passent donc pas la qualification ; la chaîne naturelle décrite plus bas passe. Les rapports en échec restent présents ;
  pas de régularisation ajoutée, changement des dix EM ou seuil élargi.

La référence TensorFlow doit être générée dans un processus frais ; les imports
combinés d'export provoquaient une attente native. Le script de référence isole
ce processus et désactive explicitement le GPU dans sa ConfigProto.

## Mémoire et exécution

Chaque worker Python a un véritable maximum WASM fixé avant initialisation.
Le budget compte ce maximum, les téléchargements/copies de runtime et les
entrées/sorties. Annulation par destruction du worker ; sessions inutilisées
récupérables. Noiseprint garde les tuiles natives 1024 et halo 34. Si une tuile
ne tient pas, ses sorties sont subdivisées avec le même halo et les frontières
de l'image source : aucun pixel de contexte du réseau à 17 couches n'est perdu.
Les tuiles natives indépendantes utilisent les workers disponibles et la RAM.
La subdivision interne de secours est séquentielle.

La voie historique conserve les statistiques monolithiques pour les petites
images. La voie par bandes décrite ci-dessous prend en charge les plus grandes
images ; les tableaux source et résultats restent soumis au budget partagé.
Pas de calibration/canary/benchmark utilisateur.

## Contrat B

`createCompositeAnalyzer({assets,runtimes,statisticsRuntime,budget?,...})`.
`assets` indexé par qualité (chaînes 51…101). `statisticsRuntime` : URL locale
du runtime, SHA de l'archive Python, somme des tailles téléchargées.
`analyze(rgb8,{quality:0|51…101,stage:'noise'|'map'},hooks)` : qualité 0 = vraie
courbe JPEG native, 101 = modèle sans JPEG. Qualité automatique <51 : erreur
explicite demandant un modèle installé. Aucun recadrage ni redimensionnement.

Résultat `data.noise` float32 source, `noise_rgb`, modèle choisi et courbe
optionnelle ; pour carte réussie, `map` float64 et `mapShape`, `valid`, `range0/1`,
`raster`, `map_rgb`, `Sigma`, `mu`, `L`, `eigs` et paramètres EM. Une carte refusée
retourne `mapError` **avec** le bruit terminé. `render(result,'noise'|'map')`,
`exportNpz(result)`, `clearCache()`, `dispose()`, `memory()` ; chaque sortie a
`release()`. NPZ conserve les tableaux scientifiques et la provenance.
Progression chargement, courbe, inférence/tuiles, statistiques, ajustement.
Composant exporté de `src/index.js`, sans activer le détecteur complet dans le
registre public tant que les limites de qualification restent ouvertes.

Runtime rebuilds now use fixed ZIP entry timestamps and preserve the original
factory SHA independently of the patched factory. Two consecutive builds produce
the same manifest SHA. Runtime/model configuration is copied at analyzer creation
and included in result-cache identities.

## Chaîne complète sur image naturelle

`generate-composite-natural.py` et `study-composite-natural.mjs` utilisent la
photo astronaut 512×512 distribuée avec scikit-image, modèle natif 95. Les voies
CPU et WebGPU passent : 1862 blocs valides, carte brute maximale 2,89e-9,
validités/raster/couleurs finales identiques, résidu max 2,57e-5 CPU et 4,58e-5
WebGPU. NPZ complet 4 107 484 octets ; réservation/cache/session à zéro après
libération. Les contre-preuves presque singulières ne sont ni supprimées ni
« réparées » avec une régularisation étrangère à la méthode. Elles décrivent
une limite numérique connue de cette chaîne portable, distincte de la chaîne
complète désormais vérifiée sur cette image naturelle.

## SPAM par bandes, PCA globale et dix EM parallèles

`memoryBounded:true` choisit `composite-stream.js` ; cette voie est automatique
au-delà de 1 050 000 pixels. Les poids sont calculés sur l'image entière. Les
histogrammes SPAM sont construits par bandes alignées au pas natif de huit pixels,
avec contexte conservé et au plus 32 lignes de caractéristiques par opération.
La moyenne suit l'ordre des lignes ; la covariance est accumulée par portions.
La PCA reste globale, avec les 32 composantes natives. Les dix EM originaux
utilisent chacun leur tirage exact de RandomState(0), 100 itérations et la
régularisation native. Les ajustements indépendants occupent les workers admis
par le budget ; le meilleur modèle est sélectionné dans l'ordre natif des dix
réplicats. Aucun détecteur local ni nouvelle régularisation n'est introduit.

Les preuves naturelles 512×512 CPU et WebGPU passent : histogrammes comparés séparément
exactement au natif, carte finale max 4,43e-9, validité/raster/couleurs exacts,
trois workers EM utiles et mémoire rendue à zéro. Les réservations incluent les
vrais plafonds WASM et les téléchargements de chaque worker. Un worker EM non
admis est repris sur le worker principal ; les échecs et annulations terminent
les workers parallèles avant de rendre le contrôle. Métadonnées :
`memory_bounded` et `bounded_execution` (bandes, workers, meilleur réplicat).

Le regroupement des sommes de covariance peut modifier les derniers bits ; les
cas presque singuliers déjà identifiés restent une limite numérique explicite.
Cette livraison n'annonce pas une qualification 20 MP. Les tableaux JS globaux
et les ajustements EM doivent encore tenir dans le budget réellement disponible.

## Reprise : diagnostic des covariances EM presque singulières

Le résultat ajoute `data.model_conditioning` (float64 exporté au NPZ) et
`data.metadata.model_conditioning` : valeurs propres extrêmes, conditionnement,
rang numérique, dimension 32, tolérance de rang et statut. La tolérance est
`eps(float64) × dimension × rayon spectral`, utilisée exclusivement pour décrire
la précision disponible. Elle ne modifie ni covariance, ni EM, ni carte.
Le diagnostic suit le vrai ajustement utile, sans essai préalable ni calibration.
Il est également présent sur la voie par bandes et EM parallèles.

Les deux contre-exemples sont de rang numérique 15/32 et 16/32, conditionnement
supérieur à 1e16 ou valeur propre minimale non positive au niveau des arrondis.
La régularisation native vaut un seul espacement flottant de la plus grande
valeur propre ; elle rend les distances de Mahalanobis extrêmement sensibles à
l'arithmétique BLAS/Cholesky. La covariance de référence native du petit cas a
elle aussi des valeurs propres de l'ordre de 1e-17 à 1e-15 : ce n'est pas un
simple opérateur GPU erroné. Le résidu natif exact a été fourni aux statistiques
navigateur pour isoler cette cause.

Effet mesuré : petit cas, raster max 28/255, moyenne 7,438/255 ; second cas,
max 65/255, moyenne 17,071/255. Les valeurs normalisées maximales .1098 et .2549
excèdent nettement la latitude 1e-2 ; ces cartes ne sont pas qualifiées comme
équivalentes. Le point milieu d'affichage 128 change sur 2240 et 4576 pixels
respectivement (diagnostic de rendu, pas un seuil de détection natif). La carte
régulière témoin, conditionnement 384, reste exactement identique à l'affichage.

Ce cas ne peut recevoir une garantie de parité par simple relâchement des seuils.
Changer le plancher spectral, supprimer des composantes ou rejeter des réplicats
modifierait le modèle et n'est pas fait. La carte calculée et le résidu restent
accessibles avec le statut explicite `ill-conditioned` ; le choix CPU original
reste disponible. Consommation M5 : exposer ce statut sans présenter la carte
comme une probabilité fiable. Les preuves caractérisent l'échec matériel au lieu
de le convertir artificiellement en succès : `composite-conditioning-wasm-proof.json`.

## Vérification de la référence après contrôle de clôture

[COMPOSITE-NATIVE-SENSITIVITY-M2.md](COMPOSITE-NATIVE-SENSITIVITY-M2.md) établit
la sensibilité native des deux cas presque singuliers : mêmes données et code,
1/2/4 threads BLAS, références à2 threads exactement reproduites. Les variations
de rendu natives atteignent28/255 et188/255, contrôle bien conditionné exact.
Aucune régularisation modifiée, aucune parité navigateur singulière revendiquée.
Les franchissements128 sont un diagnostic d’affichage, pas un seuil natif.
