# Contrat worker M2 pour B et la composition automatique

## État des parcours source — 1er octobre 2026

Les recettes suivantes utilisent l'original entier12000×8000 dans Chrome154,
budget partagé3Gio, calcul réel, lecture des champs et export complet. Ce sont
des preuves de charge/API/mémoire reliées aux comparaisons natives de petite
et moyenne taille ; pas des oracles natifs indépendants96MP ni une qualification
WordPress. Le pic comptabilisé ne mesure pas tout le RSS de Chrome/Blob.

| Parcours | Résultat et export | Preuve |
| --- | --- | --- |
| CFA, adaptateur commun aux trois variantes | 384tuiles,93126cellules,9vues, NPZ7943106octets | [96MP CFA](cfa-source-96mp-webgpu-proof.json) |
| CAT-Net, JPEG original | carte96M/native6M,4vues, NPZ408003652octets | [96MP JPEG](catnet-source-96mp-webgpu-proof.json) |
| CAT-Net, PNG et compagnonQ100/444 | même chaîneRGB/DCT/table,4vues, NPZ408004456octets | [96MP compagnon](catnet-companion-source-96mp-webgpu-proof.json) |
| Composite, qualité automatique | centJPEG, Noiseprint, PCA globale,10EM, covariance-floor-v1,4vues, NPZ1453408114octets | [96MP Composite corrigé](composite-source-stability-96mp-webgpu-proof.json) |
| Forgeryscope Auto/blots, ALIKED | copie texturée,24inliers,candidate embedding, NPZ960033520octets | [96MP Auto](forgeryscope-source-96mp-rich-webgpu-proof.json) |
| Forgeryscope pistes | 36pistes,3paires,candidats natifs, NPZ576026216octets | [96MP pistes](forgeryscope-source-96mp-lanes-webgpu-proof.json) |
| Forgeryscope microscopie, SIFT | deux48MP,4transformations,2584inliers, NPZ576025276octets | [96MP microscopie](forgeryscope-source-96mp-microscopy-webgpu-proof.json) |
| TruFor / Noiseprint++ | 32attentions globales,3champs96M,score,6vues, NPZ1152003868octets ;5h46min24,54s | [96MP TruFor](trufor-source-96mp-webgpu-proof.json) |

Accélération optionnelle TruFor : le manifeste produit décrit dans
[TRUFOR-SPLIT-VALUE-M2](TRUFOR-SPLIT-VALUE-M2.md) ajoute26graphes pour les trois
premiers étages sur grandes banques WebGPU. API et sorties inchangées. Les gains
locaux ne remplacent pas le temps96MP historique ci-dessus. Composite utilise
également [les covariances/projections BLAS](COMPOSITE-BLAS-M2.md), sans nouvel
actif ni paramètre UI. La correction native autorisée est
[portée avec covariance-floor-v1](COMPOSITE-STABILITY-M2.md), incluant les actifs
Python et métadonnées/cache versionnés. Les anciens rapports de singularité
concernent la politique historique.

Les appels historiques contigus restent disponibles. Les sections présentant
leurs limites de mémoire ne décrivent pas les nouveaux backbones segmentés.
Pour B/M5 : conserver la distinction candidats/géométrie de Forgeryscope et le
conditionnement Composite. Les erreurs numériques dégénérées documentées ne sont
pas déclarées corrigées par les recettes de charge.


`createM2WorkerClient` est exporté de `src/index.js`. Un worker hôte conserve
les résultats scientifiques et partage un seul budget entre les cinq familles.
Les algorithmes utilisent leurs vrais sous-workers CPU/WebGPU. Les fenêtres de
lecture, les exports et l'annulation ne déclenchent pas une seconde analyse.
Aucun travail de calibration ni benchmark n'est ajouté.

```js
const client = await createM2WorkerClient({
  memoryBudgetBytes: budgetForM2,
  computeProfile: 'aggressive',
  methods: { trufor: truforConfiguration, cfa: cfaConfiguration }
});
const result = await client.analyze('trufor', rgb8, {}, {
  signal, backend: 'auto', onProgress
});
const info = await client.metadata(result);
const visibleValues = await client.readArray(result.id, 'map', offset, count);
await client.exportTo(result.id, writableStream, { signal });
await client.release(result.id);
await client.dispose();
```

Les configurations sont celles des composants individuels documentés dans les
cinq contrats M2. Elles sont sérialisables : `preparationFactoryUrl`,
`siftFactoryUrl`, `jpegFactoryUrl` remplacent les fonctions factory. Fournir des
URL absolues et les SHA/taille des modèles. Les modules et workers doivent être
servis à leur emplacement relatif habituel. B/A gardent assemblage, politique de
chargement et publication. Rien n'est publié par ce client.

`methods` accepte forgeryscope/trufor/composite/catnet/cfa. Paramètres,
coordonnées, indices, seuils, variantes et exports scientifiques restent ceux
des contrats individuels. L'hôte lance une analyse à la fois ; les travaux
indépendants à l'intérieur du réseau utilisent les ressources admises. `BUSY`
rejette une analyse concurrente. `AbortSignal` arrête ses véritables inférences.
`dispose()` renvoie une Promise : attendre la fermeture des temporaires avant la terminaison de l'hôte et ses workers ; les identifiants deviennent invalides.

