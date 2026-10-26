import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {forgeryscopeNativeYoloAvailability} from './forgeryscope-native-availability.js';
import {compileOriginalSourceRegions,createOriginalSourceRegionsState} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {retireForgeryscopeOwners} from './forgeryscope-owner-retirement.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
const certified=new WeakMap(),className=r=>({microscopy:'Microscopy',gel:'Blots',photography:'Body Imaging'})[r.type]??r.label??r.type;
const covers=(rows,a,b)=>{let at=a;for(const[x,r]of rows){if(r<=at)continue;if(x>at)return false;at=Math.max(at,r);if(at>=b)return true;}return at>=b;};
const deepFreeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))deepFreeze(child);Object.freeze(v);}return v;};
export function certifiedForgeryscopeSource(image){return certified.has(image);}
export function forgeryscopeBoundedIdentity(image){return certified.get(image)?.identity;}
/** Borrow the Original decoder. Every CNN crop is a genuine contiguous native
 * rectangle of candidate pixels; no full-frame raster or hole fill exists. */
export async function createForgeryscopeBoundedSource(prepared,{budget,signal}={}){
 requireValue(['analysis.clones','analysis.complete'].includes(prepared?.originalTask?.operation),'Bounded aggregate Forgeryscope requires verified clone-search geometry.');
 const lease=budget.reserve(65536+sourceRegionTransportBytes([prepared.originalTask,prepared.sourceDomain?.descriptor,prepared.candidateDomain?.descriptor,prepared.contextDomain?.descriptor],{allowAliases:true,allowUndefined:true})*4),fragmentLeases=[];let view,returned=false,failed=false,primary;
 try{
  const task=structuredClone(prepared.originalTask),source=await compileOriginalSourceRegions(prepared.sourceDomain.descriptor),suppliedCandidate=await compileOriginalSourceRegions(prepared.candidateDomain.descriptor),context=await compileOriginalSourceRegions(prepared.contextDomain.descriptor);let candidate=suppliedCandidate;checkAbort(signal);
  const d=prepared.source?.descriptor;
  requireValue(d&&prepared.source.sha256===source.sourceSha256&&source.sourceSha256===candidate.sourceSha256&&source.sourceSha256===context.sourceSha256&&d.width===source.sourceWidth&&d.height===source.sourceHeight&&source.width===prepared.width&&source.height===prepared.height&&source.origin[0]===prepared.origin[0]&&source.origin[1]===prepared.origin[1]&&source.fingerprint===prepared.sourceDomain.fingerprint&&candidate.fingerprint===prepared.candidateDomain.fingerprint&&context.fingerprint===prepared.contextDomain.fingerprint,'Bounded Forgeryscope differs from its verified Original source.');
  for(let y=0;y<candidate.height;y++){if(y%32===0)await controlCheckpoint(signal);const oy=y+candidate.origin[1];for(const[a,b]of candidate.rowIntervals(y)){const x=a+candidate.origin[0],r=b+candidate.origin[0];requireValue(covers(source.rowIntervals(oy-source.origin[1]).map(([a,b])=>[a+source.origin[0],b+source.origin[0]]),x,r)&&covers(context.rowIntervals(oy-context.origin[1]).map(([a,b])=>[a+context.origin[0],b+context.origin[0]]),x,r),'Forgeryscope candidate pixels exceed their verified source/context ceiling.');}}
  const scope=task.params?.scientificScope??task.scientificScope;
  if(scope){
   const free=budget.reserve(65536+8*sourceRegionTransportBytes(scope,{allowAliases:true,allowUndefined:true}));let retained=false;
   try{const state=await createOriginalSourceRegionsState({sourceSha256:source.sourceSha256,width:source.sourceWidth,height:source.sourceHeight}),zones=[...scope.regions.map((r,i)=>({id:'prepared-native-acquisition-'+i,kind:'acquisition',enabled:true,polygon:r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]],x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1})),...scope.excluded.map((polygon,i)=>({id:'prepared-native-exclusion-'+i,kind:'exclusion',enabled:true,polygon,x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1]))}))];await state.replaceZones(zones,{enabled:true,positiveMode:'selected'});const bounded=await compileOriginalSourceRegions(state.snapshot(),{ceiling:candidate});checkAbort(signal);if(bounded.countIncluded!==candidate.countIncluded){candidate=bounded;fragmentLeases.push(free);retained=true;}}finally{if(!retained)free();}
  }
  requireValue(!candidate.empty,'No admitted Forgeryscope candidate pixels.');
  view=await createSourceRegionView(prepared.source,candidate.descriptor,{budget,maxReadPixels:candidate.width*candidate.height});checkAbort(signal);
  const acquisitions=scope?.regions??[{x0:source.rect.x0,y0:source.rect.y0,x1:source.rect.x1,y1:source.rect.y1}],fragments=[];
  const known=['Microscopy','Blots','Body Imaging'],classification=[];
  for(let i=0;i<acquisitions.length;i++){
   const r=acquisitions[i];requireValue(['x0','y0','x1','y1'].every(k=>Number.isFinite(r[k])),'Invalid prepared acquisition.');
   const label=className(r);if(!known.includes(label))continue;
   const corners=r.polygon,rectangular=!corners||corners.length===4&&new Set(corners.map(p=>JSON.stringify(p))).size===4&&corners.every(([x,y])=>[r.x0,r.x1].includes(x)&&[r.y0,r.y1].includes(y));
   const membership=rectangular?null:compileForgeryscopeScientificScope({...scope,regions:[r],excluded:[],nativeSourceRegions:undefined},{width:source.sourceWidth,height:source.sourceHeight,sourceSha256:source.sourceSha256});
   classification.push({index:i,region:r,label,confidence:Number.isFinite(r.confidence)?r.confidence:1,membership});
  }
  async function participation(row,bounds){
   const r=row.region,[x,y,right,bottom]=bounds;if(Math.min(r.x1,right)<=Math.max(r.x0,x)||Math.min(r.y1,bottom)<=Math.max(r.y0,y))return{intersects:false,covers:false};
   const covers=r.x0<=x&&r.y0<=y&&r.x1>=right&&r.y1>=bottom;if(!row.membership)return{intersects:true,covers};
   let hit=false,all=covers;for(let yy=y;yy<bottom;yy++){if((yy-y)%32===0)await controlCheckpoint(signal);for(let xx=x;xx<right;xx++){const inside=row.membership.admits(xx+.5,yy+.5);hit||=inside;all&&=inside;if(hit&&!all)return{intersects:true,covers:false};}}return{intersects:hit,covers:all};
  }
  // The canonical view is already a disjoint partition of the admitted pixel
  // union. Iterating acquisitions here would repeat their intersections.
  for(const part of view.admittedRectangles()){
   await controlCheckpoint(signal);const originalBounds=[part.x+candidate.origin[0],part.y+candidate.origin[1],part.x+part.width+candidate.origin[0],part.y+part.height+candidate.origin[1]],covering=[],touching=[];
   for(const row of classification){const p=await participation(row,originalBounds);if(p.intersects)touching.push(row);if(p.covers)covering.push(row);}
   const labels=new Set(touching.map(r=>r.label)),confidence=new Set(covering.map(r=>r.confidence)),inherit=labels.size===1&&covering.length>0&&confidence.size===1,selected=inherit?covering[0]:null;
   fragmentLeases.push(budget.reserve(1024+touching.length*32));fragments.push({acquisition:selected&&covering.length===1?selected.index:null,acquisitions:touching.map(r=>r.index),label:selected?.label,confidence:selected?.confidence,bounds:originalBounds.map((v,i)=>v-source.origin[i%2]),originalBounds,classPolicy:selected?'unambiguous-full-fragment-prepared-class':'native-panel-detector-required'});
  }
  const identity=deepFreeze({schema:'sherloq.forgeryscope-native-contexts/1',sourceSha256:source.sourceSha256,sourceDomain:source.fingerprint,candidateDomain:candidate.fingerprint,requestedCandidateDomain:suppliedCandidate.fingerprint,contextDomain:context.fingerprint,contextFingerprint:prepared.fingerprint,origin:[...source.origin],fragments,observationPolicy:'canonical-candidate-union-each-pixel-once',preparedClassPolicy:'A known class/confidence is inherited only with full-fragment coverage and no conflicting intersecting known class; otherwise unchanged native panel detector.',cnnContext:'Only native admitted acquisition fragments enter every panel, embedding, lane and feature model; comparisons remain global across fragments.',rawGeometry:'Native geometric hulls remain envelopes, not exact pixel segmentations.'});
  let closed=false,disposal;const held=new Set();
  const info={identity,alive(extra){checkAbort(extra);requireValue(!closed,'Bounded Forgeryscope source is closed.');},async crop(box,{signal:extra}={}){
   this.alive(extra);requireValue(Array.isArray(box)&&box.length===4&&box.every(Number.isFinite),'Invalid native crop bounds.');
   const norm=(v,n)=>Math.max(0,Math.min(n,(v=Math.trunc(v))<0?n+v:v)),x=norm(box[0],source.width),y=norm(box[1],source.height),r=norm(box[2],source.width),b=norm(box[3],source.height);requireValue(r>x&&b>y,'Empty panel crop.');
   const native={x:x+source.origin[0]-candidate.origin[0],y:y+source.origin[1]-candidate.origin[1],width:r-x,height:b-y};let window;
   try{window=await view.readWindow(native,{signal:extra});this.alive(extra);const w=window;window=null;let released=false;const result={...w.pixels,scientificOrigin:[x,y],async release(){if(released)return;await w.release();released=true;held.delete(result);}};held.add(result);return result;}catch(error){await retireForgeryscopeOwners([()=>window?.release()],{primary:error});throw error;}
  }};
  const image={sha256:source.sourceSha256,segmented:true,width:source.width,height:source.height,surface:{descriptor:{id:'forgeryscope-native-'+prepared.fingerprint,revision:1,width:source.width,height:source.height,format:'rgb8'},readWindow:async(rect,options)=>{const p=await info.crop([rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],options);return{pixels:p,release:()=>p.release()};}},provenance:{sourceRegionDomain:{fingerprint:prepared.fingerprint},origin:[...source.origin]}};deepFreeze(image);certified.set(image,info);
  returned=true;return{image,metadata:identity,dispose(){if(disposal)return disposal;closed=true;certified.delete(image);disposal=(async()=>{await retireForgeryscopeOwners(Array.from(held,p=>()=>p.release()));await view.dispose();for(const free of fragmentLeases)free();lease();})().catch(error=>{disposal=undefined;throw error;});return disposal;}};
 }catch(error){failed=true;primary=error;throw error;}finally{if(!returned)await retireForgeryscopeOwners([async()=>{await view?.dispose();for(const free of fragmentLeases)free();lease();}],failed?{primary}:{});}
}
export async function readForgeryscopeBoundedCrop(image,box,options={}){const info=certified.get(image);requireValue(info,'Uncertified bounded Forgeryscope source.');return info.crop(box,options);}
/** Known classes are inherited; unknown fragments run the unchanged real panel
 * detector on their own admitted RGB. Detection caches get a distinct derived
 * context digest so equally sized acquisitions can never alias Original SHA. */
