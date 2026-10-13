# Livraison et gestion locales

Les commandes de préparation décrites ici ne publient rien. Les livraisons
distantes et le déploiement du site restent deux opérations distinctes. Une
version annoncée par GitHub ne prouve pas qu'elle est installée sur un site.

## Contrat de livraison

Le canal produit commun est
`https://raw.githubusercontent.com/Kinkazma/sherloq-web/main/releases/stable.json`.
Ce seul pointeur est mutable : `sherloq.release-channel/1` contient un descripteur
`release: {url, sha256, size}` vers une description immuable. Le nom d'une GitHub
Release, son ordre chronologique et un site WordPress ne servent pas de référence
de version à l'application locale.

La description `sherloq.local-release/1` lie une version, trois inventaires
`shell`, `manifest`, `catalog`, leurs tailles et SHA-256, une `assetBase` publique
épinglée à un commit et les schémas/migrations acceptés. Le shell lie aussi le
SHA du catalogue. Cela empêche un catalogue changé d'écraser celui d'une version
active dont les scripts seraient identiques. Les ressources exécutées et modèles
restent épinglés à leur SHA, indépendamment de leur nom ou de leur taille.

Un overlay JavaScript revu peut être déclaré dans `runtimeOverrides` : chaque
chemin lie les SHA avant/après et la taille livrée. Le plan de mise à jour
vérifie que le SHA après et la taille correspondent exactement au manifeste,
sans autoriser un fichier `localOnly`. L'absence de ce champ reste compatible
avec les descriptions antérieures. Les reçus scientifiques de référence
restent distincts de cet overlay ; voir
[la reconstruction de la sélection](../web/wordpress/FEATURE-SELECTION-OVERLAY.md).

Le transport utilise des fichiers vérifiés sur `raw.githubusercontent.com`.
Il n'utilise pas le ZIP des assets de Release comme API navigateur. Les scripts
du service worker restent servis par l'origine locale ; leur enregistrement
est soumis aux règles de même origine de l'API.
[Documentation primaire](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register).

Un futur schéma exigeant un interpréteur plus récent doit augmenter
`migrations.minimumUpdater`. Le pont existant refuse ce schéma plutôt que de
mélanger deux contrats. Le premier raccord doit alors être refait avec le
lanceur compatible ; ce n'est pas un téléchargement de code de worker depuis
une origine différente.

## Catalogue et choix volontaires

`sherloq.features/1` couvre tous les fichiers du manifeste. Chaque fonction a
un identifiant stable, des noms français/anglais, des opérations et paramètres
effectifs, ses ressources et ses dépendances. Les nœuds `internal` décrivent les
contenus partagés ; ils ne sont pas des choix activés par défaut. Le socle et la
préparation scientifique du batch sont protégés.

`sherloq.feature-policy/1` conserve `disabledFeatures` et `disabledGroups`, y
compris les identifiants inconnus d'une livraison. Les nouvelles fonctions sont
sélectionnées par défaut, sauf dans un groupe volontairement retiré. Les menus,
appels directs et recettes de batch partagent cette sélection. Une analyse
automatique conserve ses tâches natives disponibles et marque les branches
retirées `feature-uninstalled`, sans résultat scientifique négatif.

Forgeryscope reste un groupe indivisible : son mode Auto et ses profils partagent
des ressources et des règles d'exécution. Le modèle de panneaux également utilisé
par la préparation des lots reste conservé lors de sa désinstallation.

## Installation, préparation, activation et réparation

Dans la version locale, « Mise à jour auto » / « Auto update » active une
recherche au démarrage. L'option est désactivée initialement et peut être
réactivée dans Réglages. Une recherche utilise le même canal stable et les
mêmes métadonnées vérifiées que le bouton manuel ; elle n'installe rien sans
le choix de l'utilisateur. Un démarrage sans réseau ou un canal indisponible
ne bloque pas l'ouverture de l'application.
Une version produit plus ancienne n'est pas proposée au démarrage. Une
version non interprétable reste accessible par la recherche manuelle. Le choix
d'ignorer une version vaut aussi pour sa nouvelle signature éventuelle.

Lorsqu'une autre livraison est disponible, une fenêtre assortie à l'interface
propose la préparation de la mise à jour, le report, l'arrêt des propositions
pour cette version ou la désactivation des recherches automatiques. Cette
dernière action demande une seconde confirmation ; son annulation conserve
l'option active. Les choix persistants font partie de la sauvegarde des
réglages. Les deux fenêtres et leurs boutons suivent la langue de l'interface.
La préparation et l'activation conservent les protections décrites ci-dessous.

L'installation et les mises à jour utilisent la même union transitive de
ressources. Les morceaux valides sont réutilisés depuis les caches reconnus,
une bibliothèque autorisée ou un TAR vérifié. Les imports `localOnly` ne sont
jamais téléchargés publiquement et n'empêchent pas les autres fonctions de
fonctionner. Leurs octets importés sont protégés lors des collectes automatiques.

