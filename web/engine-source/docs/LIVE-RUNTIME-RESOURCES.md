# Pilotage des ressources en cours de calcul

État : intégration.33, qualification à petite taille et injections de panne. La preuve de réussite et de temps total à 96 MP reste à produire.

## Mémoire

Le client peut recevoir `memoryExtensionId` ou `memoryHintProvider`, ou transmettre explicitement `updateResourceHints(hints)`. Pendant une opération active, la lecture facultative est espacée de deux secondes, sans chevauchement. Elle ne déclenche ni allocation de capacité, ni GC, ni calcul préalable. Une observation trop ancienne, répétée ou invalide est ignorée.

Le budget additionne la mémoire CPU matérialisée et suivie à la fraction de mémoire disponible fournie par le système. Les réservations non matérialisées ne sont pas ajoutées : cela créerait une augmentation artificielle du budget à chaque observation. Le résultat reste limité par la fraction de capacité du profil et par une éventuelle limite explicitement fournie. La mémoire GPU n'est pas additionnée à ce total CPU, ce qui évite de compter deux fois des buffers partagés sur une architecture à mémoire unifiée.

Une baisse significative affecte les prochaines admissions, sans annuler les réservations existantes. Deux observations confirment une hausse. Une zone de tolérance évite les petites oscillations. Le cache partagé retire ses banques excédentaires après les véritables acquittements des lecteurs. Les champs peuvent rendre des kernels devenus inutiles à une frontière de commandes validées ; leurs plans et leurs résultats restent présents. La perte de l'extension conserve le dernier budget. Ce budget est une politique, pas une garantie d'allocation Chromium.

Les flux JPEG/ELA réservent et réutilisent une fenêtre de lignes pendant leur vie entière. Le stockage temporaire prend ses tampons dans l'enveloppe déjà détenue par chaque worker. Cela vaut aussi pour IndexedDB : une baisse du budget global n'invalide plus les lectures/écritures intermédiaires d'un flux admis. Les nouvelles qualités restent soumises au budget courant. La qualification abaisse le budget à un octet pendant une qualité active, puis vérifie ses trois plans natifs exacts sans redémarrage ; il s'agit d'une injection de test, absente du moteur de production.

## Parallélisme et arbitrage

Un temps de tâche qui inclut attente, stockage et récupération n'est plus utilisé pour conclure à une contention CPU. Un plafond réduit après un échec remonte aux terminaisons utiles, ou est réévalué après une libération dans le domaine concerné. Les bandes d'ondelettes réévaluent leur plafond pendant la tâche. Les kernels PatchMatch rendent immédiatement les créneaux CPU d'un élargissement refusé au lieu de les garder pendant leur lot suivant.

L'ordonnanceur publie une seule union stable des attentes d'une opération. Deux requêtes CPU/GPU de la même opération ne réécrivent plus alternativement son état en se réveillant indéfiniment. La reproduction sur le code précédent produit encore une notification après cent tours sans aucun changement de ressources ; le test corrigé converge et admet ensuite les deux travaux. Les capacités et le parallélisme autorisé ne sont pas réduits.

Les lectures utiles alimentent un échantillonnage des coûts de cache (une lecture sur 64). L'arbitre compare une estimation du temps gagné par octet sur un horizon commun aux demandes de nouveaux workers des pools élastiques. Un cache moins utile peut céder la place ; les banques ayant servi le moins sont retirées en premier. Les chiffres restent des estimations, et les premiers travaux démarrent sans calibration. Les admissions ne mesurent pas l'occupation physique des cœurs.

## Reprise interne PatchMatch

Le kernel prépare les écritures d'une commande dans un buffer réutilisable de 2 Mio par kernel (adapté aux pages explicitement plus grandes). Les lectures de la commande voient ses écritures privées. Le coordinateur publie le lot terminé avant d'ouvrir ses dépendances. Il conserve le front des lignes, les positions des lots, la phase et l'itération. Le RNG est déterministe par graine, pixel et itération ; il n'existe pas d'état aléatoire implicite à reconstruire entre deux commandes.

