import "../../runtime-context.js?v=0.25.0";
import {certifyNativeRequestedGeometry} from './source-region-requested-geometry.js';
import {strictSparseDefaultTask} from './sparse-strict-defaults.js';
import {strictDenseDefaultTask} from './dense-strict-contexts.js';
import {localizeFragmentedResampling} from './source-region-resampling-localize.js';
import {nativeSourceRegionMembership,nativeSourceRegionCandidateExclusions,nativeSourceRegionDefaultRegions} from './source-region-native-regions.js';
import {isSourceRegionNeuralOperation,localizeNeuralSourceRegionTask} from './source-region-neural-localize.js';
import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {magnifierParams} from './magnifier.js';
import {resamplingAnalysisParams,resamplingAnalysisRegions} from './resampling-analysis.js';
import {resamplingFourierParams,resamplingFourierGeometry} from './resampling-fourier.js';
import {sourceRegionDomainShape,SOURCE_REGION_LOCAL_GEOMETRY_OPERATIONS} from './source-region-capabilities.js';
import {sourceRegionTransportBytes} from './source-region-dispatch.js';
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
const operations=new Set(SOURCE_REGION_LOCAL_GEOMETRY_OPERATIONS),schema='sherloq.source-region-localization/1';
const fail=message=>new EngineError('SOURCE_REGIONS_INVALID',message);
const present=value=>value!==undefined&&value!==null;
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
/** Bound the copies this adapter creates, not arbitrary native task parameters.
 * Scientific metadata may legitimately alias search/acquisition polygons. */
