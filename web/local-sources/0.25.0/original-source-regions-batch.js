import {assertSourceRegionOperation,sourceRegionDomainShape} from './unified-engine/src/source-region-capabilities.js';
import {compileOriginalSourceRegions,createOriginalSourceRegionsState,validateOriginalSourceRegions} from './original-source-regions.js?v=0.25.0';
import {SCIENTIFIC_SCOPE_POLICY,scopeFingerprint} from './batch-scientific-preparation.js?v=0.25.0';
import {rectangleComplement,rectanglePolygon} from './batch-scope-geometry.js?v=0.25.0';
import {batchBlobSha256} from './batch-run-resume.js?v=0.25.0';
const copy=value=>structuredClone(value),fail=message=>Object.assign(Error(message),{code:'BATCH_SOURCE_REGIONS_INVALID'});

/** Source bytes, source grid and geometry are bound before the importer mutates its model. */
export async function verifyOriginalBatchSource({file,sourceRegions},{signal,identifyBytes=batchBlobSha256}={}){
 if(!(file instanceof Blob))throw fail('An original encoded source file is required.');
 const snapshot=await validateOriginalSourceRegions(sourceRegions);signal?.throwIfAborted();
 const sha=await identifyBytes(file,{signal});if(sha!==snapshot.sourceSha256)throw fail('The original source bytes do not match these source regions.');
 return snapshot;
}

/** Bridge to the existing batch scope without changing the encoded source.
 * The exact domain remains authoritative, including concave polygons and holes. */
export async function originalBatchScientificScope(image,{editedScope}={}){
 const original=image.originalSourceRegions??image.preparation?.originalSourceRegions;
 if(!original)throw fail('The immutable original source region ceiling is absent.');
 const size={sourceSha256:image.sourceSha256,width:image.width,height:image.height},ceiling=await validateOriginalSourceRegions(original,size);
 let snapshot=ceiling;
 if(editedScope){
  if(editedScope.sourceSha256!==size.sourceSha256||editedScope.width!==size.width||editedScope.height!==size.height)throw fail('The edited batch scope belongs to another source.');
  const zones=[...(editedScope.regions??[]).map((region,index)=>({...region,id:region.zoneId??'batch-positive-'+index,kind:'acquisition',enabled:true,polygon:region.polygon??rectanglePolygon(region)})),...(editedScope.excluded??[]).map((polygon,index)=>({id:'batch-negative-'+index,kind:'exclusion',enabled:true,x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),polygon}))];
  const local=await createOriginalSourceRegionsState(size);snapshot=await local.replaceZones(zones,{positiveMode:'selected',enabled:true});
 }
 const domain=await compileOriginalSourceRegions(snapshot,{ceiling});
 const whole=!snapshot.enabled||snapshot.positiveMode==='whole',regions=(whole?[{id:'original-whole',x0:0,y0:0,x1:image.width,y1:image.height,polygon:rectanglePolygon({x0:0,y0:0,x1:image.width,y1:image.height}),enabled:true}]:snapshot.zones.filter(zone=>zone.enabled&&zone.kind==='acquisition')).map(zone=>({x0:zone.x0,y0:zone.y0,x1:zone.x1,y1:zone.y1,polygon:copy(zone.polygon),zoneId:zone.id,type:'unknown',label:'Original image acquisition',manual:true}));
 const excluded=snapshot.enabled?snapshot.zones.filter(zone=>zone.enabled&&zone.kind==='exclusion').map(zone=>copy(zone.polygon)):[];
 const allExcluded=[...new Map([...excluded,...rectangleComplement(regions,image.width,image.height)].map(polygon=>[JSON.stringify(polygon),polygon])).values()];
 const activeRegions=domain.empty?[]:regions,base=editedScope??{},scope={...base,...SCIENTIFIC_SCOPE_POLICY,version:'original-source-regions-batch-1',sourceSha256:image.sourceSha256,width:image.width,height:image.height,status:domain.empty?'excluded':'ready',family:base.family??'unknown',regions:activeRegions,searchRegions:activeRegions.map(copy),excluded:allExcluded,text:{status:'complete',polygons:[],skipped:true,review:{actor:'human',decision:'original-source-regions',sourceFingerprint:ceiling.fingerprint}},models:{},warnings:[],coverage:{acquisitions:'original-source-regions',undetectedAreas:'outside-positive-union',exhaustive:true},originalSourceRegions:ceiling,sourceRegions:snapshot,sourceRegionDomain:domain.descriptor};
 if(activeRegions.length>1&&domain.rect&&!activeRegions.some(region=>JSON.stringify(region.polygon)===JSON.stringify(rectanglePolygon(domain.rect))))scope.searchRegions.push({...domain.rect,polygon:rectanglePolygon(domain.rect),envelope:true,derived:true,role:'cross-panel-search'});
 scope.manual=editedScope?.manual?copy(editedScope.manual):{schema:'sherloq.batch-manual-scope/1',version:1,actor:'human',coordinates:'original-pixels',edgeConvention:'half-open-rectangles',sourceSha256:image.sourceSha256,width:image.width,height:image.height,pixelHash:image.hash,zones:copy([...activeRegions.map(region=>({id:region.zoneId,kind:'acquisition',x0:region.x0,y0:region.y0,x1:region.x1,y1:region.y1,polygon:region.polygon,type:'unknown',label:region.label,origin:'human'})),...excluded.map((polygon,index)=>({id:'original-exclusion-'+index,kind:'exclusion',x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),polygon,origin:'human'}))]),actions:[],originalPixelsPreserved:true};
 scope.fingerprint=await scopeFingerprint(scope);return scope;
}

/** Execution requires actual published capabilities. UI-only geometry may pass
 * admit:false; source identity/ceiling verification remains mandatory. */
export async function originalBatchTaskDomain(image,operation,{capabilities,params,admit=true}={}){const descriptor=image.preparation?.sourceRegionDomain;if(!descriptor){if(image.originalSourceRegions||image.preparation?.originalSourceRegions)throw fail('The original source ceiling has not been compiled for this batch image.');return null;}const transported=await compileOriginalSourceRegions(descriptor),ceiling=await validateOriginalSourceRegions(image.originalSourceRegions??image.preparation.originalSourceRegions,{sourceSha256:image.sourceSha256,width:image.width,height:image.height}),domain=await compileOriginalSourceRegions(transported.snapshot,{ceiling});if(domain.fingerprint!==transported.fingerprint)throw fail('The batch source domain differs from its immutable original ceiling.');if(domain.sourceSha256!==image.sourceSha256||domain.sourceWidth!==image.width||domain.sourceHeight!==image.height)throw fail('This source domain belongs to another batch image.');if(admit!==false)assertSourceRegionOperation(operation,{shape:sourceRegionDomainShape(domain),capabilities,params});return domain.descriptor;}
