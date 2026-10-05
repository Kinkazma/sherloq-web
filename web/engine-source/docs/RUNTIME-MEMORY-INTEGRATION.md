# Contrat d’exécution et de reprise — integration.29

Les refus observés dans integration.28 venaient de contrats incomplets entre les
producteurs, leurs workers, les propriétaires de mémoire et l’ordonnanceur.
Le crédit du budget ne mesurait pas une capacité d’allocation garantie par le
navigateur. Libérer un tas WASM ne constituait pas la preuve qu’un cache de
SharedArrayBuffer avait été retiré. Une progression de préparation pouvait aussi
être rejouée sans représenter du travail nouvellement conservé.

## Comportement intégré

| Frontière | Comportement en cas de refus | Travail conservé |
| --- | --- | --- |
| Allocation native / copie JS / GPU | Domaine, étendue connue, cause et contexte traversent le RPC ; une erreur de bornes reste une erreur de bornes. | Le résultat appartient à son propriétaire jusqu’à sa publication ou son nettoyage. |
| Admission | Une libération réelle ou un propriétaire devenu récupérable réveille la file ; un simple heartbeat ne relance pas une boucle de récupération. | Les travaux voisins capables de terminer gardent leurs admissions. |
| Récupération | Réclamation du domaine concerné, quantité proportionnée, distinction entre crédit comptable et mémoire effectivement retirée ; priorité héritée explicitement par les sous-tâches. | Les résultats validés ne sont pas confondus avec un cache facultatif. |
| D2PRL | Projection par bandes, avec curseur zone/plan/ligne ; scratch réutilisable réservé avant projection. | Grilles, plans, exclusions, lignes composées et post-traitement déjà validés. |
| PatchMatch / SIFT dense | Deux banques alternées évitent de reprendre sur une entrée partiellement écrasée ; entrée, sortie et scratch circulent par acquittement entre les tuiles. | Bitmap des tuiles validées et champs terminés ; erreur de préparation visible pendant la fin des champs actifs. |
| ELA / Ghost | Qualités parallèles, stockage segmenté et consommation d’un plan à la fois ; disparition du cube complet obligatoire pour le parcours par cellules. | Qualités, min/max, courbes et étapes validées ; l’état de la phase suivante remplace celui devenu inutile. |
| SIFT clairsemé | Continuations de préparation, réutilisation des couches gaussiennes compatibles et du travail des fenêtres voisines. | Couches/étapes natives compatibles avec la même source et géométrie. |
| Réseaux et statistiques | Propriété des sorties distincte des sessions ; tas inactifs récupérables ; transfert de réservation sans libérer puis redemander le même crédit. | La sortie reste lisible après destruction du worker. |

La concurrence reste celle du profil agressif. Les unités indépendantes reçoivent
les ressources disponibles ; le nombre de threads ORT s’adapte entre les vrais
travaux. Un échec de préparation arrête les nouvelles admissions de cette
préparation pendant que ses champs déjà actifs terminent. Il n’impose pas un
ordre séquentiel permanent aux champs ni aux cinq groupes.

La récupération peut se répéter après une progression utile. Elle s’arrête après
cinq échecs consécutifs comparables sans nouveau résultat validé ; un changement
de libellé, un heartbeat ou la répétition d’une ancienne tuile ne remet pas ce
compteur à zéro. Les erreurs terminales sont des événements distincts des reprises.

## Données disponibles sans calcul préalable

`runtimeDiagnostic` distingue les réservations, les allocations matérialisées
connues, leurs propriétaires, les domaines demandés par les phases, les attentes
et les dépendances. La réclamation rapporte les propriétaires visités, les octets
retirés dans le domaine demandé et les autres crédits rendus. Les alias d’un même
buffer ne sont comptés qu’une fois. Les tas WASM exposent leur taille réelle.
Les exécuteurs GPU CFA/Noiseprint exposent les buffers résidents qu’ils possèdent ;
les allocations internes opaques d’ORT restent une enveloppe réservée, pas une
mesure inventée de VRAM.

