# Wavelet Threshold segmenté — contrat M4

L'opération publique `detail.wavelets` est disponible sur JPEG segmenté. Les
59 ondelettes et cinq modes natifs conservent leurs paramètres : wavelet,
threshold0..100, level entier ou null, mode soft/hard/garrote/greater/less.
La reconstruction rend un `layout:'surface'` de même taille orientée que la
source. Lecture/export/libération par le protocole des surfaces, avec revision.

Chaque bande de calcul couvre un axe entier. Les convolutions symétriques
PyWavelets1.5.0 sont celles du moteur qualifié ; les bandes de stockage ne
créent aucun nouveau bord mathématique. Canal bleu, calcul float64, maxima
absolus par sous-bande globale, choix des niveaux, recadrage des dimensions
impaires et troncature uint8 restent natifs. Même le seuil zéro reconstruit les
coefficients : aucune identité artificielle contournant les arrondis natifs.

Les plans de coefficients utilisent le stockage segmenté commun. Les caches
volumineux sont placés en OPFS/IndexedDB plutôt que de saturer le budget actif.
Un seul cache d'ondelette par source est conservé ; changer seuil/niveau/mode
réutilise tous les coefficients, changer l'ondelette les libère. `unload` et
`dispose` ferment le cache puis la session temporaire. Les sorties ont leur
propre durée de vie et ne modifient pas les coefficients.

Progression par phases `blue-channel`, `decompose-N-*`, `reconstruct-N-*`,
`render` (fraction locale par phase) ; `metrics.coefficientsCached` signale la
réutilisation. AbortSignal contrôlé entre bandes/transferts. Toutes les sorties
intermédiaires sont détruites sur erreur ou annulation. Le budget adapte la
largeur des bandes ; un axe entier doit tenir en RAM, sinon MEMORY_LIMIT
explicite sans redimensionnement. Aucun calibrage avant le calcul utile.

Les axes sont parallélisés en bandes complètes sous le budget commun ; voir le contrat de concurrence ci-dessous.

Validation : 295 reconstructions (59×5) exactes contre la voie native déjà
qualifiée ; recadrage impair/seuil zéro et annulation en quatre phases avec
stockage temporaire. Chrome/API publique : JPEG1600×1100 sous64Mio, deux rendus
complets SHA-256 natifs exacts, coefficients réutilisés, OPFS et nettoyage
complet. `wavelet-stream-browser-proof.json`. Pic comptabilisé48,65Mo. Cette
validation n'est jamais exécutée chez l'utilisateur avant une analyse.

Sources/build propres : `native/wavelet-stream.cpp` réemploie `wavelets.cpp`,
archive PyWavelets vérifiée SHA-256, `scripts/build-wavelet-stream.sh`. Fichiers
communs à fusionner : index, image-sources (durée de vie du cache), manifeste.
Wavelet Blocking, PRNU, Frequency Split et Noisesniffer sont des lignes séparées.

## Useful strip concurrency

Complete-axis decomposition and reconstruction now use a bounded worker pool.
Each worker receives an owned strip and runs the identical float64 PyWavelets
kernel; global coefficient maxima/thresholds stay with the owner. No transform
crosses an artificial tile boundary. Workers are reused within each axis stage
and terminated before releasing their shared-budget reservation. Full local
workspace is retained for memory-limited stages. Scheduling starts at available
CPU/memory capacity and adapts from completed useful strips; no probes.

`profile.maxWorkers` controls internal adapters; public calls use the existing
compute profile/CPU selection. `loadBlob({id,blob,layout:'segmented'})` explicitly
selects the qualified segmented JPEG path even when the ordinary decoder fits.
Omitting layout keeps automatic source selection. Metrics expose worker count,
completed strip jobs and zero preflight executions. No pixel/threshold change.