Le résultat initial contient `id`, dimensions source et descripteurs des champs
numériques : type, longueur, octets. `metadata(result)` restitue les paramètres,
formes natives (mapShape/gridShape/statisticsShapes), provenance, métriques et
éventuel mapError de Composite. Les masques et cartes restent dans le worker.
`readArray(id,field,offset,count)` copie une plage linéaire en ordre natif, maximum
**4 Mio par appel**, sans modifier le tableau conservé. Lire les lignes source
ou lignes de grille nécessaires à la vue. Ce mécanisme évite de transférer tous
les champs d'une analyse à chaque rafraîchissement ; il ne rend pas le calcul du
backbone segmenté et ne constitue pas une qualification des backbones à 94 MP.

`render(id,view)` conserve un rendu natif RGB8 et retourne son identifiant,
dimensions et taille. Lire ses octets via `readExport` puis `releaseExport`.
Les vues sont celles des composants ; Forgeryscope fournit directement masques,
polygones et provenance au visualiseur de clones existant.
`beginExport(id,{signal,onProgress})` prépare les en-têtes et CRC du NPZ natif
par portions de 1 Mio. Les tableaux scientifiques sont référencés, sans copie
complète de l'archive. `readExport` assemble chaque fenêtre, `releaseExport`
libère les en-têtes et la référence au résultat. Le résultat peut être libéré
par l'UI pendant un export : sa mémoire reste comptée jusqu'au dernier export.
`exportTo` gère ce cycle vers un WritableStream avec contre-pression et
annulation, y compris pendant les CRC. La limite du format ZIP sans ZIP64 reste
4 Gio ; les appels synchrones `analyzer.exportNpz` gardent leur ancien contrat
avec tableau complet. Les octets des deux voies sont identiques.

Le mode neuronal Auto attend les travaux actifs puis utilise le CPU si les
réservations GPU ne peuvent être admises. Ce choix ne désactive pas le GPU pour
les travaux suivants plus petits. Une demande WebGPU explicite reste explicite.
Il n'existe aucun calcul préalable de calibration pour faire ce choix.

Par défaut, la source est copiée par le transfert de message. Avec
`transferSource:true`, l'appelant cède explicitement son buffer au worker et ne
peut plus lire cette vue. L'hôte garde cette source pour les rendus CFA/CAT.
Chaque résultat doit être libéré ; les exports indépendants se libèrent eux aussi.
`clearCache()` supprime les caches/sessions, `memory()` décrit le budget commun.
L'appelant attribue à M2 une part du budget global de l'application en tenant
compte de ses sources et autres moteurs déjà résidents.

Qualification : `m2-worker-wasm-proof.json` exerce un vrai réseau CFA dans les
workers imbriqués, lecture isolée des mutations, décisions natives, rendu,
NPZ vers flux, conservation du résultat pendant un export, rejet BUSY,
annulation sur inférence et préparation NPZ, et zéro mémoire après
libération/cache. Les preuves numériques propres aux autres familles restent
celles de leurs contrats ; l'hôte ne les requalifie pas implicitement.

`tests/m2-npz-stream.test.mjs` compare octet pour octet les cinq exports, y
compris Unicode, int64 et fenêtres non alignées. Une archive >16 Mio tient
dans un budget export de 3 Mio ; l’annulation libère intégralement ce budget.

## Source JPEG originale et CFA >=94 MP

`analyzeBlob('cfa', blob, params, options)` décode l’original JPEG par scanlines
vers la surface segmentée commune, sans Canvas/redimensionnement. `renderWindow`
accepte `{x,y,width,height}` dans les coordonnées originales et renvoie `origin`.
Le CFA lit les tuiles du réseau avec le halo natif8 ; la réduction des quatre
grilles reste globale. Les trois variantes utilisent exactement cet adaptateur.

`metadata.source` décrit le décodeur, les dimensions/orientation et le stockage ;
`provenance.originalSourceSha256` est le SHA du JPEG encodé. Il n’est pas présenté
comme SHA des pixels RGB. Les sources restent épinglées pendant rendu/export ;
les libérations attendent la fermeture des ressources temporaires. Le tas WASM
du codec JPEG reste compté dans `residentCodecBytes` jusqu’à `client.dispose()`.
`clearCache()` libère modèles et résultats cachés, pas le tas du codec importé.

Preuve `cfa-source-96mp-webgpu-proof.json` : vrai JPEG bruité12000×8000,96MP,
384 tuiles,93126 cellules globales et quatre étiquettes présentes ;9 vues
(3modes ×3régions distantes), export NPZ complet7943106octets. Chrome154,
hybride WebGPU,226,23s de bout en bout, budget3Gio, pic comptabilisé3107249576
octets. Source RGB segmentée en RAM288MB ; aucun temporaire nécessaire.
Après libération/cache : réservations actives/cache0, seul codec103546880octets
reste résident jusqu’à la fermeture du worker. Le Blob encodé est géré par le
navigateur et son coût physique n’est pas mesuré comme nul. Ce pic est celui du
budget, pas une mesure RSS exhaustive de Chrome. Pas de qualification implicite
des autres familles ou d’une intégration WordPress. Le contrôle petit cas
`cfa-surface-webgpu-proof.json` est exact entre entrée contiguë et surface.

