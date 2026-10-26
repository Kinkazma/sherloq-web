import {nativeSourceRegionDefaultRegions,nativeSourceRegionMembership} from './source-region-native-regions.js';
import {EngineError} from './errors.js';

const schema='sherloq.native-acquisition-requested-geometry/1';
const fields=['regions','guides'];
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value??{},key);
const fail=message=>{throw new EngineError('SOURCE_REGIONS_INVALID',message);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function nativePolygons(value,origin){
 if(value===undefined||value===null)return value;
 if(!Array.isArray(value))fail('Requested native acquisition geometry must be a polygon list.');
 return value.map(poly=>{
  if(!Array.isArray(poly)||poly.length<3)fail('Requested native acquisition polygon is invalid.');
  return poly.map(point=>{
   if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point.some(v=>Math.abs(v)>2**30))fail('Requested native acquisition coordinates are invalid.');
   return [point[0]-origin[0],point[1]-origin[1]];
  });
 });
}

/** Record requested geometry separately from defaults generated for the native
 * acquisition adapter. This verifies metadata only; it does not replace the
 * localized geometry consumed by any descriptor, matcher or model. */
export function certifyNativeRequestedGeometry(task,params,domain,{already=false,defaultRegions}={}){
 const previous=task.sourceRegionLocalization?.nativeParameterGeometry;
 // A legacy localized task has no recoverable record of omitted/empty inputs.
 // Preserve its prior route, without inventing an alleged original request.
 if(already&&!previous)return undefined;
 let original;
 if(previous){
  if(previous.schema!==schema||previous.domainFingerprint!==domain.fingerprint||previous.sourceSha256!==domain.sourceSha256||!previous.original||Object.keys(previous.original).length!==fields.length)fail('Native requested geometry certificate belongs to another source domain.');
  original=structuredClone(previous.original);
  for(const name of fields){const record=original[name];if(!record||typeof record.present!=='boolean'||Object.keys(record).some(k=>!['present','value'].includes(k))||(!record.present&&own(record,'value')))fail('Malformed native requested geometry certificate.');}
 }else original=Object.fromEntries(fields.map(name=>[name,own(task.params,name)?{present:true,value:structuredClone(task.params[name])}:{present:false}]));
 const native=Object.fromEntries(fields.map(name=>[name,nativePolygons(original[name].value,domain.origin)]));
 const regions=defaultRegions??nativeSourceRegionDefaultRegions(nativeSourceRegionMembership(domain));
 if(!native.regions?.length){native.regions=regions.map(r=>r.polygon);if(native.regions.length>1&&!params.compare)native.regions.push([[0,0],[domain.width,0],[domain.width,domain.height],[0,domain.height]]);}
 if(!native.guides?.length&&!params.compare)native.guides=regions.map(r=>r.polygon);
 for(const name of fields)if(!equal(params[name],native[name]))fail('Native acquisition geometry differs from its verified requested geometry and generated defaults.');
 return {schema,domainFingerprint:domain.fingerprint,sourceSha256:domain.sourceSha256,original};
}

/** The caller first revalidates the localized task and its source certificate.
 * Restore presence as well as values: absent, undefined, null, [] and an
 * explicit polygons must retain their requested values instead of generated defaults. */
export function restoreNativeRequestedGeometry(params,certificate){
 if(!certificate)return;
 if(certificate.schema!==schema)fail('Unknown native requested geometry certificate.');
 for(const name of fields){const record=certificate.original[name];if(record.present)params[name]=structuredClone(record.value);else delete params[name];}
}

/** Membership defaults are built from the positive Original ceiling before
 * true exclusions split RGB. They are a different generator from native
 * rectangular acquisitions, but must retain the same requested identity. */
export function certifySparseRequestedGeometry(task,params,domain,{polygons,positiveFingerprint}={}){
 const meta=task.sourceRegionLocalization,previous=meta?.nativeParameterGeometry;
 if(!previous&&meta?.sparseDefaults)return undefined;
 let original;
 if(previous){
  if(previous.schema!==schema||previous.domainFingerprint!==domain.fingerprint||previous.sourceSha256!==domain.sourceSha256||previous.defaults?.policy!=='strict-sparse-positive-ceiling'||previous.defaults.positiveFingerprint!==positiveFingerprint||!previous.original||Object.keys(previous.original).length!==fields.length)fail('Sparse requested geometry certificate differs from its verified positive source ceiling.');
  original=structuredClone(previous.original);
  for(const name of fields){const record=original[name];if(!record||typeof record.present!=='boolean'||Object.keys(record).some(k=>!['present','value'].includes(k))||(!record.present&&own(record,'value')))fail('Malformed Sparse requested geometry certificate.');}
 }else{
  // This input has already had its coordinates translated, but has not yet
  // acquired generated Sparse defaults. Undo that exact translation only.
  original=Object.fromEntries(fields.map(name=>[name,own(task.params,name)?{present:true,value:nativePolygons(task.params[name],domain.origin.map(x=>-x))}:{present:false}]));
 }
 const native=Object.fromEntries(fields.map(name=>[name,nativePolygons(original[name].value,domain.origin)]));
 if(!native.regions?.length){
  native.regions=structuredClone(polygons);const frame=[[0,0],[domain.width,0],[domain.width,domain.height],[0,domain.height]];
  if(!params.compare&&polygons.length>1&&!polygons.some(p=>equal(p,frame)))native.regions.push(frame);
 }
 if(!native.guides?.length&&!params.compare)native.guides=structuredClone(polygons);
 for(const name of fields)if(!equal(params[name],native[name]))fail('Sparse acquisition geometry differs from its requested coordinates and verified positive defaults.');
 return {schema,domainFingerprint:domain.fingerprint,sourceSha256:domain.sourceSha256,defaults:{policy:'strict-sparse-positive-ceiling',positiveFingerprint},original};
}
