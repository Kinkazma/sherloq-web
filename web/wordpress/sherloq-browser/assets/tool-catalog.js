import {equalizationOperations} from './unified-engine/src/equalization-settings.js';
import{segmentationExclusionsAvailable}from'./unified-engine/src/segmentation-window-capabilities.js';
import {CLONE_ALGORITHMS,cloneMethodLabel,SSG_DEFAULTS} from './clone-methods.js?v=0.31.0';
// UI descriptors only. Scientific validation remains in the frozen worker.
import {toolGroups} from './tool-tree.js?v=0.31.0';
import defaults from './tool-defaults.js?v=0.31.0';
import {EXTENSION_TOOLS} from './extension-tools.js?v=0.31.0';
import {D2PRL_INPUT_SIDES} from './d2prl-input-size.js?v=0.31.0';
const select=(values,labels=values)=>({choices:values.map((value,i)=>({value,label:labels[i]}))});
const indexed=labels=>select(labels.map((_,i)=>i),labels);
const range=(min,max,step=1)=>({min,max,step});
const channels=indexed(['Luminance','Rouge','Vert','Bleu','Norme RGB']);
const fields={
 'various.ocr':{orientationCorrection:{label:'Corriger le sens de lecture'},bitmapThreshold:{...range(.01,.99,.01),label:'Seuil du masque de texte'},boxThreshold:{...range(.01,.99,.01),label:'Confiance de détection'},unclipRatio:{...range(.1,5,.1),label:'Marge autour du texte'},algorithm:select(['ppocr-medium','tesseract'],['PP-OCRv6 Medium','Tesseract LSTM — précision']),language:{...select(['eng+fra','fra','eng'],['Français + anglais','Français','Anglais']),label:'Langues'},psm:{...select([3,4,6,7,8,10,11,13],['Mise en page automatique','Colonne de texte','Bloc de texte','Ligne de texte','Mot isolé','Caractère isolé','Texte épars','Ligne brute']),label:'Organisation du texte'},threshold:{...range(0,1,.01),label:'Confiance minimale'},view:select(['overlay','text'],['Texte et encadrements','Texte'])},
 'ai.clones.d2prl':{inputSide:{...select(D2PRL_INPUT_SIDES,D2PRL_INPUT_SIDES.map(side=>side+' × '+side+(side>448?' ⚠️':''))),label:'Taille de la grille D2PRL'},minimum:range(0,5000)},
 'metadata.exiftool':{mode:select(['dump','headers','location','thumbnail'],['Métadonnées','Structure HTML','Géolocalisation','Miniature brute'])},
 'm2.cfa':{variant:select(['Original','JPEG 95','Sans JPEG']),block:range(8,256,2),tile:range(0,8192)},
 'file.hex':{offset:{...range(0,Number.MAX_SAFE_INTEGER),label:'Décalage (octets)'},length:{...range(1,65536),label:'Octets par page'}},
 'inspection.histogram':{channel:indexed(['Rouge','Vert','Bleu','Valeur']),start:range(0,255),end:range(0,255)},
 'inspection.magnifier':{mode:select(['contrast','equalize'],['Contraste automatique','Égalisation']),percent:{...range(0,100),label:'Écrêtage (%)'}},
 'inspection.adjust':{brightness:range(-255,255),saturation:range(-255,255),hue:range(0,180),gamma:{...range(1,50),label:'Gamma (dixièmes)'},shadows:range(-100,100),highlights:range(-100,100),sweep:range(0,255),width:range(0,255),sharpen:range(0,100),threshold:range(0,255),equalize:indexed(['Sans égalisation','Histogramme','CLAHE L1','CLAHE L2','CLAHE L3','CLAHE L4'])},
 'detail.gradient':{method:{...select(['sobel','krawetz'],['Gradient de Sobel','Gradient de Krawetz']),label:'Méthode'},intensity:range(0,100),mode:indexed(['Sans bleu','Bleu constant','Valeur absolue','Norme'])},
 'detail.echo':{radius:range(1,15),contrast:range(0,100)},
 'detail.frequency':{split:range(0,100),smooth:range(0,100),threshold:range(0,100),filter:range(0,15)},
 'detail.wavelets':{wavelet:select([...Array.from({length:20},(_,i)=>'db'+(i+1)),...Array.from({length:19},(_,i)=>'sym'+(i+2)),...Array.from({length:5},(_,i)=>'coif'+(i+1)),...['1.1','1.3','1.5','2.2','2.4','2.6','2.8','3.1','3.3','3.5','3.7','3.9','4.4','5.5','6.8'].map(x=>'bior'+x)]),threshold:range(0,100),level:{...range(0,30),nullable:true},mode:select(['soft','hard','garrote','greater','less'])},
 'colors.space':{space:select(['rgb','cmyk','gray','hsv','hls','ycrcb','xyz','lab','luv']),channel:indexed(['Composante 1','Composante 2','Composante 3','Composante 4'])},
 'colors.pca':{component:indexed(['1','2','3']),mode:select(['distance','project','crossprod'],['Distance','Projection','Produit vectoriel'])},
 'colors.stats':{mode:select(['min','avg','max'],['Minimum','Moyenne','Maximum'])},
 'colors.plots':{scale:{...range(0,30),nullable:true,label:'Niveau de sous-échantillonnage natif'},x:select([0,1,2,3,4,5],['Rouge','Vert','Bleu','Teinte','Saturation','Valeur']),y:select([0,1,2,3,4,5],['Rouge','Vert','Bleu','Teinte','Saturation','Valeur']),z:select([0,1,2,3,4,5],['Rouge','Vert','Bleu','Teinte','Saturation','Valeur']),alpha:range(0,1,.05),kind:select(['2d','3d'])},
 'noise.separation':{mode:indexed(['Médiane','Gaussien','Moyenne','Bilatéral','Non local']),radius:range(1,10),sigma:range(1,200),levels:range(0,255)},
 'noise.planes':{channel:channels,bit:range(0,7),filter:indexed(['Aucun','Médian','Gaussien'])},
 'noise.minmax':{channel:channels,minimum:indexed(['Rouge','Vert','Bleu','Blanc','Noir']),maximum:indexed(['Rouge','Vert','Bleu','Blanc','Noir']),filter:range(0,5)},
 'noise.blocking':{block:range(1,100)},
 'noise.noisesniffer':{blockSize:select([3,5,7,8]),cellSize:range(10,500),samplesPerBin:range(100,200000),lowFrequencyFraction:range(.01,1,.01),lowNoiseFraction:range(.01,.99,.01),view:select(['regions','mask','distribution'],['Régions','Masque','Distribution'])},
 'comparison.image':{view:select(['normal','difference','ssim','butter'],['Référence','Différence','SSIM','Butteraugli'])},
 'jpeg.ghosts':{low:range(0,100),high:range(0,100),step:range(1,20),x:range(0,7),y:range(0,7)},
 'jpeg.zero':{view:indexed(['Régions','Votes de grille','Votes JPEG99','Grilles différentes','Grilles manquantes'])},
 'tampering.contrast':{block:select([32,64,128,256]),mode:indexed(['Erreur d’histogramme','Similarité des canaux','Indicateur joint'])},
 'tampering.copyMove.brisk':{response:range(0,100),matching:range(1,100),distance:range(1,100),minimum:range(1,20)},
 'tampering.resampling':{stage:select(['probability','fourier']),size:select([3,5]),'fourier.window':select(['hanning','radial']),'fourier.highpass':select(['simple','radial']),'fourier.gamma':range(0,5,.1)},
 'various.median':{variance:range(0,100),threshold:range(0,1,.01)},
 'various.illuminant':{block:select([32,64,128,256]),method:indexed(['Gray World','Shades of Gray (p=6)','White Patch']),mode:indexed(['Couleur de l’illuminant','Écart à l’illuminant global','Pixels valides'])},
 'various.stereogram':{mode:indexed(['Motif','Silhouette','Disparité relative','Ombrage'])},
 'pixels.defects':{radius:select([1,2],['3 × 3','5 × 5']),threshold:range(1,255),spread:range(0,255),kind:indexed(['Chauds et morts','Chauds','Morts']),mode:indexed(['Candidats superposés','Masque des candidats','Aperçu corrigé'])},
 'ai.sources.safire':{side:select([4,8,16,24,32]),groups:range(1,16),kind:select(['kmeans','dbscan']),eps:range(.001,100,.001),minimum:range(1,1024)},
 'tampering.copyMove.sparse':{algorithm:select(CLONE_ALGORITHMS,CLONE_ALGORITHMS.map(cloneMethodLabel)),alikedInputSide:{...select([1024,2048],['1024 · standard','2048 · détails fins']),label:'Résolution ALIKED'},alikedDetectionThreshold:{...select([.2,.05],['0,2 · standard','0,05 · points faibles']),label:'Seuil de détection ALIKED'},limit:range(100,20000),radius:range(1,100000,.1),minimum:range(0,100000,.1),threshold:range(.01,1,.01),tolerance:range(.1,10000,.1),model:select(['None','Similarity','Affine','Homography']),geometricThreshold:range(.1,10000,.1),geometricMinimum:range(4,20000),patch:range(2,32),iterations:range(1,32),texture:range(0,255,.1),longSide:range(64,2048,32),rotationMode:select(['none','quarter-turns'],['Sans rotation','0° · 90° · 180° · 270°']),normalizationLongEdge:range(0,30000),minimumDistance:range(0,100000),spatialK:range(1,20),salienceSigma:range(.000001,1,.0001),ratio:range(.001,1,.001),absolute:range(.001,1,.001),maskThreshold:range(0,1,.01),minimumArea:range(0,1,.00001),roiRadius:range(0,512),ssimRadius:range(.1,20,.1),ssimOpening:range(0,64),rngSeed:range(0,4294967295)},
};
const labels={channel:'Canal',start:'Borne basse',end:'Borne haute',mode:'Mode',imageHashes:'Empreintes perceptuelles',percent:'Centile (%)',brightness:'Luminosité',saturation:'Saturation',hue:'Teinte',shadows:'Ombres',highlights:'Hautes lumières',sweep:'Centre',width:'Largeur',sharpen:'Netteté',threshold:'Seuil',equalize:'Égalisation',invert:'Inverser',intensity:'Intensité (%)',radius:'Rayon',contrast:'Contraste',grayscale:'Niveaux de gris',split:'Séparation (%)',smooth:'Lissage (%)',filter:'Filtre',wavelet:'Ondelette',level:'Niveau (vide = automatique)',space:'Espace',component:'Composante',inclusive:'Bornes incluses',colored:'Couleurs d’origine',alpha:'Opacité',kind:'Type',sigma:'Sigma',denoised:'Image débruitée',levels:'Niveaux',bit:'Bit',minimum:'Minimum',maximum:'Maximum',block:'Bloc',blockSize:'Taille des blocs',cellSize:'Taille des cellules',samplesPerBin:'Échantillons par classe',lowFrequencyFraction:'Fraction basses fréquences',lowNoiseFraction:'Fraction faible bruit',view:'Vue',metrics:'Calculer les 20 mesures',equalized:'Égaliser',low:'Qualité minimale',high:'Qualité maximale',step:'Pas',x:'X',y:'Y',z:'Z',includeOriginal:'Inclure l’original',missing:'Grilles absentes',response:'Réponse (%)',matching:'Appariement (%)',distance:'Distance (%)',showPoints:'Points',hideLines:'Masquer les liaisons',stage:'Étape',size:'Voisinage',window:'Fenêtre',upsample:'Sur-échantillonner',center:'Centrer',highpass:'Passe-haut',gamma:'Gamma',rescale:'Rééchelonner',variance:'Variance minimale',showScore:'Afficher les scores',speckle:'Nettoyage des points isolés',method:'Méthode',linear:'RGB linéaire',exclude:'Exclure les pixels saturés',spread:'Dispersion',side:'Grille des propositions',groups:'Groupes',eps:'Distance DBSCAN',binary:'Binaire',algorithm:'Algorithme',limit:'Limite de points',tolerance:'Tolérance',model:'Modèle géométrique',geometricThreshold:'Seuil géométrique',geometricMinimum:'Minimum géométrique',compare:'Comparer deux zones',reflections:'Réflexions (Panels + Text)',autoRadius:'Rayon automatique',compact:'Axes compacts',independent:'Zones indépendantes'};
const hidden=new Set(['modelId','referenceImageId','databaseId','maskImageId','bounds','regions','excluded','guides','exclusions','selectionPresent','refilterOf','reprojectOf','zoneIds','layout','rect','fourierRegions','trustAnchors']);
const extra={
 'file.similarity':{},'m2.trufor':{},'m2.rita':{},'m2.catnet':{},'m2.cfa':{variant:'Original',block:32,tile:512},
 'tampering.copyMove.sparse':{algorithm:'Extended: PatchMatch Zernike + PatchMatch SIFT + Mirror',alikedInputSide:1024,alikedDetectionThreshold:.2,limit:6000,radius:600,minimum:5,threshold:.3,tolerance:50,model:'Similarity',geometricThreshold:3,geometricMinimum:6,compare:false,reflections:false,autoRadius:true,compact:true,independent:true,patch:8,iterations:8,texture:2,longSide:832,rotationMode:'none',...SSG_DEFAULTS},
 'ai.sources.safire':{side:16,groups:3,kind:'kmeans',eps:.2,minimum:1,binary:false},'ai.localization.focal':{},'ai.localization.adaifl':{},'ai.clones.d2prl':{inputSide:448,minimum:500}
};
for(const [id,params] of Object.entries(extra))defaults[id]={params,exports:['json']};
// Native sparse evidence already has a complete Core NPZ adapter.
defaults['tampering.copyMove.sparse'].exports.push('npz');
// Six projected D2PRL scientific fields; not the native448 raw-bank archive.
defaults['ai.clones.d2prl'].exports.push('npz');
// Display-only defaults; neither value is sent as a scientific model parameter.
defaults['m2.rita'].view={mode:'overlay',threshold:.5};
for(const tool of EXTENSION_TOOLS)defaults[tool.id]={params:{},exports:tool.kind==='global'?['json']:['json','npz']};
// Keep the native automatic wavelet level; validate() canonicalizes the zero threshold.
defaults['detail.wavelets'].params.level=null;
// Original pixel colours are the initial plot presentation; saved choices still win.
defaults['colors.plots'].params.colored=true;
defaults['colors.plots'].params.kind='3d';
export const toolCatalog=Object.fromEntries(toolGroups.flatMap(g=>g.items).filter(t=>defaults[t.id]).map(t=>[t.id,{...t,...defaults[t.id]}]));
export function toolFields(id){const out=[];const visit=(object,prefix='')=>{for(const [name,value]of Object.entries(object)){if(hidden.has(name))continue;const key=prefix+name;if(value&&typeof value==='object'&&!Array.isArray(value)){visit(value,key+'.');continue;}if(Array.isArray(value))continue;out.push({key,label:labels[name]||name,type:typeof value==='boolean'?'checkbox':typeof value==='number'||value===null?'number':'text',value,...(fields[id]?.[key]||{} )});}};visit(toolCatalog[id].params);if(Object.hasOwn(equalizationOperations,id)){
 const legacy=equalizationOperations[id],index=out.findIndex(f=>f.key===legacy),field={key:'equalization',label:'Égalisation',type:'equalization'};
 if(index>=0&&id!=='noise.separation')out.splice(index,1,field);else out.push(field);
 }return out;}
