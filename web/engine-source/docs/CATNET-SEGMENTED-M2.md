# CAT-Net v2 : opérateurs et stockage segmentés

Le chemin JPEG original utilise le même CAT-Net v2 natif : RGB normalisé
`(RGB-127.5)/127.5`, vrais coefficients DCT luminance, 21 catégories, table de
quantification du fichier, deux HRNet et fusion finale. Aucun redimensionnement
global ajouté. Le padding demeure celui du natif, multiple de 8 seulement.

`export-catnet-segments.py` exporte 149 graphes (456955519 octets) depuis le
chargeur strict natif. Actifs sous `.build/catnet-segments`, hors Git. Les
convolutions/BN natives sont exportées comme dans le premier portage CAT-Net ;
les fusions de branches conservent l'ordre des additions float32, et les
redimensionnements bilinéaires utilisent les dimensions et coordonnées globales.
Les halos sont dérivés des vrais opérateurs, alignés sur les strides. Les
banques float32 sont en RAM ou OPFS selon le budget commun ; aucun champ complet
n'est reconstruit dans une allocation WASM monolithique.

Le codec `build-catnet-jpeg.py` ajoute `_catnet_coeff_open/rows/close` : libjpeg
retient ses tableaux natifs, puis les catégories sont consommées par lignes.
Le RGB brut, avant orientation, provient du même décodage segmenté original.
Pas de seconde copie/décodage RGB complet. Les coefficients de bord sont ceux
du JPEG ; seul le RGB hors image est rempli par la valeur native 127.5.
Le tas de ce codec est admis sous le budget et libéré après extraction. Le tas
du décodeur d'image commun demeure compté dans `residentCodecBytes` jusqu'à
la fermeture du worker. Le fichier encodé est un Blob géré par le navigateur.

## Contrat

Configurer `methods.catnet` avec `segments` (manifest et URL absolue de chaque
asset), `runtimes`, `jpegFactoryUrl`. `analyzeBlob('catnet', originalJpeg)` renvoie
`map` dans l'orientation/dimensions de l'image ouverte et `native_map` à la
résolution native du réseau (avant recadrage/orientation). `nativeShape` décrit
cette dernière. Métadonnées : source/padded shape, orientation, SHA du JPEG,
checkpoint, opérateurs, stockage et backend réellement utilisés.

`readArray` lit des fenêtres numériques ; `renderWindow(id, 0|1|2, rect)` garde
les modes natifs (surimpression, chaleur ; mode2 identique chaleur pour CAT).
`exportTo`/`beginExport` produisent les deux cartes NPZ float32 complètes, sans
archive contiguë. Un export épingle son résultat même après `release` et
`clearCache`. Attendre `dispose()` pour achever l'annulation et le nettoyage.

Le chemin contigu existant reste disponible. Le chemin source couvre désormais
JPEG original et PNG avec compagnon global Q1004:4:4 ; voir
CATNET-COMPANION-SEGMENTED-M2.md pour la recette complète96MP distincte.
Le quota temporaire et les limites réelles de libjpeg sont respectés ; un
stockage indisponible ne déclenche aucun changement de méthode.

## Preuves et portée

`catnet-segmented-network-wasm-proof.json` : géométries 64×96 et 104×136,
fenêtres forcées courtes, toutes les fusions, cartes native et agrandie.
Erreur maximale1,90e-7 ; aucun changement au seuil0,5. Ce seuil est un diagnostic,
pas un nouveau paramètre scientifique de CAT-Net. Le second cas vérifie les
rapports globaux non entiers entre branches (padding non multiple de32).

