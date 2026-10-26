import {efficientLoFtrDeclaredAcquisitions} from './efficient-loftr-comparison-ui.js?v=0.25.0';
import {declaredCloneScopeRegions} from './unified-engine/src/clone-scope-declarations.js';
import {EngineError,requireValue} from './unified-engine/src/errors.js';
import {compileForgeryscopeScientificScope} from './unified-engine/src/forgeryscope-scientific-scope.js';
import {composeScientificScope,scopeFingerprint,SCIENTIFIC_SCOPE_POLICY} from './batch-scientific-preparation.js?v=0.25.0';
import {clipPolygon,rectanglePolygon,rectangleComplement,scientificScopeEnvelope} from './batch-scope-geometry.js?v=0.25.0';

const copy=value=>structuredClone(value),key=JSON.stringify,hash=/^[a-f0-9]{64}$/;
const acquisitions=new Map([['Microscopy','microscopy'],['Blots','gel'],['Body Imaging','photography']]);
const graphs=new Set(['Graphs','Flow Cytometry']);
function validateImage(image){requireValue([image?.width,image?.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=131072)&&hash.test(image.sourceSha256??''),'Original individual image dimensions and SHA256 required');}
function geometry(value,image,index){
 const box=value?.bounds??[value?.x0,value?.y0,value?.x1,value?.y1];
 requireValue(Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]<=image.width&&box[3]<=image.height&&box[2]>box[0]&&box[3]>box[1],'Individual rectangle must use original image bounds');
 const r={x0:box[0],y0:box[1],x1:box[2],y1:box[3]},polygon=copy(value.polygon??rectanglePolygon(r));
 requireValue(key(clipPolygon(polygon,image.width,image.height))===key(polygon)&&polygon.every(([x,y])=>x>=r.x0&&x<=r.x1&&y>=r.y0&&y<=r.y1),'Individual polygon differs from its original rectangle');
 const detection=value.detection;
 if(detection)requireValue(detection.sourceSha256===image.sourceSha256&&detection.width===image.width&&detection.height===image.height&&detection.coordinates==='original-pixels','Individual detector provenance belongs to another source');
 return {...copy(value),...r,polygon,zoneId:value.zoneId??value.id??'individual-region-'+index};
}
function unique(polygons){return [...new Map(polygons.map(p=>[key(p),p])).values()];}
function samePolygon(a,b){
 if(!Array.isArray(a)||a.length!==b.length||a.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return false;
 return b.some((_,start)=>[1,-1].some(direction=>a.every((p,i)=>{const q=b[(start+direction*i+b.length)%b.length];return p[0]===q[0]&&p[1]===q[1];})));
}
function comparisonRegions(params,scope){
 const pair=params.regions,positives=params.algorithm==='EfficientLoFTR'
  ?efficientLoFtrDeclaredAcquisitions(individualScopeRectangles(scope)).filter(r=>!r.envelope).map(r=>r.polygon)
  :scope.regions.filter(r=>!r.envelope).map(r=>r.polygon??rectanglePolygon(r));
 const members=Array.isArray(pair)&&pair.length===2?pair.map(p=>positives.findIndex(r=>samePolygon(p,r))):[];
 if(members.length!==2||members.some(index=>index<0)||members[0]===members[1])throw new EngineError('SCIENTIFIC_SCOPE_PAIR_REQUIRED','La comparaison exige deux acquisitions distinctes choisies dans les zones individuelles, sans enveloppe.',{details:{suppliedRegions:Array.isArray(pair)?pair.length:null,acquisitions:positives.length}});
 return pair;
}

/** Geometric selection and modern classifiers share one original pixel plane.
 * The envelope is a search job, never acquisition membership. No implicit
 * full-image fallback is synthesized when a detector or OCR has failed.
 */
export async function createIndividualScientificScope(image,{rectangles=[],prepared,excludeTexts=true,includeEnvelope=true,manualFullSource=false}={}){
 validateImage(image);requireValue(Array.isArray(rectangles)&&rectangles.length<=256&&[excludeTexts,includeEnvelope,manualFullSource].every(v=>typeof v==='boolean'),'Explicit individual scope options required');
 if(prepared)requireValue(prepared.width===image.width&&prepared.height===image.height&&prepared.sourceSha256===image.sourceSha256,'Modern individual preparation belongs to another original source');
 const sourceRegionCeiling=image.sourceRegionCeiling??image.preparation?.sourceRegionCeiling??image.preparation?.originalSourceRegions;
 const inputRects=rectangles.map((r,i)=>geometry(r,image,i)),positives=inputRects.filter(r=>!r.envelope&&r.kind!=='exclusion'),explicit=inputRects.filter(r=>r.kind==='exclusion');
 const originalPrepared=prepared?copy(prepared):null;
 let text;
 if(!prepared&&manualFullSource)text={status:'complete',polygons:[],detections:[],warnings:[],skipped:true,automatic:false,reason:'Explicit manual full-source selection without automatic OCR'};
 else if(!excludeTexts)text={...(prepared?.text??{}),status:'complete',polygons:[],detections:[],warnings:[],disabled:true,automatic:false,rawDetection:copy(prepared?.text??null),reason:'Text exclusions explicitly disabled by the user'};
 else text=copy(prepared?.text??{status:'unavailable',polygons:[],detections:[],warnings:[]});
 const metadata={...(prepared??{}),width:image.width,height:image.height,sourceSha256:image.sourceSha256,text,panels:copy(prepared?.panels??{panels:[],status:'unavailable'})};
 const classified=composeScientificScope(image,metadata);
 let regions=positives.map(r=>({...r,envelope:false,type:r.type??'unknown',label:r.label??'Geometric panel',selectionSource:r.manual?'human':'subimages.detect'}));
 if(!regions.length)regions=classified.regions.map((r,i)=>({...r,zoneId:r.zoneId??'individual-classifier-'+i,selectionSource:'modern-classifier'}));
 if(!regions.length&&manualFullSource){const r={x0:0,y0:0,x1:image.width,y1:image.height};regions=[{...r,polygon:rectanglePolygon(r),zoneId:'individual-manual-source',type:'unknown',label:'Manual acquisition',manual:true,selectionSource:'explicit-manual-full-source'}];}
 const graphPanels=(metadata.panels?.panels??[]).filter(p=>p.policyHint==='non-acquisition'||graphs.has(p.label)),graphPolys=graphPanels.map(p=>clipPolygon(rectanglePolygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]}),image.width,image.height)).filter(p=>p.length);
 // Remove known all-graph rectangles before creating neural jobs. Partial
 // polygons remain explicit masks; manual editing can override them visibly.
 const cancelled=regions.filter(r=>graphPanels.some(p=>p.rectangle[0]<=r.x0&&p.rectangle[1]<=r.y0&&p.rectangle[2]>=r.x1&&p.rectangle[3]>=r.y1));
 regions=regions.filter(r=>!cancelled.includes(r));
 for(const r of regions)if(r.type==='unknown'){
  const panel=(metadata.panels?.panels??[]).find(p=>acquisitions.has(p.label)&&p.rectangle[0]<=r.x0&&p.rectangle[1]<=r.y0&&p.rectangle[2]>=r.x1&&p.rectangle[3]>=r.y1);if(panel){r.type=acquisitions.get(panel.label);r.label=panel.label;}
 }
 // A caller's old envelope is not an acquisition or a new detector input.
 // Derive the current native crop from real regions minus current exclusions.
 const excluded=unique([...(excludeTexts?text.polygons??[]:[]),...graphPolys,...explicit.map(r=>r.polygon),...rectangleComplement(regions,image.width,image.height)]),envelope=scientificScopeEnvelope({regions,excluded,width:image.width,height:image.height,sourceSha256:image.sourceSha256,...(sourceRegionCeiling?{sourceRegionCeiling}:{})});
 const searchRegions=regions.map(copy);
 if(includeEnvelope&&regions.length>1&&envelope&&!regions.some(r=>samePolygon(r.polygon??rectanglePolygon(r),envelope.polygon)))searchRegions.push({...envelope,zoneId:'individual-envelope',role:'cross-panel-search'});
 const warnings=(classified.warnings??[]).filter(w=>w.code!=='NO_IDENTIFIED_ACQUISITION');if(!regions.length)warnings.push({code:'NO_IDENTIFIED_ACQUISITION',message:'Aucune acquisition définie ; choisissez ses zones explicitement.'});
 const types=new Set(regions.map(r=>r.type)),scope={...classified,...SCIENTIFIC_SCOPE_POLICY,version:'individual-preparation-1',regions,searchRegions,envelope,excluded,...(sourceRegionCeiling?{sourceRegionCeiling:copy(sourceRegionCeiling)}:{}),status:warnings.length?'needs-review':'ready',warnings,family:types.size===1?[...types][0]:types.size?'mixed':'unknown',individual:{schema:'sherloq.individual-scientific-scope/1',includeEnvelope,excludeTexts,manualFullSource,geometricRectangles:copy(inputRects),cancelledRegions:cancelled.map(r=>({zoneId:r.zoneId,reason:'fully-covered-by-non-acquisition',bounds:[r.x0,r.y0,r.x1,r.y1]})),preparedSource:originalPrepared?'modern-source-bound-preparation':'manual-or-unavailable',originalPixelsPreserved:true},coverage:{acquisitions:positives.length?'geometric-selection':regions.some(r=>r.manual)?'explicit-manual-selection':'modern-classifier',undetectedAreas:'excluded-unclassified',exhaustive:false}};
 scope.fingerprint=await scopeFingerprint(scope);compileForgeryscopeScientificScope(scope,image);return scope;
}

