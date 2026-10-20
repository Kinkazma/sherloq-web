# Reconnaissance de texte et Noise Sniffer

## OCR dans Divers

**Divers → OCR — Reconnaissance de texte** transcrit les caractères visibles
sur l’image ouverte. Les calculs s’exécutent dans le navigateur. L’installation
des ressources peut demander un téléchargement ; les images ne sont pas
envoyées à un service de reconnaissance distant.

1. Ouvrir l’image et choisir l’outil OCR.
2. Choisir **PP-OCRv6 Medium** ou **Tesseract LSTM — précision**.
3. Régler les options propres au moteur, puis lancer **Calculer**.
4. Garder **Texte et encadrements** pour sélectionner du texte directement
   sur l’image, ou choisir **Texte** pour consulter la transcription.
5. Copier une sélection avec la commande de copie habituelle du navigateur,
   ou utiliser **Copier tout le texte** pour récupérer la transcription complète.

La sélection suit le zoom et le déplacement de l’image. Elle utilise les zones
de mots ou de lignes produites par l’OCR ; la position de chaque caractère est
ajustée avec les métriques de police du navigateur. Il ne s’agit pas d’une
localisation scientifique de chaque lettre. Vérifier la transcription avant de
la citer, notamment les symboles, nombres, unités et références.

### PP-OCRv6 Medium

Ce choix par défaut associe le détecteur et le reconnaisseur officiels
PP-OCRv6 Medium. Le dictionnaire multilingue inclut le français et l’anglais ;
le menu de langue de Tesseract ne s’applique pas à ce modèle.

| Réglage | Valeur initiale | Effet |
| --- | ---: | --- |
| Corriger le sens de lecture | Activé | Le classifieur officiel PP-LCNet détermine si chaque ligne doit être retournée de 180°. Les lignes verticales sont d’abord redressées par leur géométrie. |
| Seuil du masque de texte | 0,20 | Seuil de binarisation de la carte de détection. |
| Confiance de détection | 0,45 | Score minimal de la région candidate pour passer à la reconnaissance. |
| Marge autour du texte | 1,40 | Agrandissement géométrique des régions détectées avant lecture. |
| Calcul | Automatique | Admission CPU ou WebGPU selon la disponibilité et les ressources ; CPU reste sélectionnable. |

Les trois réglages de détection sont regroupés sous **Réglages de détection**.
Ils modifient l’analyse native et demandent une nouvelle reconnaissance. Le
moteur accepte des seuils strictement entre 0 et 1 et une marge positive finie.
Les plages des curseurs de l’interface sont des plages de réglage usuelles.

Le prétraitement suit les dimensions du modèle : détection avec un côté
minimal de 736 pixels et une limite de 4000 pixels par fenêtre admise ; lecture
sur 48 pixels de hauteur, avec une largeur de 320 à 3200 pixels. Cette dernière
limite est celle du prétraitement officiel, pas une adaptation silencieuse au
budget mémoire. Les coordonnées des résultats restent celles de l’image source.

Le moteur prévoit la mémoire avant la détection. Si une image normalisée tient
dans une seule fenêtre, une ligne peut être lue entière. Sinon, il parcourt
l’image avec des fenêtres qui se chevauchent et signale le risque de fragments
aux frontières. Une admission mémoire refusée peut déclencher des fenêtres
plus petites ; les paramètres de détection et tous les pixels sources restent
conservés. Si le minimum officiel ne peut pas être admis, le calcul s’arrête
avec une erreur explicite.

### Tesseract LSTM

Ce second moteur utilise les modèles officiels `tessdata_best`, avec le moteur
LSTM. Choisir **Français + anglais**, **Français** ou **Anglais**. Le calcul
s’effectue sur CPU avec les ressources WebAssembly déjà utilisées par SHERLOQ.

Le réglage **Organisation du texte** permet de préciser la structure attendue :
mise en page automatique, colonne, bloc, ligne, mot, caractère, texte épars ou
ligne brute. Dans l’interface, le choix initial est la mise en page automatique
(PSM 3). Une ligne ou un bloc bien cadré peut bénéficier d’un choix plus précis.
La détection d’orientation de page OSD n’est pas proposée par cette intégration.

### Réglages qui réutilisent le résultat

**Confiance minimale**, initialement 0, filtre seulement les zones visibles et
le texte présenté. **Texte et encadrements / Texte** change la présentation.
Ces deux réglages réutilisent la reconnaissance conservée, sans nouvelle
inférence et sans supprimer les régions natives.

La confiance est un score propre au moteur. PP-OCR conserve sa moyenne CTC
sur 0–1 ; Tesseract conserve aussi son score natif sur 0–100 et utilise une
normalisation pour le curseur commun. Ces valeurs ne sont pas des probabilités
calibrées ni des mesures directement comparables entre les deux moteurs.