La préparation écrit un candidat distinct, vérifie les octets et les migrations,
puis conserve la référence active. Interruption, quota, corruption ou erreur de
migration ne constituent pas une activation. La reprise vérifie les morceaux
déjà reçus. Une réparation de la version actuelle restaure seulement ses SHA
et ses fonctions actives ; elle ne réactive aucune exclusion et ne migre pas les
préférences.

L'activation gèle les fenêtres locales après confirmation d'inactivité, reprend
une sauvegarde fraîche de leurs préférences, puis change une référence IndexedDB
atomique. Une fenêtre occupée, muette ou ouverte entre les contrôles bloque cette
opération. Les fenêtres existantes restent liées à leurs anciens octets jusqu'au
rechargement. La désinstallation et l'activation d'une réinstallation utilisent
aussi un verrou entre fenêtres. Une version précédente et un candidat sont
retenus ; le journal est borné à quarante événements. La collecte conserve aussi
le pont du worker et les références de fenêtres encore ouvertes.

Le bouton Activer transmet l'identité du candidat affiché. Si une autre fenêtre
remplace ce candidat avant l'action ou pendant sa vérification, le moteur de
mise à jour refuse l'activation avant sauvegarde, verrou ou mutation. Rouvrir
le dialogue permet d'examiner et de reprendre le candidat réellement présent.

Le helper Python conserve sur disque une référence active et une précédente.
Il vérifie les objets et réutilise les fichiers/morceaux du TAR avant tout PUT.
Les morceaux vérifiés directement par le helper ne sont pas recopiés dans le
cache navigateur. Avec le helper géré, les nouveaux objets de ressources restent
sur disque ; avec le lanceur natif, seuls les morceaux reçus qui ne sont pas
déjà fournis par le TAR ou le pont sont mis en cache. Le mode PWA conserve ses
ressources nécessaires dans le navigateur. Les estimations distinguent donc
l'espace temporaire navigateur de celui du dossier géré.
L'écriture atomique du fichier de référence précède la modification de l'état
en mémoire. En cas d'échec partiel entre navigateur et helper, les compensations
conservent ou rétablissent la référence précédente. Le retour arrière conserve
les exclusions volontaires les plus récentes.

## Stockages et sauvegardes

| Support | Mise à jour | Désinstallation et récupération |
| --- | --- | --- |
| Cache navigateur/PWA | Candidat vérifié puis référence active | Supprime les morceaux gérés sans autre référence ; conserve les imports locaux |
| Helper Python et dossier géré | Objets vérifiés sur disque, originaux du TAR réutilisés | Libère seulement ses objets devenus sans utilisateur ; le TAR reste intact |
| Lanceur natif | Archive/pont en lecture, mises à jour dans le navigateur | Le cache peut être allégé ; les fichiers du pont et le TAR restent en lecture |
| Dossier choisi | Réutilisation avec autorisation de lecture | Aucun fichier personnel supprimé automatiquement ; volumes non vérifiés signalés |
| OPFS | Pas de bibliothèque de dépendances OPFS dans ce contrat | Les stockages temporaires scientifiques existants ne sont pas comptés comme bibliothèque |

Les volumes présents, à télécharger, partagés, retenus par une sauvegarde et
récupérables sont distincts. La taille logique d'une union de modèles n'est pas
la place automatiquement rendue par la suppression de leurs copies en cache.
Une archive sélective exportée reste un TAR standard : son manifeste complet et
les marqueurs de catalogue/politique distinguent les absences volontaires des
fichiers perdus. Pour alléger durablement une copie transportable, créer et
vérifier un nouveau TAR, puis remplacer l'ancienne sauvegarde choisie.