export const toolTitle=(id,language='fr')=>toolCatalog[id]?.[language]||id;
export function setField(object,path,value){const keys=path.split('.');const last=keys.pop();for(const key of keys)object=object[key];object[last]=value;}

// Selection is explicit: neural regions are top-level task inputs, unlike the
// polygon parameters of sparse matching. Never send one representation as another.
export function neuralSelection(rectangles=[],scope='whole',segmentation=false){
 if(scope==='whole')return {params:{selectionPresent:false},regions:[]};
 if(!rectangles.length)throw new Error('Dessinez au moins un rectangle dans « Calques et zones ».');
 const bounds=rectangles.map(r=>[r.x0,r.y0,r.x1,r.y1]);
 if(scope==='exclude'){
  if(segmentation){
   if(segmentation===true)throw new Error('Les exclusions sont disponibles avec D2PRL.');
   if(!segmentationExclusionsAvailable(segmentation))throw new Error('Les exclusions internes ne sont pas disponibles pour cette variante et ce backend.');
  }
  return {params:{selectionPresent:false,exclusions:bounds},regions:[]};
 }
 if(scope!=='regions')throw new Error('Sélection de zones inconnue.');
 return {params:{selectionPresent:true},regions:bounds.map((bounds,i)=>({id:rectangles[i].id||'region-'+i,kind:'region',bounds}))};
}

// Scientific operation aliases may share one visible tool entry. Export
// capabilities belong to the computed operation, not its menu container.
export function toolOperationExports(operation){return [...(defaults[operation]?.exports??[])];}