`catnet-source-temporary-wasm-proof.json` : vrai JPEG131×97, décodage, DCT natif,
réseau, recadrage,4vues, archive57980octets. Erreurmax2,80e-8, aucun changement
au seuil0,5. OPFS forcé : pic1216384octets ; résultat/cache libérés avant lecture
de l'export, annulation suivante et répertoire temporaire vide vérifiés.
Temps75,94s à froid incluant ces interactions ; coût des149sessions visible,
pas présenté comme accélération du chemin dense. Zéro calibration utilisateur.
Les tests Node couvrent les8orientations avec frontières internes et les NPZ
segmentés aux mêmes octets que les archives contiguës (lectures désalignées).

Les preuves petite taille ne qualifient pas la charge96MP ni l'UI WordPress.
Les preuves de charge de chaque famille sont suivies séparément dans l'état M2.

`catnet-source-webgpu-proof.json` vérifie aussi le JPEG complet via WebGPU :
erreurmax4,80e-8, moyenne<9,46e-9, aucun changement au seuil0,5 ;4vues et
NPZ57988octets. Les quelques octets de différence avec le rapport CPU sont
les métadonnées de backend. Les cartes sont comparées numériquement au natif.
Les temps de ces recettes de développement incluent la coexistence avec le
calcul TruFor96MP ; ils ne sont pas des mesures de vitesse isolées.

## Limite réelle du stockage privé observée pendant la charge96MP

Le premier parcours96MP a calculé le stem RGB, puis échoué en relisant sa banque
6,144Go. Un test indépendant a isolé le fournisseur OPFS du contexte privé
Playwright/Chrome154 : `truncate(6144000000)` laissait une taille0, et certaines
écritures renvoyaient4294967288 (supérieur à la requête), sans exception utile.
Même par fichiers256Mio, ce contexte a refusé une allocation autour de4Go alors
que son estimation annonçait10Gio. Cette limite physique n'est pas une preuve
que le réseau ou le quota annoncé couvre le calcul complet.

Les stockages segmentés bornent désormais chaque fichier temporaire à256Mio.
Le helper OPFS vérifie la taille après truncate et les nombres d'octets réellement
lus/écrits. Une allocation refusée échoue explicitement ; aucune donnée manquante
n'est considérée calculée. Le test sur profil temporaire **sur disque**, propriété
M2, valide6,144Go en23fichiers, lectures/écritures aux frontières256Mio/2Gio/4Gio
et en fin de banque. Le profil est supprimé après fermeture de la recette.
Ce correctif ne promet pas un stockage illimité en navigation privée.

Les grandes recettes sont relancées avec `--persistent` (profil de développement
isolé sous `.build`, pas le profil personnel de l'utilisateur). Les anciennes
preuves petite taille restent valides. Le premier essaiTruFor96MP est interrompu
avant une phase qui aurait aussi dépassé le fournisseur privé ; pas de résultat
96MP annoncé à partir de cet essai. Le budget décrit toujours les allocations
comptabilisées, pas une mesure physique exhaustive du processus navigateur.

## Parcours original96MP qualifié (moteur1ead3ff)

`catnet-source-96mp-webgpu-proof.json` : JPEG public bruité12000×8000,
SHA`f0b7febc57f625bf078dfeb746f5775f4c6efa7379e0f1c469a9330eb094f254`.
Chrome154, WebGPU demandé (nœuds auxiliaires CPU possibles), profil temporaire
sur disque, aucun redimensionnement ajouté. Temps analyse1176,383s ; parcours
complet1181,285s. Carte96millions de valeurs [0,0023491;0,827969], carte native
6millions de valeurs, toutes finies ;4vues dans2régions distantes ;NPZ complet
408003652octets vérifié, cartes et archive aux dimensions originales.
Budget3Gio, piccomptabilisé3211632096octets. Pictemporaire8256000000octets,
sous quota10Gio. Après libération et cache : actif/cache0 ; seul le tas du codec
JPEG103546880octets reste jusqu'àdispose. Source RGB en RAM288MB. Cette preuve
couvre le réseau CAT-Net v2 complet et son chemin JPEG segmenté, pas l'UIWordPress
ni un compagnon JPEG96MP généré depuis un format nonJPEG.
