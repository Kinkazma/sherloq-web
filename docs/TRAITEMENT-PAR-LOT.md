# Traitement par lot intégré à SHERLOQ

Branche : `codex/traitement-par-lot`. Gaël a demandé que le lot complet soit vérifié avant transmission aux fils Extension WordPress et GitHub pour publication. Cette recette locale est terminée le 12 octobre 2026 ; la publication est confiée au fil GitHub. Les articles et les sorties du lot restent privés sur sa machine.

## Périmètre accepté

Bouton dans SHERLOQ Web, mêmes moteurs et réglages, réutilisable par l'application web téléchargeable. Entrées : PDF, images et ZIP contenant ces fichiers. Aucun téléchargement d'article par URL, aucune archive HTML, aucune clé API et aucun envoi des documents à un serveur. Sélection humaine des acquisitions réelles. Déduplication des pixels identiques avec conservation de toutes les occurrences. Traitement séquentiel pour limiter la mémoire.

L'utilisateur choisit les outils et leurs paramètres avant le lancement, y compris l'option de comparaison automatique entre les études retenues après la première passe. Export : rapport PDF, copies annotées des études, images originales/extraites et sorties des méthodes dans un ZIP standard. Reprise d'un ZIP produit précédemment, avec présélection possible par le nom des PDF.

## Lecture des outils existants

| Famille | Usage en lot | Fondement dans le code |
| --- | --- | --- |
| D2PRL | Recommandé ; minimum des composants configurable | `d2prl-adapter.js`, masque source/cible, minimum et exclusions ; réglage propre au modèle |
| SIFT + G2NN + RANSAC, Panels + Text | Recommandé ; appariements et géométrie | `sparse-copy.js`, `clone-methods.js`, groupes, modèles, autoRadius, panneaux et exclusions OCR |
| PatchMatch et autres détecteurs de clones | Adaptés ; certains modèles sont lourds | `dense-profiles.js`, `sparse-copy.js`, regroupements géométriques et paramètres natifs |
| Recherche automatique de clones / analyse complète | Adaptées, lourdes | `automatic-client.js`, plusieurs fournisseurs, sorties et états partiels explicites |
| TruFor et autres cartes de localisation | Complément, seuil de signalement nécessaire | Cartes numériques ; la seule production d'une carte n'est pas un résultat positif |
| Noisesniffer | Complément de détection | `noisesniffer.js`, régions avec log NFA négatif ; sélection vide = non concluante |
| ELA biomes / énergie | Complément descriptif | `automatic-ela.js`, `segmented-energy.js` ; profils automatiques, régions, pas de probabilité de retouche |
| ELA classique, contraste, gradient, filtres, couleurs | Moins adaptés : vues pour lecture humaine | Paramètres fixes du lot et image de sortie, aucune décision automatique déduite de la vue |
| Comparaison de référence, PRNU, modèles personnels | Prérequis explicites | Référence, base ou modèle supplémentaire obligatoire ; ne pas simuler une exécution sans ces entrées |

Les variantes d'une même méthode ne doivent pas ajouter plusieurs votes pour les mêmes réglages. La corroboration spatiale compte une méthode une fois par pixel ; un autre compteur présente les méthodes complémentaires positives. Le compteur de tri est leur somme, sans échelle artificielle de 0 à 10. Pour une étude, maximum sur une image, puis détail par image. Une erreur ou une analyse interrompue ne devient jamais « rien détecté ».

## Ordre de réalisation

1. Intégration du bouton, import PDF/ZIP, provenance, déduplication et sélection corrigible.
2. Catalogue classé, paramètres natifs, modes automatiques réellement disponibles, exécution et arrêt du lot.
3. Signalement, corroboration, sorties scientifiques, rapport PDF et ZIP réimportable.
4. Comparaison entre les études retenues, commandée dans les réglages initiaux.
5. Recette navigateur dans la copie locale existante : vrais fichiers, vrais moteurs, extraction et coordonnées, erreurs/annulation, export et reprise. Vérification visuelle du PDF.
6. Reprise des mêmes fichiers dans le paquet web téléchargeable, puis transmission au fil GitHub après validation humaine.

