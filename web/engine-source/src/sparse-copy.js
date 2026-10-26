import {retireCompositeOwners} from './composite-owner-release.js';
import {EfficientLoFtrEngine} from './efficient-loftr.js';
import {efficientLoFtrParams} from './efficient-loftr-input.js';
import {ssgFullParams} from './ssg-full-input.js';
import {sparseStageCache} from './sparse-stage-cache.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {SparseGlueEngine} from './sparse-glue.js';
import {LearnedFeatureEngine} from './learned-feature.js';
import {SparseFeatureEngine} from './sparse-extract.js';
import {TextRegionEngine} from './text-ocr.js';
import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {detectPanels} from './auto-zones.js';
import {copyDistancePolicy,compactCopyAxes,enclosingCopyRegions} from './copy-policy.js';
import {spatialCopyMatches,normalizeSiftDescriptors} from './copy-spatial.js';
import {siftG2nnMatch} from './sift-g2nn.js';
import {pairedBiomes} from './copy-biomes.js';
import {verifyCopyGeometry,filterSiftModels,rejectSelfCopies,createGeometryKernel} from './copy-geometry.js';
import {copyPalette,refineCopyBiomes} from './copy-subbiomes.js';
const CLASSIC='SIFT + G2NN + RANSAC',PANELS=CLASSIC+' + Panels + Text';
export const SPARSE_COPY_ALGORITHMS=Object.freeze(['SIFT','RootSIFT','AKAZE','BRISK','ORB','XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue',CLASSIC,PANELS,'EfficientLoFTR','SSG']);
const implemented=[...SPARSE_COPY_ALGORITHMS];
export function sparseCopyParams(input={}){
 if(input.algorithm==='EfficientLoFTR')return efficientLoFtrParams(input);
 if(input.algorithm==='SSG')return ssgFullParams(input);
 const p={algorithm:CLASSIC,limit:6000,radius:600,minimum:5,threshold:.7,tolerance:50,model:'Affine',geometricThreshold:3,geometricMinimum:24,regions:[],excluded:[],compare:false,reflections:false,autoRadius:false,compact:false,guides:[],independent:true,...input};
 requireValue(SPARSE_COPY_ALGORITHMS.includes(p.algorithm)&&Number.isInteger(p.limit)&&p.limit>=100&&p.limit<=20000,'Invalid sparse algorithm or point count.');
 for(const key of ['radius','minimum','threshold','tolerance','geometricThreshold'])requireValue(Number.isFinite(p[key]),'Nonfinite sparse parameter.');
 requireValue(p.radius>0&&p.minimum>=0&&p.minimum<=p.radius&&p.threshold>0&&p.threshold<=1&&p.tolerance>0&&p.geometricThreshold>0&&['None','Similarity','Affine','Homography'].includes(p.model)&&Number.isInteger(p.geometricMinimum)&&p.geometricMinimum>=4,'Invalid sparse distances or geometry.');
 for(const key of ['compare','reflections','autoRadius','compact','independent'])requireValue(typeof p[key]==='boolean','Invalid sparse switch.');
 for(const name of ['regions','excluded','guides'])requireValue(Array.isArray(p[name])&&p[name].every(poly=>Array.isArray(poly)&&poly.length>=3&&poly.every(xy=>Array.isArray(xy)&&xy.length===2&&xy.every(x=>Number.isFinite(x)&&Math.abs(x)<=2**30))),'Invalid sparse polygons.');
 requireValue(!p.compare||p.regions.length===2,'Compare requires two regions.');
 requireValue(!p.reflections||p.algorithm===PANELS,'The reflected sparse pass belongs to Panels + Text.');
 return p;
}
const payloadBytes=value=>ArrayBuffer.isView(value)?value.byteLength:typeof value==='string'?value.length*2:!value||typeof value!=='object'?8:Object.values(value).reduce((n,v)=>n+payloadBytes(v)+32,64);
let nextId=0;
// Internal complete classical pipeline. Only ORB/AKAZE extraction currently has
// exact image evidence; unresolved numerical profiles remain explicit in output.
export class SparseCopyEngine{
 constructor(image,budget,profile){this.image=image;this.budget=budget;this.profile=profile;this.features=new SparseFeatureEngine(budget,profile);this.learned=new LearnedFeatureEngine(budget,profile);this.glue=new SparseGlueEngine(budget,profile);this.ocr=new TextRegionEngine(budget,profile);this.prefix='m3-sparse-'+(++nextId)+'/';this.running=false;this.disposed=false;this.lifetime=new AbortController();this.counts={detections:0,matchings:0,groupings:0,ocr:0};this.fitInputs=new WeakMap();this.nextFitInput=0;}
 clearCheckpoint(key){return this.features.clearCheckpoint?.(key);}
 dispose(){
  this.disposed=true;this.lifetime.abort();if(this.disposal)return this.disposal;
  const call=retire=>{try{return Promise.resolve(retire());}catch(error){return Promise.reject(error);}},pending=[()=>this.efficient?.dispose(),()=>this.ssg?.dispose(),()=>this.features.dispose(),()=>this.learned.dispose(),()=>this.glue.dispose(),()=>this.ocr.dispose(),()=>this.finished].map(call);
  this.disposal=(async()=>{const outcomes=await Promise.allSettled(pending);await retireCompositeOwners(outcomes.map(outcome=>()=>{if(outcome.status==='rejected')throw outcome.reason;}));this.budget.clearPrefix(this.prefix);})().finally(()=>{this.disposal=undefined;});return this.disposal;
 }
 async localizeRetained(input={},hooks={}){
  if(this.running||this.disposed||!this.image||input.algorithm!=='SSG'||!this.ssg)return null;
  const signal=hooks.signal?AbortSignal.any([hooks.signal,this.lifetime.signal]):this.lifetime.signal;checkAbort(signal);this.running=true;let finish;this.finished=new Promise(resolve=>finish=resolve);
  try{this.ssg.image=this.image;return await this.ssg.localizeRetained(input,{...hooks,signal});}finally{this.running=false;finish();}
 }
 async analyze(input={},hooks={}){
  if(input.algorithm==='SSG'){
   requireValue(!this.running&&!this.disposed,'Sparse engine busy or disposed.');
   const signal=hooks.signal?AbortSignal.any([hooks.signal,this.lifetime.signal]):this.lifetime.signal;checkAbort(signal);
   this.running=true;let finish;this.finished=new Promise(resolve=>{finish=resolve;});
   try{const {SsgFullEngine}=await import('./ssg-full.js');checkAbort(signal);this.ssg??=new SsgFullEngine(this.image,this.budget,this.profile);this.ssg.image=this.image;return await this.ssg.analyze(input,{...hooks,signal});}
   finally{this.running=false;finish();}
  }
  if(input.algorithm==='EfficientLoFTR'){
   requireValue(!this.running&&!this.disposed,'Sparse engine busy or disposed.');
   const signal=hooks.signal?AbortSignal.any([hooks.signal,this.lifetime.signal]):this.lifetime.signal;checkAbort(signal);
   this.running=true;let finish;this.finished=new Promise(resolve=>{finish=resolve;});
   try{this.efficient??=new EfficientLoFtrEngine(this.image,this.budget,this.profile);this.efficient.image=this.image;return await this.efficient.analyze(input,{...hooks,signal});}
   finally{this.running=false;finish();}
  }
  const p=sparseCopyParams(input),{onProgress,language}=hooks,signal=hooks.signal?AbortSignal.any([hooks.signal,this.lifetime.signal]):this.lifetime.signal;
  requireValue(!this.running&&!this.disposed,'Sparse engine busy or disposed.');
  if(!implemented.includes(p.algorithm))throw new EngineError('UNSUPPORTED_OPERATION','This learned sparse variant is not yet ported; no substitute is selected.');
  checkAbort(signal);this.running=true;let finish;this.finished=new Promise(resolve=>{finish=resolve;});const releases=[],admit=n=>{const free=this.budget.reserve(n);releases.push(free);return free;},stageCache={};let kernel,progress=0,freeUnreturned;
  const report=(phase,fraction,detail={})=>{if(detail.phase?.startsWith('resource-')){onProgress?.(detail);return;}progress=Math.max(progress,fraction);const {phase:ignoredPhase,fraction:ignoredFraction,...counts}=detail;onProgress?.({...counts,phase,fraction:progress});};
  const cache=sparseStageCache(this.budget,this.prefix,{signal,byteLength:payloadBytes,hits:stageCache}),memo=(name,compute)=>cache.memo(name,compute);
  const geometry=async()=>kernel??=await createGeometryKernel({signal,reserveMemory:admit});
  try{
   let regions=p.regions,excluded=p.excluded,preprocessing=null;const scope=hooks.scientificScope,acquisitionsOnly=scope?.nativePreparation==='acquisitions-only'&&!!scope.nativeSourceRegions;
   if(scope){
    compileForgeryscopeScientificScope(scope,{width:this.image.width,height:this.image.height,sourceSha256:hooks.sourceSha256});
    requireValue(scope.status==='ready'&&(acquisitionsOnly||scope.text?.status==='complete')&&scope.regions.length>0,'Scientific preparation is incomplete; whole-image fallback is forbidden.');
    regions=p.regions=(scope.searchRegions??scope.regions).map(r=>r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]]);excluded=p.excluded=scope.excluded;
    if(!acquisitionsOnly)preprocessing={version:3,reflections:p.reflections,automatic_panels:false,panels:regions,envelope:null,text_engine:scope.text.metadata?.model?.id??'PP-OCRv6_small_det',text_exclusions:scope.text.polygons??[],graph_exclusion:true,scientific_scope:{schema:scope.schema,fingerprint:scope.fingerprint,models:scope.models,coordinates:scope.coordinates,policy:'original-pixel feature exclusions; no source painting'},ocr:scope.text.metadata};
   }
   if(p.algorithm===PANELS&&(!scope||acquisitionsOnly)){
    if(hooks.strictPanelsPreparation){
     const receipt=hooks.strictPanelsPreparation;
     requireValue(receipt.status==='ok'||receipt.status==='no-regions','Strict Panels preparation is incomplete.');
     if(receipt.status==='no-regions'){const value={status:'no-regions',regions:[],preprocessing:receipt.preprocessing},free=this.budget.reserve(payloadBytes(value));try{const copy=structuredClone(value);return{...copy,release:free};}catch(error){free();throw error;}}
     regions=receipt.regions;excluded=receipt.excluded;preprocessing=receipt.preprocessing;
    }else{
    const auto=!regions.length&&!p.compare;let panels=[],envelope=null;
    if(auto){panels=await memo('panels',()=>detectPanels(this.image,{signal,account:admit,onProgress:f=>report('panels',f*.04)}));envelope=enclosingCopyRegions(panels);if(!panels.length){report('no-regions',1);return {status:'no-regions',regions:[],preprocessing:{automatic_panels:true,panels:[],envelope:null},release(){}};}regions=[...panels];if(!regions.some(poly=>JSON.stringify(poly)===JSON.stringify(envelope)))regions.push(envelope);}
    requireValue(language?.data instanceof Uint8Array&&typeof language.sha256==='string','Panels + Text requires explicit verified English OCR weights.');
    const text=await memo('text/'+language.sha256,async()=>{this.counts.ocr++;const result=await this.ocr.detect(this.image,{language,signal,onProgress:e=>report('ocr',.04+e.fraction*.06,e)});let transferred=false;try{const value={boxes:result.boxes,polygons:result.polygons,metadata:result.metadata};result.release();transferred=true;admit(payloadBytes(value));return value;}finally{if(!transferred)result.release();}});
    excluded=[...excluded,...text.polygons];preprocessing={version:2,reflections:p.reflections,implementation:'SHERLOQ alternative, not the luc_pub competition ensemble',automatic_panels:auto,panels,envelope,text_engine:'Tesseract / eng / PSM 11',text_boxes:text.boxes,text_exclusions:text.polygons,graph_exclusion:false,ocr:text.metadata};
   }
   }
   const glue=p.algorithm.includes('LightGlue')||p.algorithm.includes('LighterGlue'),glueKind=p.algorithm.startsWith('XFeat')?'xfeat':p.algorithm.startsWith('SIFT')?'sift':'aliked',glueModel=hooks.models?.[glueKind+'-glue-paged']??hooks.models?.[glueKind+'-glue'],matchingIdentity=glue?[hooks.backend??'auto',glueModel?.sha256]:null;
   const g2nn=p.algorithm===CLASSIC||p.algorithm===PANELS,family=g2nn?'SIFT-G2NN':p.algorithm==='SIFT + LightGlue'?'SIFT-LightGlue':p.algorithm==='RootSIFT'?'SIFT':p.algorithm.replace(' + LightGlue','').replace(' + LighterGlue',''),independent=g2nn&&(p.algorithm===PANELS||p.independent),policy=copyDistancePolicy(p,regions),axes=compactCopyAxes(this.image.width,this.image.height,p.compact&&!p.compare?p.guides:[],{reserveMemory:admit});
   const learned=['XFeat','ALIKED','ALIKED rotation'].includes(family),featureModel=family==='XFeat'?(hooks.models?.['xfeat-paged']??hooks.models?.xfeat):hooks.models?.[family==='ALIKED rotation'?'aliked-n16rot':'aliked-n16'],featureIdentityBase=learned?[hooks.backend??'auto',family==='XFeat'?featureModel?.sha256:Object.entries(featureModel?.graphs??{}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,v.sha256])]:family.startsWith('SIFT')?[hooks.backend??'auto']:null,featureIdentity=hooks.sourceContextFingerprint===undefined?featureIdentityBase:[featureIdentityBase,hooks.sourceContextFingerprint];
   const extract=async reflected=>memo('features/'+JSON.stringify([family, featureIdentity,p.limit,regions,excluded,independent,reflected]),async()=>{this.counts.detections++;const r=await (learned?this.learned:this.features).extract(this.image,{model:featureModel,backend:hooks.backend??'auto',storageContext:hooks.storageContext,checkpointKey:hooks.checkpointKey,family,limit:p.limit,regions,excluded,independent,reflected,signal,onProgress:e=>report(reflected?'reflection-extraction':'extracting',reflected ? .56+e.fraction*.14:.1+e.fraction*.25,e)});let transferred=false;try{const {release,transferBacking,reservedBytes,...value}=r;if(transferBacking){cache.adopt(value,transferBacking());releases.push(release);transferred=true;admit(Math.max(0,payloadBytes(value)-(reservedBytes??0)));}else{r.release();transferred=true;admit(payloadBytes(value));}return value;}finally{if(!transferred)r.release();}});
   const base=await extract(false);let desc=base.descriptors;
   if(p.algorithm==='XFeat'&&base.points.length<=100*7)this.lastNativeDistanceMetrics=null;
   if(family==='SIFT')desc=await memo('normalized/'+JSON.stringify([p.algorithm,featureIdentity,matchingIdentity,p.limit,regions,excluded]),()=>normalizeSiftDescriptors(desc,p.algorithm==='RootSIFT',{signal,reserveMemory:admit}));
   const match=async(features,descriptors,variants,phase,low,high)=>memo('matches/'+JSON.stringify([p.algorithm,featureIdentity,matchingIdentity,p.limit,regions,excluded,independent,policy,p.minimum,p.threshold,p.compare,p.compact,p.guides,!!variants]),async()=>{this.counts.matchings++;const settings={...features,descriptors,...policy,minimum:p.minimum,ratio:p.threshold,threshold:p.threshold,binary:['ORB','AKAZE','BRISK'].includes(family),compare:p.compare,axes,variants};const control={signal,reserveMemory:admit,backend:hooks.backend??'auto',onProgress:f=>report(phase,low+(high-low)*f)};if(p.algorithm==='XFeat'&&!settings.binary&&settings.descriptors instanceof Float32Array&&settings.points.length>100*7){const {spatialCopyMatchesInternal}=await import('./copy-spatial-private.js');const value=await spatialCopyMatchesInternal(settings,{...control,nativeDistance:true,nativeVariant:'simd-ordered'});this.lastNativeDistanceMetrics=value.nativeDistanceMetrics;return value;}
   return glue?this.glue.match(settings,{...control,kind:glueKind,model:glueModel,backend:hooks.backend??'auto',imageSize:[this.image.width,this.image.height]}):(g2nn?siftG2nnMatch:spatialCopyMatches)(settings,control);});
   const matched=await match(base,desc,null,'matching',.35,p.reflections ? .48 : .78);
   const groupAndFit=async(features,matched,reflection)=>{
    const groupStart=reflection?.86:p.reflections?.48:.79,groupSpan=reflection?.1:p.reflections?.06:.1;
    report(reflection?'reflection-grouping':'grouping',groupStart);
    const grouped=await memo('groups/'+JSON.stringify([p.algorithm,featureIdentity,matchingIdentity,p.limit,regions,excluded,independent,policy,p.minimum,p.threshold,p.compare,p.compact,p.guides,reflection,p.tolerance]),async()=>{this.counts.groupings++;return pairedBiomes(features.points,matched.pairs,p.tolerance,{signal,reserveMemory:admit,pairSearchRegions:matched.pairSearchRegions,onProgress:f=>report(reflection?'reflection-grouping':'grouping',groupStart+f*groupSpan*.25)});});
    const model=reflection&&p.model==='None'?'Affine':p.model;
    report(reflection?'reflection-geometry':'fitting',groupStart+groupSpan*.3);
    const fit=async()=>{
     let verified=await verifyCopyGeometry(features.points,matched.pairs,grouped,{model,threshold:p.geometricThreshold,minimum:p.geometricMinimum,reflection,signal,reserveMemory:admit,kernel:model==='None'?null:await geometry(),onProgress:f=>report(reflection?'reflection-geometry':'fitting',groupStart+groupSpan*(.3+.7*f))});
     if(g2nn&&model!=='None')verified=filterSiftModels(verified.groups,verified.models);
     if(reflection){const selected=verified.models.map((m,i)=>m.matrix[0][0]*m.matrix[1][1]-m.matrix[0][1]*m.matrix[1][0]<0?i:-1).filter(i=>i>=0);verified={groups:selected.map(i=>verified.groups[i]),models:selected.map(i=>({...verified.models[i],variant:'reflection'}))};}
     return verified;
    };
    // The immutable image owner already namespaces feature/match/group stages.
    // Keep every geometric input and verified source/scope identity in this key;
    // callers without a source digest retain the existing uncached fit path.
    if(model==='None'||typeof hooks.sourceSha256!=='string'||!/^[a-f0-9]{64}$/i.test(hooks.sourceSha256))return fit();
    // Stage buffers are immutable and private; identity changes on eviction or
    // recomputation, even if the requested backend still says "auto". Never
    // reuse an old fit against newly materialized coordinates or group rows.
    const inputId=value=>{let id=this.fitInputs.get(value);if(id===undefined){id=++this.nextFitInput;this.fitInputs.set(value,id);}return id;};
    return memo('fits/'+JSON.stringify([inputId(features.points),inputId(matched.pairs),inputId(grouped),hooks.sourceSha256,this.image.width,this.image.height,scope?.fingerprint??null,p.algorithm,featureIdentity,matchingIdentity,p.limit,regions,excluded,independent,policy,p.minimum,p.threshold,p.compare,p.compact,p.guides,reflection,p.tolerance,model,p.geometricThreshold,p.geometricMinimum]),fit);
   };
   let fitted=await groupAndFit(base,matched,false),result={points:base.points,pairs:matched.pairs,pair_search_regions:matched.pairSearchRegions,...fitted,total_features:base.totalFeatures,candidate_comparisons:matched.candidateComparisons};
   report('geometry',p.reflections ? .55 : .9);
   if(p.reflections){
    const mirror=await extract(true),n=base.points.length/7,m=mirror.points.length/7;admit((n+m)*(568+base.zoneCount));
    const points=new Float64Array((n+m)*7),descriptors=new Float32Array((n+m)*128),members=new Uint8Array((n+m)*base.zoneCount),variants=new Uint8Array(n+m);points.set(base.points);points.set(mirror.points,base.points.length);descriptors.set(base.descriptors);descriptors.set(mirror.descriptors,base.descriptors.length);members.set(base.members);members.set(mirror.members,base.members.length);variants.fill(1,n);
    const features={points,descriptors,members,zoneCount:base.zoneCount,descriptorSize:128},extra=await match(features,descriptors,variants,'reflection-matching',.7,.85),fit=await groupAndFit(features,extra,true),offset=n,rows=result.pairs.length/4;
    admit(result.points.byteLength+points.byteLength+result.pairs.byteLength+extra.pairs.byteLength+(rows+extra.pairs.length/4)*8);
    const joined=new Float64Array(result.points.length+points.length),pairs=new Float64Array(result.pairs.length+extra.pairs.length),owners=new Int32Array(result.pair_search_regions.length+extra.pairSearchRegions.length);joined.set(result.points);joined.set(points,result.points.length);pairs.set(result.pairs);pairs.set(extra.pairs,result.pairs.length);for(let i=result.pairs.length;i<pairs.length;i+=4){pairs[i]+=offset;pairs[i+1]+=offset;}owners.set(result.pair_search_regions);owners.set(extra.pairSearchRegions,result.pair_search_regions.length);
    result={...result,points:joined,pairs,pair_search_regions:owners,groups:[...result.groups,...fit.groups.map(g=>Uint32Array.from(g,i=>i+rows))],models:[...(result.models.length?result.models:Array(result.groups.length).fill(null)),...fit.models.map(model=>({...model,source_point_indices:model.source_point_indices.map(i=>i+offset),destination_point_indices:model.destination_point_indices.map(i=>i+offset)}))],total_features:result.total_features+mirror.totalFeatures,candidate_comparisons:result.candidate_comparisons+extra.candidateComparisons,reflection_backend:'cpu'};
   }
   let rejected=[],selfFilter=null;
   if(p.algorithm===PANELS||['XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue'].includes(p.algorithm)){const accepted=await rejectSelfCopies(result.points,result.pairs,result.groups,result.models,p.minimum,{signal,reserveMemory:admit,kernel:await geometry()});result={...result,groups:accepted.groups,models:accepted.models};rejected=accepted.rejected;selfFilter={maximum_overlap:.8,metric:'intersection_over_smaller_hull',minimum_model_displacement_px:p.minimum};}
   let colors=copyPalette(result.groups,result.pairs,p.threshold,{reserveMemory:admit}),partitions=[];
   if(p.algorithm===PANELS){const refined=await refineCopyBiomes(result.points,result.pairs,result.groups,result.models,colors.colors,colors.bases,p.tolerance,{signal,reserveMemory:admit,pairSearchRegions:result.pair_search_regions});result={...result,groups:refined.groups,models:refined.models};colors={colors:refined.colors,bases:refined.bases};partitions=refined.provenance;}
   const output={status:'ok',...result,...colors,biome_partitions:partitions,params:p,regions,compare:p.compare,backend:base.metadata.provider==='webgpu'||matched.backend==='hybrid'?'hybrid':'cpu',feature_policy:independent?'independent_roi_v2':'global',distance_policy:{radii:policy.radii,comparison_radius:policy.radius,gap:policy.gap,compact_guides:p.compact&&!p.compare?p.guides:[]},preprocessing,self_match_filter:selfFilter,rejected_biomes:rejected,metadata:{extraction:base.metadata,matching:matched.metadata,stageCache,counts:{...this.counts},preflightExecutions:0,coordinates:'original-pixel-centres',colorOrder:'BGR',qualification:'native-comparisons-documented'}};
   const bytes=payloadBytes(output);freeUnreturned=this.budget.reserve(bytes);const owned=structuredClone(output),freeOutput=freeUnreturned;let released=false;checkAbort(signal);report('complete',1);checkAbort(signal);freeUnreturned=null;
   return {...owned,release(){if(!released){released=true;freeOutput();}}};
  }finally{freeUnreturned?.();kernel?.dispose();releases.forEach(f=>f());cache.finish({publish:!this.disposed});this.running=false;finish();}
 }
}