export function individualScopeRectangles(scope){
 compileForgeryscopeScientificScope(scope,{width:scope.width,height:scope.height,sourceSha256:scope.sourceSha256});
 const integer=r=>({x0:Math.max(0,Math.floor(r.x0)),y0:Math.max(0,Math.floor(r.y0)),x1:Math.min(scope.width,Math.ceil(r.x1)),y1:Math.min(scope.height,Math.ceil(r.y1))});
 const positives=scope.regions.filter(r=>!r.envelope&&r.enabled!==false).map((r,i)=>({...integer(r),kind:'acquisition',zoneId:r.zoneId??'individual-region-'+i,polygon:copy(r.polygon??rectanglePolygon(r)),originalGeometry:copy(r),...(r.type?{type:r.type}:{})}));
 const frame=scientificScopeEnvelope(scope),envelopes=scope.individual?.includeEnvelope===false||!frame||positives.length<2||scope.regions.some(r=>samePolygon(r.polygon??rectanglePolygon(r),frame.polygon))?[]:[{...integer(frame),kind:'envelope',zoneId:'individual-envelope',polygon:copy(frame.polygon),envelope:true,derived:true,originalGeometry:copy(frame)}];
 const excluded=scope.excluded.map((polygon,i)=>{const r={x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1]))};return {...integer(r),kind:'exclusion',zoneId:'individual-exclusion-'+i,polygon:copy(polygon),originalGeometry:{...r,polygon:copy(polygon)}};});
 return [...positives,...envelopes,...excluded];
}

