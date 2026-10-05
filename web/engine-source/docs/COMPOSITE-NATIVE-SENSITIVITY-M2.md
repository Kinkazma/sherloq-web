# Composite : instabilité vérifiée de la référence native

État courant : [covariance-floor-v1](COMPOSITE-STABILITY-M2.md) reprend désormais
la correction native autorisée, sur les trois chemins navigateur. Les mentions
ci-dessous de singularités non résolues ou de régularisation ULP seule décrivent
la politique **historique** et ses preuves conservées. Les gains BLAS restent actifs.


La reprise du contrôle de clôture a utilisé les deux résidus natifs exacts déjà
conservés. Le diagnostic de rang seul ne démontrait pas la cause des cartes
instables. La nouvelle [preuve native](composite-native-sensitivity-proof.json)
exécute `EMgu_img` sans modification sur le même Mac, avec NumPy 1.26.4 et les
bibliothèques BLAS identifiées dans le rapport. Seul le nombre de threads BLAS
varie (1, 2, 4) ; les données, seed, 32 composantes PCA, dix réplicats, cent
itérations maximales et la régularisation native restent identiques. Les sources
natives sont lues seulement et leurs SHA sont consignés.

Les trois références enregistrées sont reproduites **exactement à deux threads**,
cartes float64 et rasters compris. Les écarts suivants sont donc observés dans
l'application native, indépendamment du portage WebAssembly :

| Cas | 1 thread vs référence 2 threads, rendu max/moyenne | 4 threads vs référence 2 threads, rendu max/moyenne | WebAssembly vs référence, déjà livré |
| --- | --- | --- | --- |
| Petit presque singulier | 28/255 ; 5,628/255 | 22/255 ; 6,380/255 | 28/255 ; 7,438/255 |
| Chaîne presque singulière | 56/255 ; 15,372/255 | 188/255 ; 43,894/255 | 65/255 ; 17,071/255 |
| Contrôle bien conditionné | rendu exact | rendu exact | rendu exact |

Entre un et deux threads, les covariances EM finales changent d'au plus
1,452e-13 et 2,687e-14, tandis que les distances brutes changent jusqu'à
6,687e15 et 2,134e16. Le second cas à quatre threads aboutit aussi à une
covariance finale matériellement différente. Ce n'est donc pas uniquement un
arrondi de palette ni une divergence provenant du résidu Noiseprint GPU.
Le contrôle bien conditionné varie de moins de 3,46e-11 sur la carte et garde
son rendu exact.

Cette vérification établit une sensibilité intrinsèque de ces deux références
aux bibliothèques/réductions parallèles de leur propre calcul. Le résultat à
deux threads reste un résultat natif enregistré valide, mais exiger sa stricte
reproduction pour toute implémentation fidèle revient ici à fixer aussi son
ordre de calcul BLAS. Passer simplement le navigateur à Python ne le résout pas :
les statistiques utilisent déjà Pyodide/NumPy/SciPy/OpenBLAS.

Aucun résultat attendu n'est injecté, aucune composante retirée, aucun réplicat
supprimé et aucun ridge supplémentaire introduit. Le runtime conserve la méthode
et signale son conditionnement. La différence WebAssembly reste mesurée et
visible : elle n'est **pas déclarée conforme à la latitude 1e-2**. Les 2240/4576
franchissements recensés auparavant concernent le milieu d'affichage 128, pas
un seuil natif de détection de fraude. B doit conserver cette distinction et
l'information de conditionnement lors de l'interprétation des cartes.

Le `passed:true` de cette nouvelle preuve signifie reproduction native exacte
à deux threads et sensibilité native démontrée ; il ne transforme pas les
contre-preuves de parité navigateur en succès. La suite peut améliorer les
réductions fidèles et leur coût sans prendre ce résultat numériquement instable
comme un oracle universel. Les recettes bien conditionnées et les huit parcours
96 MP acquis restent utilisables sans nouvelle inférence.
