# Affichages ELA

L’outil ELA distingue trois vues : **Classique**, **Énergie** et **Biome**.
Il s’ouvre par défaut en Classique. Un choix explicitement enregistré reste
prioritaire.

## Classique

La vue classique conserve ses réglages de recompression JPEG, d’échelle et de
contraste. Elle utilise l’opération `ela.classic`.

## Énergie

Cette vue montre les scores par pixel déjà calculés par `ela.energy`. On peut
choisir la couche **haute énergie**, **basse énergie**, **élevée + faible**,
ou **unifiée**,
puis régler le **score minimal affiché** avec le curseur et sa valeur numérique.
**Élevée + faible** conserve les deux cartes, haute à gauche et basse à droite.
**Unifié** réunit les deux niveaux sur une seule image : haute énergie en rouge,
basse énergie en bleu. Les cartes séparées conservent leur échelle rouge existante.

La vue initiale est **Unifié**, en **Carte d’énergie**, avec un
**score minimal affiché de 0**. Les choix explicitement enregistrés sont
conservés. La carte haute au seuil nul correspond à l’exemple
« Spiral — high-energy score » du README :
le canal rouge vaut `clamp(round(score × 255), 0, 255)` et les autres canaux sont
nuls. La saturation commence à un score de 1 ; le rouge maximal ne permet donc
pas, à lui seul, de distinguer les scores supérieurs à 1. Le filtre porte sur
les scores numériques d’origine, avant cette saturation.

Les valeurs sont des scores descriptifs du résidu JPEG, relatifs au panneau
de référence. Elles ne représentent ni une probabilité de retouche, ni une
attribution à un logiciel. Des structures de la scène peuvent produire un
score élevé.

Le curseur filtre seulement l’affichage. Il ne modifie pas les histogrammes,
les seuils bas/haut ou les régions issus du calcul. L’échelle de couleur reste
fixe ; elle n’est pas normalisée selon le maximum de l’image.

Les vues **Élevé**, **Faible** et **Unifié** utilisent un seuil positif, de
**0 au maximum** de leur carte. La vue unifiée reconstruit l’écart signé
`high − low` à partir des cartes
conservées, sans créer de nouveau tableau scientifique. Elle filtre sa valeur
absolue : les deux couleurs sont visibles à zéro, puis disparaissent ensemble
quand le seuil augmente. Le même réglage s’applique de manière symétrique aux
deux niveaux ; ce miroir n’ajoute aucun curseur à l’interface. Le maximum commun
est le plus grand des maxima natifs bas et haut, mesuré dans le support retenu.

Dans ces trois choix, seuls les pixels dont l’énergie dépasse strictement le
seuil sont colorés.
Au maximum, aucun pixel ne reste coloré. Les cartes séparées conservent leur
rendu exact à zéro. Les pixels hors du support `energy_scope > 0` restent exclus,
quel que soit le seuil. Les anciens filtres négatifs enregistrés pour les
cartes séparées sont ramenés à zéro lors du chargement des réglages ; les
rapports historiques et les tableaux scientifiques restent intacts.

**Élevée + faible** conserve son filtre signé précédent et ses deux images.
Chaque panneau reconstruit son écart (`high − low` ou `low − high`) et colore
les valeurs supérieures ou égales au seuil. Les seuils négatifs restent
disponibles dans ce choix. La carte du niveau choisi reste rouge ; les écarts
opposés admis sous zéro apparaissent en bleu. Ce choix reste disponible à côté
de la nouvelle carte Unifié, avec la même réutilisation des calculs.

Le réglage **Affichage** est distinct du niveau d’énergie :

- **Carte d’énergie** conserve le fond noir de l’exemple.
- **Sur l’image** superpose les couleurs de la carte à l’original. Le noir reste
  transparent ; les pixels masqués par le seuil conservent leur aspect original.

La superposition emploie une opacité de présentation de 35 %, indépendante
du réglage de la vue Biome. Chaque carte conserve sa résolution native
dans le rendu exact et dans l’export de l’image.
Le bouton **Ajuster** et le double-clic sur l’image ajustent la surface affichée
entière, y compris les deux panneaux d’Élevée + faible.

## Biome