Une panne du kernel abandonne uniquement son lot non publié. Les kernels sains terminent leurs lots avant la reprise. Le remplacement retrouve les pools de candidats et les champs existants. La publication vers le stockage peut réappliquer les mêmes écritures sans refaire le calcul. Les comparaisons déjà validées sont conservées, y compris quand un kernel est retiré pour rendre de la mémoire. Il n'y a pas de deuxième copie du champ complet.

La garde porte sur cinq échecs comparables sans progression ; dix incidents distincts séparés par du travail utile sont couverts par la qualification. Un arrêt du coordinateur du champ lui-même reste un cas distinct : le secours extérieur peut encore reconstruire ce champ. Les tests de reprise interne ne constituent pas une preuve de survie à la destruction du navigateur.

## GPU

Les champs parallèles demandent leurs lots de distances à un exécuteur GPU commun placé chez leur propriétaire. Ils partagent ainsi le device, le pipeline et l'arène de buffers sans tenter de transférer un `GPUDevice`, ce que l'API ne permet pas. Les portées d'erreur ont un propriétaire unique. Les prêts CPU sont rendus pendant l'attente GPU, puis réadmis pour le raffinement natif. Les limites négociées et le budget global restent appliqués.

Les profils activent ce chemin certifié ; l'absence de GPU ou un échec conserve le raffinement CPU exact. Les ressources des autres bibliothèques GPU restent sous leur propre propriétaire et sous l'admission globale : ce changement ne prétend pas fusionner tous les devices des runtimes tiers. Les migrations des descripteurs restent possibles avec le chemin GPU actif.

## Vérification disponible

Les preuves dans `docs/qualification/live-runtime` couvrent :

- les quatre phases d'un champ, avec refus injecté après une écriture privée, résultats et nombre de comparaisons identiques à la référence sur Chrome, Firefox et WebKit ;
- le retrait puis le retour de kernels, sans redémarrer le champ ;
- deux champs concurrents utilisant un seul exécuteur GPU dans Chromium ;
- les migrations en cours de calcul, dont le chemin GPU, OPFS et IndexedDB ;
- les observations mémoire qui traversent le canal de contrôle d'un worker occupé sans remplacer son contrôleur ;
- 1 393 tests de régression réussis, puis 44 vérifications ciblées après la dernière modification de publication du graphe d’attentes.

La première passe complète avait deux attentes de test devenues obsolètes : la lente remontée d'un plafond et sa baisse sur le seul temps mural. Ces attentes ont été remplacées par des vérifications du comportement demandé. Aucun résultat scientifique n'a été assoupli.

## Analyse complète à taille réduite

L'analyse froide de 2 008 × 1 444 pixels sur le commit `46d4752` a terminé les cinq groupes et les onze hypothèses denses. Les 746 tableaux scientifiques (dont 699 tableaux de résultats) sont identiques bit à bit au commit `8bd175a`. L'archive de 638 339 902 octets a été relue indépendamment, avec vérification des en-têtes NumPy, CRC et hachages. Son SHA-256 est `114e52063743aee6d16bdbaf2878be88cff19a877be18f84545c457e8836de1c`.

Le temps total mesuré, export et relecture inclus, est de 346 863,895 ms, contre 364 110,65 ms pour l'exécution précédente. Ce sont deux observations à petite taille, pas une démonstration statistique du gain à 96 MP. Après cette exécution, la revue a ajouté la garde des créations de kernels et raccordé la fin du secours ELA à la remontée du parallélisme ; ces chemins sont vérifiés par injection de panne.

La création d'un kernel est elle aussi protégée contre cinq refus comparables sans travail utile, même si la récupération annonce des octets libérés. Un échec répété d'élargissement facultatif conserve le kernel sain et rend les créneaux CPU superflus. La qualification comprend treize tests du coordinateur, dont ces deux cas.

Les diagnostics du grand test enregistrent la dernière observation de l'extension, la révision du budget et son motif, en plus des compteurs du moteur et de Chromium. La vérification indépendante d'un grand test autonome s'exécute avec `python3 scripts/verify-m5-complete-96mp.py --run-directory CHEMIN` et écrit `archive-verification.json` dans son dossier.

