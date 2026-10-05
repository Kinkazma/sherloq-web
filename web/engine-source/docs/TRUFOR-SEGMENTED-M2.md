# TruFor — stockage segmenté et dépendances globales

La nouvelle voie consomme une surface RGB8 originale. Elle ne redimensionne pas
la source et ne fait pas de détection indépendante par tuiles. Le manifest
`segments` de `createTruforAnalyzer` contient les opérateurs natifs exportés,
leurs tailles/SHA, les quatre étages des deux modalités, les deux têtes et le
MLP du score. Les URL de ses `assets` sont résolues par l'intégrateur.

Produire `.build/trufor-segments/manifest.json` avec
`scripts/export-trufor-segments.py`, dans l'environnement Python/ONNX M2 déjà
utilisé pour les exports précédents. Les 152 graphes font 279738813 octets ;
poids et sorties de développement restent hors Git. Conserver la configuration
Noiseprint++ native, les runtimes CPU/WebGPU et reconstruire les opérateurs CFA
avec `scripts/build-cfa-operators.py` pour `_cfa_conv_window`. La voie dense et
ses actifs restent disponibles pour les appels RGB contigus existants.

Les features sont stockées sans perte en float32, en RAM ou dans la session
temporaire commune OPFS/IndexedDB. Chaque allocation est comptée ; les banques
qui gêneraient les opérateurs suivants vont au stockage temporaire. Les offsets
du stockage dépassent 4 Gio sans troncature. `segments.storage` peut imposer
`temporary` ou `memory` pour un contexte d'exécution ; le défaut est `auto`.
Les quotas réels restent contraignants et une erreur n'est pas masquée.

- Noiseprint++ lit des fenêtres dans les deux axes avec halo17. Le placement des
  biais suit la position globale, y compris l'épilogue natif. L'opérateur CPU
  par fenêtres est exact sur 458445 valeurs vérifiées ; les résidus GPU sont
  comparés aux références natives sur deux géométries, max5,29e-5, moyenne1,09e-7.
- Les patch embeddings gardent phase de stride et padding aux seuls bords de
  l'image. MLP/depthwise et fusion gardent leurs halos. Les 32 attentions utilisent
  toutes les clés, puis les résultats sont écrits dans leur banque globale.
- Les clés/valeurs sont préparées une fois dans leur layout de multiplication et
  conservées dans le worker/GPU pendant les requêtes. Leur résidence est comptée
  et récupérable ; le choix CPU reste possible. Les identités de réutilisation
  désignent des entrées immuables, distinctes à chaque banque calculée.
- FRM utilise moyennes/maxima sur tous les pixels. FFM additionne les contributions
  K-transpose-V avant son unique softmax global. Ses projections pointwise sont
  recalculées dans la passe d’application pour éviter quatre banques intermédiaires
  (6,14GB à96MP), sans modifier la fonction apprise. Les réductions utilisent un
  accumulateur float64 ; aucune régularisation ou méthode n'est remplacée.
- Chaque tête projette les features avant interpolation, aux coordonnées globales.
  Le score conserve un seul normalisateur sur l'image entière et les statistiques
  natives pondérées ; il n'est pas une moyenne de scores locaux.

Le résultat segmenté expose des champs float32 en lecture seule (`readInto`,
`readBytes`) plutôt que des copies d'image complètes. Les fenêtres des trois vues
gardent la palette native et les coordonnées originales. Les percentiles 1/99 du
résidu sont exacts : quatre lectures radix globales et interpolation native, sans
copie triée de tout le champ. `createM2NpzStream` lit ces champs de façon asynchrone
et conserve les octets NPY/NPZ de la voie dense. Le helper ZIP64 commun reste M5.

Au niveau worker : `analyzeBlob('trufor',blob)` et `renderWindow` sont disponibles.
`readArray` et `readExport` attendent les accès temporaires et épinglent leurs
ressources. **Attendre `client.dispose()`** permet d'annuler les opérations, de
fermer/supprimer les temporaires, puis de terminer le worker. Un arrêt brutal du
processus relève de la récupération des sessions temporaires communes.

## Qualification numérique et cycle de vie

Les deux géométries d'encodeur/têtes ont été comparées en CPU/GPU avec fenêtres
forcées : features max1,64e-5 ; cartes/confiance sous1e-6, score sous1,1e-7 et
aucun changement au seuil0,5 sur ces cartes. La preuve de réutilisation de clés
vérifie 4712 opérations utiles, 23MB de retransferts évités et les mêmes features.

Le JPEG193×129 traverse réellement le worker, le décodeur, Noiseprint++, les deux
modalités, cartes, score, six vues et le NPZ complet. CPU : cartes/confiance max
1,32e-6 ; GPU : max1,02e-6 ; résidu max5,97e-7 ; aucun changement au seuil0,5.
Le coût à froid des nombreux graphes et de Noiseprint++ CPU est encore important
(environ65s pour cette recette). Ce n'est pas présenté comme un gain de vitesse
sur la voie dense existante. La motivation immédiate est la mémoire globale.

Ces comparaisons natives restent distinctes de la qualification de charge96MP
ci-dessous. Aucun préflight, oracle, benchmark ou calibration n'est chargé par
le produit.

Recette OPFS dédiée : source193×129, stockage des features et sorties imposé
àOPFS, mêmes cartes et score ; annulation du travail utile puis répertoire
temporaire vide. La recette conserve aussi les champs pendant un export dont
le résultat et le cache ont déjà été libérés. Les preuves JSON séparent cette
qualification de cycle de vie de la couverture96MP ci-dessous.