Le cache partagé expose hits, misses, fills, collisions et, pour les retraits,
les octets, le temps d’acquittement et les compteurs avant/après. Ces observations
proviennent du travail utile. Elles permettent de rapprocher un retrait de la
progression suivante, sans prétendre mesurer le temps contrefactuel qu’aurait
pris la même exécution avec un autre cache. Aucun canari, étalonnage ni test de
remplissage de RAM n’entre dans le parcours utilisateur.

Les admissions CPU/GPU ne sont pas une mesure de l’utilisation physique des
cœurs. Les garanties de reprise portent sur les erreurs remontées au runtime et
sur les résultats détenus par la session. La destruction complète du processus
navigateur par le système ne peut pas être rattrapée par son JavaScript disparu.

## Vérification

Les preuves de cette intégration sont dans `qualification/memory-runtime-integration/`.
Elles couvrent les refus injectés aux vraies frontières natives, les reprises
imbriquées et concurrentes, la conservation des sorties, les références
scientifiques et les navigateurs. Les tests de développement sont séparés du
moteur distribué. Les préparations à budget serré et les pools JPEG/ELA/Ghost ont
été exécutés sur Chromium, Firefox et WebKit ; le pipeline GPU et le runtime
statistique natif ont été exécutés dans Chromium.

La suite Node complète, exécutée avec les interceptions de modules activées,
compte 1 358 réussites, aucun échec et deux tests initialement ignorés faute de
leurs oracles locaux. Ces références natives ont ensuite été retrouvées dans le
répertoire M4, raccordées en lecture seule, enregistrées par leurs empreintes et
les deux tests ont réussi séparément. Les 1 360 cas sont donc couverts ; les
comptages des suites qui se recouvrent ne sont pas additionnés. Le corpus EM
comprend 104 calculs acceptés et 86 refus attendus, avec des poids et nombres
d'itérations exacts. Aucune référence ni tolérance n'a été modifiée.
Les tests aux frontières couvrent aussi les statuts d'allocation natifs, le
transport C2PA et le rejet d'un readback GPU SparseGlue avec sa cause d'origine.

Les injections des workers SIFT et texture portent sur des allocations réellement
effectuées dans le parcours actuel : copie propriétaire des poids SIFT après
les gradients natifs et appel malloc natif du masque. Sur les trois navigateurs,
deux refus produisent deux reprises, sans répétition des tuiles déjà validées,
avec des empreintes identiques et un budget final nul. L'ancien test qui visait
une allocation supprimée par la réutilisation des buffers a été corrigé.

SparseGlue a également été exécuté entièrement dans Chromium, sur CPU et GPU,
sur ses trois références natives. Les correspondances sélectionnées sont
identiques ; les écarts flottants respectent les tolérances existantes.
Le contrôle des dépendances couvre 2 337 références littérales et 92 répertoires
de base : aucun fichier manquant ni dépendance absente du manifeste distribué.

Le parcours complet final, figé sur le code du commit `549bd42`, termine les cinq
groupes à leur première tentative sur l'image positive 2 008 × 1 444, puis
l'export et sa lecture en 364 secondes. L'archive de 638 339 234 octets a passé
la vérification indépendante CRC/NumPy/empreintes. Ses 746 tableaux scientifiques,
dont 699 sorties détaillées, sont identiques octet pour octet à integration.28 ;
la comparaison des métadonnées scientifiques ne révèle aucune différence.
Les réservations, caches et résultats retenus reviennent à zéro après fermeture.
Ce temps inclut les transferts finaux ; des tests EM de développement ayant
chevauché une partie du parcours, il ne constitue pas une comparaison isolée de
performances. Le bilan et les empreintes des preuves sont dans
`qualification/memory-runtime-integration/summary.json`.

L’ancien essai 96 MP d’integration.28 s’est terminé en échec : SIFT, Forgeryscope
et ELA terminés, D2PRL et PatchMatch échoués. Il ne constitue aucune validation
de cette version. Aucun nouvel essai 96 MP ni contrôle planifié n’a été lancé
pendant cette intégration.
