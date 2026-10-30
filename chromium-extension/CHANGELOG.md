# Historique de l’extension Chromium

## 0.5.8

- Ouverture des adresses PDF avant l’injection de la loupe dans le document, pour les lecteurs intégrés qui acceptent l’injection sans déclencher le lecteur SHERLOQ.
- Détection des PDF sans extension de fichier avant le chargement des modules de l’interface. Les PDF incorporés transmettent leur propre adresse.

## 0.5.7

- Ajout de deux préréglages fournis : « AHE+GAMMA » (AHE 8 × 8 et gamma × 10 à 20, seuls) et « AHE+GAMMA+ÉGALISATION » (mêmes valeurs, avec la loupe améliorée en égalisation). Le balayage de niveau reste désactivé. La géométrie personnelle de la loupe est conservée.

## 0.5.6

- Enregistrement de préréglages personnels nommés avec le bouton + ; suppression avec le bouton − et confirmation. Les effets sont conservés dans le navigateur, indépendamment de la taille et du grossissement de la loupe.
- Prévisualisation pendant le déplacement des curseurs : qualité adaptée au temps de calcul et d’affichage, avec une cible moyenne de 200 ms. Une petite image conserve sa définition complète lorsque le budget le permet.
- Rendu définitif en pleine définition après le relâchement. Les aperçus temporaires ne sont ni exportés ni utilisés par l’OCR. Les raccourcis par paliers conservent leur lecture de chaque étape.
- Maintien des histogrammes indépendants des sous-images PDF pendant l’aperçu et dans le rendu définitif.

## 0.5.5

- Ajout d’AHE et d’un curseur adapté à la méthode : limite de contraste pour CLAHE, nombre de tuiles par axe pour AHE. Chaque méthode conserve son réglage.
- Ajout du préréglage « AHE au maximum », avec une grille 16 × 16 et les autres effets désactivés. La géométrie personnelle de la loupe est conservée.
- Conservation des résultats des quatre anciens niveaux CLAHE et des histogrammes indépendants des sous-images PDF.
- Ouverture directe du lecteur PDF, sans onglet vide intermédiaire.