export function sourceRegionCoordinateBytes(task){
 if(task.operation==='inspection.magnifier')return sourceRegionTransportBytes({bounds:task.params?.bounds??null,localization:task.sourceRegionLocalization??null},{allowUndefined:true,allowAliases:true});
 if(['tampering.resampling','tampering.resampling.fourier'].includes(task.operation))return sourceRegionTransportBytes({rect:task.params?.rect??null,regions:task.params?.regions??null,fourierRegions:task.params?.fourierRegions??null,localization:task.sourceRegionLocalization??null},{allowUndefined:true,allowAliases:true});
 if(!operations.has(task.operation)&&!isSourceRegionNeuralOperation(task.operation))return 0;let bytes=0;
 for(const value of [task.scientificScope,task.params?.regions,task.params?.excluded,task.params?.guides,task.sourceRegionLocalization,task.params?.selection,task.params?.scientificScope,task.regions])if(present(value))bytes+=sourceRegionTransportBytes(value,{allowUndefined:true,allowAliases:true});
 return bytes;
}
async function localizeMagnifier(task,domain,{signal}={}){
 checkAbort(signal);if(!['rectangle','native-regions','membership'].includes(sourceRegionDomainShape(domain)))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','A magnifier source crop requires a nonempty qualified native domain.');sourceRegionCoordinateBytes(task);
 const p=magnifierParams(task.params),existing=task.sourceRegionLocalization,already=existing?.coordinates==='source-region-native';
 if(existing&&(!already||existing.schema!==schema||existing.operation!=='inspection.magnifier'||existing.domainFingerprint!==domain.fingerprint||existing.originalSha256!==domain.sourceSha256||existing.width!==domain.width||existing.height!==domain.height||existing.origin?.[0]!==domain.origin[0]||existing.origin?.[1]!==domain.origin[1]||existing.originalGrid?.[0]!==domain.sourceWidth||existing.originalGrid?.[1]!==domain.sourceHeight))throw fail('A localized magnifier belongs to another original-source domain.');
 const originalBounds=already?existing.originalBounds:p.bounds?.slice()??null;
 if(originalBounds!==null&&(!Array.isArray(originalBounds)||originalBounds.length!==4||!originalBounds.every(Number.isSafeInteger)||originalBounds[2]<originalBounds[0]||originalBounds[3]<originalBounds[1]))throw fail('Invalid original magnifier rectangle.');
 const bounds=originalBounds?.map((value,i)=>Math.max(0,Math.min(i%2?domain.height:domain.width,value-domain.origin[i%2])))??null;
 if(bounds&&(bounds[2]<=bounds[0]||bounds[3]<=bounds[1]))throw new EngineError('SOURCE_SCOPE_EMPTY','The selected magnifier rectangle has no pixels inside the admitted native source domain.');
 if(already&&(JSON.stringify(p.bounds)!==JSON.stringify(bounds)||JSON.stringify(existing.nativeBounds)!==JSON.stringify(bounds)))throw fail('Localized magnifier bounds differ from their recorded original rectangle.');
 checkAbort(signal);return{...task,params:{...p,bounds},sourceRegionLocalization:{schema,operation:'inspection.magnifier',coordinates:'source-region-native',domainFingerprint:domain.fingerprint,originalSha256:domain.sourceSha256,originalGrid:[domain.sourceWidth,domain.sourceHeight],origin:[...domain.origin],width:domain.width,height:domain.height,originalBounds:originalBounds?.slice()??null,nativeBounds:bounds?.slice()??null,policy:'Exact half-open native rectangle intersection and translation; empty intersections are refused before the kernel.'}};
}
async function localizeResampling(task,domain,{signal}={}){
 checkAbort(signal);if(sourceRegionDomainShape(domain)!=='rectangle')throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Native resampling requires a completely admitted rectangle.');sourceRegionCoordinateBytes(task);
 const fourier=task.operation==='tampering.resampling.fourier',p=fourier?resamplingFourierParams(task.params):resamplingAnalysisParams(task.params),existing=task.sourceRegionLocalization,already=existing?.coordinates==='source-region-native';
 if(existing&&(!already||existing.schema!==schema||existing.operation!==task.operation||existing.domainFingerprint!==domain.fingerprint||existing.originalSha256!==domain.sourceSha256||existing.width!==domain.width||existing.height!==domain.height||existing.origin?.[0]!==domain.origin[0]||existing.origin?.[1]!==domain.origin[1]||existing.originalGrid?.[0]!==domain.sourceWidth||existing.originalGrid?.[1]!==domain.sourceHeight))throw fail('Localized resampling belongs to another original-source domain.');
 const supplied=fourier?{rect:p.rect}:{regions:p.regions,fourierRegions:p.fourierRegions},original=already?existing.originalCoordinates:supplied;
 if(!original||typeof original!=='object')throw fail('Original native resampling coordinates are required.');
 const nativeOriginal=fourier?resamplingFourierParams({...p,rect:original.rect}):resamplingAnalysisParams({...p,regions:original.regions,fourierRegions:original.fourierRegions});
 if(fourier)resamplingFourierGeometry(domain.sourceWidth,domain.sourceHeight,nativeOriginal);else resamplingAnalysisRegions(nativeOriginal,domain.sourceWidth,domain.sourceHeight);
 const intersect=(rect,minimum,label)=>{const local=rect.map((value,i)=>Math.max(0,Math.min(i%2?domain.height:domain.width,value-domain.origin[i%2])));if(local[2]-local[0]<minimum||local[3]-local[1]<minimum)throw new EngineError('SOURCE_SCOPE_EMPTY','The selected '+label+' is too small inside the admitted native source rectangle.',{details:{minimum,originalBounds:[...rect],nativeBounds:local}});return local;};
 const coordinates=fourier?{rect:nativeOriginal.rect?intersect(nativeOriginal.rect,2,'Fourier region'):null}:{regions:nativeOriginal.regions?.map(rect=>intersect(rect,p.size,'EM region'))??null,fourierRegions:nativeOriginal.fourierRegions.map(rect=>intersect(rect,2,'Fourier region'))},params={...p,...coordinates};
 if(fourier)resamplingFourierGeometry(domain.width,domain.height,params);else resamplingAnalysisRegions(params,domain.width,domain.height);
 if(already&&(JSON.stringify(supplied)!==JSON.stringify(coordinates)||JSON.stringify(existing.nativeCoordinates)!==JSON.stringify(coordinates)))throw fail('Localized resampling coordinates differ from their recorded original selection.');
 checkAbort(signal);const originalCoordinates=fourier?{rect:nativeOriginal.rect?.slice()??null}:{regions:nativeOriginal.regions?.map(rect=>rect.slice())??null,fourierRegions:nativeOriginal.fourierRegions.map(rect=>rect.slice())};return{...task,params,sourceRegionLocalization:{schema,operation:task.operation,coordinates:'source-region-native',domainFingerprint:domain.fingerprint,originalSha256:domain.sourceSha256,originalGrid:[domain.sourceWidth,domain.sourceHeight],origin:[...domain.origin],width:domain.width,height:domain.height,originalCoordinates,nativeCoordinates:structuredClone(coordinates),policy:'Native half-open selections intersect the admitted file-gray rectangle before EM/FFT; empty or sub-minimum intersections are refused.'}};
}
/** Translation is deliberately not an approximate polygon clipping operation.
 * Concave/cross-boundary polygons keep every vertex and exclusion; only the
 * available native image grid is cropped. Holes need a different input adapter. */