Ce nom remplace l’ancien onglet « Énergie · territoires ». La vue conserve
l’ensemble de ses fonctions : profils, histogrammes, seuils de segmentation,
paramètres JPEG, taille des blocs, taille minimale, superposition ou territoires,
opacité et exports scientifiques.

Les couleurs de cette vue représentent les territoires retenus dans
`energy_labels`, avec leur support exact. Elles ne sont pas la carte rouge
des scores. Une couche de score peut contenir de nombreux pixels visibles
sans qu’un biome de cette classe ait été retenu.

## Réutilisation et export

Les vues Énergie et Biome partagent le même résultat `ela.energy`. Passer de
l’une à l’autre, choisir une couche ou déplacer le curseur d’affichage réutilise
ce résultat ; cela ne relance pas l’analyse. Le dernier rendu reste visible
pendant sa mise à jour, au lieu de revenir brièvement à l’original.
Modifier les paramètres scientifiques
de Biome nécessite en revanche un calcul mis à jour.

Pendant le glissement du curseur, une prévisualisation moins détaillée peut
échantillonner ces mêmes scores déjà calculés. Elle ne change pas leur précision
numérique et ne remplace pas le résultat scientifique. Le rendu en résolution
native est demandé au relâchement ; les exports attendent ce rendu exact.

L’export de l’image affichée utilise la vue et le filtre actifs. Les tableaux
de scores, les étiquettes et les métadonnées scientifiques restent conservés
dans les exports de données. Les anciens réglages enregistrés sous le nom de
mode `energy` continuent d’ouvrir la vue Biome ; ils ne sont pas réinterprétés
comme le nouveau filtre de scores.

## Aperçus des réglages

Pendant un geste maintenu sur les réglages Classique et les histogrammes ou
seuils Biome, l’interface peut afficher des brouillons bornés, puis lancer le
calcul natif complet au relâchement. Elle garde le dernier rendu pendant cette
transition. Les demandes intermédiaires sont regroupées : un brouillon en
cours et la dernière valeur demandée, sans accumuler les anciennes valeurs.

À qualité JPEG fixe, Classique réutilise des couples de pixels échantillonnés
dans l’original et sa vraie recompression native. Son échelle, son contraste
et ses options de couleur utilisent la même table de rendu. Quand la qualité
change ou que ces couples ne sont plus conservés, le brouillon utilise une
recompression de l’image réduite ; il ne prétend pas reproduire le JPEG natif.
Le calcul final conserve la résolution et les réglages choisis.

Les brouillons Biome réutilisent les scores natifs pour les seuils, ou les
résidus JPEG natifs pour de nouveaux histogrammes. Leur segmentation tient
compte de l’échelle spatiale du brouillon et des exclusions retenues. Changer
la qualité JPEG ne permet pas de réutiliser ces résidus : le dernier rendu
reste visible jusqu’au nouveau calcul complet. Les réglages par défaut du
mode Biome sont conservés.

Un brouillon de paramètres n’est ni un nouveau résultat scientifique ni un
export final. Les exports attendent la fin du calcul exact. Le brouillon
n’altère pas les tableaux, les métadonnées ou les territoires du résultat
précédent.

## Estimation automatique Classique

Le bouton **Auto** recherche une référence de recompression à partir du fichier
et de ses pixels. Il ne choisit pas un préréglage fixe.

Les tables de quantification JPEG référencées par les composantes du fichier
sont utilisées en premier. Une correspondance complète fournit un facteur
équivalent aux tables IJG actuelles. Des tables non standard fournissent
seulement une référence IJG approchée, affichée comme telle. Les tables du
fichier courant ne décrivent pas tous ses enregistrements précédents.

