# Mémoire et reprise — integration.30

## Incident et périmètre

Le test integration.29 du 3 octobre 2026, démarré à 17:34:05 UTC, a été arrêté
sur autorisation de Gaël à 21:10:28 UTC. Les journaux sont conservés dans
`web-engine-integration/.build/integration/runtime-v2-integrated-memory-96mp-20261003T173405Z`.
SIFT et D2PRL avaient échoué sur des allocations de 4 Mio malgré plus de 12 Gio
de crédit dans le budget logiciel. ELA et Forgeryscope avaient terminé ;
PatchMatch n'avait pas achevé ses onze hypothèses. Aucun succès 96 MP n'est acquis.

La capture `vmmap` avant arrêt indique 12,9 Go d'empreinte physique, un maximum
historique de 16 Go et environ 9 Go de mémoire writable paginée hors RAM. Les
réservations virtuelles très supérieures ne sont pas de la RAM consommée.
Cela fournit une piste de ralentissement, pas la preuve du mécanisme exact
ayant refusé les allocations. Les journaux ne permettent pas de départager
plafond du pool de backing, références encore vivantes, collecte différée et
pression système. Il serait incorrect d'annoncer un plafond universel de 4,
8 ou 16 Gio, ou de promettre qu'un flag Chromium le supprimerait.

## Corrections exécutables

- **Nettoyage des buffers.** Une réservation vide encore tenue après réclamation
  n'est plus confondue avec un buffer transféré en attente d'acquittement. Le
  refus initial conserve sa cause ; les erreurs de nettoyage sont secondaires.
  Les vrais transferts sans acquittement restent interdits. Le worker sain reste
  réutilisable après le refus d'une nouvelle allocation.
- **Priorité de reprise.** La priorité mémoire d'une opération reprise cesse au
  premier travail utile validé par cette opération ou ses descendants, au lieu
  d'attendre la fin d'un champ entier. Les événements d'une opération étrangère
  et les heartbeats ne suffisent pas. Une nouvelle panne réarme cette priorité.
  Si le refus change de domaine, la priorité de l'ancien domaine est retirée
  avant de protéger le domaine réellement en échec.
- **Cache partagé.** Un refus réel retire au moins le besoin demandé et une
  fraction progressive du cache facultatif : 1/8, 1/4, 1/2 puis le reste lors
  de quatre reprises comparables. Ce choix est une heuristique de récupération,
  pas une mesure de capacité. Les lecteurs acquittent d'abord le retrait. Le
  cache ne reprend pas la place libérée pour le calcul ; les libérations de
  données externes peuvent financer sa croissance. Cette limite locale disparaît
  à la fin des lecteurs. Les résultats utiles ne sont pas évincés par ce mécanisme.
- **Informations mémoire.** `browserMemoryObservation()` lit seulement les
  métadonnées disponibles, y compris lors d'un vrai refus. Le budget expose
  `policyAvailableBytes` ; aucune soustraction du tas JS ne devient « RAM libre ».
  SIFT utilise également l'allocateur commun pour ses sorties.
- **Extension facultative.** Le pont local lit `chrome.system.memory.getInfo()`.
  `readExtensionMemoryHints(id)` produit un instantané daté ; un instantané frais
  peut alimenter le budget à la création du moteur, sans changer ses cœurs.
  Les observations absentes, périmées ou incohérentes ne deviennent pas des quotas.
  Firefox/WebKit et Chromium sans extension gardent le chemin portable.
- **WebGPU.** Les kernels concernés négocient leurs limites de buffer avec
  l'adaptateur. Les kernels bornés demandent leur taille utile ; ceux dont les
  dimensions arrivent ensuite demandent les limites exposées. Les batches
  respectent à la fois la taille du buffer, sa liaison et la grille de calcul.
  Fréquence et Hamming conservent le refus GPU même si `mapAsync` rejette avant
  la remontée de l'erreur mémoire. Les buffers sont détruits en cas d'échec.

Le nombre de workers et les paramètres scientifiques ne sont pas réduits par
ces changements. La fin des champs actifs reste nécessaire après une erreur
terminale de préparation pour conserver leurs résultats ; elle n'interdit pas
l'exécution concurrente normale. Les tableaux/bandes, banques réutilisables,
checkpoints fins et pyramides SIFT compatibles de l'intégration précédente
restent en place.

## Observations pour la prochaine exécution

Le runner autonome produit `browser-memory.jsonl` : compteurs CDP par isolate
(`usedSize`, `totalSize`, `embedderHeapUsedSize`, `backingStorageSize`), identifiants
des pages/workers, temps CPU cumulés par processus et durée de chaque lecture.
Lecture au début, au premier incident puis au plus toutes les trente secondes
sur les événements diagnostiques déjà présents. Aucune tâche planifiée n'est
créée, aucun calcul de capacité n'est exécuté. L'échantillonnage est asynchrone,
sans pause, appel au ramasse-miettes ni dump de tas ; son coût n'est pas prétendu nul.

Les buffers partagés peuvent apparaître dans plusieurs isolates : ces compteurs
ne doivent pas être additionnés comme une RAM physique. Le temps CPU du processus
GPU n'est pas l'occupation des unités GPU. L'admission d'un cœur n'est pas son
utilisation physique. Comparer ces observations aux propriétaires enregistrés,
aux acquittements de retrait et à la progression utile pour tester les hypothèses.

Le runner peut charger l'extension avec `SHERLOQ_MEMORY_EXTENSION=1`, dans son
seul profil jetable, depuis les fichiers figés. Il passe alors l'observation
fraîche à la recette. La voie ordinaire ne requiert ni extension ni cookie.

## Vérification et limites

Les preuves de cette révision sont regroupées dans
`docs/qualification/browser-memory-headroom/`. Elles distinguent tests injectant
un refus, véritables workers/navigateurs, calculs GPU et recette scientifique
complète sur image réduite. Les injections sont exclusivement des tests de
développement ; aucun canari ni pré-calcul n'est ajouté au moteur livré.

Ces vérifications établissent les chemins exercés, la conservation des résultats
et l'absence de fuite comptable à leur terme. Elles ne prouvent pas qu'un
navigateur ne peut plus manquer de mémoire, ni que le test 96 MP est réussi.
Le changement permet surtout d'utiliser une meilleure information quand elle
est disponible et de corriger les transitions dont le mauvais comportement
est reproduit, tout en rendant le prochain refus beaucoup plus interprétable.

Sources primaires :
- [Compte mémoire Blink](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/timing/memory_info.cc)
- [Compteurs CDP](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage)
- [Mémoire système des extensions](https://developer.chrome.com/docs/extensions/reference/api/system/memory)
- [Messagerie des extensions](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Limites et erreurs WebGPU](https://gpuweb.github.io/gpuweb/explainer/#errors)
