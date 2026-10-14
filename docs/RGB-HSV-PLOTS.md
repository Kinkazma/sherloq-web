# Navigation des nuages RGB/HSV

La vue 3D démarre de face, avec la même projection des axes horizontal et
vertical que la vue 2D. Le troisième axe reste disponible par rotation. Le
bouton **Ajuster** et le double-clic rétablissent cette orientation et le cadrage
initial.

Le nuage utilise la préférence de navigation commune à SHERLOQ :

- **Automatique** distingue les événements de défilement précis, les crans de
  molette et le pincement, selon les informations fournies par le navigateur.
- **Trackpad** déplace la vue avec le défilement à deux doigts ; le pincement
  zoome sous le pointeur.
- **Souris** utilise la molette pour zoomer sous le pointeur.

Le point situé sous le pointeur reste au même endroit pendant le zoom, même
après avoir déplacé le nuage. Les boutons de zoom utilisent le centre visible
de la fenêtre. Le déplacement à deux doigts ne change pas l'orientation 3D.
En 3D, un glissement tourne le nuage ; **Maj + glisser** ou le bouton du milieu
permettent de le déplacer. En 2D, un glissement le déplace directement.

Ces gestes changent seulement la caméra du rendu. Ils réutilisent les points
déjà présents, sans relancer leur calcul ni modifier les valeurs RGB/HSV ou
les exports CSV/JSON scientifiques. Le niveau de sous-échantillonnage natif
reste un réglage distinct et explicite.