export async function prepareForgeryscopeBoundedPanels(image,{networks,signal,...options}={}){
 const info=certified.get(image);requireValue(info,'Uncertified bounded Forgeryscope source.');info.alive(signal);const panels=[],classification=[];
 for(let i=0;i<info.identity.fragments.length;i++){
  await controlCheckpoint(signal);const f=info.identity.fragments[i];
  if(['Microscopy','Blots','Body Imaging'].includes(f.label)){panels.push([f.label,f.confidence,...f.bounds]);classification.push({fragment:i,acquisition:f.acquisition,source:'prepared-class'});continue;}
  const unavailable=forgeryscopeNativeYoloAvailability(f.bounds[2]-f.bounds[0],f.bounds[3]-f.bounds[1],{stage:'panel-classification',bounds:f.bounds,originalBounds:f.originalBounds,fragment:i,acquisition:f.acquisition});
  if(unavailable){classification.push({...unavailable,source:'native-panel-detector'});continue;}
  let crop,failure;try{
   crop=await info.crop(f.bounds,{signal});const encoded=new TextEncoder().encode(JSON.stringify(['forgeryscope-native-crop/1',info.identity.sourceSha256,info.identity.contextFingerprint,f.originalBounds]));const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(v=>v.toString(16).padStart(2,'0')).join('');info.alive(signal);
   const rows=await networks.detect({...crop,sha256:digest},'panels',{...options,signal});info.alive(signal);
   for(const row of rows){requireValue(Array.isArray(row)&&row.length===6&&row.slice(-4).every(Number.isFinite),'Invalid native classified panel.');const box=row.slice(-4);requireValue(box[0]>=0&&box[1]>=0&&box[2]<=crop.width&&box[3]<=crop.height,'Native classified panel exceeds its admitted fragment.');panels.push([row[0],row[1],box[0]+f.bounds[0],box[1]+f.bounds[1],box[2]+f.bounds[0],box[3]+f.bounds[1]]);}
   classification.push({fragment:i,acquisition:f.acquisition,source:'native-panel-detector',derivedContextSha256:digest,panels:rows.length});
  }catch(error){failure=error;throw error;}finally{await retireForgeryscopeOwners([()=>crop?.release()],failure?{primary:failure}:{});}
 }
 info.alive(signal);return{panels,metadata:{...info.identity,classification}};
}