## Contraintes de fidélité

L'extraction conserve les pixels à leur résolution native. Les miniatures servent uniquement à la sélection. Lorsqu'un JPEG intégré au PDF est retrouvé et correspond exactement aux pixels décodés, conserver son encodage. Sinon signaler le décodage en PNG, car l'historique JPEG n'est pas celui de l'image intégrée. Les répétitions dans les annexes ne sont pas à elles seules un signal de manipulation.

Une classification légère ne doit pas être présentée comme une reconnaissance scientifique validée : les familles et panneaux sont confirmés par l'utilisateur. Les imports/exports ont des limites de mémoire explicites. Les ressources communes existantes sont réutilisées ; aucune copie du site, des modèles ou des jeux de données.

## Validation

Prototype local intégré et vérifié dans Chrome le 11 octobre 2026. Les fichiers nouveaux du plugin sont reliés à la copie existante du site ; les quatre fichiers d’intégration y ont été modifiés sur place. Le site et les modèles n’ont pas été dupliqués. Les seules bibliothèques ajoutées sont PDF.js, PDF-lib et JSZip avec leurs licences, environ 2,3 Mio.

| Vérification | Résultat |
| --- | --- |
| PDF et ZIP contenant plusieurs PDF | Deux images uniques, quatre occurrences PDF de la même acquisition conservées, dont deux placements tournés |
| BRISK et ELA énergie | Calculs natifs terminés, vues et régions exportées |
| SIFT G2NN et comparaison entre documents | Correspondances internes et six groupes entre les deux images de l’exemple, sans réduire leur résolution |
| D2PRL sur l’exemple de microscopie 3226 × 936 | 33 composants retenus au minimum de 10 pixels, C1, JSON, masque, superposition PNG et NPZ |
| TruFor sur une image 480 × 480 | Carte brute lue et seuil appliqué ; JSON, PNG et NPZ, avec plafond mémoire M2 de 2 Gio |
| PatchMatch Zernike | JSON, PNG et NPZ ; correction des compteurs BigInt, conservés en chaînes décimales exactes dans le JSON |
| Recherche automatique de clones | Tous les groupes terminés sur l’image d’essai ; six entrées, C1, carte de corroboration et archive scientifique NPZ |
| TIFF et PDF invalide | TIFF décodé par le moteur existant ; PDF invalide signalé comme erreur d’import |
| Arrêt du lot | Méthode arrêtée, image et document incomplets, aucun résultat « sans signal » inventé |
| Export puis réimport puis reprise | Inventaire, pixels et sorties restaurés ; analyses complètes réutilisées sans recalcul avec le même moteur et les mêmes réglages |
| Interface | Parcours bureau et écran de 390 pixels, sans débordement horizontal ni erreur JavaScript pendant la recette |
| Ouverture dans SHERLOQ | Acquisition chargée à sa résolution native depuis les résultats ; retour au lot en conservant son état |
| PDF exportés | Rapport et annotations rendus avec Poppler et inspectés visuellement ; les annotations suivent le placement tourné |
| Contrats | Onze tests passent, dont comptage, états partiels, coordonnées PDF et précision des grands entiers |

Ces essais vérifient le fonctionnement du traitement, pas la précision scientifique des détecteurs sur un corpus d’articles. Une région ELA reste descriptive, et un seuil TruFor constitue un réglage de signalement. La validation du signal appartient à l’utilisateur.

Interface harmonisée avec SHERLOQ le 12 octobre 2026 : palette et typographie communes, contrôles natifs, onglets horizontaux, groupes et barres de paramètres compacts. Vérification visuelle des thèmes clair et sombre et du format de 390 pixels.

