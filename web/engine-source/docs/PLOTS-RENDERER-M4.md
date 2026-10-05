# RGB/HSV : raccordement du graphe par B

L'opération `colors.plots` conserve son comportement historique. Demander
`params.layout:'values'` évite les copies positions/couleurs inutiles au rendu
GPU ; le défaut `legacy` conserve les anciens champs. La sélection pyramidale
`scale` reste explicite et la préparation RGB/HSV native reste inchangée.

Importer `createPlotRenderer` depuis `src/plot-renderer.js`, fournir un canvas et
le Budget commun, puis `await renderer.setData(result.data.values,{signal,
onProgress})`. Ce tableau Nx6 float32 est emprunté immutable : garder son lease
CPU jusqu'au remplacement ou à la destruction du graphe. Le renderer facture
les buffers GPU, son enveloppe et son framebuffer au Budget, découpe les uploads
sans perdre de point et refuse explicitement une allocation hors budget. Aucun
prétest GPU. Il ne remplace pas le nuage par un échantillon.

`setStyle({x,y,z,kind,colored,alpha,size,grid})` utilise les six colonnes
Red/Green/Blue/Hue/Saturation/Value (indices0..5), kind2d/3d/classic, alpha0..1,
size1..10 (diamètre GPU2×size). `setCamera({limits,center,distance,elevation,
azimuth})`, `zoom2d(delta,xFraction,yFraction)` et `resetCamera()` modifient des
uniformes sans analyser ni réenvoyer les points. `resize(width,height,ratio)`
réserve le framebuffer. `snapshot()` fournit état et compteurs. B raccorde les
événements de souris, labels, boutons et grille ; les helpers publics dans
`plot-camera.js` exposent colonnes et projection. Valeurs axes natives0..1,
caméra initiale3D centrée(.5,.5,.5), distance3.5, élévation25°, azimut45°.

`exportSvg({signal})` est un générateur asynchrone de fragments UTF-8 à écrire
progressivement dans un fichier/flux. Tous les points sélectionnés sont visités,
clippés à la vue ; axes, graduations2D, grille et transparence inclus. Le SVG3D
est une projection vectorielle dans l'ordre natif, sans tampon de profondeur,
explicitement annoncé dans ses métadonnées ; `exportPng()` capture le rendu GPU
avec profondeur pour la vue3D opaque. Le PNG contient le canvas ; B compose ses
labels externes si nécessaire. Pas de prétendue identité pixel entre Qt et GL.

`setData` est annulable entre uploads ; remplacement réussi seulement après
upload complet, échec laissant le nuage précédent. `dispose()` libère les
ressources. Perte de contexte : callback `onContextLost`, erreurs explicites,
recréer le renderer et transmettre les valeurs retenues. Pas de réanalyse cachée.

Validation : corpus1674 graphes natifs antérieurs passe ; test disposition
values-only et caméra ; Chrome réel100003 points, uploads persistants, export
SVG complet/XML valide, PNG non vide inspecté, annulation/remplacement et
libération. `plot-renderer-browser-proof.json`. GPU2D/3D et contrat livrés ; les
contrôles WordPress et leur composition graphique restent chez B.
