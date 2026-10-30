# Ressource CPU PGM LSTM supplémentaire

Cette ressource reçoit uniquement le PGM produit à la résolution native par `textTilePgm`. Elle conserve le graphe LSTM, les modèles `traineddata`, les sommes ordonnées, le clipping et les activations Native. Quatre sorties de lignes indépendantes partagent leurs lectures ; les queues de une à trois lignes gardent le chemin original. Aucun JSPI ni GPU ne sont requis.

Les cœurs officiels complets restent disponibles. `completeCpuOnly: true` les sélectionne explicitement. Un véritable refus d’initialisation Native de cette ressource spécialisée permet un repli compatible après la retraite ACK du propriétaire ; un refus d’appelant ne déclenche pas ce repli.

`UPSTREAM-SOURCES.json` et `PINNED.json` épinglent l’arbre complet et les quatre surcharges. Fournir une copie dédiée intacte, Emscripten 4.0.15, Python 3, CMake et Make. Aucun téléchargement ni installation de ressources distribuées par ce script.

```text
python3 ../rebuild-cpu.py --core-source SOURCE_TREE --emscripten EMSCRIPTEN_DIRECTORY --output NEW_OUTPUT_DIRECTORY --jobs 1
```

Cette recette est adaptée du constructeur GPU en retirant JSPI et son hook C++. Sa syntaxe est vérifiée ; elle n’a pas été recompilée dans cet addendum. Les ressources remises viennent de la construction rows4 épinglée déjà vérifiée. Les octets peuvent changer suivant les outils ou chemins ; toute nouvelle construction doit repasser les contrôles Native/API/Worker avant remplacement de ses identités.