Preuve compacte : `TRAITEMENT-PAR-LOT-validation.json`. Aperçu : `TRAITEMENT-PAR-LOT-preview.jpg`. Les vues à plusieurs paramètres d’une même méthode ne doivent pas gonfler la corroboration ; les deux variantes SIFT G2NN, avec ou sans préparation Panels + Text, partagent ainsi un vote.

## Prochaines étapes

1. Faire essayer le parcours à Gaël sur ses PDF et ajuster la présentation des outils et des résultats.
2. Améliorer l’aide à la sélection des prises de vue réelles et des panneaux mixtes. Pour cette première version, la famille de l’image et sa conservation sont confirmées par l’utilisateur. Le détecteur de sous-images existant ne s’applique automatiquement qu’aux familles microscopie et gel.
3. Qualifier les autres variantes lourdes du catalogue et les outils nécessitant une référence ou une base. Leur présence dans la liste ne vaut pas recette exhaustive.
4. Élargir l’extraction aux PDF complexes : acquisitions découpées en tuiles, masques, découpes et assemblages de panneaux. La version actuelle extrait les objets raster intégrés ; elle ne reconstitue pas automatiquement toutes les figures composites à partir de leur mise en page.
5. Vérifier l’intégration dans WordPress exécutant PHP avant tout ZIP installable, puis reprendre le module dans la version web téléchargeable. L’aperçu actuel sert les fichiers réels de la copie locale, avec les moteurs existants, mais n’exécute pas PHP ni Gutenberg. Le moteur Docker local était indisponible pendant la recette.
6. Après validation de Gaël, transmettre la branche au fil GitHub pour publication.

## Reprendre localement

Depuis ce dépôt, `python3 scripts/serve-batch-local.py` sert la copie existante à l’adresse `http://127.0.0.1:8097/wp-content/plugins/sherloq-browser/assets/app.html#lang=fr`. Le serveur écoute seulement sur la machine locale et ne sert pas les fichiers PHP de WordPress. L’option `--root` permet de désigner une autre copie locale existante ; aucune copie n’est créée.

Le parcours est : Documents → Images → Analyses → Résultats. La comparaison entre études est bien une case des réglages initiaux ; elle s’exécute après la première passe et se limite aux documents retenus ou présélectionnés. Les originaux et les sorties peuvent ensuite s’ouvrir dans l’espace de travail habituel de SHERLOQ.

Les moteurs du lot ont un budget de 4 Gio ; les méthodes M2 ont un plafond de 2 Gio et le montage de 1 Gio. Les fichiers et les sorties ont aussi des limites explicites. Une erreur sur un outil est conservée dans le rapport et n’efface pas les signaux terminés des autres outils.

Mise à jour locale du 12 octobre : l’aperçu utilise désormais le moteur `0.35.0-export.3` et l’interface `0.15.1` fusionnés avec le batch. Le serveur reconstruit en mémoire les manifestes des anciens workers locaux pour permettre la transition après son redémarrage. Les fichiers de l’archive locale ont été actualisés sur place, sans copie du site ni des modèles. Le raccord de Forgeryscope Auto accepte sa sortie M2 native sur l’image entière en lui associant une origine `[0,0]` ; les résultats déjà découpés en zones conservent leurs origines. L’export NPZ de SIFT utilise les tableaux du résultat natif, sans demander l’export de sa seule surface d’affichage. Douze tests de contrats passent. La recette du lot scientifique réel, distincte de ces tests, est décrite ci-dessous.

La correction `0.2.0` remplace le plafonnement provisoire à trois workers, qui n’avait pas été publié. Le moteur commun enregistre la continuation SIFT avant de libérer son créneau CPU/GPU. Cette transition atomique évite de déclarer un refus mémoire pendant le passage entre deux phases d’un travail déjà admis. Le batch utilise la capacité native du navigateur et ne force plus une reprise M2 sur CPU après un refus ; les mécanismes de récupération du moteur restent ceux du moteur commun. Les pixels, réglages, budgets et calculs natifs sont conservés.

