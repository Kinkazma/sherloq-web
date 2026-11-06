# Reconstruction du noyau OSQP

Les sources OSQP et QDLDL sont conservées respectivement dans
`vendor/osqp-1.0.0` et `vendor/qdldl-v0.1.8`, avec leurs licences et crédits.
AMD et sa licence BSD3 font partie de l'arbre source OSQP.

Le pont de raccordement est `src/wasm/osqp_bridge.c`. Le module de projection
`src/sherloq7c-project.js` définit le problème7C et utilise ce pont.
La recette de reconstruction est `scripts/build-sherloq7c-osqp.sh`.

La recette générique ci-jointe reconstruit depuis ces deux dépendances locales,
sans téléchargement. Elle reproduit les options CMake du binaire qualifié :
double, indices32, QDLDL intégré, optimisations Release, sans fast-math,
sans threads Emscripten, sans codegen spécifique à une image. Les dérivées
OSQP restent activées pour reproduire la configuration qualifiée actuelle,
même si Sherloq ne les appelle pas. Leur suppression serait une optimisation
distincte à qualifier.

Emscripten4.0.15 et CMake sont requis. Après copie de la recette sous scripts/ :

```sh
SHERLOQ_EMSCRIPTEN=/path/to/emscripten sh scripts/build-sherloq7c-osqp.sh
```

Cette nouvelle recette complète n'a pas été exécutée à la demande de l'agent
intégrateur ; les sources ont déjà servi au binaire qualifié et l'ancienne
recette de liaison a été exécutée. Une future reconstruction doit être suivie
des gates numériques et de cycle de vie. L'identité bit à bit d'un binaire
reconstruit dans un autre environnement n'est pas affirmée.

Licences conservées : OSQP Apache2.0 avec NOTICE ; QDLDL Apache2.0 ; AMD BSD3.
Il s'agit de dépendances numériques génériques ; le problème mathématique
7C est défini par Sherloq.
