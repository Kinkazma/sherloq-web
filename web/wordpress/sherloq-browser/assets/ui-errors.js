// Technical errors/cause chains stay intact in exported reports. Only their
// presentation is localized, never their type or recovery semantics.
const messages=[
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
 ISOLATION_REQUIRED:['L’export HEIC nécessite la page dédiée de SHERLOQ, ouverte directement dans le navigateur.','HEIC export requires the dedicated SHERLOQ page opened directly in the browser.'],
 ENCODE_FAILED:['L’encodage de l’image a échoué. Le détail technique est conservé.','Image encoding failed. Technical details are preserved.'],
 MEDIA_CODEC_FAILED:['Le format de cette image n’a pas pu être lu ou écrit. Le détail technique est conservé.','The image format could not be read or written. Technical details are preserved.'],
 CANCELLED:['Calcul annulé.','Calculation cancelled.'],
 MEMORY_LIMIT:['La mémoire disponible ne suffit pas pour cette étape.','Available memory is insufficient for this step.'],
 MEMORY_ALLOCATION:['Le navigateur a refusé une allocation de mémoire.','The browser refused a memory allocation.'],
 GPU_OUT_OF_MEMORY:['La mémoire graphique disponible ne suffit pas.','Available graphics memory is insufficient.'],
 UNSUPPORTED_BACKEND:['Ce mode de calcul n’est pas disponible pour cet outil. Choisissez Automatique ou CPU.','This computation mode is unavailable for this tool. Choose Automatic or CPU.'],
 UNSUPPORTED_OPERATION:['Cette opération n’est pas disponible avec cette configuration.','This operation is unavailable with this configuration.'],
 INVALID_INPUT:['Les réglages transmis au moteur ne sont pas valides.','The settings supplied to the engine are invalid.'],
 FEATURE_EXTRACTION_FAILED:['L’extraction des points caractéristiques a échoué. Le bouton Diagnostic donne la cause technique.','Feature extraction failed. Open Diagnostics for the technical cause.'],
 WORKER_FAILED:['Le processus de calcul a rencontré une erreur.','The calculation process encountered an error.'],
 BUSY:['Un calcul est déjà en cours.','A calculation is already running.']
};
export function errorText(error,language='fr'){
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
