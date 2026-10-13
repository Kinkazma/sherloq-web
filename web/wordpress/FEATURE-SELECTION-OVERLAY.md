# Reconstruction de la sélection des fonctions facultatives

Le moteur numérique de référence reste `0.37.0-methods.1`, commit
`5d39aebd7194662be47bccc89b7bbb160a7ae7ba`. Le manifeste de dépendances publié
de départ est `a488d0a8cba3120ea52cc497beadf6cf68758394cb2db81c81ab6c47890a6081`.
Les reçus D2PRL, clones, `runtime-manifest.json`, `source-manifest.json` et
`PINNED.json` sont conservés avec leurs empreintes publiées.

`runtime-patches/feature-selection-overlay-0.18.0.json` décrit séparément les
modifications de sélection. Il contient les commits de référence, les tailles
et SHA avant/après de trois sources moteur et de leurs six livraisons
unified/composite, les chemins des miroirs et les empreintes des deux verrous.
Il ne déclare aucune nouvelle qualification numérique.

Le contrat ajouté est `params.excludedFeatures`, limité à
`ai.clones.d2prl` et `m2.forgeryscope`. Un groupe volontairement désinstallé
porte l'état `feature-uninstalled` et n'est pas exécuté. Les tableaux natifs,
paramètres numériques, régions et exclusions géométriques sont conservés.

## Vérifier et reconstruire

1. Restaurer les ressources du manifeste de référence depuis les pièces
   adressées par SHA. Réutiliser les pièces vérifiées existantes ; les modèles
   et corpus ne nécessitent aucune duplication pour appliquer cet overlay.
2. Appliquer uniquement les trois sources et six livraisons listées dans
   l'overlay. Les miroirs `web/runtime-sources` doivent être identiques aux
   assets correspondants. La livraison composite conserve son import de
   contexte historique ; les empreintes de source distinguent ce transport
   des trois sources moteur unified.
3. Vérifier `runtime-source-lock.json` et `runtime-lock.json`. Toutes les
   entrées hors des six chemins déclarés doivent rester identiques à la
   référence. Le petit WASM D2PRL reste `1e94c50c…`, 19 584 octets ; son PINNED
   reste `f2fc987a…`, 36 163 octets.
4. Régénérer le catalogue depuis les quatre JSON de `feature-inputs`, vérifiés
   par taille et SHA contre le manifeste. Les fonctions facultatives gardent
   leurs identifiants stables ; les dix nouvelles ressources du moteur sont
   couvertes par le socle protégé. Conserver les sept manifestes de compatibilité.
5. Construire la nouvelle livraison avec les six arguments `--runtime-override`
   de `scripts/build-local-release.py stage`. Son inventaire remplace ces six
   empreintes et conserve les autres ressources publiées. Le champ
   `runtimeOverrides` de la description de livraison doit correspondre à
   `release.runtimeOverrides` de l'overlay, également produit dans `stage.json`.

Les manifestes moteur de référence ne sont pas les empreintes actuelles des
trois sources modifiées. Une vérification de reconstruction doit reconnaître
cet overlay explicite et refuser toute autre divergence. Les recalculer puis
réattribuer leurs nouveaux SHA aux reçus scientifiques publiés ferait perdre
la distinction entre le moteur qualifié et la sélection ajoutée ici.

La qualification ciblée est
`node --test tests/feature-runtime-integration.test.mjs tests/local-feature-policy.test.mjs`.
Elle vérifie les empreintes, la fermeture des ressources protégées et les
exclusions automatiques sans inférence ni réécriture des poids.
