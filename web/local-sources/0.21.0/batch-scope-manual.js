import {clipPolygon,rectangleComplement,rectanglePolygon} from './batch-scope-geometry.js?v=0.21.0';
import {SCIENTIFIC_SCOPE_POLICY,scopeFingerprint} from './batch-scientific-preparation.js?v=0.21.0';

export const MANUAL_SCOPE_SCHEMA='sherloq.batch-manual-scope/1';
const MAX_ZONES=8192,MAX_VERTICES=131072,MAX_ACTIONS=512;
const invalid=message=>Object.assign(Error(message),{code:'BATCH_SCOPE_EDIT_INVALID'});
const copy=value=>structuredClone(value),key=JSON.stringify;
const bounds=polygon=>({x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1]))});
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function zoneGeometry(zone){return {x0:zone.x0,y0:zone.y0,x1:zone.x1,y1:zone.y1,polygon:copy(zone.polygon)};}
function validateGeometry(geometry,width,height){
 if(!geometry||![geometry.x0,geometry.y0,geometry.x1,geometry.y1].every(Number.isFinite)||geometry.x0<0||geometry.y0<0||geometry.x1>width||geometry.y1>height||geometry.x1<=geometry.x0||geometry.y1<=geometry.y0||!Array.isArray(geometry.polygon)||geometry.polygon.length>MAX_VERTICES)throw invalid('La géométrie d’origine d’une zone est invalide.');
 const clipped=clipPolygon(geometry.polygon,width,height),b=bounds(geometry.polygon);if(!clipped.length||key(clipped)!==key(geometry.polygon)||Object.keys(b).some(k=>Math.abs(b[k]-geometry[k])>1e-7))throw invalid('La géométrie d’origine ne correspond pas à son polygone.');
}
// Each editing transaction keeps its first geometry. Old archives establish a
// baseline from their current geometry; no earlier detector output is invented.
function retainOriginalGeometry(zone,width,height){
 const geometry=zone.originalGeometry??zoneGeometry(zone);validateGeometry(geometry,width,height);
 for(const point of geometry.polygon)Object.freeze(point);Object.freeze(geometry.polygon);Object.freeze(geometry);
 Object.defineProperty(zone,'originalGeometry',{value:geometry,enumerable:true,writable:false,configurable:false});return geometry;
}
function dimensions(image){if(!Number.isSafeInteger(image?.width)||image.width<1||!Number.isSafeInteger(image.height)||image.height<1)throw invalid('Les dimensions de l’image originale sont absentes.');return {width:image.width,height:image.height};}
function identity(image){const values=[image.sourceSha256,image.preparation?.sourceSha256].filter(v=>v!==undefined&&v!==null);if(!values.length||!values.every(validHash)||values.some(v=>v!==values[0]))throw invalid('L’identité de la source originale est absente ou incohérente. Préparez l’image avant de modifier ses zones.');return values[0];}
export function normalizeScopeRectangle(value,{width,height}){
 if(!value||![value.x0,value.y0,value.x1,value.y1].every(Number.isFinite))throw invalid('Le rectangle doit contenir quatre coordonnées finies.');
 const snap=n=>Math.abs(n-Math.round(n))<1e-8?Math.round(n):n;
 const rectangle={x0:Math.max(0,Math.floor(snap(Math.min(value.x0,value.x1)))),y0:Math.max(0,Math.floor(snap(Math.min(value.y0,value.y1)))),x1:Math.min(width,Math.ceil(snap(Math.max(value.x0,value.x1)))),y1:Math.min(height,Math.ceil(snap(Math.max(value.y0,value.y1))))};
 if(rectangle.x1<=rectangle.x0||rectangle.y1<=rectangle.y0)throw invalid('La zone doit contenir au moins un pixel de l’image originale.');return rectangle;
}
function explicitExclusions(scope,width,height){
 const complement=new Set(rectangleComplement(scope.regions??[],width,height).map(key)),known=new Set([...(scope.text?.polygons??[]),...(scope.pdfText?.polygons??[]),...(scope.manual?.zones??[]).filter(z=>z.kind==='exclusion').map(z=>z.polygon),...(scope.panels?.panels??[]).filter(p=>p.policyHint==='non-acquisition'||['Graphs','Flow Cytometry'].includes(p.label)).map(p=>rectanglePolygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]}))].map(key));
 return (scope.excluded??[]).filter(p=>!complement.has(key(p))||known.has(key(p)));
}
const labelType=type=>type==='microscopy'?'Microscopy':type==='gel'?'Blots':type==='photography'?'Body Imaging':'Human acquisition';
export function createManualScopeDraft(image){
 const {width,height}=dimensions(image),sourceSha256=identity(image),scope=image.preparation??{},zones=[],seen=new Set();let serial=0;
 if(scope.manual?.schema===MANUAL_SCOPE_SCHEMA){
  const m=scope.manual;if(m.sourceSha256!==sourceSha256||m.width!==width||m.height!==height)throw invalid('Les zones manuelles ne correspondent plus à la source.');
  if(!Array.isArray(m.zones)||m.zones.length>MAX_ZONES||!Array.isArray(m.actions??[])||(m.actions??[]).length>MAX_ACTIONS)throw invalid('Les zones manuelles importées dépassent les limites de métadonnées.');
  const restored=copy(m.zones),nextId=Math.max(0,...restored.map(z=>Number(/^zone-(\d+)$/.exec(z.id)?.[1]??0)))+1;
  const draft={schema:MANUAL_SCOPE_SCHEMA,version:1,coordinates:'original-pixels',edgeConvention:'half-open-rectangles',sourceSha256,width,height,baseFingerprint:scope.fingerprint??null,baseStatus:scope.status,zones:restored,nextId,changed:false,actions:[],previousActions:copy(m.actions??[]),previousTruncatedActions:m.truncatedActions??0};validateDraft(draft);return draft;
 }
 const add=(kind,polygon,metadata={})=>{const clipped=clipPolygon(polygon,width,height);if(!clipped.length)return;const unique=kind+key(clipped);if(seen.has(unique))return;seen.add(unique);zones.push({id:'zone-'+(++serial),kind,...bounds(clipped),polygon:clipped,...metadata});};
 for(const r of scope.regions??[])add('acquisition',r.polygon??rectanglePolygon(r),{type:r.type??'microscopy',label:r.label??labelType(r.type),origin:r.manual?'human':'automatic'});
 const graphPolys=new Map((scope.panels?.panels??[]).filter(p=>p.policyHint==='non-acquisition'||['Graphs','Flow Cytometry'].includes(p.label)).map(p=>[key(rectanglePolygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]})),p.label]));
 const texts=new Set([...(scope.text?.polygons??[]),...(scope.pdfText?.polygons??[])].map(key));
 for(const polygon of explicitExclusions(scope,width,height))add('exclusion',polygon,{origin:'automatic',...(graphPolys.has(key(polygon))?{label:graphPolys.get(key(polygon)),role:'non-acquisition'}:texts.has(key(polygon))?{label:'Text',role:'text'}:{label:'Exclusion',role:'exclusion'})});
 const draft={schema:MANUAL_SCOPE_SCHEMA,version:1,coordinates:'original-pixels',edgeConvention:'half-open-rectangles',sourceSha256,width,height,baseFingerprint:scope.fingerprint??null,baseStatus:scope.status??'unprepared',zones,nextId:serial+1,changed:false,actions:[]};validateDraft(draft);return draft;
}
function validateDraft(draft){
 if(draft?.schema!==MANUAL_SCOPE_SCHEMA||draft.coordinates!=='original-pixels'||!validHash(draft.sourceSha256)||!Number.isSafeInteger(draft.width)||draft.width<1||!Number.isSafeInteger(draft.height)||draft.height<1||!Array.isArray(draft.zones)||draft.zones.length>MAX_ZONES)throw invalid('Le brouillon des zones est invalide.');
 const ids=new Set();let vertices=0;
 for(const zone of draft.zones){if(typeof zone.id!=='string'||ids.has(zone.id)||!['acquisition','exclusion'].includes(zone.kind)||![zone.x0,zone.y0,zone.x1,zone.y1].every(Number.isFinite)||zone.x0<0||zone.y0<0||zone.x1>draft.width||zone.y1>draft.height||zone.x1<=zone.x0||zone.y1<=zone.y0)throw invalid('Une zone du brouillon est invalide.');ids.add(zone.id);const clipped=clipPolygon(zone.polygon,draft.width,draft.height);if(!clipped.length||key(clipped)!==key(zone.polygon))throw invalid('Un polygone sort de l’image originale.');const original=retainOriginalGeometry(zone,draft.width,draft.height);vertices+=zone.polygon.length+original.polygon.length;if(vertices>MAX_VERTICES)throw invalid('Le brouillon contient trop de sommets.');const b=bounds(zone.polygon);if(Object.keys(b).some(k=>Math.abs(b[k]-zone[k])>1e-7))throw invalid('Les limites d’une zone ne correspondent pas à son polygone.');}
 if(!Array.isArray(draft.actions)||draft.actions.length>MAX_ACTIONS||draft.previousActions!==undefined&&(!Array.isArray(draft.previousActions)||draft.previousActions.length>MAX_ACTIONS))throw invalid('Le journal de modification est invalide.');return draft;
}
function record(draft,action){draft.changed=true;draft.actions.push({...action,coordinates:'original-pixels'});if(draft.actions.length>MAX_ACTIONS){draft.actions.shift();draft.truncatedActions=(draft.truncatedActions??0)+1;}return draft;}
export function addManualScopeZone(draft,kind,rectangle,{type='microscopy'}={}){
 validateDraft(draft);if(!['acquisition','exclusion'].includes(kind)||draft.zones.length>=MAX_ZONES)throw invalid('Cette zone ne peut pas être ajoutée.');const r=normalizeScopeRectangle(rectangle,draft),id='zone-'+draft.nextId++;
 const zone={id,kind,...r,polygon:rectanglePolygon(r),origin:'human',...(kind==='acquisition'?{type,label:labelType(type)}:{role:'exclusion',label:'Human exclusion'})};retainOriginalGeometry(zone,draft.width,draft.height);draft.zones.push(zone);record(draft,{operation:'add',id,kind,rectangle:r,...(kind==='acquisition'?{type}:{})});return zone;
}
export function updateManualScopeZone(draft,id,rectangle,{operation='resize'}={}){
 validateDraft(draft);const zone=draft.zones.find(z=>z.id===id);if(!zone)throw invalid('La zone à modifier est absente.');let r;const previous={...bounds(zone.polygon)};
 if(operation==='move'){if(!rectangle||![rectangle.x0,rectangle.y0,rectangle.x1,rectangle.y1].every(Number.isFinite))throw invalid('Le déplacement est invalide.');const dx=Math.max(-zone.x0,Math.min(draft.width-zone.x1,rectangle.x0-zone.x0)),dy=Math.max(-zone.y0,Math.min(draft.height-zone.y1,rectangle.y0-zone.y0));r={x0:zone.x0+dx,y0:zone.y0+dy,x1:zone.x1+dx,y1:zone.y1+dy};}
 else r=normalizeScopeRectangle(rectangle,draft);const dx=r.x0-zone.x0,dy=r.y0-zone.y0;
 // Moving retains oriented OCR geometry. Resizing is an explicit human choice
 // of a rectangle, recorded separately from the original detector polygon.
 const polygon=operation==='move'?zone.polygon.map(([x,y])=>[x+dx,y+dy]):rectanglePolygon(r);
 Object.assign(zone,r,{polygon,origin:'human'});record(draft,{operation,id,previous,rectangle:r});return zone;
}
export function removeManualScopeZone(draft,id){validateDraft(draft);const index=draft.zones.findIndex(z=>z.id===id);if(index<0)throw invalid('La zone à retirer est absente.');const [zone]=draft.zones.splice(index,1);record(draft,{operation:'delete',id,kind:zone.kind,rectangle:bounds(zone.polygon)});return zone;}
export function restoreManualScopeZone(draft,id){
 validateDraft(draft);const zone=draft.zones.find(z=>z.id===id);if(!zone)throw invalid('La zone à restaurer est absente.');const original=zone.originalGeometry;
 if(key(zoneGeometry(zone))===key(original))return false;
 const previous=zoneGeometry(zone);Object.assign(zone,{x0:original.x0,y0:original.y0,x1:original.x1,y1:original.y1,polygon:copy(original.polygon),origin:'human'});record(draft,{operation:'restore-original',id,previous,rectangle:bounds(original.polygon)});return true;
}
function axisRectangle(polygon){const r=bounds(polygon);return polygon.length===4&&new Set(polygon.map(key)).size===4&&rectanglePolygon(r).every(p=>polygon.some(q=>key(q)===key(p)))?r:null;}
function covered(region,excluded){
 if(excluded.some(p=>key(p)===key(region.polygon)))return true;
 // A convex exclusion containing every acquisition vertex also contains the
 // whole acquisition, including a rotated/nonrectangular panel.
 for(const poly of excluded){let sign=0,convex=true;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],c=poly[(i+2)%poly.length],v=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(Math.abs(v)>1e-8){const next=Math.sign(v);if(sign&&next!==sign){convex=false;break;}sign=next;}}if(convex&&sign&&region.polygon.every(p=>poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))>=-1e-8;})))return true;}
 // Union coverage of the bounding box is a conservative proof of complete
 // exclusion for any panel shape; partial/oriented masks remain precise.
 const r=bounds(region.polygon);
 const rectangles=excluded.map(axisRectangle).filter(Boolean).map(e=>({x0:Math.max(0,e.x0-r.x0),y0:Math.max(0,e.y0-r.y0),x1:Math.min(r.x1-r.x0,e.x1-r.x0),y1:Math.min(r.y1-r.y0,e.y1-r.y0)})).filter(e=>e.x1>e.x0&&e.y1>e.y0);
 return rectangleComplement(rectangles,r.x1-r.x0,r.y1-r.y0).length===0;
}
export function manualDraftScope(draft,base={}){
 validateDraft(draft);const explicit=draft.zones.filter(z=>z.kind==='exclusion').map(z=>copy(z.polygon));
 const candidates=draft.zones.filter(z=>z.kind==='acquisition').map(z=>({x0:z.x0,y0:z.y0,x1:z.x1,y1:z.y1,polygon:copy(z.polygon),type:z.type??'microscopy',label:z.label??labelType(z.type),manual:z.origin==='human',zoneId:z.id}));
 const regions=candidates.filter(r=>!covered(r,explicit)),types=new Set(regions.map(r=>r.type)),family=types.size>1?'mixed':types.size?[...types][0]:'unknown',excluded=[...new Map([...explicit,...rectangleComplement(regions,draft.width,draft.height)].map(p=>[key(p),p])).values()];
 return {...base,...SCIENTIFIC_SCOPE_POLICY,sourceSha256:draft.sourceSha256,width:draft.width,height:draft.height,status:regions.length?'ready':'excluded',family,regions,searchRegions:regions.map(copy),excluded,cancelledRegions:candidates.filter(r=>!regions.includes(r)).map(r=>({zoneId:r.zoneId,rectangle:[r.x0,r.y0,r.x1,r.y1],reason:'fully-excluded-by-human-scope'}))};
}
/** Return a new serializable scope. The image, its Blob, native maps and model
 * outputs are untouched. Explicit human approval can resolve an unknown class;
 * the automatic OCR status and panels remain available as raw provenance. */
