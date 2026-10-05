# CAT-Net — compagnon Q100 pour source PNG segmentée

Les modules PNG et le codec RGB JPEG sont repris **à l'identique** du commit
stable d'intégration M5 `fb57a71` : src/png-stream.js, png-header-source.js,
vendor/png-stream, vendor/jpeg-rgb-stream, leurs sources C et scripts de build.
Aucun fichier vivant M5 modifié, aucun second codec inventé. L'ajout au chargeur
M2 réutilise ces fonctions ; M5 garde la fusion du chargeur commun avec TIFF et
ses contrats d'appartenance de session déjà plus larges.

`analyzeBlob('catnet', pngBlob)` décode le vrai original par scanlines libpng,
construit le JPEG global qualité100/subsampling4:4:4, puis décode ce compagnon.
Le réseau emploie le RGB décodé du compagnon et ses vrais coefficients/table,
comme le natif. Il ne prend pas le RGB original à la place. Les pixels orientés
sont encodés sans EXIF dans le compagnon ; les cartes gardent ces coordonnées.
Metadata conserve jpeg_source=companion_q100_444, SHA du compagnon, taille et
stockage ; provenance.originalSourceSha256 demeure celle du fichier original.

Le codec a un heap borné et traite32lignes par appel. Octets encodés et RGB
compagnon sont des banques RAM/OPFS ; l'enveloppe encodée conservative24octets/
pixel est libérée dès extraction des coefficients, avant HRNet. La banque RGB
reste disponible jusqu'à la fin du calcul. SHA incrémental, aucun Blob géant ni
copie complète d'archive ajoutée. Nettoyage sur erreur/annulation et libération
finale de la session avec le résultat. Aucune calibration utilisateur.

Preuves : PNG83×71, JPEG compagnon26526octets identique octet pour octet au natif,
SHA cb4a1587319febfc44c7b14de217dcd7f2b7b80592cb4cc4e80ad09a6daa8ec7.
Le contrôle Node du codec termine avec budget final0 et pic46180838octets sous
128Mio. Chaîne Chrome154 WebGPU : carte finale max2,189e-8/moyenne6,503e-9 ;
carte native max2,375e-8/moyenne6,661e-9 ; aucun changement au seuil0,5. Quatre
vues distantes et NPZ complet lus ; budget actif/cache/retained0 après libération.
195,73s mesurés avec d'autres recettes lourdes concurrentes : ce temps n'est pas
une mesure de débit isolé. Le PNG96MP reste à qualifier sur ce nouveau chemin.
Les variantes de format déjà qualifiées par M5 ne sont pas requalifiées par ce lot.


## Recette compagnon96MP

`catnet-companion-source-96mp-webgpu-proof.json` réussie sur3d6f4e4.
PNG12000×8000 original : vrai compagnon global Q100/444 de275642960octets,
SHA1df2df70d4bc1c6097641c98ae2853409488545c3fb924b745591628964511b1.
CAT-Net consomme ses RGB décodés, DCT stockés et tables ; réseau entier et
redimensionnements globaux. Carte96M et carte native6M entièrement relues,
quatre vues éloignées et NPZ408004456octets après release/cache.
Analyse1589,84s, total1593,99s avec autres recettes concurrentes.
Pic3214268257octets sous3Gio, OPFSpic8544000000octets sous quota10Gio ;
mémoire comptabilisée finale0. Pas d'oracle natif96MP indépendant : preuve
charge/API/mémoire couplée à la comparaison exacte du compagnon petit et aux
références numériques du réseau. Pas de réduction de la source ou du réseau.