**Copier tout le texte** récupère la transcription native complète, y compris
les régions que le seuil d’affichage masque. La sélection à la souris et la vue
Texte respectent, elles, les zones visibles. L’export d’image standard reste
accessible par le menu Fichier ; il n’est pas un export de PDF à couche OCR.

### Rapport avec le traitement par lot

Le détecteur PP-OCRv6 Small déjà utilisé pour préparer les exclusions de texte
reste inchangé. Il produit des régions candidates et ne transcrit pas les mots.
Le nouvel outil de transcription utilise Medium et un reconnaisseur distinct.

Une comparaison sur les mêmes images synthétiques, avec les mêmes fenêtres et
le même calcul CPU, a trouvé le détecteur Small environ trois fois plus rapide
que Medium sur ce protocole. Medium couvrait davantage certaines lignes, mais
pas toutes ; un fond texturé favorisait parfois Small. Ce petit essai ne
constitue pas un classement de fiabilité sur des figures scientifiques. Il ne
justifie pas de remplacer automatiquement le détecteur du lot par Medium.

### Ressources et limites

Les trois modèles PP officiels totalisent **145 365 632 octets** ; leur
dictionnaire dérivé occupe **112 366 octets**. Les deux langues Tesseract best
occupent **19 373 486 octets**. Les runtimes déjà présents sont réutilisés.
Modèles, configurations, dictionnaire et runtimes choisis restent sous 1 Go de
fichiers ; cela ne borne pas la RAM nécessaire à une analyse. Ici, 1 Go signifie
1 000 000 000 octets et 1 Gio signifie 1 073 741 824 octets.

Les fautes de lecture restent possibles : texte très petit, flou, faible
contraste, écritures inhabituelles, symboles scientifiques et mise en page
complexe. La correction 0/180° n’est pas une garantie de lecture d’une écriture
arbitraire. Le crop cubique et le redimensionnement sont documentés ; le port
ne revendique pas une identité bit à bit globale avec toute la chaîne OpenCV.

Les fichiers sont identifiés par leur taille et leur SHA-256. Les sources,
révisions et conditions de réutilisation figurent dans la
[notice OCR et Noise Sniffer](OCR-NOISESNIFFER-NOTICE.md). La disponibilité
sans connexion dépend de l’installation des ressources OCR choisies dans
**Emporter hors ligne**.

## Noise Sniffer dans Bruit

**Bruit → Noise Sniffer** recherche des incohérences locales du bruit selon la
méthode IPOL de Gardella, Musé, Colom et Morel. Les régions significatives sont
des indices de cohérence du bruit ; elles ne sont ni une probabilité de
retouche, ni une preuve d’authenticité ou de falsification.

| Paramètre natif | Valeur initiale | Rôle |
| --- | ---: | --- |
| Taille des blocs (`blockSize`) | 3 | Voisinages de 3, 5, 7 ou 8 pixels utilisés pour les statistiques locales. Le bloc doit tenir dans l’image. |
| Taille des cellules (`cellSize`) | 100 | Grille spatiale employée pour les comptages et la croissance des régions. |
| Échantillons par classe (`samplesPerBin`) | 20000 | Effectif cible des groupes constitués selon l’intensité moyenne. |
| Fraction de basse fréquence (`lowFrequencyFraction`) | 0,10 | Fraction retenue à l’étape de sélection par variation fréquentielle. |
| Fraction de faible bruit (`lowNoiseFraction`) | 0,50 | Sélection des blocs de plus faible écart-type et paramètre du modèle de fond. |
| Vue | Régions | Régions significatives sur l’image, masque binaire ou distribution des blocs sélectionnés. |

Les bornes de l’interface sont 10–500 pour les cellules, 100–200000 pour les
échantillons, 0,01–1 pour la fraction fréquentielle et 0,01–0,99 pour la fraction
de faible bruit. Ces paramètres changent les statistiques ou la sélection ;
ils ne sont pas de simples réglages de couleur.

Les bases statistiques et les étapes de sélection encore valides sont
réutilisées lorsque les paramètres le permettent. Un changement de cellules
peut réutiliser la sélection ; un changement de vue réutilise le résultat
scientifique. Pendant un maintien ou un glissement, une prévisualisation peut
être affichée ; le résultat natif final reste la référence. Les clics brefs
n’intercalent pas de prévisualisation.

La vue Distribution montre les blocs sélectionnés et le sous-ensemble de
faible bruit, pas un masque de retouche. Une sélection vide est explicitement
**non concluante**. La compression, le traitement de l’appareil et le contenu
de la scène peuvent produire des différences de bruit sans manipulation.
Les cas trop proches d’une frontière numérique sont signalés au lieu d’être
présentés comme une décision robuste.

L’algorithme et les références sont décrits dans la
[publication IPOL](https://doi.org/10.5201/ipol.2024.462). Les notices et les
licences existantes restent applicables.