Le cache peut être évincé par le navigateur. Une PWA sans archive de secours ne
peut pas reconstruire ses octets sans source disponible. Le helper géré peut
resservir la version active conservée sur disque. Le lanceur natif peut resservir
son archive/pont initial. Si une version native plus récente a perdu
ses octets en cache, elle exige son archive/HTML de sauvegarde correspondant ou
une réparation depuis sa source disponible. Le worker demande l'identité du
shell au helper, puis vérifie son écho `X-Sherloq-Release` : une version différente
est refusée, même si ses chemins de fichiers portent les mêmes noms.
Les préférences sont exportables dans un fichier de
secours indépendant du navigateur ; les origines incompatibles et champs inconnus
y restent conservés. L'import récupère les entrées compatibles séparément.
Un dossier devra être reconnecté sur une autre origine.
[Quotas et éviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Le port par défaut des nouveaux lanceurs est 8765. Un premier raccord garde le
port et l'identifiant du HTML original ; il ne change pas l'origine des réglages.
Le port n'est pas remplacé silencieusement s'il est occupé. Avant un changement de
domaine, port ou contexte PWA, exporter puis importer la sauvegarde complète.

## Premier raccord

Une archive ancienne sans module de mise à jour ne peut pas acquérir son bouton
spontanément. Après la fin des calculs et la fermeture de l'ancien helper,
conserver le HTML et le TAR originaux et lancer le helper neuf avec
`--bridge-assets`, `--bridge-chunks` et le HTML original. Il vérifie le nouveau
shell, réutilise la bibliothèque et garde l'origine des préférences. Le raccord
natif utilise le même mécanisme et fonctionne sans Python chez l'utilisateur.

Le lanceur de raccord ouvre `__sherloq_bridge/<token>/offline-bridge.html`
en dehors du scope de l'ancien worker. Une ancienne PWA mise en cache ne peut
ainsi remplacer cet écran par son ancienne interface. Le bouton de préparation
sauvegarde les préférences puis vérifie et conserve uniquement le nouveau shell ;
les ressources restent dans le TAR. Le worker neuf attend la fermeture des
anciens onglets, sans activation forcée pendant leurs calculs. Le bouton d'ouverture
exige l'identité exacte du worker et de la référence active. Une sauvegarde fraîche
est téléchargée après la fermeture des anciens onglets. Les deux helpers exposent
uniquement les fichiers vérifiés du shell à ce chemin secondaire, et donnent un
statut d'archive cohérent à `__offline-status.json` avant tout worker.

Dans une installation locale, `Gérer les fonctions → Créer une archive sélective…`
donne accès à l'emport sans passer par les commandes d'arrêt du lanceur. Ces
commandes restent accessibles après la prise de contrôle du worker et ne sont
pas considérées comme des fenêtres de calcul lors des probes d'activation.

`--bridge-policy` permet de transférer des choix explicites avant le premier
raccord. Sans cette option, les choix existants sont conservés et les nouvelles
fonctions publiques sont ajoutées par défaut. Une fonction volontairement absente
ne justifie pas de télécharger ses nouveaux modèles pour compléter le pont.

## Préparer les fichiers publics

Depuis `web/wordpress`, générer le catalogue avec
`scripts/generate-feature-catalog.py --manifest … --metadata-root feature-inputs
--output …`. Les quatre petits fichiers de configuration d'entrée sont vérifiés
contre le manifeste ; ils ne contiennent pas les modèles.

`scripts/build-local-release.py stage` prépare les sources vérifiées du shell,
les inventaires et les seuls morceaux JS remplacés par `--runtime-override`.
Son ZIP est réservé à la reconstruction et à la qualification privées, avec
une limite de 25 000 000 octets **compressés**. Aucun ZIP WordPress installable,
paquet web préconstruit ni lien public vers ces archives n'est publié. Les sources,
moteurs, ressources autorisées et scripts de reconstruction restent publics.
Les ressources scientifiques lourdes restent séparées. Un
staging local peut utiliser le commit de ressources de référence, mais ses
morceaux nouveaux n'y sont pas disponibles avant publication explicite : ce
staging n'est pas une livraison distante installable.

Pour une publication ultérieure explicitement autorisée :

1. Intégrer et vérifier les morceaux de `resource-overlay/web-assets/chunks`,
   garder les morceaux inchangés et obtenir le nouveau commit de ressources.
2. Refaire le staging avec cette origine immuable exacte ; vérifier shell,
   manifeste, catalogue et licences ; garder le ZIP de qualification privé.
3. Publier les inventaires et les fichiers sources publics du shell, puis exécuter
   `describe` avec leurs `--inventory-base` et `--asset-base` immuables.
4. Publier cette description, puis produire le seul pointeur mutable avec
   `channel --release … --release-url … --output releases/stable.json`.
5. Vérifier la livraison par lecture HTTP/CORS depuis une origine locale avant
   de modifier ce pointeur. Le déploiement du site garde sa propre validation.

Le premier module d'emport raccordé au site doit consulter ce même canal ; ses
livraisons suivantes utilisent les inventaires publics sans télécharger les
ressources lourdes depuis l'hébergement du site. Aucune archive web prête à utiliser
n'est fournie publiquement ; l'emport construit par l'utilisateur reste local.
Ne jamais publier un paquet personnel de raccord contenant `bridge-launch.json`, un chemin de bibliothèque,
un HTML personnel, une sauvegarde de réglages ou une qualification détaillée.

## Contrôles reproductibles

Les tests JS de dépendances, fonctionnalités, préférences et mise à jour utilisent
des petits contenus synthétiques. `tests/local-managed-server-test.py` vérifie le
TAR, les écritures tronquées, les transitions atomiques, la réinstallation,
l'origine HTTP et la rétention. `offline-launcher` possède ses tests Go, y compris
le premier raccord et les archives sélectives.

`scripts/check-local-update-browser.mjs` contrôle activation, plusieurs fenêtres,
réparation, CORS et reprise sans serveur. `scripts/check-old-archive-bridge.mjs`
réutilise une archive réelle en lecture, avec un profil navigateur isolé, sans
image utilisateur ni copie du TAR. Les rapports complets restent locaux.
