# Poids d’attention CSR Native

Cette ressource supplémentaire expose `_glue_attention_weights(logits, offset, rows, edges, heads, out)`. Les logits et poids Float32 sont rangés par tête puis arête ; les offsets Int32 décrivent des lignes CSR complètes dans leur ordre Native. Les tableaux d’entrée et de sortie restent disjoints.

Le calcul reprend le maximum, les sommes, `std::exp` et `std::log` de `glue_attention` sans recalculer de produit scalaire. Les quatre anciens exports sont compilés à partir de leur source inchangée ; la ressource d’attention historique reste distincte.

Le constructeur `scripts/build-sparse-glue-csr-native.py` prend `--source-root` et `--emsdk` (Emscripten 4.0.15). Il vérifie les deux sources épinglées et produit uniquement `attention-csr-native.js`, `.wasm` et leurs empreintes dans un répertoire distinct. Aucun téléchargement ni modèle n’est ajouté.

L’appelant doit financer chaque mémoire Wasm et chaque transport. Une mémoire importée limitée à 64 Mio suffit au témoin de 1 048 576 arêtes et quatre têtes ; ce témoin ne remplace pas l’admission de la forme demandée. La limite compilée reste 2 Gio, comme la ressource historique.
