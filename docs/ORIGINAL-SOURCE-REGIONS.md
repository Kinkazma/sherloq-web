# Zones de l’image originale

Les commandes de l’onglet **Image originale** permettent de détecter les zones, d’ajouter une acquisition ou une exclusion à la souris, de les modifier et d’ouvrir la source dans le traitement par lot. Elles se trouvent dans la barre de réglages de cet onglet. Les autres outils conservent leur panneau de zones.

Désactiver les zones conserve leurs géométries et permet au calcul suivant d’utiliser l’image entière. Les réactiver rétablit la sélection. Supprimer les zones est une opération annulable. Un résultat déjà calculé conserve la provenance de son propre périmètre ; une modification des zones ne réécrit pas ce résultat.

## Appartenance et coordonnées

Le domaine admis est l’union des acquisitions, à laquelle sont soustraites les exclusions. Une exclusion garde donc la priorité à l’intérieur d’une acquisition. La plus petite enveloppe rectangulaire du domaine devient la grille native de l’entrée dérivée. Son origine dans l’image originale accompagne le résultat et les surfaces utilisées pour la comparaison.

Les octets encodés originaux sont conservés séparément. Un recadrage de pixels ne fabrique pas de nouveau JPEG et ne remplace pas les tables de quantification originales par celles d’une recompression intermédiaire.

Une exclusion ne devient jamais une observation noire. Les histogrammes omettent les pixels exclus. Les traitements ponctuels ne reçoivent que des rectangles de pixels admis ; l’image originale peut rester visible hors du domaine comme fond de présentation, sans participer au calcul. Un traitement dépourvu d’adaptateur pour un domaine troué est refusé avant le calcul plutôt que d’analyser silencieusement les exclusions.

## Zones propres à un outil

Par défaut, l’outil reprend le domaine courant de l’original. Une modification ou une nouvelle détection propre à l’outil crée une copie locale. Cette copie reste limitée par le domaine de l’original. La nouvelle détection peut examiner son enveloppe comme contexte de préparation, sans modifier les zones de l’original ni réadmettre les exclusions dans une analyse scientifique.

La préparation OCR reçoit des fenêtres RGB natives par un canal dédié. Elle n’exige pas d’encoder le recadrage en PNG. Ses coordonnées sont replacées dans la grille originale ; son cache dépend de l’empreinte du domaine. Un résultat de préparation devenu périmé est rejeté.

## Intégration

Le transport scientifique utilise `task.sourceRegionDomain`. Les capacités du moteur distinguent les domaines identiques à la source, les rectangles et les domaines avec exclusions internes. Les adaptateurs qualifiés déclarent leurs formes et leurs contraintes de paramètres. Les caches sont isolés par source et empreinte du domaine, et les ressources de comparaison restent possédées jusqu’à leur libération explicite.

Les limites de chaque méthode restent applicables : une sélection trop petite pour son voisinage, son bloc ou sa grille native doit être corrigée par l’utilisateur. La sélection n’autorise ni une réduction implicite de précision ni un changement silencieux de méthode.

L’estimation automatique d’ELA utilise les pixels natifs du rectangle admis pour ses mesures et sa calibration. Lorsqu’elles sont présentes, les tables JPEG restent celles du fichier original. Le cache inclut l’empreinte du domaine ; deux rectangles de mêmes dimensions ne partagent donc pas une estimation ou un résultat par erreur.

Les cartes Énergie et Biome conservées sous forme de surfaces se lisent par fenêtres bornées. Le rendu, les aperçus et les histogrammes réutilisent ces valeurs scientifiques. Une modification de présentation ne doit ni remplacer la source recadrée par l’image entière ni exiger une copie contiguë de tous les champs natifs.

Le cache d’aperçu conserve une seule grille visuelle bornée. Il peut réutiliser les valeurs déjà lues pour plusieurs mouvements du curseur, sans recompression JPEG ni nouvelle analyse. Une autre source, un autre domaine ou une autre grille de prélèvement invalide ce cache. Le résultat final garde sa définition native.

## Formes prises en charge

Un rectangle et un ensemble de zones avec des trous ne demandent pas le même adaptateur scientifique. Les méthodes à voisinage ou à statistiques globales doivent préserver leur propre définition du domaine ; découper une fenêtre RGB ne suffit pas à exclure correctement des pixels internes.

Les histogrammes acceptent les appartenances discontinues. Les traitements ponctuels et l’ELA classique disposent d’adaptateurs d’appartenance avec leurs contraintes de support natif. Énergie et Biomes acceptent le rectangle natif ; une sélection comportant des exclusions internes reste refusée avant leur analyse. Les méthodes fondées sur le fichier encodé, une seconde source ou des coordonnées scientifiques indépendantes conservent également leurs contraintes explicites.

En cas de forme non prise en charge, les commandes de l’original permettent de modifier le domaine ou de le désactiver temporairement. Les zones conservées ne sont pas supprimées. Le moteur ne transforme pas cette décision en analyse silencieuse de l’image entière.