/** Return a task copy without injecting algorithm/display defaults. The
 * individual global envelope is explicit, distinct from batch acquisition jobs.
 */
export function scopeIndividualTask(task,scope){
 compileForgeryscopeScientificScope(scope,{width:scope.width,height:scope.height,sourceSha256:scope.sourceSha256});
 if(scope.status!=='ready'||scope.text?.status!=='complete'||!scope.regions.length||!hash.test(scope.fingerprint??''))throw new EngineError('SCIENTIFIC_SCOPE_REQUIRED','Les zones individuelles et leurs exclusions doivent être prêtes avant le calcul.',{details:{status:scope.status,warnings:scope.warnings}});
 const out=copy(task);out.params??={};const searches=declaredCloneScopeRegions(scope),polygons=searches.map(r=>copy(r.polygon??rectanglePolygon(r)));
 // Sparse Original/local/text negatives stay in the verified scientific scope.
 // params.excluded keeps only the caller's explicit native polygon contract.
 if(out.operation==='tampering.copyMove.sparse'){out.scientificScope=copy(scope);out.params.regions=out.params.compare===true||out.params.algorithm==='EfficientLoFTR'?comparisonRegions(out.params,scope):polygons;}
 else if(out.operation==='tampering.copyMove.dense'){out.params.regions=out.params.compare===true?comparisonRegions(out.params,scope):polygons;out.scientificScope=copy(scope);}
 else if(['ai.clones.d2prl','ai.clones.segmentation'].includes(out.operation)){
  out.params.scientificScope=copy(scope);out.params.selectionPresent=true;out.regions=searches.map((r,i)=>{const b=[Math.floor(r.x0),Math.floor(r.y0),Math.ceil(r.x1),Math.ceil(r.y1)];requireValue(b[2]-b[0]>=8&&b[3]-b[1]>=8,'Individual neural search rectangle needs eight original pixels per side');return {id:r.zoneId??r.id??'individual-region-'+i,kind:r.envelope?'envelope':'region',bounds:b,...(r.envelope?{envelope:true}:{} )};});
 }else if(['m2.forgeryscope','analysis.clones','analysis.complete'].includes(out.operation))out.params.scientificScope=copy(scope);
 else throw new EngineError('SCIENTIFIC_SCOPE_UNSUPPORTED','Cet outil ne possède pas de périmètre scientifique qualifié avant son calcul.',{details:{operation:out.operation}});
 return out;
}
