# Traitement par lot intégré à SHERLOQ

Branche locale : `codex/traitement-par-lot`. Aucune publication autorisée avant la validation de Gaël. La publication sera confiée au fil GitHub.

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

Mise à jour locale du 12 octobre : l’aperçu utilise désormais le moteur `0.35.0-export.3` et l’interface `0.15.1` fusionnés avec le batch. Le serveur reconstruit en mémoire les manifestes des anciens workers locaux pour permettre la transition après son redémarrage. Les fichiers de l’archive locale ont été actualisés sur place, sans copie du site ni des modèles. Le raccord de Forgeryscope Auto accepte sa sortie M2 native sur l’image entière en lui associant une origine `[0,0]` ; les résultats déjà découpés en zones conservent leurs origines. L’export NPZ de SIFT utilise les tableaux du résultat natif, sans demander l’export de sa seule surface d’affichage. Douze tests de contrats passent. La recette du lot scientifique réel est distincte et reste à terminer avant de conclure à son fonctionnement de bout en bout.

Le batch `0.1.1` réserve de la marge aux changements de phase SIFT : avec son budget de 4 Gio, il admet au plus trois workers du moteur principal, ou moins si le navigateur annonce moins de cœurs. Cette politique de ressources ne modifie ni les pixels, ni les seuils, ni le backend demandé. Le client commun accepte ces indications en option ; les parcours interactifs gardent leurs valeurs habituelles. L’export NPZ sparse prévoit à la fois les tableaux numériques et leur miroir JSON natif. Les détails des refus mémoire restent dans le dossier de résultats, et un export partiel conserve le statut antérieur du lot. Quatorze tests batch et dix tests ciblés du client/de l’interface passent. Trois acquisitions réelles successives terminent SIFT Panels + Text et Forgeryscope Auto, dont deux qui échouaient auparavant ; le lot complet de 86 images reste en recette.

Pour reproduire les essais, créer un dossier temporaire avec `python3 scripts/generate-batch-fixtures.py /chemin/temporaire`, puis démarrer le serveur avec `--fixtures /chemin/temporaire`. Définir `SHERLOQ_BATCH_TEST_ROOT` sur ce dossier, `SHERLOQ_PLAYWRIGHT` sur le module Playwright disponible et, si nécessaire, `SHERLOQ_CHROME` sur l’exécutable Chrome. Lancer `node --test tests/batch-contract.test.mjs`, puis `node scripts/check-batch-browser.mjs`. Les vérifications natives sont séparées dans `scripts/check-batch-native.mjs` : modes `decode`, `cancel`, `dense`, `compare`, `m2.trufor`, `ai.clones.d2prl` et `analysis.clones`. Les modèles sont servis depuis les ressources déjà présentes ; les tests lourds sont lancés explicitement.

Supprimer ensuite le dossier temporaire. Seules les preuves compactes et les fichiers de démonstration utiles à la revue sont conservés.