Qualification : 94 tests ciblés de ressources/ordonnancement, sept tests SIFT sur le WASM natif et trois acquisitions extraites des PDF réels. Le navigateur annonce dix créneaux CPU ; ces acquisitions utilisent neuf à dix workers et WebGPU, sans reprise mémoire. Les empreintes des points, paires, couleurs, groupes et régions sont identiques à la référence à trois workers. Le lot utilisateur tournait simultanément : ces durées ne constituent pas un benchmark isolé. Ce n’est pas une nouvelle qualification à 96 MP.

Les sorties sont maintenant écrites dans des fichiers temporaires locaux du navigateur et relues à la demande. L’index ne garde que les références ; le plafond cumulé à 512 Mio est retiré. Le ZIP standard, avec ZIP64 si nécessaire, est écrit par fenêtres d’un Mio vers un fichier temporaire. Les PNG/JPEG restent stockés tels quels ; les autres sorties sont comprimées en DEFLATE par un flux natif du navigateur. La reprise décompresse une entrée à la fois. Le plafond d’export à 768 Mio est retiré. La reprise des ZIP SHERLOQ lit des tranches du fichier au lieu de charger toute l’archive dans JSZip. Les limites des PDF/images individuels et des entrées compressées externes restent explicites. La place disque/quota réelle reste une contrainte et les erreurs restent visibles.

Un essai navigateur distinct écrit 528 Mio, exporte le ZIP puis relit son index et les premières/dernières sorties. L’ouverture d’un second stockage ne supprime pas les fichiers du premier. Tous les fichiers de cet essai ont été supprimés. Les Web Locks protègent les lots vivants ; un nouveau lot peut nettoyer les sessions abandonnées. Vingt et un tests batch/stockage vérifient aussi les CRC via l’extracteur ZIP indépendant de Python, ZIP32/ZIP64, les lectures bornées et l’annulation. Quinze tests ciblés du client automatique, du démarrage et de l’adaptation de livraison passent. L’ancien calcul avait rencontré le plafond des sorties et ne valide pas cette nouvelle version. Le batch corrigé a d’abord terminé les deux méthodes sur trois acquisitions, exporté un rapport PDF et un ZIP puis repris ces trois images sans recalcul.

Contrôle fonctionnel du lot complet du 12 octobre : sept PDF, 98 pages, 147 images uniques extraites et les 86 images de la présélection humaine exacte. SIFT + G2NN + RANSAC + Panels + Text et Forgeryscope Auto terminent les 172 analyses, sans erreur. Les paramètres SIFT sont conservés : 6 000 points, rayon 600 automatique, minimum 10, seuil 0,725, tolérance 50, modèle affine, seuil géométrique 5, minimum géométrique 10, réflexions activées ; les deux backends sont automatiques. Les 86 sorties SIFT indiquent un backend hybride. Les extractions les plus chargées utilisent neuf ou dix workers ; 62 acquisitions plus petites utilisent un seul worker selon leur travail natif. Aucune reprise d’extraction n’est enregistrée. Il n’y a pas de nouveau plafond de workers ; ce contrôle n’est pas un benchmark de durée isolé ni une qualification supplémentaire à 96 MP.

**La validation humaine du traitement scientifique filtré est refusée.** Les méthodes n’excluent pas encore de façon fiable les textes, graphiques et schémas à l’intérieur des figures ; leurs répétitions peuvent alimenter les faux positifs. L’affichage par défaut ajoute encore cercles et traits aux biomes, alors que le choix demandé est celui des biomes seuls. Les contrôles ci-dessous établissent le fonctionnement, la correction mémoire et l’intégrité des exports, pas la conformité à ces deux exigences.

