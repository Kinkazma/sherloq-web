# Lecteur PDF

Déposez un PDF dans l’espace principal ou choisissez-le avec « Ouvrir une image ». Le document reste dans son propre onglet. Les pages apparaissent au fil de leur préparation ; cliquer sur une page disponible conserve ce choix pendant l’arrivée des suivantes. Le dépôt dans la fenêtre de traitement par lot conserve le parcours d’import du lot.

La page occupe l’espace restant sous les boutons de page. Le volet repliable « Images incorporées » contient les sources extraites à leur définition native. Cliquer sur une source ouvre son analyse dans un onglet image et conserve le PDF.

## Navigation et loupe

Le lecteur prépare des calques conservés pour la page sélectionnée. Les placements d’image dont la composition est qualifiée gardent le bitmap natif et sa transformation séparément ; les autres éléments du PDF sont peints à une définition couvrant celle des images. Le zoom et la loupe ajustent ensuite l’échelle de cette représentation. Ils ne relancent ni la peinture du PDF ni les analyses scientifiques après cette préparation. Les tuiles d’affichage absentes du cache sont relues depuis les mêmes données conservées.

La préparation haute définition est indiquée dans la barre d’état. Elle porte sur la page sélectionnée ; les pages suivantes peuvent déjà être consultées à partir de leur aperçu. Les éléments textuels peints dans les calques ne sont pas des objets SVG conservant une définition infinie.

Une fois le rendu natif disponible, le lecteur et la loupe conservent leur dernière image complète pendant l’arrivée de nouvelles tuiles. La position et l’échelle correspondantes sont conservées avec elle, puis remplacées ensemble. Ils ne réaffichent pas l’aperçu initial au milieu d’un déplacement ou d’un zoom.

Les gestes de navigation habituels permettent de déplacer et de zoomer la page. Le bouton Ajuster et le double-clic, lorsque la loupe est inactive, recentrent la page dans la fenêtre.

La loupe partage les réglages globaux de l’application. Les effets s’appliquent au composite RGB complet : image, texte et fond. La classification des acquisitions et la reconnaissance OCR ne sont pas déclenchées pour afficher la page ou ses réglages. Les groupes d’effets ne sont cumulés que lorsque l’utilisateur les active.

La composition précède les effets RGB, afin de conserver les couleurs issues des transparences et de l’anticrénelage. Les réglages ponctuels utilisent directement le composite affiché. Les opérateurs de voisinage et les statistiques globales utilisent une grille haute définition fixe de la page ; déplacer la loupe ne redéfinit donc pas l’histogramme ou le voisinage du calcul. Aucun masque de protection ne réinjecte des pixels originaux pour atténuer l’effet.

Le mode normal et le maintien de Maj utilisent la même composition native complète. Il n’existe plus de repli implicite vers une page de moindre définition pour traiter le texte ou le fond.

## Export et fidélité

L’export standard du menu Fichier capture la page et les réglages choisis à l’ouverture de la boîte de dialogue. Un changement ultérieur de page ne remplace pas cette capture. Un effet en préparation conserve ses propres paramètres ; l’export ne les remplace pas silencieusement par ceux de l’original.

Le lecteur réutilise les sources et ressources de préparation existantes. Il ne lance pas une nouvelle reconnaissance OCR pour publier chaque page. Les pages encodées sont conservées dans le stockage temporaire local ; les pixels décodés et les tuiles sont gérés par le cache borné. Le stockage OPFS est préféré ; si son ouverture est indisponible, IndexedDB conserve les mêmes fichiers temporaires sans repli sur une accumulation de fichiers en mémoire.
