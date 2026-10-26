import "../../runtime-context.js?v=0.25.0";
import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';

export const NEURAL_SCIENTIFIC_SCOPE_SCHEMA='sherloq.neural-scientific-scope/1';
export function neuralScientificScopeIdentity(scope,{width,height,sourceSha256}={}){
 compileForgeryscopeScientificScope(scope,{width,height,sourceSha256});
 requireValue(scope&&['ready','excluded'].includes(scope.status),'Prepared neural scope required');
 return JSON.stringify([scope.schema,scope.fingerprint,width,height,sourceSha256,scope.regions,scope.excluded,...(scope.nativeSourceRegions?[scope.nativeSourceRegions]:[])]);
}
function rectangular(polygon){return polygon.length===4&&new Set(polygon.map(p=>p[0])).size===2&&new Set(polygon.map(p=>p[1])).size===2&&polygon.every((p,i)=>p[0]===polygon[(i+1)%4][0]||p[1]===polygon[(i+1)%4][1]);}
async function hasOriginalPixels(compiled,bounds,signal){
 const cooperate=createCooperator(signal);
 // A subpixel sliver can contain resized centres without containing any real
 // source pixel. It must not cause a model to run on invented eligible data.
 for(const region of compiled.regions){
  const x0=Math.max(bounds[0],Math.ceil(region.bounds[0])),y0=Math.max(bounds[1],Math.ceil(region.bounds[1])),x1=Math.min(bounds[2]-1,Math.floor(region.bounds[2])),y1=Math.min(bounds[3]-1,Math.floor(region.bounds[3]));
  if(x0>x1||y0>y1||compiled.excluded.some(e=>rectangular(e.polygon)&&e.bounds[0]<=x0&&e.bounds[1]<=y0&&e.bounds[2]>=x1&&e.bounds[3]>=y1))continue;
  for(let y=y0;y<=y1;y++){await cooperate();for(let x=x0;x<=x1;x++){if(compiled.admits(x,y))return true;if((x&255)===255)await cooperate();}}
 }
 checkAbort(signal);return false;
}
// This controls membership of real native-grid centres. It does not paint RGB,
// replace an image, change its dimensions or claim to mask a CNN's context.
export async function prepareNeuralScientificScope(scope,zones,{width,height,sourceSha256,side=448,budget,signal,requireGridSupport=true,retainMatchingGrid=true}={}){
 if(scope===undefined)return null;
 const compiled=compileForgeryscopeScientificScope(scope,{width,height,sourceSha256});
 requireValue(['ready','excluded'].includes(scope.status)&&Number.isSafeInteger(side)&&side>=2&&side<=512&&Array.isArray(zones),'Prepared neural scientific scope required.');
 const identity=neuralScientificScopeIdentity(scope,{width,height,sourceSha256});
 const retained=[],selected=[],skipped=[],grids=new Map();let complete=false;
 try{
  for(const zone of zones){
   const b=zone.bounds;requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=width&&b[3]<=height&&b[2]>b[0]&&b[3]>b[1],'Scientific neural zone must use original half-open pixels.');
   if(!await hasOriginalPixels(compiled,b,signal)){skipped.push({id:zone.id,bounds:[...b],reason:'no-admissible-original-pixels-before-inference'});continue;}
   const release=budget.reserve(side*side);retained.push(release);const values=new Uint8Array(side*side);let admitted=0;
   const w=b[2]-b[0],h=b[3]-b[1];
   for(let y=0;y<side&&(retainMatchingGrid||!admitted);y++){
    if((y&15)===0)await controlCheckpoint(signal);
    // Native antialiased resize uses half-pixel centres. Border samples use
    // the same source boundary, not a fabricated pixel outside the rectangle.
    const oy=b[1]+Math.max(0,Math.min(h-1,(y+.5)*h/side-.5));
    for(let x=0;x<side;x++){const ox=b[0]+Math.max(0,Math.min(w-1,(x+.5)*w/side-.5));if(compiled.admits(ox,oy)){values[y*side+x]=1;admitted++;if(!retainMatchingGrid)break;}}
   }
   if(!admitted){
    // A small real island can lie between downsampled grid centres. Do not
    // silently reinterpret that case as a completely cancelled acquisition.
    if(requireGridSupport)throw new EngineError('NEURAL_SCOPE_BELOW_GRID','Remaining acquisition pixels have no native-grid centre; refine the region instead of silently dropping them.',{details:{zoneId:zone.id,bounds:b,side}});
    selected.push(zone);grids.set(zone.id,{identity:identity+':'+JSON.stringify(b),values:null,side,admitted:0,total:values.length,bounds:[...b],unrepresentedOriginalPixels:true});release();retained.pop();continue;
   }
   selected.push(zone);grids.set(zone.id,{identity:identity+':'+JSON.stringify(b),values:!retainMatchingGrid||admitted===values.length?null:values,side,admitted,total:values.length,bounds:[...b]});
   if(!retainMatchingGrid||admitted===values.length){release();retained.pop();}
  }
  checkAbort(signal);complete=true;
  return {zones:selected,grids,identity,sourceScope:scope,metadata:{schema:NEURAL_SCIENTIFIC_SCOPE_SCHEMA,fingerprint:scope.fingerprint,coordinates:'original-pixels',sourceSha256,width,height,side,matchingGrid:retainMatchingGrid?'native-source-centres':'presence-only; candidate-domain projection is performed by the native inference adapter',requestedZones:zones.length,retainedZones:selected.length,skippedZones:skipped,projection:'native-half-pixel-centres; original RGB unchanged',cnnContext:'Original rectangle context remains computed; not a masked CNN inference.',...(scope.nativeSourceRegions?{nativeSourceRegions:{domainFingerprint:scope.nativeSourceRegions.domainFingerprint,policy:'Source and target candidates intersect native acquisition centres and every Original ceiling; gaps remain available only as the declared envelope RGB context. Explicit source exclusions are not admitted by this adapter.'}}:{})},release(){for(const free of retained.splice(0))free();}};
 }finally{if(!complete)for(const free of retained)free();}
}