Le seuil final choisi dans l’interface et enregistré dans l’inventaire est 2 sur la corroboration des clones. La passe finale réutilise les 86 analyses déjà terminées, avec les mêmes pixels, moteur et paramètres des méthodes. Cinq études sont retenues, soit 48 images pour 543 comparaisons géométriques entre études. Quatre comparaisons produisent des correspondances exportées ; aucune erreur de comparaison n’est enregistrée. Les paires sans signal ne sont pas conservées individuellement. Les signaux nécessitent une lecture humaine, notamment pour les figures mixtes qui contiennent aussi des graphiques et des textes répétés.

Le rapport compte 46 pages. Le ZIP standard contient 680 fichiers, pèse 307 633 661 octets et représente 1 287 905 009 octets décompressés, dont 1 172 320 718 octets de sorties des méthodes et des comparaisons : le lot dépasse donc réellement l’ancien plafond cumulé de 512 Mio. Les CRC du ZIP et des 1 290 fichiers NPY des 172 archives NPZ passent dans l’extracteur indépendant de Python. NumPy vérifie les types, dimensions, valeurs finies et les miroirs JSON des tableaux SIFT, ainsi que les groupes et modèles géométriques. Les cinq empreintes scientifiques des trois acquisitions de référence correspondent exactement, y compris les groupes. Les 172 empreintes des images sources correspondent aux provenances exportées. Les cartes et masques Forgeryscope gardent les dimensions natives. Les sept copies PDF conservent leurs pages et leurs annotations inspectables. Toutes les pages du rapport ont été rendues et examinées ; deux pages des PDF annotés ont également été contrôlées visuellement.

La réimportation du ZIP complet dans un onglet local temporaire restaure les 147 images, la sélection exacte de 86 images et leurs 172 analyses terminées, sans lancer de recalcul. Le stockage du test a été nettoyé ; le lot principal et ses 172 sorties restent disponibles. La preuve compacte destinée au dépôt est `TRAITEMENT-PAR-LOT-memory-validation.json`. Les PDF, images, sorties scientifiques et preuves détaillées privées ne sont pas ajoutés au dépôt. L’exécution PHP/Gutenberg reste une vérification distincte pour le fil Extension WordPress.

La vérification d’intégration GitHub utilise l’interface `0.15.2`, avec ses corrections de démarrage et sa présentation hors ligne conservées. Après reconstruction des ressources verrouillées, les 261 tests de l’interface passent, y compris les deux cas dont les ressources étaient absentes du premier passage. Les 21 tests batch/stockage, 60 tests ciblés de ressources/ordonnancement et sept tests SIFT natifs passent également. Les deux fichiers modifiés sont identiques dans le moteur livré, ses sources publiques et leurs blocs ; l’inventaire des sources distingue leurs empreintes brutes de celles de l’adaptation navigateur. [Preuve d’intégration et identité de publication](evidence/batch-publication-0.2.0.json).

Pour reproduire les essais, créer un dossier temporaire avec `python3 scripts/generate-batch-fixtures.py /chemin/temporaire`, puis démarrer le serveur avec `--fixtures /chemin/temporaire`. Définir `SHERLOQ_BATCH_TEST_ROOT` sur ce dossier, `SHERLOQ_PLAYWRIGHT` sur le module Playwright disponible et, si nécessaire, `SHERLOQ_CHROME` sur l’exécutable Chrome. Lancer `node --test tests/batch-contract.test.mjs`, puis `node scripts/check-batch-browser.mjs`. Les vérifications natives sont séparées dans `scripts/check-batch-native.mjs` : modes `decode`, `cancel`, `dense`, `compare`, `m2.trufor`, `ai.clones.d2prl` et `analysis.clones`. Les modèles sont servis depuis les ressources déjà présentes ; les tests lourds sont lancés explicitement.

Supprimer ensuite le dossier temporaire. Seules les preuves compactes et les fichiers de démonstration utiles à la revue sont conservés.
