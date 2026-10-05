# TruFor : produit global attention–valeurs parallélisé

Le softmax porte toujours sur **toutes** les clés de l'image. Le changement
concerne uniquement son produit par les valeurs : produits par groupes de
1024 clés, puis somme des contributions avant projection apprise et résidu.
Les zéros de padding sont ajoutés **après** le softmax. Aucune attention locale,
clé supprimée, précision réduite ou modification des poids/prétraitements.
L'ordre des additions float32 change ; la comparaison numérique reste requise.

## Raccordement

Après l'export habituel `scripts/export-trufor-segments.py`, lancer
`scripts/export-trufor-split-value.py` dans le même environnement Python/ONNX.
Le manifeste `.build/trufor-split-value/manifest.json` réutilise les actifs
originaux par chemins relatifs et ajoute 26 graphes (11 568 756 octets) avec SHA/taille. L'intégrateur
résout chaque `asset.file` relativement à ce manifeste, comme précédemment.
Les poids et graphes générés restent externes au Git. Aucun runtime ORT à modifier.

Chaque bloc peut déclarer :

```json
{"querySplitValue":{"name":"s1-rgb-b0-query-split-value","chunkKeys":1024,"minKeys":65536}}
```

Le plan choisit ce graphe si WebGPU est disponible/demandé et le nombre de clés
atteint `minKeys` (65536 à l’export, pour réserver le gain aux grandes banques). Les blocs du quatrième étage ne déclarent pas cette propriété : leur variante
mesurée est plus lente et n’est pas activée. Les anciens manifestes fonctionnent
sans cette propriété.
Le CPU explicite et les petites banques choisissent le graphe original. Un
repli CPU interne après échec GPU peut aussi exécuter le graphe fractionné,
mathématiquement équivalent. Ce sont des choix sur les tailles réelles, sans
calibration, canary ou mesure préalable chez l'utilisateur.

L'admission réserve huit tableaux de scores **paddés**, contre quatre pour le
graphe original, et deux banques clés/valeurs pour couvrir le padding de V. Le
nombre de requêtes simultanées diminue en conséquence ; le budget reste partagé,
les clés/valeurs réutilisables et les workers récupérables. Le repli par division
sur erreur mémoire réelle, l'annulation et les accès RAM/OPFS restent actifs.
Les résultats, coordonnées, vues et exports n'ajoutent aucun paramètre UI.

## Mesures et qualification

Les études sont des outils de développement distincts du runtime public.
L'étude du noyau (`trufor-attention-core-webgpu-proof.json`) compare les mêmes
opérateurs sur 93750 clés, une/cinq têtes. Les appels chauds passent de36–43ms
à14–23ms, erreur max3,95e-10. Le softmax fractionné à normalisation globale,
également exploré, n'apporte pas de gain supplémentaire stable et n'est pas
intégré. Chaque mode dispose de sa session isolée pour éviter de mesurer des
rechargements induits par la limite mémoire comme des appels chauds.

L'étude E/S (`trufor-query-io-webgpu-proof.json`) utilise le vrai graphe appris,
9984 requêtes et des banques OPFS de géométrie96MP. Regrouper les lectures et
écritures diminue leur coût mais ne donne pas de gain total à chaud stable.
Aucun tampon de regroupement supplémentaire n'est donc ajouté au produit.

La comparaison des huit configurations candidates est conservée dans
`trufor-split-value-all-candidates-96mp-shapes-webgpu-proof.json` :

| Étage / branche | Requêtes par appel avant → après | Gain à chaud par requête |
|---|---:|---:|
| 1 / RGB | 178 → 88 | 1,90× |
| 1 / NPP | 178 → 88 | 1,49× |
| 2 / RGB | 89 → 44 | 1,84× |
| 2 / NPP | 89 → 44 | 1,66× |
| 3 / RGB | 35 → 17 | 1,21× |
| 3 / NPP | 35 → 17 | 1,28× |
| 4 / RGB | 22 → 11 | 0,85× — candidat rejeté |
| 4 / NPP | 22 → 11 | 0,79× — candidat rejeté |

Ce sont les vrais graphes appris et l’admission produit, toutes les93750clés,
aux quatre géométries de features96MP, avec données d’entrée finies synthétiques.
Les lectures/écritures OPFS portent sur les derniers offsets des banques.
Maximum d’écart2,385e-7 ; pic compté2331957373octets sous3Gio ; picOPFS3,072Go,
final mémoire0 et aucun temporaire restant. Les appels initiaux et dernières
portions incomplètes sont exclus du ratio chaud (leurs temps restent publiés).
Les chargements sont isolés par mode : pas de cache évincé compté comme appel
chaud. Les petits totaux avec chargement à froid ne garantissent aucun gain.

L’exporteur accepte `--all-candidates` pour reproduire la comparaison rejetant
l’étage4 ; il écrit alors `all-candidates-manifest.json`, séparé du manifeste
produit. Même option pour `study-trufor-split-value.mjs` et
`study-trufor-segmented-network.mjs --split-value`. Le défaut exporte uniquement
les26graphes retenus. Aucun choix par benchmark ne s’exécute chez l’utilisateur.

Les deux chaînes natives65×97/128×160 avec tous les32candidats et fenêtres
forcées passent : features max1,264e-5, cartes6,855e-7, confiance5,97e-7,
score1,044e-7 ; aucun franchissement0,5. Respectivement3978/11320appels aux
nouveaux graphes, final mémoire0. La preuve `trufor-segmented-network-split-value-all-candidates-webgpu-proof.json`
reste une qualification de candidats ; la recette source suivante valide le
manifeste produit retenant seulement les trois premiers étages. Le temps complet96MP historique reste celui
de `trufor-source-96mp-webgpu-proof.json` : aucun ratio de sous-calcul n'est
extrapolé à son temps bout en bout. Les chemins NPP, banques de features,
rectifications/fusions, têtes, champs et export ne sont pas modifiés ici.

Source193×129 avec le nouveau graphe forcé sur les petites banques : carte
max8,94e-7, confiance1,014e-6, NPP5,97e-7, score2,98e-8. Aucun franchissement
de0,5 sur les cartes. Six vues et NPZ302620octets ; export épinglé après release
du résultat, annulation et nettoyageOPFS passent. Pic compté3183839639octets
sous3Gio ; mémoire finale horscodec nulle (codec16Mio jusqu’àdispose).
Preuve : `trufor-source-split-value-webgpu-proof.json`. Le temps de cette recette
à froid (144,57s) n’est pas une mesure de gain face au chemin précédent.