export async function applyManualScopeDraft(image,draft,{reviewedAt=new Date().toISOString()}={}){
 validateDraft(draft);const {width,height}=dimensions(image);if(width!==draft.width||height!==draft.height||identity(image)!==draft.sourceSha256||draft.baseFingerprint!==(image.preparation?.fingerprint??null))throw invalid('L’image ou sa préparation a changé depuis l’ouverture de l’éditeur. Rouvrez ses zones.');
 const base=image.preparation??{};if(!draft.changed&&base.status==='ready')return base;
 const next=manualDraftScope(draft,copy(base)),rawText=base.text?.rawDetection??base.text??null,rawPanels=base.manual?.originalPanels??base.panels??null;
 next.version=SCIENTIFIC_SCOPE_POLICY.version+'+manual-1';
 next.text={...(base.text??{}),status:'complete',detections:draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text').map(z=>({polygon:copy(z.polygon),actor:'human',zoneId:z.id})),polygons:draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='text').map(z=>copy(z.polygon)),rawDetection:copy(rawText),review:{actor:'human',decision:'edit-scientific-scope',originalStatus:rawText?.status??'unavailable',reviewedAt,originalFingerprint:draft.baseFingerprint}};
 next.panels={...(base.panels??{}),panels:[...next.regions.map(r=>({label:r.label,rectangle:[r.x0,r.y0,r.x1,r.y1],actor:'human',policyHint:'acquisition'})),...draft.zones.filter(z=>z.kind==='exclusion'&&z.role==='non-acquisition').map(z=>({label:z.label,rectangle:[z.x0,z.y0,z.x1,z.y1],actor:'human',policyHint:'non-acquisition'}))]};
 next.annotations=null;next.warnings=[];next.coverage={acquisitions:'human-reviewed-zones',undetectedAreas:'excluded-unclassified',exhaustive:false};
 const previousActions=draft.previousActions??[],allActions=[...previousActions,...draft.actions],truncatedActions=(draft.previousTruncatedActions??0)+(draft.truncatedActions??0)+Math.max(0,allActions.length-MAX_ACTIONS);
 next.manual={schema:MANUAL_SCOPE_SCHEMA,version:1,actor:'human',reviewedAt,coordinates:'original-pixels',edgeConvention:'half-open-rectangles',sourceSha256:draft.sourceSha256,width,height,baseFingerprint:draft.baseFingerprint,...(typeof image.hash==='string'?{pixelHash:image.hash}:{}),originalStatus:base.manual?.originalStatus??base.status??'unprepared',originalPanels:copy(rawPanels),zones:copy(draft.zones),actions:copy(allActions.slice(-MAX_ACTIONS)),...(truncatedActions?{truncatedActions}:{}),originalPixelsPreserved:true};
 // Search the whole admitted union as well as individual panels; exclusions
 // still determine membership and are never repainted into the source.
 if(next.regions.length>1){const envelope=bounds(next.regions.flatMap(r=>r.polygon));if(!next.regions.some(r=>key(rectanglePolygon(envelope))===key(r.polygon)))next.searchRegions.push({...envelope,polygon:rectanglePolygon(envelope),envelope:true,role:'cross-panel-search'});}
 next.fingerprint=await scopeFingerprint(next);return next;
}

// Archive/configuration restoration must not resurrect automatic exclusions.
// The signature binds exact human polygons to source identity and native size.
export async function restoreManualScientificScope(image){
 const scope=image?.preparation;if(scope?.manual?.schema!==MANUAL_SCOPE_SCHEMA||scope.manual.actor!=='human')return null;
 const m=scope.manual,{width,height}=dimensions(image);if(m.pixelHash!==undefined&&m.pixelHash!==image.hash||identity(image)!==m.sourceSha256||scope.sourceSha256!==m.sourceSha256||m.width!==width||m.height!==height||scope.width!==width||scope.height!==height||scope.coordinates!=='original-pixels'||!['ready','excluded'].includes(scope.status)||scope.text?.status!=='complete'||!validHash(scope.fingerprint))throw invalid('La préparation manuelle importée ne correspond pas à la source.');
 const draft={schema:MANUAL_SCOPE_SCHEMA,version:1,coordinates:'original-pixels',sourceSha256:m.sourceSha256,width,height,baseFingerprint:m.baseFingerprint,zones:copy(m.zones),nextId:m.zones.length+1,actions:copy(m.actions??[]),changed:true};validateDraft(draft);const rebuilt=manualDraftScope(draft);
 if(key(scope.regions)!==key(rebuilt.regions)||key(scope.excluded)!==key(rebuilt.excluded)||scope.status!==rebuilt.status||await scopeFingerprint(scope)!==scope.fingerprint)throw invalid('L’empreinte ou les zones de la préparation manuelle importée ont changé.');return scope;
}