## TruFor segmenté

Fournir `methods.trufor.segments` (manifest exporté avec les URL des actifs
résolues), `runtimes` et la configuration `noiseprint` native.
`analyzeBlob('trufor',blob)` conserve les dépendances globales dans les banques
float32 ; `renderWindow(id,view,rect)` accepte map/confidence/noiseprint_pp.
Les descripteurs des champs incluent `storage`. `readArray`/`readExport` restent
limités à4Mio et attendent les accès temporaires. Attendre `client.dispose()`
pour annulation/nettoyage avant arrêt. Contrat détaillé : TRUFOR-SEGMENTED-M2.md.
La recette96MP complète est acquise (voir tableau), avec un coût de5h46min24,54s.
Les comparaisons natives petites tailles et la recette OPFS de cycle de vie
restent distinctes ; cette preuve de charge ne qualifie pas une UI WordPress.

## CAT-Net segmenté

`methods.catnet` accepte `segments` (manifest résolu), `runtimes` et
`jpegFactoryUrl` reconstruit avec les lecteurs DCT par lignes.
`analyzeBlob('catnet',blob)` traite le JPEG original ; `map` est recadrée et
orientée, `native_map` conserve la géométrie du réseau. Vues par
`renderWindow(id,0|1|2,rect)`, sorties float32 par `readArray`, NPZ complet
asynchrone avec les mêmes champs. Les temporaires sont épinglés par le résultat
et ses exports. Détails et limites : CATNET-SEGMENTED-M2.md.


## Integration.7 storage/export reconciliation

M2 commit1ead3ff is consumed with the existing common OPFS backend from M5:
logical safe-integer arrays,1GiB physical files, checked truncation and byte counts,
partial-allocation cleanup. Its separate256MiB generic-store sharding is redundant
and is not added. A fresh persistent Chrome154 proof writes/reads the complete
seam set of a6,144,000,000-byte logical bank (six physical files), including2/4GiB
and final offsets, and disposes it with owned memory0. This tests addressing and
lifecycle, not a second neural96MP inference. See m5-integration-m2-storage-wasm-proof.json.

TruFor/CAT tensor-backed asynchronous NPZ windows are joined to the common ZIP64
headers/offset planner. Existing small archives remain byte-identical, including
unaligned tensor reads. The scientific fields remain borrowed/pinned until their
export lifetime ends. Model arithmetic and full-domain attention stay M2-owned.

## Composite segmenté

`analyzeBlob('composite',blob,{quality,stage})` utilise les mêmes actifs/runtime.
Champs à types natifs float32/float64/uint8 ; `readArray` conserve ces types.
`renderWindow(id,'noise'|'map',rect)` et NPZ asynchrone épinglent les banques
RAM/OPFS. Bruit réutilisé pour noise→map ; mapError garde le bruit disponible.
Attendre les libérations asynchrones. Voir COMPOSITE-SEGMENTED-M2.md pour la
PCA/EM globaux, la comparaison des coordonnées PCA et les limites connues.

## Forgeryscope source et ALIKED segmenté

`analyzeBlob('forgeryscope',blob,params)` ; fournir aussi alikedSegments manifesté
et préparation reconstruite. readArray donne les sept champs de sortie Auto ;
les vues/couleurs/identités restent au clone viewer via masques et polygones.
Export asynchrone conservant tous les champs, ressources épinglées après release.
Détails : FORGERYSCOPE-SEGMENTED-M2.md et FORGERYSCOPE-SIFT-PAGED-M2.md.
Distribuer aussi le vendor SIFT paginé et ses auxiliaires repris du commit M3
0aaf98a, avec l'extension du profil Forgeryscope livrée par ae45b36.

## Source PNG et compagnon CAT-Net

Le chargeur M2 accepte désormais les originaux PNG via le décodeur M5 épinglé
fb57a71. CAT-Net produit automatiquement son compagnon global Q100/4:4:4 et
conserve le SHA du fichier original séparément du SHA JPEG. Config inchangée,
vendor/jpeg-rgb-stream et vendor/png-stream doivent être distribués. Les modules
et builds repris sont identiques au commit M5 ; fusion unique par M5 du chargeur.
Voir CATNET-COMPANION-SEGMENTED-M2.md et sa recette96MP explicite ci-dessus.


Integration declaration follow-up: the public createTruforAnalyzer types now
include the existing segments manifest, segmented source/result, renderWindow
and awaitable cleanup contracts. Each segmented map/confidence/Noiseprint field
retains its numeric readInto/readBytes API. Complete segmented exports continue
through the M2 worker beginExport/readExport APIs; the legacy in-memory exportNpz
signature stays scoped to contiguous results. No runtime or model change.