export async function localizeSourceRegionTask(task,domain,{signal,strictNeuralFragments=false,strictDenseFragments=false,strictSparseFragments=false,strictAutomaticFragments=false}={}){
 const shape=sourceRegionDomainShape(domain);if(shape==='identity')return task;if(task.operation==='inspection.magnifier')return localizeMagnifier(task,domain,{signal});if(['tampering.resampling','tampering.resampling.fourier'].includes(task.operation))return shape==='rectangle'?localizeResampling(task,domain,{signal}):localizeFragmentedResampling(task,domain,{signal});if(isSourceRegionNeuralOperation(task.operation)){if(!['rectangle','native-regions'].includes(shape)&&!(((strictNeuralFragments===true&&['ai.clones.d2prl','ai.clones.segmentation'].includes(task.operation))||(strictAutomaticFragments===true&&['analysis.clones','analysis.complete'].includes(task.operation)))&&shape==='membership'))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Neural and automatic source adapters require an admitted rectangle or native rectangular acquisitions without explicit source exclusions.');sourceRegionCoordinateBytes(task);return localizeNeuralSourceRegionTask(task,domain,{signal,strictNeuralFragments:strictNeuralFragments===true||strictAutomaticFragments===true&&['analysis.clones','analysis.complete'].includes(task.operation),nativeRegions:shape==='native-regions',localizeScopeTask:input=>localizeSourceRegionCoordinates(input,domain,{signal,nativeRegions:shape==='native-regions'})});}if(!operations.has(task.operation))return task;
 if(task.operation==='tampering.copyMove.sparse'&&strictSparseFragments===true&&shape==='membership'){
  const localized=await localizeSourceRegionCoordinates(task,domain,{signal,nativeRegions:false});
  return strictSparseDefaultTask(localized,domain,{signal});
 }
 if(task.operation==='tampering.copyMove.dense'&&strictDenseFragments===true&&shape==='membership'){
  const localized=await localizeSourceRegionCoordinates(task,domain,{signal,nativeRegions:false});
  return strictDenseDefaultTask(localized,domain,{signal});
 }
 if(!['rectangle','native-regions'].includes(shape))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Native clone polygon localization requires an admitted rectangle or native rectangular acquisitions without explicit source exclusions.');
 return localizeSourceRegionCoordinates(task,domain,{signal,nativeRegions:shape==='native-regions',certifyNativeParameters:operations.has(task.operation)});
}
async function localizeSourceRegionCoordinates(task,domain,{signal,nativeRegions=false,certifyNativeParameters=false}={}){
 checkAbort(signal);sourceRegionCoordinateBytes(task);const existing=task.sourceRegionLocalization,already=existing?.coordinates==='source-region-native';
 if(existing&&(!already||existing.schema!==schema||existing.domainFingerprint!==domain.fingerprint||existing.originalSha256!==domain.sourceSha256||existing.width!==domain.width||existing.height!==domain.height||existing.origin?.[0]!==domain.origin[0]||existing.origin?.[1]!==domain.origin[1]))throw fail('A localized scientific task belongs to another original-source domain.');
 const shift=already?[0,0]:domain.origin;let points=0;
 async function polygon(value){
  if(!Array.isArray(value)||value.length<3)throw fail('A native clone polygon must have at least three vertices.');const out=[];
  for(const point of value){if(++points%256===0)await controlCheckpoint(signal);if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point.some(x=>Math.abs(x)>2**30))throw fail('Invalid native clone polygon coordinates.');out.push([point[0]-shift[0],point[1]-shift[1]]);}
  checkAbort(signal);return out;
 }
 async function polygons(value){if(!Array.isArray(value))throw fail('Native clone geometry must be an explicit polygon list.');const out=[];for(const item of value)out.push(await polygon(item));return out;}
 const box=value=>{if(!Array.isArray(value)||value.length!==4||!value.every(Number.isFinite)||value[2]<=value[0]||value[3]<=value[1])throw fail('Invalid native scientific rectangle.');return[value[0]-shift[0],value[1]-shift[1],value[2]-shift[0],value[3]-shift[1]];};
 async function region(value){
  if(!value||typeof value!=='object')throw fail('Invalid native scientific region.');const out={...value},rect=box([value.x0,value.y0,value.x1,value.y1]);[out.x0,out.y0,out.x1,out.y1]=rect;if(value.polygon)out.polygon=await polygon(value.polygon);if(value.bounds)out.bounds=box(value.bounds);return out;
 }
 async function regions(value){if(!Array.isArray(value))throw fail('Native scientific regions must be an explicit list.');const out=[];for(const item of value)out.push(await region(item));return out;}
 const out={...task,params:{...task.params}},geometry={};let nativeParameterExclusions,nativeParameterGeometry=already?structuredClone(existing.nativeParameterGeometry):undefined;
 for(const name of ['regions','excluded','guides'])if(present(task.params?.[name]))geometry[name]=out.params[name]=await polygons(task.params[name]);
 if(nativeRegions&&operations.has(task.operation)){const membership=nativeSourceRegionMembership(domain),regions=nativeSourceRegionDefaultRegions(membership),complement=nativeSourceRegionCandidateExclusions(membership);
  if(!out.params.regions?.length){out.params.regions=regions.map(r=>r.polygon);if(out.params.regions.length>1&&!out.params.compare)out.params.regions.push([[0,0],[domain.width,0],[domain.width,domain.height],[0,domain.height]]);}
  if(certifyNativeParameters){const certificate=already?existing.nativeParameterExclusions:null;
  if(certificate&&certificate.schema!=='sherloq.native-acquisition-parameter-exclusions/1')throw fail('Invalid native acquisition exclusion certificate.');
  const original=certificate?await polygons(certificate.original):already?(out.params.excluded??[]).map(poly=>poly.map(([x,y])=>[x+domain.origin[0],y+domain.origin[1]])):structuredClone(task.params?.excluded??[]),provided=original.map(poly=>poly.map(([x,y])=>[x-domain.origin[0],y-domain.origin[1]])),providedKeys=new Set(provided.map(poly=>JSON.stringify(poly))),generated=complement.filter(poly=>!providedKeys.has(JSON.stringify(poly))),merged=[...new Map([...provided,...complement].map(poly=>[JSON.stringify(poly),poly])).values()];
  if(certificate&&(JSON.stringify(certificate.generated)!==JSON.stringify(generated)||JSON.stringify(out.params.excluded??[])!==JSON.stringify(merged)))throw fail('Native candidate-only exclusion certificate differs from the original acquisition domain or explicitly supplied exclusions.');
  nativeParameterExclusions={schema:'sherloq.native-acquisition-parameter-exclusions/1',original,generated:structuredClone(generated)};out.params.excluded=merged;}else out.params.excluded=[...new Map([...(out.params.excluded??[]),...complement].map(poly=>[JSON.stringify(poly),poly])).values()];
  if(!out.params.guides?.length&&!out.params.compare)out.params.guides=regions.map(r=>r.polygon);
  nativeParameterGeometry=certifyNativeRequestedGeometry(task,out.params,domain,{already,defaultRegions:regions});
 }
 let scoped;
 if(task.scientificScope){
  const input=task.scientificScope;
  try{compileForgeryscopeScientificScope(input,{width:already?domain.width:domain.sourceWidth,height:already?domain.height:domain.sourceHeight,sourceSha256:domain.sourceSha256});}catch(cause){throw new EngineError('SOURCE_REGIONS_INVALID','Scientific scope does not match its declared native source grid.',{cause});}
  scoped={...input,width:domain.width,height:domain.height,regions:await regions(input.regions),excluded:await polygons(input.excluded)};
  if(input.searchRegions)scoped.searchRegions=await regions(input.searchRegions);
  if(input.text){scoped.text={...input.text};if(input.text.polygons)scoped.text.polygons=await polygons(input.text.polygons);if(input.text.detections){scoped.text.detections=[];for(const detection of input.text.detections){const next={...detection};if(detection.polygon)next.polygon=await polygon(detection.polygon);if(detection.bounds)next.bounds=box(detection.bounds);if(detection.rectangle)next.rectangle=box(detection.rectangle);scoped.text.detections.push(next);}}}
  if(nativeRegions){const expected=nativeSourceRegionMembership(domain);if(already&&JSON.stringify(input.nativeSourceRegions)!==JSON.stringify(expected))throw fail('Localized native acquisition membership differs from the original-source domain.');scoped.nativeSourceRegions=expected;scoped.excluded=[...new Map([...scoped.excluded,...nativeSourceRegionCandidateExclusions(expected)].map(poly=>[JSON.stringify(poly),poly])).values()];}
  const key=['localized-scientific-scope/1',already?existing.originalScopeFingerprint:input.fingerprint,domain.fingerprint,domain.sourceSha256,domain.width,domain.height,scoped.regions,scoped.searchRegions,scoped.excluded,scoped.text?.status,scoped.text?.polygons,scoped.models,...(nativeRegions?[scoped.nativeSourceRegions]:[])];
  const fingerprint=await digest(key);if(already&&input.fingerprint!==fingerprint)throw fail('Localized scientific scope fingerprint does not match its geometry.');scoped.fingerprint=fingerprint;scoped.sourceRegionDomain=domain.descriptor;scoped.sourceRegionOrigin=[...domain.origin];
  scoped.sourceRegionLocalization={schema,coordinates:'source-region-native',originalScopeFingerprint:already?existing.originalScopeFingerprint:input.fingerprint,domainFingerprint:domain.fingerprint,originalSha256:domain.sourceSha256,originalGrid:[domain.sourceWidth,domain.sourceHeight],origin:[...domain.origin],width:domain.width,height:domain.height,metadataCoordinates:'Only regions/searchRegions/excluded/text geometry are translated; other source metadata remains in its recorded original coordinates.'};
  compileForgeryscopeScientificScope(scoped,{width:domain.width,height:domain.height,sourceSha256:domain.sourceSha256});out.scientificScope=scoped;
 }
 // An entirely disjoint selected rectangle may not become an implicit full
 // frame. Keep other shapes/vertices untouched for the native membership code.
 const positive=scoped?.regions?.map(r=>r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]])??geometry.regions;
 if(scoped&&!positive?.length)throw new EngineError('SOURCE_SCOPE_EMPTY','The scientific scope has no native acquisition region.');
 // Sparse native two-ROI comparison is preserved across analysis windows.
 // A missing ROI gives the native method an empty comparison; it must not
 // replace the ROI, borrow another window, or discard visible native features.
 const nativeSparsePair=task.operation==='tampering.copyMove.sparse'&&out.params.regions?.length===2&&(out.params.compare===true||out.params.algorithm==='EfficientLoFTR'&&out.params.compare===undefined);
 if(positive?.length&&!nativeSparsePair){for(const poly of positive){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const[x,y]of poly){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}if(maxX<=0||maxY<=0||minX>=domain.width||minY>=domain.height)throw new EngineError('SOURCE_SCOPE_EMPTY','A selected native clone region lies entirely outside the admitted original-source crop.');}}
 out.sourceRegionLocalization={schema,coordinates:'source-region-native',domainFingerprint:domain.fingerprint,originalSha256:domain.sourceSha256,originalGrid:[domain.sourceWidth,domain.sourceHeight],origin:[...domain.origin],width:domain.width,height:domain.height,...(scoped?{originalScopeFingerprint:scoped.sourceRegionLocalization.originalScopeFingerprint,localizedScopeFingerprint:scoped.fingerprint}:{}),...(nativeParameterExclusions?{nativeParameterExclusions}:{}),...(nativeParameterGeometry?{nativeParameterGeometry}:{}),...(already&&existing.sparseDefaults?{sparseDefaults:structuredClone(existing.sparseDefaults)}:{}),policy:nativeRegions?'Exact native acquisitions and comparison envelope; acquisition complement restricts candidates before matching but remains available as declared RGB context; no explicit source exclusion is admitted.':'Exact native-grid translation; no polygons or exclusions dropped; no encoded crop.'};
 checkAbort(signal);return out;
}