## Fenêtres de requêtes : admission et progression

Après une erreur réelle MEMORY_LIMIT/MEMORY_ALLOCATION sur une fenêtre, le
contrôleur libère ses ressources, divise sa largeur et recommence au même offset.
Aucune requête ni clé n'est omise ; une erreur à une seule requête reste explicite.
Les messages de progression donnent le nombre global de requêtes terminées,
sans masquer cette information par un message d'inférence pour chaque portion.
La fenêtre par défaut reste256Mio : la comparaison312/156requêtes n'établit pas
un gain stable en concurrence et ne justifie pas d'augmenter ce défaut.

Preuves de développement uniquement :624requêtes identiques sur les93750clés de
la première attention96MP donnent des sorties exactes avec156 ou312parappel,
final mémoire0. Une erreur d'admission injectée uniquement dans le script de
recette provoque exactement un repli ; les quatre étages réels de l'encodeur
terminent, features max1,002e-5, final0. La source193×129 complète conserve
cartes/confiance max1,014e-6, résidu5,97e-7, score2,98e-8 ; six vues et NPZ302620
valident le raccordement. Aucune recherche de paramètres ni exécution synthétique
n'est ajoutée chez l'utilisateur. La recette96MP ci-dessous a conservé ses
fenêtres d'origine256Mio ; le repli après erreur est qualifié séparément par
la recette injectant une vraie erreur d'admission dans son seul script.


## Source 96 MP complète — recette 1ead3ff

Preuve : [trufor-source-96mp-webgpu-proof.json](trufor-source-96mp-webgpu-proof.json).
JPEG original bruité 12000×8000, SHA
`f0b7febc57f625bf078dfeb746f5775f4c6efa7379e0f1c469a9330eb094f254`,
86 050 184 octets encodés ; décodage par lignes sans interpolation ni réduction.
Chrome 154.0.8037.58, WebGPU demandé avec opérateurs CPU possibles, profil
sur disque temporaire propre M2. La recette a chargé le moteur `1ead3ff` ; les
changements ultérieurs de progression/repli mémoire `caa54a7` ne sont pas
présentés comme exécutés par ce parcours. Leur chemin modifié est vérifié
séparément ci-dessus, avec le même budget de fenêtre par défaut.

Noiseprint++, les 32 attentions utilisant toutes les clés, les quatre fusions,
les deux têtes et le score global ont terminé. Les trois champs ont été lus
intégralement : chacun 96 000 000 valeurs finies et non constantes. Carte dans
[0,0329084583 ; 0,830072761], confiance dans [0,679817855 ; 0,999833643], résidu
dans [-1,618670583 ; 1,159517407]. Score image fini : 0,10407834500074387.
Six vues (trois modes dans deux régions distantes) lues aux coordonnées source.
NPZ complet de 1 152 003 868 octets consommé en flux, taille et signatures ZIP
vérifiées ; les tests unitaires de format à octets natifs restent la preuve du
sérialiseur. Le résultat a été libéré après cet export ; la conservation d'une
archive après libération anticipée est la preuve OPFS distincte de petite taille,
pas une revendication ajoutée à cette recette 96 MP.

Analyse : 20 767,549 s ; parcours complet : 20 784,540 s, soit **5 h 46 min 24,54 s**.
Ce coût est une limite pratique importante de cette attention globale sur 96 MP.
La machine exécutait d'autres travaux ; ce n'est ni une mesure isolée de vitesse
ni une promesse de latence interactive. Aucun calcul natif n'a été remplacé pour
raccourcir la recette.

Budget partagé : 3 221 225 472 octets (3 Gio), pic comptabilisé : 3 212 138 086 octets.
Pic temporaire OPFS : 8 064 000 000 octets sous limite de 10 Gio ; trois champs
conservés sur 1 152 000 000 octets en fin d'analyse. Source RGB : 288 Mo en RAM
segmentée. Après release/cache : réservations actives et cache à zéro, tas JPEG
de 103 546 880 octets encore compté jusqu'à dispose. Dispose attendu, processus
terminé avec code 0 et profil temporaire retiré. Le pic du budget ne mesure pas
tout le RSS Chrome/Blob. L'inventaire OPFS final n'a pas été relu dans cette grande
recette ; son nettoyage explicite est vérifié par la recette OPFS séparée, et le
profil entier de ce parcours a bien été supprimé par le script de recette.

Les critères supplémentaires du script `005414e` (source >=94 MP, score fini dans
[0,1]) ont été contrôlés directement sur ce rapport après exécution, sans
prétendre que ce script plus récent avait été chargé au lancement. Il s'agit
d'une qualification réelle de charge/calcul/API/export/mémoire reliée aux
comparaisons natives de petite taille ; **pas d'oracle natif indépendant 96 MP**,
ni qualification WordPress ou de cohabitation avec les autres moteurs.

## Accélération des grandes attentions

L’export optionnel [TruFor split-value](TRUFOR-SPLIT-VALUE-M2.md) ajoute26graphes
pour les trois premiers étages, activés sur WebGPU à partir de65536clés.
Softmax toujours global ; seule la somme P@V est parallélisée, avec admission
explicite des nouveaux tampons. Gains locaux mesurés1,21–1,90× à chaud, pas de
nouveau temps complet96MP revendiqué. Le quatrième étage conserve son graphe
original, car le candidat était plus lent. Les anciens manifestes restent valides.