/** Completely cancelled requests own only zero scientific output, never a fake
 * model grid. Stored surfaces synthesize bounded zero windows without allocating
 * an original-sized map. Existing NPZ/window exports can read these stores. */
export function emptyScopedNeuralResult({width,height,segmented,roles=true,budget,metadata}){
 const n=width*height,fields=['map','mask',...(roles?['target','source']:[]),'analyzed','candidates'],release=budget.reserve(65536);let disposed=false;
 const result={width,height,metadata:{...metadata,status:'empty',zones:[],boxes:[],inferences:0,cache_hits:0,inference_performed:false,raw_filter_applied:false,scientificScope:metadata.scientificScope},metrics:{inferences:0,skippedBeforeInference:true},release(){if(disposed)return;disposed=true;release();},dispose(){this.release();}};
 if(segmented){result.stores=Object.fromEntries(fields.map(key=>[key,{byteLength:n*(['map','target','source'].includes(key)?4:1),storage:'constant-zero',async readInto(bytes,offset=0){requireValue(!disposed&&ArrayBuffer.isView(bytes)&&Number.isSafeInteger(offset)&&offset>=0&&offset+bytes.byteLength<=this.byteLength,'Invalid cancelled neural output window');new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength).fill(0);return bytes;},async dispose(){}}]));}
 else{const bytes=n*(roles?15:7);let free;const old=result.release;result.release=()=>{if(disposed)return;free?.();old();};try{free=budget.reserve(bytes);for(const key of fields)result[key]=['map','target','source'].includes(key)?new Float32Array(n):new Uint8Array(n);}catch(error){result.release();throw error;}}
 return result;
}
