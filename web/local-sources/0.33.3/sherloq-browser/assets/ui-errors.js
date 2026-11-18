// Technical errors/cause chains stay intact in exported reports. Only their
// presentation is localized, never their type or recovery semantics.
const messages=[
 [/^Image too small for\s*25 complete native cells$/i,'La zone à analyser est trop petite pour Énergie : au moins 25 cellules complètes sont nécessaires. Aucun score n’a été calculé.','The analysis region is too small for Energy: at least 25 complete cells are required. No score was computed.'],
 [/reflected sparse pass belongs to Panels \+ Text/i,'Les réflexions nécessitent l’algorithme SIFT + G2NN + RANSAC + Panels + Text.','Reflections require SIFT + G2NN + RANSAC + Panels + Text.'],
 [/Compare requires two regions|Comparaison.*deux zones/i,'Pour comparer, tracez exactement deux zones.','Draw exactly two regions to compare.'],
 [/Invalid sparse distances or geometry/i,'Vérifiez les distances et la géométrie : la séparation minimum doit être inférieure au rayon maximum, les tolérances positives et le seuil compris entre 0 et 1.','Check distances and geometry: minimum spacing must not exceed the radius, tolerances must be positive and the threshold must be between 0 and 1.'],
 [/Invalid sparse display filter/i,'Vérifiez les filtres d’affichage : minimum inférieur au maximum et au moins un point par côté.','Check display filters: minimum must not exceed maximum, with at least one point per side.'],
 [/Invalid sparse algorithm or point count/i,'Choisissez un détecteur disponible et entre 100 et 20 000 points.','Choose an available detector and between 100 and 20,000 points.'],
 [/Panels \+ Text requires explicit verified English OCR weights/i,'Le modèle de reconnaissance du texte requis par Panels + Text n’a pas pu être chargé.','The text recognition model required by Panels + Text could not be loaded.'],
 [/Choisissez une image de référence/i,'Choisissez une image de référence.','Choose a reference image.'],
 [/Choisissez une base PRNU ou des images d’apprentissage/i,'Choisissez une base PRNU ou des images d’apprentissage.','Choose a PRNU database or training images.'],
 [/Modèle.*absent|model.*(?:missing|required)|Explicit pinned model/i,'Le modèle nécessaire n’est pas disponible. Vérifiez les fichiers de l’installation.','The required model is unavailable. Check the installation files.'],
 [/Failed to fetch|NetworkError|fetch failed/i,'Le chargement a échoué. Vérifiez la connexion au serveur de l’application.','Loading failed. Check the connection to the application server.'],
 [/Source not loaded|Image not loaded|Original image.*missing/i,'L’image source n’est pas chargée. Ouvrez l’image avant de calculer.','The source image is not loaded. Open it before calculating.'],
 [/SUBIMAGES_MEMORY|segmented.*(?:unavailable|unsupported)|Operation.*segmented/i,'La détection des sous-images nécessite ici une image décodée en mémoire. La mémoire disponible ne l’a pas permis ; vos zones précédentes sont conservées.','Subimage detection currently requires an in-memory decoded image. Available memory did not permit it; your previous regions are preserved.']
];
const codes={
 SOURCE_SCOPE_EMPTY:['Les zones actives ne contiennent aucun pixel à analyser. Ajoutez ou réactivez une acquisition.','The active regions contain no pixels to analyze. Add or enable an inclusion region.'],
 SOURCE_REGIONS_INVALID:['Les zones ne correspondent pas à cette image ou leur géométrie est invalide.','The regions do not belong to this image or their geometry is invalid.'],
 SOURCE_SCOPE_UNSUPPORTED:['Cet outil ou ces paramètres ne permettent pas encore d’analyser ce périmètre. Les pixels exclus n’ont pas été analysés.','This tool or these parameters cannot yet analyze this domain. Excluded pixels were not analyzed.'],
 SOURCE_SCOPE_OCR_UNSUPPORTED:['La reconnaissance du texte n’est pas disponible pour ce périmètre. Les zones et exclusions conservées restent intactes.','Text recognition is unavailable for this domain. Saved regions and exclusions are preserved.'],
 SOURCE_REGION_PARTIAL_WINDOW:['Cette étape ne sait pas encore omettre les exclusions à l’intérieur d’une zone. Aucun pixel exclu n’a été réadmis.','This stage cannot yet omit exclusions inside a region. No excluded pixel was re-admitted.'],
 PDF_IMAGE_PAINT_UNSUPPORTED:['La composition de cette page PDF ne permet pas encore d’y appliquer les effets. Vous pouvez ouvrir son image incorporée pour l’analyser.','This PDF page composition does not yet support these effects. You can open its embedded image for analysis.'],
 ISOLATION_REQUIRED:['L’export HEIC nécessite la page dédiée de SHERLOQ, ouverte directement dans le navigateur.','HEIC export requires the dedicated SHERLOQ page opened directly in the browser.'],
 ENCODE_FAILED:['L’encodage de l’image a échoué. Le détail technique est conservé.','Image encoding failed. Technical details are preserved.'],
 MEDIA_CODEC_FAILED:['Le format de cette image n’a pas pu être lu ou écrit. Le détail technique est conservé.','The image format could not be read or written. Technical details are preserved.'],
 CANCELLED:['Calcul annulé.','Calculation cancelled.'],
 MEMORY_LIMIT:['La mémoire disponible ne suffit pas pour cette étape.','Available memory is insufficient for this step.'],
 MEMORY_ALLOCATION:['Le navigateur a refusé une allocation de mémoire.','The browser refused a memory allocation.'],
 GPU_OUT_OF_MEMORY:['La mémoire graphique disponible ne suffit pas.','Available graphics memory is insufficient.'],
 UNSUPPORTED_BACKEND:['Ce mode de calcul n’est pas disponible pour cet outil. Choisissez Automatique ou CPU.','This computation mode is unavailable for this tool. Choose Automatic or CPU.'],
 METHOD_DIMENSIONS_UNQUALIFIED:['Cette version expérimentale nécessite une image ou un rectangle de 512 × 512 pixels. Aucune réduction automatique n’est appliquée.','This experimental version requires a 512 × 512 image or rectangle. No automatic downscale is applied.'],
 UNSUPPORTED_OPERATION:['Cette opération n’est pas disponible avec cette configuration.','This operation is unavailable with this configuration.'],
 INVALID_INPUT:['Les réglages transmis au moteur ne sont pas valides.','The settings supplied to the engine are invalid.'],
 FEATURE_EXTRACTION_FAILED:['L’extraction des points caractéristiques a échoué. Le bouton Diagnostic donne la cause technique.','Feature extraction failed. Open Diagnostics for the technical cause.'],
 WORKER_FAILED:['Le processus de calcul a rencontré une erreur.','The calculation process encountered an error.'],
 BUSY:['Un calcul est déjà en cours.','A calculation is already running.']
};
const scopeLimitations={
 SOURCE_UPSTREAM_MEMBERSHIP_UNQUALIFIED:['Cet outil accepte une acquisition rectangulaire, mais ne sait pas encore retirer les exclusions internes avant son calcul. Le calcul n’a pas été lancé et les zones sont conservées.','This tool accepts a rectangular inclusion, but cannot yet remove internal exclusions before computation. Analysis was not started and the regions are preserved.'],
 SOURCE_NEIGHBORHOOD_MEMBERSHIP_UNQUALIFIED:['La netteté et le contraste local ne savent pas encore omettre les exclusions de leurs voisinages. Le calcul n’a pas été lancé.','Sharpening and local contrast cannot yet omit exclusions from their neighborhoods. Analysis was not started.'],
 ORIGINAL_ENCODED_SOURCE_REQUIRED:['Cet outil examine le fichier encodé d’origine, pas ses pixels recadrés. Une sélection ne peut pas remplacer ces données.','This tool examines the original encoded file, not cropped pixels. A selection cannot replace that evidence.'],
 SOURCE_DCT_CROP_UNQUALIFIED:['Cet outil nécessite des données JPEG/DCT alignées avec l’image. Leur recadrage exact avec les zones n’est pas encore pris en charge.','This tool requires JPEG/DCT data aligned with the image. Their exact crop with the regions is not yet supported.'],
 SOURCE_PAIRED_CROP_UNQUALIFIED:['Cet outil doit aligner la sélection sur toutes ses images de référence. Ce raccord n’est pas encore pris en charge ; le calcul n’a pas été lancé.','This tool must align the selection across all reference images. This adaptation is not yet supported; analysis was not started.'],
 SOURCE_COORDINATES_UNLOCALIZED:['Les coordonnées de cette préparation ne peuvent pas encore être transposées dans la sélection. Le calcul n’a pas été lancé et les zones sont conservées.','These preparation coordinates cannot yet be localized to the selection. Analysis was not started and the regions are preserved.']
};
export function errorText(error,language='fr'){
 const limitation=error?.details?.sourceRegionCapability?.limitation,explanation=error?.code==='SOURCE_SCOPE_UNSUPPORTED'&&scopeLimitations[limitation];
 if(explanation)return explanation[language==='fr'?0:1];
 const index=language==='fr'?1:2,message=error?.message??String(error),match=messages.find(([pattern])=>pattern.test(message));
 if(match)return match[index];
 if(codes[error?.code])return codes[error.code][index-1];
 if(language==='en')return message;
 if(/[àâçéèêëîïôùûüœ]/i.test(message)&&!/^Invalid |^Error/i.test(message))return message;
 return 'Le calcul n’a pas abouti'+(error?.code?' ('+error.code+')':'')+'. Le rapport conserve le détail technique de l’erreur.';
}
export function localizeStatus(message,language){
 if(!/^(?:Error|Erreur)(?:\s|:|·)/.test(message))return message;
 message=message.replace(/^(?:Error|Erreur)[\s:·]+/,'');
 const code=message.match(/\b[A-Z][A-Z_]{2,}\b/)?.[0];
 return (language==='fr'?'Erreur · ':'Error · ')+errorText({message,code},language);
}