Sans tables, l’estimateur examine des blocs DCT 8×8 à leurs coordonnées natives,
sur les 64 phases de grille possibles. Il recherche des pas de quantification
statistiquement significatifs, puis vérifie leur compatibilité avec une même
famille de tables IJG. Cette implémentation reprend les équations de la méthode
publiée dans [IPOL, 2022](https://doi.org/10.5201/ipol.2022.399), avec sa propre
politique bornée d’échantillonnage et de confirmation. Elle ne reprend pas le
code de référence. La mise à l’échelle des tables suit le
[référentiel libjpeg/IJG](https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/src/jcparam.c).

Une trace absente, incohérente ou ambiguë conserve la qualité choisie par
l’utilisateur et l’indique. La sortie expose les candidats, les pas retenus,
la phase et les bornes statistiques. Elle ne présente pas une histoire de
compression unique, une probabilité de retouche ou un verdict d’authenticité.
Les images rééchantillonnées, les tables non standard et les compressions
multiples peuvent empêcher une identification fiable.

La visibilité est ensuite évaluée sur un échantillon de vrais pixels du résidu
JPEG natif : percentile 99,5 %, cible 225/255, gain entier dans les limites du
contrôle et contraste nul lorsque ce percentile est exploitable. Un résidu
insuffisamment soutenu conserve les réglages de présentation actuels. Les
options Linéaire et Gris restent celles de l’utilisateur. Cette calibration
est une règle de visibilité documentée, pas un optimum forensique universel.
Le rendu final utilise le calcul natif habituel. L’estimation et la calibration
sont liées à l’empreinte de l’image ; les sorties temporaires sont libérées.

## Réglages ELA dans Énergie

Le panneau ELA de la vue Énergie partage les valeurs actuelles de Classique :
qualité JPEG, gain, contraste, Linéaire et Gris. Pendant leur modification,
il montre un aperçu ELA ; au relâchement, il revient à la carte d’énergie.
Cette interface reste disponible pour l’évaluation de cette variante.

La qualité JPEG est la référence utilisée par les scores Énergie. Changer
cette qualité nécessite un calcul énergétique correspondant. Gain, contraste
et options de couleur règlent l’ELA montrée pendant le geste ; ils ne remplacent
pas les résidus scientifiques par une image de présentation quantifiée.
Quand la qualité effective, la source et la recette énergétique restent
identiques, la carte revient depuis les RAW conservés, sans nouvelle analyse.
Les choix de couche et de filtre restent conservés. Les paramètres JPEG et les
profils explicitement enregistrés pour Biome restent indépendants.

Les changements de vue préservent le propriétaire du moteur et son cache
borné de JPEG encodés. Une recompression native déjà disponible à la même
qualité peut ainsi servir au premier calcul énergétique. Les variantes de
qualité supplémentaires et les étapes manquantes restent réellement calculées.

## Histogrammes Biome

Deux histogrammes compacts apparaissent à droite des réglages ; dans une
fenêtre étroite, ils passent sous ceux-ci. Ils montrent des populations natives,
sans recompression supplémentaire ni histogramme de luminosité de l’original.
La hauteur des barres utilise une échelle logarithmique des effectifs.

Le premier représente l’énergie résiduelle grise, moyennée sur 7×7, pour le
panneau et la qualité JPEG choisis. Par défaut, le panneau le plus étendu et
la qualité centrale effective sont sélectionnés. Les coupes des deux
percentiles et la moyenne tronquée sont celles de cette référence native.
Les trois qualités calculées restent sélectionnables. L’axe couvre l’étendue
résiduelle observée et conserve ses unités. Le support correspond exactement
au rectangle de référence et à la validité du gris original, y compris lorsque
les rectangles de panneaux se chevauchent.

Le second représente le score signé `high − low` de tous les pixels retenus
par `energy_scope > 0`, y compris les scores nuls : haut en rouge à droite,
bas en bleu à gauche. Les traits verticaux marquent les seuils forts
`−shadow/10` et `+highlight/10`. Ils utilisent les unités du score, distinctes
des percentiles du premier graphique. Aucun percentile global ne remplace
les références calculées séparément par panneau et par qualité.

Pendant un geste, les effectifs natifs restent conservés. Les positions des
nouveaux percentiles peuvent être estimées à partir de leurs bins, avec un
rendu pointillé et une indication provisoire ; la largeur d’un bin borne la
précision de cette représentation. La moyenne précédemment calculée garde
son statut natif. Après le calcul final, les courbes et les coupes natives
exactes remplacent ces repères. Les lectures et compteurs restent bornés ;
les cartes scientifiques, la segmentation et les biomes ne sont pas modifiés
par les graphiques.

## Plusieurs onglets ouverts

Un nouvel onglet peut démarrer sans imposer la fermeture des précédents.
Chaque fenêtre et ses workers conservent l’identité de leurs ressources,
même lorsqu’une version plus récente prend le contrôle du chargement.
Les protections des migrations et des suppressions de ressources locales
restent actives.
