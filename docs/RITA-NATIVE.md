# RITA : exécution native et reconstruction

RITA est proposé pour examiner des retouches au tampon et par génération. Il utilise le checkpoint du protocole CAT-Net publié par les auteurs de RITA ; ce nom de protocole ne désigne pas l’architecture CAT-Net. Une détection constitue un élément d’inspection, sans établir à elle seule une manipulation.

## Source et géométrie

La référence est le dépôt officiel [scu-zjz/RITA](https://github.com/scu-zjz/RITA), commit `b50efcd5b4c41b8bfc69b0b10ce6230dcb67b983`.

| Élément | SHA-256 |
| --- | --- |
| `rita.py` original | `4ab0cb2a76ce537833589d12b54a4599322a5a5ba6a5277378d21c093c002c56` |
| `rita_catnet.pth` | `50da42c81508dd3d0f150af4245f47af8c8c0b554a392527635b7e2245aa3299` |

L’adaptation native remplace les quatre séparations de hauteur fixes du réseau par les hauteurs effectives des caractéristiques, puis rétablit la taille d’entrée avec l’interpolation bilinéaire `align_corners=True`. Les pixels RGB sont normalisés par les moyennes et écarts types ImageNet du modèle. Un prolongement par réflexion à droite et en bas assure des dimensions multiples de 32 ; la sortie est recadrée aux dimensions originales. L’image n’est pas réduite à 512 × 512. Cette adaptation géométrique reste distincte du protocole officiel à taille fixe.

## Calcul et mémoire

Les calculs et caractéristiques restent en FP32. Les 108 graphes ONNX découpent les opérateurs appris ; leurs poids représentent environ 222,4 Mo. Chaque requête d’attention conserve toutes les clés et valeurs de l’image et du masque. Les fenêtres de lignes et leurs halos respectent les champs réceptifs locaux, y compris la jonction spatiale entre les caractéristiques RGB et celles du masque. Des tuiles indépendantes ne remplacent pas l’attention globale.

Le moteur admet les travaux CPU/GPU dans son ordonnanceur et comptabilise leurs espaces de travail. Les banques de caractéristiques utilisent des tableaux mémoire ou un stockage temporaire sans perte selon le budget disponible. Le gestionnaire libère d’abord les banques terminées vers ce stockage sans perte. Si l’espace de travail reste insuffisant, seule la fenêtre de requêtes ou de lignes non encore validée est réessayée avec une empreinte plus petite ; cette reprise ne change ni la résolution, ni les poids, ni les itérations demandées, et ne recommence pas les fenêtres déjà terminées. Les workers inutilisés peuvent être réemployés et sont récupérables par le gestionnaire de ressources. Une transition du GPU vers le CPU recommence le bloc d’attention concerné avec les fenêtres CPU historiques : elle évite de conserver une partition CPU différente après un échec GPU.

Le moteur réutilise les sessions des graphes quand le budget finance leur cycle complet ; les banques de travail restent prioritaires sur ce cache facultatif. La première projection RGB, indépendante du masque, est partagée entre les étapes autorégressives. Les caractéristiques qui dépendent du masque sont recalculées. Une analyse terminée peut être réutilisée pour le même original immuable vérifié, le même checkpoint et le même backend ; les surfaces modifiables gardent leur identité et leur révision dans la clé.

Les transferts regroupent plusieurs fenêtres sans fusionner leurs calculs. Sur GPU, les sorties FP32 sont assemblées par copies de buffers avant une lecture groupée. L’admission comptabilise les buffers temporaires, et une erreur ou une annulation invalide le lot entier avant publication. Les fenêtres GPU sont choisies à partir du budget et des limites du dispositif réellement utilisé. Les dimensions des fenêtres CPU sont conservées, car une modification de forme GEMM peut changer les derniers bits d’un résultat FP32.

Les lectures d’affichage échantillonnent directement les scores conservés. Les réglages visuels et les proxys de déplacement du curseur ne relancent pas l’inférence et ne remplacent pas les valeurs scientifiques natives.

## Séquence et seuil

L’inférence autorégressive conserve le masque initial de classe 3, l’indice d’itération entier et la limite officielle de dix étapes. Elle s’arrête lorsque tous les pixels prolongés sont de classe EOS 2. La sélection de sortie reproduit la règle effective du script officiel : première étape où au moins une colonne atteint 90 % de pixels EOS, puis étape précédente ; un indice négatif sélectionne la dernière étape.

Dans le masque sélectionné, la plus grande classe présente différente de 3 constitue la classe exclue. Les autres classes sont retenues. Les cas limites du script officiel, notamment une classe maximale nulle ou absente, sont conservés.

La vue initiale est la **superposition**, avec un seuil de **0,5**. Ce seuil reproduit exactement ce masque catégoriel, y compris les égalités de logits. Le réglage utilise une carte de marge logistique orientée entre la classe exclue et la plus forte autre classe. Ce score visuel n’est pas une probabilité calibrée de fraude. Les logits, classes et masque officiel sont conservés indépendamment de ce réglage.

Déplacer le curseur réutilise cette carte native conservée ; aucun nouvel appel au réseau n’est nécessaire. L’aperçu peut employer un petit proxy de rendu pendant le geste. Au relâchement, l’affichage et l’export utilisent la carte native en pleine précision, au seuil choisi.

## Lot et utilisation hors ligne

Dans le traitement par lot, RITA apparaît parmi les analyses complémentaires, près de TruFor. Le seuil du score, la vue et l’opacité de superposition sont enregistrés avec la recette. Le plein cadre sans exclusion peut contribuer au compteur de signalement. Une acquisition restreinte ou comportant des exclusions de texte, graphique ou autre zone produit un **diagnostic brut**, explicitement indiqué et sans vote scientifique filtré : le réseau utilise l’attention globale et ne garantit pas l’exclusion de ces pixels avant son calcul. Le filtrage de sortie ne remplace pas cette garantie. La carte RITA reste distincte des biomes et de la corroboration des détecteurs de clones.

RITA est une fonction optionnelle de l’emport hors ligne, avec une dépendance à l’exécution neuronale partagée. Sa sélection inclut le manifeste, les 108 graphes et leur notice. Les ressources du modèle restent dans la bibliothèque supplémentaire ; elles ne font pas partie du petit paquet d’interface initial. Les identités des ressources, du catalogue et du lanceur doivent être régénérées ensemble lors de la reconstruction. Une installation préparée conserve le calcul individuel et le traitement par lot sans connexion.

## Reconstruction et qualification

Les sources et le checkpoint doivent être fournis séparément. Les scripts ne téléchargent aucun modèle et vérifient les identités ci-dessus. Depuis `web/engine-source`, avec Python 3.11+ et les dépendances `torch`, `torchvision`, `timm`, `numpy`, `pillow`, `onnx` et `onnxruntime` disponibles :

```sh
python scripts/rita-rebuild.py \
  --source path/to/RITA/rita.py \
  --checkpoint path/to/rita_catnet.pth \
  --output .build/rita-native \
  --qualify \
  --image path/to/test.png
```

`rita-rebuild.py` orchestre les exports et leurs contrôles. `rita-export-segments.py` reconstruit les graphes d’exécution ; `rita-export-native.py` permet de produire un oracle ONNX monolithique d’une étape. `rita-qualify-segments.py` compare les frontières d’opérateurs et la séquence autorégressive à PyTorch. `rita-qualify-row-windows.py` vérifie les halos des déconvolutions et des MLP. Le catalogue contient la taille et le SHA-256 de chaque graphe ; `--verify-only` vérifie un catalogue existant sans lancer d’inférence.

La qualification numérique locale couvre des géométries rectangulaires, une image native et un motif 769 × 513 prolongé à 800 × 544. Elle ne constitue pas une mesure de fiabilité générale du modèle. La recette native a été exécutée dans Chromium, Firefox et WebKit. Les masques catégoriels des cas de référence sont identiques pixel par pixel ; les écarts numériques de logits FP32 sont mesurés séparément. Des budgets réduits, la migration sans perte vers le stockage temporaire, l’annulation et la reprise ont également été contrôlés. Le parcours utilisateur ouvre une image, lance RITA, change la vue et le seuil, puis exporte l’image native depuis le menu Fichier.

## Crédits et distribution

RITA : Xuekang Zhu, Ji-Zhe Zhou, Kaiwen Feng, Chenfan Qu, Xiwen Wang, Yunfei Wang, Liting Zhou et Jian Liu, *Revisiting Image Manipulation Localization under Realistic Manipulation Scenarios*, CVPR 2026 Findings. [Article](https://arxiv.org/abs/2509.20006), [code officiel](https://github.com/scu-zjz/RITA). Les auteurs indiquent s’appuyer sur IMDLBenCo.

Les poids RITA sont sous [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), selon la licence confirmée par les auteurs. Le catalogue des graphes FP32 conserve leur provenance et leur identité ; la conversion destinée au navigateur est signalée dans sa notice. Les scripts de reconstruction ne contiennent pas les poids. Cette licence des poids est distincte de celle du code tiers utilisé pour leur reconstruction.
