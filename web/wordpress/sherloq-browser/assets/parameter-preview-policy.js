import {toolCatalog,toolFields} from './tool-catalog.js?v=0.31.0';

// A draft is always separate from the native result. Scientific method/model
// changes and recompressed JPEG evidence are never substituted for the native
// analysis by these provisional visual previews.
const rules=new Map();
const rule=(kind,reason,extra={})=>Object.freeze({kind,reason,final:kind==='local'?'view':kind==='explicit'?'explicit':'native',...extra});
const NONE=rule('none','No variable image presentation is associated with this control.',{final:'none'});
const EXPLICIT=rule('explicit','This changes a scientific method, model, source or search contract; preserve explicit calculation.');
for(const [id]of Object.entries(toolCatalog))for(const field of toolFields(id))rules.set(id+'\0'+field.key,EXPLICIT);
function set(ids,keys,kind,reason,extra={}){for(const id of ids.split(' '))for(const key of keys.split(' ').filter(Boolean))rules.set(id+'\0'+key,rule(kind,reason,extra));}
function all(ids,kind,reason,extra={}){for(const id of ids.split(' '))set(id,toolFields(id).map(f=>f.key).join(' '),kind,reason,extra);}
all('file.digest file.hex file.similarity metadata.structure metadata.exiftool metadata.thumbnail metadata.location metadata.c2pa','none','Byte inspection, metadata and validation are exact actions, not provisional image calculations.',{final:'none'});
set('file.hex','offset length','explicit','Read the selected original-byte interval exactly on commit; no image proxy or altered bytes.',{final:'native'});
all('inspection.adjust detail.gradient detail.echo noise.separation colors.space colors.stats','pixel-proxy','A bounded provisional visual transform; the native operation and source remain unchanged at commit.');
set('detail.gradient','method','explicit','Commit the selected native gradient method automatically; a method choice is not a sampled scientific preview.',{final:'native'});
all('inspection.magnifier','local','The existing native ROI loupe already handles its small interactive display.',{existing:true,final:'view'});
all('inspection.histogram','retained','Reuse the exact native four-channel bins; no image scan.',{final:'view',strategy:'histogram'});
all('colors.pca','retained','Project sampled pixels with the native global PCA basis; no refitting on a proxy.',{strategy:'pca'});
all('detail.frequency detail.wavelets noise.blocking','pixel-proxy','Only the display draft is approximate; the final native global transform and coefficients are unchanged.',{globalBasis:true});
set('jpeg.ghosts','low high step x y','pixel-proxy','Actual JPEG recompressions and phase roll on a bounded derived RGB source; its new sampled lattice is provisional. Native original-pixel JPEG analysis remains the exact commit.',{globalBasis:true,strategy:'ghosts-recompression'});
all('colors.plots','local','The retained RGB/HSV point cloud is restyled in its existing viewer.',{final:'view',strategy:'scatter'});
set('colors.plots','scale','retained','The chart viewer draws a stable bounded subset of its retained native points during the gesture; native sampling is calculated only at commit.',{strategy:'scatter',final:'native',previewOwner:'workspace'});
all('noise.planes noise.minmax pixels.defects','pixel-proxy','Sampled RGB values stay unchanged, but neighboring proxy pixels can be spaced apart in the native image; filtering, extrema and defect neighborhoods are provisional.',{nativeSamples:true,approximateNeighborhoods:true});
all('noise.noisesniffer','retained','Reuse admitted native statistics and selections for a provisional draft; a missing basis uses an isolated sampled source. The native final retains the complete original statistical domain.',{strategy:'noisesniffer-native-cache',targetMs:50,final:'native',fallback:'pixel-proxy'});
set('various.ocr','threshold view','local','Filter and repaint retained native OCR regions/text without recognition or scientific-score changes.',{existing:true,final:'view'});
set('various.ocr','algorithm language psm orientationCorrection bitmapThreshold boxThreshold unclipRatio','explicit','Automatically recognize the full source when OCR method, language or layout changes.',{final:'native'});
set('m2.cfa','variant block tile','explicit','Automatically commit the unchanged native CFA method on the current source domain; no provisional model or sampled proxy.',{final:'native'});
all('various.median','retained','Reuse native compact probabilities and variances; never rerun feature extraction or XGBoost for presentation.',{strategy:'median',nativeBasis:'required',nativeBasisMutableParams:['variance','threshold','speckle','showScore']});
set('various.median','modelId','explicit','A model selection requires explicit native analysis.');
set('tampering.contrast','mode','retained','Reuse the native three-indicator block grid.',{strategy:'contrast'});
set('tampering.contrast','block','pixel-proxy','The bounded draft estimates native contrast indicators for the selected block; native original-pixel statistics are calculated at commit.');
set('various.illuminant','mode','retained','Reuse native cell illuminants, counts and global reference.',{strategy:'illuminant'});
set('various.illuminant','block method linear exclude','pixel-proxy','Provisional cell estimation only; native cell/global statistics remain authoritative at commit.');
set('comparison.image','view equalized grayscale','pixel-proxy','Use both bounded source/reference views; native metrics are never measured on the draft.');
set('comparison.image','metrics','explicit','Whole-image reference metrics are scientific output, not a display proxy.');
set('jpeg.ghosts','grayscale','retained','Recolor only the already retained native quality/phase maps.',{strategy:'ghosts'});
set('jpeg.ghosts','includeOriginal','retained','The original layer borrows the source; the native commit reuses retained JPEG maps.',{strategy:'ghosts',final:'native'});
set('jpeg.zero','view','retained','Read the already retained native votes, masks and luminance at a bounded display step; the exact final view reuses the same native analysis.',{strategy:'zero-native-cache',final:'native'});
set('jpeg.zero','missing','explicit','The missing-grid option changes the native JPEG99 analysis. Automatically calculate its exact native result on commit.',{final:'native'});
set('various.stereogram','mode','retained','Reuse the retained native period and existing views. If a new disparity is needed, calculate it only on bounded aligned source samples during the draft; the final native mode uses the original cache and source.',{strategy:'stereo-native-cache',final:'native'});
set('ai.sources.safire','groups kind eps minimum binary','retained','Regroup retained native proposals on a bounded provisional subset; no encoder or proposal inference. Exact native grouping and full map reconstruction run on commit.',{strategy:'safire-grouping',targetMs:200,final:'native',nativeBasis:'required',nativeBasisMutableParams:['groups','kind','eps','minimum','binary']});
set('tampering.resampling','fourier.gamma fourier.rescale','retained','Apply display gamma/rescale to retained native Fourier magnitude.',{strategy:'resampling'});
set('tampering.resampling','stage size fourier.window fourier.upsample fourier.center fourier.highpass','explicit','Commit the exact native EM/Fourier method on the current source domain; existing native stages decide cache reuse, without a sampled scientific proxy.',{final:'native'});
set('tampering.copyMove.brisk','minimum','retained','Filter the complete retained native groups on a bounded draft; native region counting and exact rendering still run on commit.',{strategy:'clones-classical',final:'native'});
set('tampering.copyMove.brisk','showPoints hideLines','retained','Draw only retained native keypoints and already grouped matches on a bounded source view; no detector or matcher runs.',{strategy:'clones-classical'});
set('tampering.copyMove.sparse','sparseView.low sparseView.high sparseView.minimum sparseView.circles sparseView.lines sparseView.points sparseView.areas sparseView.textExclusions sparseView.traceOverlap sparseView.maxBiomeArea sparseView.circleScale sparseView.clipLinesToCircles sparseView.biomeMethod','retained','Repaint retained native matches/paired biome geometry; no matching or model calculation.',{strategy:'clones'});
set('ai.clones.d2prl','minimum','retained','Temporarily refilter the complete retained native448 banks during a hold, then commit the latest native minimum; a missing or changed checkpoint cannot start inference.',{strategy:'d2prl-refilter',final:'retained-native',nativeBasis:'required',nativeBasisMutableParams:['minimum']});
set('ai.clones.d2prl','neuralView','local','Switch retained native clone layers through the existing layer selector without inference.',{strategy:'layer',existing:true,final:'view'});
set('ai.sources.safire ai.localization.focal ai.localization.adaifl','researchView','retained','Recolor native retained maps/labels on a bounded display; native commit only renders the cached analysis.',{strategy:'research',final:'native',nativeBasis:'required',nativeBasisMutableParams:['groups','kind','eps','minimum','binary']});
set('m2.trufor m2.catnet','view','local','Switch retained native model fields through the existing layer viewer.',{strategy:'layer',existing:true,final:'view'});
set('m2.rita jpeg.comprint ai.text.doctamper','threshold opacity view','local','Existing retained response proxy and native presentation path.',{existing:true,final:'view'});
for(const id of ['ela.classic','ela.energy','ela.biomes'])set(id,'quality scale contrast linear grayscale histogramLow histogramHigh shadow highlight block minimum threshold profile view opacity scoreField scoreView scoreThreshold','local','Existing ELA draft/retained energy interaction owns this control.',{existing:true,final:id==='ela.classic'?'native':'view'});
set('jpeg.multiple','jpegMethod','explicit','Select the native stored-DCT or101-quality recompression operation, then calculate once without a scientific proxy.',{final:'native'});
// UI-only extras are documented separately from scientific params.
for(const id of Object.keys(toolCatalog))set(id,'backend model reference database training mask regions exclusions','explicit','Source, backend, geometry and model changes are explicit native task choices.');

