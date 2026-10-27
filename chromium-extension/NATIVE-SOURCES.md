# Sources des moteurs embarqués

Le code JavaScript fourni dans `extension` s’exécute directement. `package.py`
l’assemble avec les fichiers WebAssembly livrés et en vérifie les empreintes.
Cette étape ne recompile pas les bibliothèques natives.

Les sources C/C++ et scripts de compilation des moteurs de SHERLOQ sont publics
dans [web/engine-source](https://github.com/Kinkazma/sherloq-web/tree/c26083d6577320854ee04d484a71141614f176a9/web/engine-source).
Les sources des bibliothèques et versions épinglées restent indiquées dans les
scripts de compilation et notices de ce dossier. La compilation native demande
la chaîne Emscripten et les dépendances indiquées par chaque script.

| Moteur embarqué | Sources et construction dans `web/engine-source` |
| --- | --- |
| OpenCV | `native/opencv.cpp`, scripts de construction OpenCV, OpenCV et opencv_contrib 4.11.0 |
| Réglages | `native/adjust-bands.cpp`, `scripts/build-adjust-bands.sh` |
| Préparation PDF | `native/forgeryscope-prepare.cpp`, `scripts/build-forgeryscope-prepare.py`, préparation affine et OpenCV |
| JPEG | `native/jpeg.c`, `scripts/build-jpeg.sh`, libjpeg-turbo 3.0.3 |
| PNG | `native/png-stream.c`, `scripts/build-png-stream.py` |
| Préparation et calculs complémentaires | `native/learned-prepare.cpp`, `native/research-post.cpp`, leurs scripts de construction |
| XFeat et attention | `native/xfeat-paged-post.cpp`, `scripts/build-xfeat-paged-post.py`, `scripts/build-sparse-glue-paged.py` |
| ONNX Runtime | Sources Microsoft ONNX Runtime ; version et notices dans `vendor/unified-engine/vendor/m3-ort` et les manifestes du moteur |

`provenance.json` indique les fichiers qui correspondent exactement à un fichier
déjà public, à la révision indiquée. Les adaptateurs propres à l’extension et les
fichiers modifiés restent fournis dans les sources de l’extension.

`tools/public_wasm.py` décrit la transformation du seul préfixe de chemins de
compilation présent dans les chaînes de diagnostic OpenCV du moteur de
préparation PDF. Elle conserve les tailles, les positions mémoire, les
instructions et les valeurs de calcul. Elle ne change ni l’algorithme ni sa
précision.

Les poids ONNX ne sont pas des exécutables ajoutés au paquet. Leurs adresses
publiques épinglées, tailles et SHA-256 sont dans
`extension/resource-catalog.json`. Le code les vérifie avant usage.