## Incident 96 MP de l'intégration.31

L'exécution `runtime-v2-live-resources-96mp-20261003T231446Z` a cessé de publier du travail utile après 181 secondes. Avant ce blocage, ELA avait récupéré un refus du budget de 1 152 000 octets : sa fenêtre était réallouée après la baisse de la limite. Ce refus ne venait pas de l'allocateur Chromium. Le processus avait ensuite un worker de coordination occupé et des workers de calcul en attente ; ses diagnostics ne répondaient plus. L'exécution a été arrêtée explicitement, ses journaux préservés, sans résultat complet.

La boucle de notifications a été reproduite séparément ; l'échantillon système ne permet pas de lui attribuer avec certitude la pile JavaScript de cet incident. Pour lever cette incertitude si elle revient, le banc de développement prend une seule seconde de profil CPU après trois diagnostics sans réponse. Une reproduction avec une boucle de microtâches confirme qu'il retrouve la fonction et son fichier. Ce mécanisme ne met pas le worker en pause, n'effectue ni allocation d'essai ni GC, et ne crée aucune tâche planifiée.

## Qualification complète de l'intégration.32

Le commit `4e062d8` a terminé les cinq groupes et les onze hypothèses denses sur la source de 2 008 × 1 444 pixels. Les 746 tableaux scientifiques sont identiques bit à bit à l'intégration.31, elle-même comparée à la référence antérieure. La relecture indépendante valide les CRC, en-têtes, tailles et hachages de l'archive de 638 339 978 octets, SHA-256 `92ba8d28841fd8f2b0b98843d1f87088d3c98dec98af1d18c916401a36cc0fff`. Les réservations et données retenues du budget sont nulles en fin d'exécution.

Le temps total est de 1 321 293,215 ms (22 min 01 s). Plusieurs calculs étrangers à SHERLOQ occupaient simultanément la machine, avec une charge système très élevée ; ce temps ne permet pas d'attribuer la différence avec l'essai précédent au moteur. La preuve détaillée conserve les observations de concurrence système et les délais de diagnostics, séparément des échecs du calcul. La réussite à petite taille ne remplace toujours pas la qualification 96 MP.

## Boucle du budget identifiée sur le 96 MP

L'exécution `runtime-v2-live-admission-96mp-20261004T002811Z`, commit `53d965c`, s'est bloquée après environ 637 secondes de progression utile, sans erreur terminale publiée. Le profil CPU a cette fois capturé la chaîne effective : notification du budget, ordonnanceur, refus de réservation et calcul des dépendances. Il capture aussi le récupérateur de préparation Forgeryscope. Celui-ci appelle `clear()` même lorsque son propriétaire est vide ; `retained -= 0` produisait encore une notification. Sous manque de crédit, le même tour pouvait donc se répéter sans qu'aucun message de worker ne soit traité.

L'intégration.33 rend les affectations de mémoire active et retenue idempotentes au niveau du budget commun. Tous les récupérateurs qui rendent zéro octet sont couverts, sans délai ajouté et sans réduction du nombre de workers. La reproduction sur le commit exécuté conserve une notification après cent tours ; avec la correction, elle converge en un tour. Une vraie libération réadmet la demande. Des workers réels sur Chrome, Firefox et WebKit vérifient que les événements de tâche survivent aux deux boucles corrigées, puis que les demandes CPU/GPU concurrentes aboutissent. Les 184 tests d'intégration des ressources et les 46 tests ciblés suivants passent.

Les diagnostics de l'ordonnanceur exposent maintenant jusqu'à 32 demandes en attente : propriétaire, CPU/GPU demandés, dernier besoin mémoire effectivement évalué et dernier refus du budget. Ils ne réexécutent pas les fonctions de dimensionnement et ne provoquent aucune allocation d'essai. Le profil CPU brut et la reproduction sont conservés dans `docs/qualification/live-runtime`. Cette exécution 96 MP bloquée a été arrêtée explicitement ; elle ne constitue pas un résultat complet.