export const SSG_RETAINED_LOCALIZATION_FIELDS=Object.freeze(['maskThreshold','minimumArea','ssimRadius','ssimOpening','roiRadius']);
const SSG_LOCALIZATION=rule('retained','Sample retained native SSIM/ROI on a provisional coarse display; exact per-group native localization runs on release without a new detector or matcher.',{strategy:'ssg-localization',targetMs:50,final:'retained-native'});
// These classical paths already memoize exact native features, matches, groups
// and geometry. Commit the current complete task; a changed scientific matcher
// must never repaint old groups or use a sampled detector as a surrogate.
const CLASSICAL_NATIVE_METHODS=new Set(['SIFT','RootSIFT','AKAZE','BRISK','ORB','SIFT + G2NN + RANSAC']);
const CLASSICAL_NATIVE_FIELDS=new Set(['limit','radius','minimum','threshold','tolerance','model','geometricThreshold','geometricMinimum','compare','reflections','autoRadius','compact','independent']);
const CLASSICAL_NATIVE_COMMIT=rule('explicit','Recalculate exact native classical descriptors/matching/geometry on commit, reusing eligible native cache stages without a scientific proxy.',{strategy:'classical-native-commit',final:'native'});
export function parameterPreviewPolicy(toolId,key,params){
 if(toolId==='tampering.copyMove.sparse'&&CLASSICAL_NATIVE_METHODS.has(params?.algorithm)&&CLASSICAL_NATIVE_FIELDS.has(key))return CLASSICAL_NATIVE_COMMIT;
 if(toolId==='tampering.copyMove.sparse'&&params?.algorithm==='SSG'&&SSG_RETAINED_LOCALIZATION_FIELDS.includes(key))return SSG_LOCALIZATION;
 const alias=key.startsWith('view.')&&toolId==='tampering.copyMove.sparse'?'sparseView.'+key.slice(5):key==='view.mode'?toolId==='ai.clones.d2prl'?'neuralView':toolId.startsWith('ai.sources.')||toolId.startsWith('ai.localization.')?'researchView':'view':key;
 if(key==='equalization'&&toolId!=='colors.pca')return rule('pixel-proxy','Bounded equalization draft; the final uses the complete admitted native display domain.',{final:'native'});
 const policy=rules.get(toolId+'\0'+alias)??(toolCatalog[toolId]?EXPLICIT:NONE);
 if(toolId==='tampering.copyMove.sparse'&&policy.strategy==='clones'&&(['view.maxBiomeArea','sparseView.maxBiomeArea','view.circleScale','sparseView.circleScale','view.clipLinesToCircles','sparseView.clipLinesToCircles','view.biomeMethod','sparseView.biomeMethod'].includes(key)||!CLASSICAL_NATIVE_METHODS.has(params?.algorithm)))return Object.freeze({...policy,nativeBasis:'required',nativeBasisMutableParams:[]});
 return policy;
}
// A retained presentation/grouping cannot authorize new model work. Its basis
// includes the actual source domain and every unchanged scientific parameter;
// only the policy's declared post-processing fields may vary.
export function retainedNativeBasisStatus(policy,client,task){
 const modeBasis=task?.operation==='tampering.copyMove.sparse'&&policy?.kind==='retained';
 if(policy?.nativeBasis!=='required'&&!modeBasis)return{required:false,available:true};
 const source=client?.source,result=client?.result;
 const absent=reason=>({required:true,available:false,reason});
 if(!source||!result)return absent(!source?'source-unavailable':'result-unavailable');
 if(!task)return{required:true,available:true};
 if(result.operation!==task.operation)return absent('operation-changed');
 if(modeBasis){
  const requested=task.cloneWindowMode??'independent',claims=[result.cloneWindowMode,result.provenance?.cloneWindowMode].filter(value=>value!==undefined);
  if(!['independent','global'].includes(requested)||!claims.length||claims.some(value=>!['independent','global'].includes(value)))return absent('clone-window-mode-unverified');
  if(claims.some(value=>value!==claims[0]))return absent('clone-window-mode-contradictory');
  if(claims[0]!==requested)return absent('clone-window-mode-changed');
 }
 // Classical retained views and SSG localization retain their existing native
 // parameter/cache checks; only the new orchestration mode is guarded here.
 if(policy?.nativeBasis!=='required')return{required:true,available:true};
 const priorSha=result.sourceRegionDomain?.sourceSha256??result.provenance?.originalSha256??result.provenance?.sourceSha256;
 if(priorSha&&source.sha256&&priorSha!==source.sha256)return absent('source-changed');
 if((result.sourceRegionDomain?.fingerprint??null)!==(task.sourceRegionDomain?.fingerprint??null))return absent('domain-changed');
 if(task.params?.algorithm==='EfficientLoFTR'&&JSON.stringify(task.efficientLoFtrComparison??null)!==JSON.stringify(result.provenance?.efficientLoFtrComparison??null))return absent('comparison-role-geometry-changed');
 // D2's public params omit the localized scientific scope. Its complete
 // source/domain/backend/window/scope key is checked by the cache-only client
 // transaction, then by the native refilter endpoint; neither can infer.
 if(policy.strategy==='d2prl-refilter')return result.operation==='ai.clones.d2prl'?{required:true,available:true}:absent('operation-changed');
 const denseOriginal=task.operation==='tampering.copyMove.dense'&&task.sourceRegionDomain&&result.provenance?.sourceRegionDomain?.fingerprint===task.sourceRegionDomain.fingerprint?result.provenance.sourceRegionOriginalParams:null;
 const mutable=policy.nativeBasisMutableParams??[],prior=denseOriginal??result.provenance?.params??result.data?.params??{};
 for(const[key,value]of Object.entries(task.params??{})){
  // The hidden UI value selects the already loaded default median handle.
  // No other model identifier is an alias, and native model changes stay strict.
  const medianAlias=task.operation==='various.median'&&key==='modelId'&&value===''&&prior[key]==='median-model';
  if(!mutable.includes(key)&&!medianAlias&&(!Object.hasOwn(prior,key)||JSON.stringify(value)!==JSON.stringify(prior[key])))return absent('scientific-parameters-changed');
 }
 return{required:true,available:true};
}
export function parameterPreviewInventory(){return [...rules].map(([identity,policy])=>{const[toolId,key]=identity.split('\0');return {toolId,key,...policy};});}
export const PARAMETER_PREVIEW_KINDS=Object.freeze(['pixel-proxy','retained','local','explicit','none']);
