import {isDenseClone,denseCloneParameters} from './clone-methods.js';
export const CLASSIC_SIFT='SIFT + G2NN + RANSAC';
export const PANELS_SIFT=CLASSIC_SIFT+' + Panels + Text';
export const sparseViewDefaults=()=>({low:0,high:100000,minimum:4,circles:false,lines:false,points:false,areas:true,textExclusions:false});
// Older UI saved its own initial circles+links preset as if it were a choice.
// Migrate only that exact legacy preset; retain all customized combinations.
export function restoreSparseView(value,version){
 const legacy={...sparseViewDefaults(),circles:true,lines:true};
 if(version!==1&&value&&Object.keys(value).length===Object.keys(legacy).length&&Object.entries(legacy).every(([key,v])=>value[key]===v))return sparseViewDefaults();
 return {...sparseViewDefaults(),...value};
}
export const biomesOnly=view=>!view.circles&&!view.lines&&!view.points&&view.areas;
export function sparseAlgorithmColor(name){return ([CLASSIC_SIFT,PANELS_SIFT].includes(name)||name.startsWith('Extended:')||name.endsWith(' + Mirror'))?'green':['AKAZE','BRISK','ORB'].includes(name)?null:'red';}
export const sparseLabels={
 fr:{patch:'Patch (px)',iterations:'Itérations',texture:'Texture minimum',algorithm:'Détecteur',limit:'Points maximum',radius:'Écartement maximum (px)',minimum:'Séparation minimum (px)',threshold:'Tolérance du descripteur',tolerance:'Proximité des biomes (px)',model:'Géométrie',geometricThreshold:'Erreur maximum (px)',geometricMinimum:'Témoins minimum',compare:'Comparer deux zones',reflections:'Inclure les réflexions',autoRadius:'Rayon automatique par zone',compact:'Ignorer les intervalles entre zones',independent:'SIFT par zone',low:'Longueur affichée min.',high:'max.',support:'Points minimum par côté',circles:'Cercles',lines:'Liaisons',points:'Points centraux',areas:'Biomes',textExclusions:'Exclusions de texte',biomesOnly:'Biomes seuls'},
 en:{patch:'Patch (px)',iterations:'Iterations',texture:'Minimum texture',algorithm:'Detector',limit:'Maximum points',radius:'Maximum spacing (px)',minimum:'Minimum spacing (px)',threshold:'Descriptor tolerance',tolerance:'Biome proximity (px)',model:'Geometry',geometricThreshold:'Maximum error (px)',geometricMinimum:'Minimum inliers',compare:'Compare two regions',reflections:'Include reflections',autoRadius:'Automatic radius per region',compact:'Ignore gaps between regions',independent:'Per-region SIFT',low:'Displayed length min.',high:'max.',support:'Minimum points per side',circles:'Circles',lines:'Links',points:'Centre points',areas:'Biomes',textExclusions:'Text exclusions',biomesOnly:'Biomes only'}
};
export const sparseHelp={
 fr:{
  algorithm:'Choisit le détecteur et l’appariement. Panels + Text ajoute la recherche de sous-images et l’exclusion du texte. Les options disponibles suivent l’algorithme sélectionné.',
  radius:'Distance maximum entre deux points appariés, dans l’image originale. En mode automatique avec des zones, leur diagonale détermine cette distance.',
  autoRadius:'Utilise la diagonale de chaque zone comme écartement maximum. En comparaison, utilise la diagonale des deux zones réunies. Sans zone, le rayon manuel reste utilisé, sauf si Panels + Text détecte lui-même des sous-images. Ce réglage ne dessine pas de cercle.',
  compact:'Retire les intervalles vides entre les zones du calcul des distances d’appariement. Ne déplace aucun pixel ni tracé. Nécessite au moins deux zones distinctes ; avec une seule zone ou des zones jointives, aucun changement n’est attendu.',
  independent:'Avec SIFT + G2NN + RANSAC, extrait les points séparément dans chaque zone : chacune dispose de sa propre limite de points et de son contraste. Peut augmenter le temps de calcul. Toujours appliqué par Panels + Text ; sans effet pour les autres détecteurs.',
  patch:'Taille du voisinage utilisé par les descripteurs PatchMatch : de 2 à 32 pixels pour Zernike, de 3 à 32 pour les variantes SIFT.',
  iterations:'Nombre de passes de propagation et de recherche aléatoire de PatchMatch. Plus de passes peut améliorer les correspondances mais demande plus de calcul.',
  texture:'Écarte les zones trop uniformes selon le seuil natif de texture. Un seuil plus faible conserve davantage de candidats.',
  reflections:'Ajoute des correspondances en miroir aux correspondances normales. Disponible avec PatchMatch et Panels + Text. Les profils Mirror ajoutent automatiquement des passes réfléchies aux passes normales.',
  compare:'Recherche uniquement entre exactement deux zones. Sans cette option, recherche à l’intérieur des zones ; leur rectangle englobant permet aussi une recherche entre sous-images.',
  threshold:'G2NN : rapport entre voisins admissibles. Glue : 1 − confiance minimum. Autres détecteurs : distance entre descripteurs ; plus faible signifie plus strict.',
  tolerance:'Rapproche dans un même biome les liens dont les extrémités sont proches, directement ou par une chaîne de liens.',
  areas:'Affiche les enveloppes des deux ensembles associés à chaque biome. Même couleur : correspondances liées ; ces enveloppes ne sont pas une segmentation certaine.',
  textExclusions:'Affiche le texte exclu par Panels + Text. Aucun texte n’est recherché par cette case : il doit déjà avoir été identifié pendant l’analyse.',
  biomesOnly:'Affiche uniquement les biomes ; désactive les cercles, les liaisons et les points centraux.'
 },
 en:{
  algorithm:'Selects the detector and matcher. Panels + Text adds subimage detection and text exclusion. Available options follow the selected algorithm.',
  radius:'Maximum distance between matched points in original pixels. Automatic mode uses the diagonal of each selected region.',
  autoRadius:'Uses each region’s diagonal as the maximum spacing; comparison uses the combined diagonal. Without regions, the manual radius is used unless Panels + Text detects subimages. This setting does not draw circles.',
  compact:'Removes empty gaps between regions from matching distances. It does not move pixels or drawings. Requires two distinct regions; a single region or touching regions may show no change.',
  independent:'With SIFT + G2NN + RANSAC, extracts each region separately with its own point limit and contrast. May increase computation. Always used by Panels + Text; unavailable for other detectors.',
  patch:'PatchMatch descriptor neighbourhood: 2–32 pixels for Zernike, 3–32 for SIFT variants.',
  iterations:'Number of PatchMatch propagation and random-search passes. More passes can improve matches but require more computation.',
  texture:'Rejects low-texture areas using the native threshold. A lower threshold retains more candidates.',
  reflections:'Adds reflected matches to normal matches. Available with PatchMatch and Panels + Text. Mirror profiles automatically add reflected passes to normal passes.',
  compare:'Searches only between exactly two regions. Otherwise searches within regions; an enclosing region also allows matches across subimages.',
  threshold:'G2NN: allowed-neighbour ratio. Glue: 1 − minimum confidence. Other detectors: descriptor distance; smaller means stricter.',
  tolerance:'Groups links whose respective endpoints are nearby, directly or through a chain, into the same biome.',
  areas:'Displays the envelopes of both matched sets in each biome. Shared color means related matches; envelopes are not proven segmentation.',
  textExclusions:'Displays text excluded by Panels + Text. This switch does not detect text; it must already have been identified during analysis.',
  biomesOnly:'Shows biomes and disables circles, links and centre points.'
 }
};
const polygon=r=>r.polygon||[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
export function sparseParameters(settings,rectangles){
 const p=structuredClone(settings);p.regions=rectangles.filter(r=>!p.compare||!r.envelope).map(polygon);
 // Normalize inactive switches at the adapter boundary as well as in the UI:
 // restored settings from an older version must not reach an invalid native path.
 p.guides=p.compact&&!p.compare?rectangles.filter(r=>!r.envelope).map(polygon):[];
 if(isDenseClone(p.algorithm))return denseCloneParameters(p);
 delete p.patch;delete p.iterations;delete p.texture;
 p.reflections=p.algorithm===PANELS_SIFT&&p.reflections;
 p.independent=p.algorithm===PANELS_SIFT||p.algorithm===CLASSIC_SIFT&&p.independent;
 p.guides=p.compact&&!p.compare?rectangles.filter(r=>!r.envelope).map(polygon):[];
 return p;
}
export function detectedRectangles(data){
 const rectangles=(data.regions||[]).map((r,i)=>({id:r.id||'panel-'+i,x0:r.bounds[0],y0:r.bounds[1],x1:r.bounds[2],y1:r.bounds[3],...(data.polygons?.[i]?{polygon:data.polygons[i]}:{})}));
 if(!rectangles.length)return rectangles;
 const x0=Math.min(...rectangles.map(r=>r.x0)),y0=Math.min(...rectangles.map(r=>r.y0)),x1=Math.max(...rectangles.map(r=>r.x1)),y1=Math.max(...rectangles.map(r=>r.y1));
 if(rectangles.length>1&&!rectangles.some(r=>r.x0===x0&&r.y0===y0&&r.x1===x1&&r.y1===y1))rectangles.push({id:'panels-envelope',x0,y0,x1,y1,envelope:true,polygon:[[x0,y0],[x1-1,y0],[x1-1,y1-1],[x0,y1-1]]});
 return rectangles;
}
