# SHERLOQ — extension Chromium

La loupe de SHERLOQ s’utilise sur les images d’une page et dans son lecteur PDF.
Le code fourni ici permet aussi de l’installer sans compte développeur et sans
passer par le Chrome Web Store.

Application web : https://gaeldauchy.com/sherloq/

Code et licences : https://github.com/Kinkazma/sherloq-web

## Égalisation dans la loupe

Dans Réglages globaux, le sélecteur Égalisation propose Histogramme, CLAHE et AHE.
Le curseur règle la limite de contraste de CLAHE (0,5 à 40) ou le nombre de tuiles
par axe d’AHE (2 à 16). Chaque méthode conserve sa valeur. Le préréglage
« AHE au maximum » active seulement AHE en 16 × 16, sans changer la taille,
la transition ou le grossissement de la loupe. Les sous-images PDF conservent
leurs histogrammes indépendants. Le préréglage « AHE+GAMMA » combine AHE en
8 × 8 et gamma × 10 à 20. « AHE+GAMMA+ÉGALISATION » y ajoute l’égalisation de la
loupe améliorée.

## Préréglages et prévisualisation

Le bouton + enregistre les effets actuels sous le nom choisi. Le bouton − supprime
le préréglage personnel sélectionné, après confirmation. Ces préréglages restent
dans le navigateur ; ils ne changent pas le diamètre, la transition ou le zoom.

Pendant le déplacement d’un curseur d’effet, la loupe affiche les résultats sans
attendre le relâchement. La définition de l’aperçu s’adapte pour viser 200 ms de
réponse en moyenne, selon le calcul et la machine. Si la définition complète tient
dans ce délai, elle est conservée. Le relâchement déclenche le rendu définitif en
pleine définition. Les aperçus temporaires ne servent pas à l’export ou à l’OCR.

## Installer depuis les sources

Récupérez ce dossier `chromium-extension` du dépôt. Dans Chrome ou Opera, ouvrez
la page des extensions, activez le mode développeur, puis choisissez « Charger
l’extension non empaquetée » et sélectionnez le sous-dossier `extension`.

La loupe fonctionne dès le chargement. Il n’est pas nécessaire de préparer
SHERLOQ web, de compiler les moteurs ou de télécharger une archive de modèles.
Les moteurs JavaScript et WebAssembly sont fournis. Les données de calcul
nécessaires sont récupérées depuis les ressources publiques du projet à l’usage.
Pour l’OCR facultatif, un téléchargement manquant attend votre accord et sa taille
est annoncée. Les poids déjà disponibles dans une bibliothèque SHERLOQ du même
profil de navigateur sont réutilisés.

Cliquez sur l’icône pour activer la loupe dans une page. R ouvre ses réglages.
Les raccourcis sont personnalisables. Les pages protégées du navigateur et le
Chrome Web Store interdisent l’injection d’extensions. L’accès aux fichiers
`file://` demande l’option correspondante dans les détails de l’extension.

Pour ouvrir directement un PDF, utilisez « Ouvrir un PDF ou une image » dans les
réglages. Les commandes Web et Local peuvent ensuite transmettre le PDF d’origine
à SHERLOQ. L’adresse de la version locale se renseigne dans les réglages.

## Assembler le paquet

Avec Python 3.10 ou plus récent, depuis ce dossier :

```sh
python3 package.py
```

La commande ne télécharge rien. Elle vérifie chaque fichier contre
`source-manifest.json`, puis crée `dist/unpacked` et un ZIP contenant le manifeste
à sa racine. Ce ZIP concerne uniquement l’extension Chromium.

```sh
python3 package.py --check
python3 package.py --output autre-dossier
```

Le paquet envoyé au Store se construit avec cette même commande. Les sources et
le paquet contiennent les mêmes fichiers d’exécution. Les dates et permissions
des entrées ZIP sont fixées pour éviter les différences dues à la machine ; la
compression peut dépendre de la version de zlib utilisée par Python.

Après une modification volontaire du code, relisez les différences, puis
actualisez l’inventaire avant de reconstruire :

```sh
python3 package.py --update-inventory
```

Les chemins d’ordinateur, profils de navigateur, secrets et archives de modèles
n’ont pas leur place dans ce dossier. Le contrôle automatique de motifs privés
complète la relecture ; il ne remplace pas celle-ci.

## Sources des moteurs et licences

Le JavaScript de l’extension et ses adaptateurs sont directement lisibles dans
`extension`. Les dépendances réutilisées sont dans `extension/vendor` et les
licences sont conservées. Les moteurs WebAssembly ont leurs sources et scripts
de compilation dans les dossiers moteur du dépôt ; voir `NATIVE-SOURCES.md` et
`provenance.json` pour les références et empreintes.

SHERLOQ a été créé par Guido Bartoli. Gaël Dauchy a réalisé son adaptation web
et cette extension. Les crédits du projet d’origine et la licence GPL-3.0 sont
conservés. Les bibliothèques et modèles tiers
gardent leurs licences respectives. Voir `LICENSE`, `extension/NOTICE.md` et les
notices des dépendances.

Le fonctionnement des données est décrit dans [PRIVACY.md](PRIVACY.md).
