# Ressource PGM LSTM supplémentaire

Cette construction ajoute `tesseract-pgm-lstm-gpu.mjs` et `.wasm`. Elle conserve les ressources complètes officielles Tesseract utilisées en CPU. L’entrée autorisée est le PGM produit à la résolution native par `textTilePgm` ; ce runtime ne remplace pas un décodeur de fichiers complet.

`UPSTREAM-SOURCES.json` énumère les sources complètes épinglées et leurs empreintes, avec les références de reconstruction. `PINNED.json` identifie les révisions et les quatre fichiers de surcharge contenus dans `native/`. Les poids `traineddata` restent ceux de la configuration OCR officielle ; aucun poids n’est inclus ni modifié ici.

Le script prend un arbre source complet et intact correspondant aux empreintes, un SDK Emscripten 4.0.15, et un nouveau répertoire de sortie. Employer une copie de travail dédiée : les quatre surcharges y sont appliquées avant compilation. Les dépendances usuelles de construction sont Python 3, CMake, Make et le SDK. Le script ne télécharge rien et n’installe rien dans les ressources distribuées.

```text
python3 rebuild.py --core-source SOURCE_TREE --emscripten EMSCRIPTEN_DIRECTORY --output NEW_OUTPUT_DIRECTORY --jobs 1
```

La sortie contient les deux ressources nommées et `artifacts.json`. Un changement de compilateur ou de chemins de construction peut changer les octets ; il faut vérifier les résultats Native, l’API, les propriétaires et les identités des nouvelles ressources avant de remplacer leurs empreintes.

Le calcul reste le LSTM Tesseract avec `FAST_FLOAT`, quatre sommes ordonnées, les tables d’activation et le clipping natifs. Le callback GPU n’est admis que pour la forme qualifiée 96→512, `na=608`, `clip=100`, et au plus 4096 étapes. Il retourne zéro sans écrire la sortie pour les autres formes, qui conservent le calcul Native CPU. Les codecs inutilisés par l’entrée PGM sont absents de cette ressource dédiée seulement. Les crédits et la licence Tesseract d’origine sont conservés.

La ressource CPU PGM ordonnée se reconstruit séparément avec `rebuild-cpu.py`, les surcharges et empreintes dans `cpu/`, et le même arbre source complet épinglé.
Elle ne requiert pas JSPI et ne remplace pas les cœurs CPU officiels complets.
Exécuter les mêmes contrôles Native/API/Worker avant de remplacer les identités de ressources.
