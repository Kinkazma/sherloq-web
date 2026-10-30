import "../../runtime-context.js?v=0.30.0";
import {sourceRegionHasNativeAcquisitions} from './source-region-native-regions.js';
import {EngineError} from './errors.js';

// These maintained pipelines consume the derived RGB grid. Encoded-byte and
// paired-source methods need separate native-domain adapters. M3 and dense
// engines retain their own native preprocessing; this layer only changes their
// admitted source grid, never their resolution, parameters or model methods.
export const SOURCE_REGION_RECTANGLE_OPERATIONS=Object.freeze([
 'analysis.complete','analysis.clones','ai.clones.d2prl','ai.clones.segmentation',
 'subimages.detect','ela.classic','ela.energy','ela.biomes','jpeg.zero','jpeg.quality','jpeg.recompression','jpeg.ghosts','inspection.histogram','inspection.magnifier','inspection.adjust','detail.gradient','detail.echo',
 'detail.frequency','detail.wavelets','noise.blocking','noise.separation','noise.planes','noise.noisesniffer',
 'noise.minmax','pixels.defects','colors.space','colors.stats','colors.pca',
 'colors.plots','various.median','tampering.contrast','various.illuminant',
 'various.stereogram','various.ocr','tampering.resampling','tampering.resampling.fourier','tampering.copyMove.brisk','tampering.copyMove.orb',
 'tampering.copyMove.akaze','tampering.copyMove.sparse','tampering.copyMove.dense',
 'ai.sources.safire','ai.localization.focal','ai.localization.adaifl',
 'ai.generation.bfree','ai.generation.spai','jpeg.comprint'
]);
const rectangles=new Set(SOURCE_REGION_RECTANGLE_OPERATIONS);
export const SOURCE_REGION_LOCAL_GEOMETRY_OPERATIONS=Object.freeze(['tampering.copyMove.sparse','tampering.copyMove.dense']);
const neuralRegions=new Set(['analysis.complete','analysis.clones','ai.clones.d2prl','ai.clones.segmentation']);
const nativePolygons=new Set(SOURCE_REGION_LOCAL_GEOMETRY_OPERATIONS),nativeRegionOperations=new Set([...neuralRegions,...nativePolygons]);
const encodedOperations=new Set(['metadata.exiftool','metadata.c2pa','metadata.structure','metadata.location','metadata.thumbnail','file.hex','file.digest','jpeg.multiple']);
const nativeRegionParameterRules={'tampering.copyMove.sparse':{algorithm:{notEquals:'EfficientLoFTR'}}};
const pairedOperations=new Set(['comparison.image','file.similarity','noise.prnu']);
// Published descriptors carry data rules, not runtime adapter functions, so
// the UI and worker can reject the same parameters before dispatch.
function publishedParameterRules(params,rules){
 for(const [key,rule]of Object.entries(rules??{})){const value=params[key]??rule.default;if(Object.hasOwn(rule,'oneOf')&&(!Array.isArray(rule.oneOf)||!rule.oneOf.includes(value))||Object.hasOwn(rule,'equals')&&value!==rule.equals||Object.hasOwn(rule,'notEquals')&&value===rule.notEquals||Object.hasOwn(rule,'minimum')&&!(Number.isFinite(value)&&value>=rule.minimum)||Object.hasOwn(rule,'maximum')&&!(Number.isFinite(value)&&value<=rule.maximum))return false;}
 return true;
}
function limitation(operation,shape,unlocalized){
 if(shape==='empty')return{code:'SOURCE_SCOPE_EMPTY',reason:'The source selection admits no original pixels.'};
 if(unlocalized)return{code:'SOURCE_COORDINATES_UNLOCALIZED',reason:'Scientific coordinates or a paired source require a qualified localization adapter for this original-source crop.'};
 if(encodedOperations.has(operation))return{code:'ORIGINAL_ENCODED_SOURCE_REQUIRED',reason:'This operation analyses the original encoded file. A derived RGB rectangle cannot replace its original byte stream or embedded evidence.'};
 if(operation==='ai.text.doctamper')return{code:'SOURCE_DCT_CROP_UNQUALIFIED',reason:'This method needs JPEG/DCT data aligned with its RGB plane; an exact original-source crop adapter has not been qualified.'};
 if(pairedOperations.has(operation))return{code:'SOURCE_PAIRED_CROP_UNQUALIFIED',reason:'This paired/reference-source method needs an adapter that localizes every source consistently; cropping only one image is not a qualified analysis.'};
 if(shape==='native-regions')return{code:'SOURCE_NATIVE_REGIONS_ADAPTER_UNQUALIFIED',reason:'This native multi-zone route is not qualified for the requested method. Rectangular acquisitions and their envelope context differ from strict explicit exclusions.'};
 if(shape==='membership')return{code:operation==='inspection.adjust'?'SOURCE_NEIGHBORHOOD_MEMBERSHIP_UNQUALIFIED':'SOURCE_UPSTREAM_MEMBERSHIP_UNQUALIFIED',reason:operation==='inspection.adjust'?'Sharpening or local CLAHE has no qualified exclusion-aware neighborhood adapter. No excluded pixels are used as observations.':'This method has no qualified adapter that removes excluded observations before its neighborhoods, statistics, features or neural context. A result mask cannot replace that upstream restriction.'};
 return{code:'SOURCE_DOMAIN_ADAPTER_UNQUALIFIED',reason:'This operation has no qualified adapter for this original-source domain. No excluded samples are replaced or silently re-admitted.'};
}
// A source crop does not by itself translate independent scientific polygons,
// prepared scopes or a paired mask/reference. Refuse them until an adapter has
// localized both their geometry and their source identity explicitly.
export function sourceRegionUnlocalizedInput(task={},operation=task.operation,{handledInputs=[]}={}){
 const present=value=>value!==undefined&&value!==null&&value!==false&&(!Array.isArray(value)||value.length>0);
 for(const owner of [['task',task],['params',task.params??{}]]){
  for(const key of ['scientificScope','selection','regions','fourierRegions','excluded','guides','maskImageId','referenceImageId','referenceId'])if(present(owner[1][key])){
   if(neuralRegions.has(operation)&&((owner[0]==='params'&&['selection','scientificScope','exclusions'].includes(key))||(owner[0]==='task'&&['regions','scientificScope'].includes(key))))continue;
   if(handledInputs.includes(owner[0]+'.'+key))continue;
   if(owner[0]==='params'&&nativePolygons.has(operation)&&['regions','excluded','guides'].includes(key))continue;
   if(owner[0]==='params'&&operation==='tampering.resampling'&&['regions','fourierRegions'].includes(key))continue;
   if(owner[0]==='task'&&key==='scientificScope'&&nativePolygons.has(operation))continue;
   return owner[0]+'.'+key;
  }
  if(owner[1].compare===true&&!(owner[0]==='params'&&nativePolygons.has(operation)))return owner[0]+'.compare';
 }
 return null;
}
export function sourceRegionDomainShape(domain){
 const width=domain?.sourceWidth??domain?.snapshot?.width,height=domain?.sourceHeight??domain?.snapshot?.height;
 if(!domain||domain.empty===true||domain.countIncluded===0)return'empty';
 if(domain.width===width&&domain.height===height&&domain.origin?.[0]===0&&domain.origin?.[1]===0&&domain.countIncluded===width*height)return'identity';
 return domain.countIncluded===domain.width*domain.height?'rectangle':sourceRegionHasNativeAcquisitions(domain)?'native-regions':'membership';
}
export function sourceRegionOperationCapability(operation,{shape='identity',params,task,capabilities,adapters={}}={}){
 const published=capabilities?.operations?.[operation],adapter=adapters[operation],extraShapes=published?.shapes??adapter?.shapes??[];
 const declaredShape=extraShapes.includes(shape)||shape==='native-regions'&&extraShapes.includes('membership'),handledInputs=declaredShape?(published?.handledInputs??adapter?.handledInputs??[]):[];
 const unlocalized=shape==='identity'?null:sourceRegionUnlocalizedInput({...task,params:params??task?.params},operation,{handledInputs});let supported=false,method=null;
 if(shape==='identity'){supported=true;method='original-identity';}
 else if(unlocalized){/* This rejection precedes all scientific computation. */}
 else if(shape==='native-regions'&&!publishedParameterRules(params??task?.params??{},published?.nativeRegionParameterRules??adapter?.nativeRegionParameterRules??nativeRegionParameterRules[operation])){/* EfficientLoFTR currently filters only published matches, not coarse/fine candidates. */}
 else if(operation==='inspection.histogram'&&['rectangle','native-regions','membership'].includes(shape)){supported=true;method='included-native-histogram';}
 else if(extraShapes.includes(shape)||shape==='native-regions'&&extraShapes.includes('membership')){const nativeParams=adapter?.validateParams?adapter.validateParams(params??{}):params??{};supported=publishedParameterRules(nativeParams,published?.parameterRules??adapter?.parameterRules)&&publishedParameterRules(nativeParams,(published?.shapeParameterRules??adapter?.shapeParameterRules)?.[shape])&&(typeof adapter?.accepts!=='function'||adapter.accepts(nativeParams));method=supported?(published?.adapter??'registered-native-domain'):null;}
 else if(shape==='native-regions'&&nativeRegionOperations.has(operation)){supported=true;method='native-independent-regions';}
 else if(shape==='rectangle'&&rectangles.has(operation)){supported=true;method='native-rectangle-view';}
 const unsupported=supported?null:limitation(operation,shape,unlocalized);
 return{operation,shape,supported,adapter:method,encodedOriginalPreserved:true,...(!supported?{...(unlocalized?{unlocalizedInput:unlocalized}:{}),limitation:unsupported.code,reason:unsupported.reason}:{})};
}
export function assertSourceRegionOperation(operation,options={}){
 const value=sourceRegionOperationCapability(operation,options);
 if(!value.supported)throw new EngineError(value.shape==='empty'?'SOURCE_SCOPE_EMPTY':'SOURCE_SCOPE_UNSUPPORTED',value.reason,{details:{operation,shape:value.shape,sourceRegionCapability:value}});
 return value;
}
export function sourceRegionCapabilities(adapters={}){
 const operations={};for(const operation of SOURCE_REGION_RECTANGLE_OPERATIONS)operations[operation]={shapes:operation==='inspection.histogram'?['rectangle','native-regions','membership']:nativeRegionOperations.has(operation)?['rectangle','native-regions']:['rectangle'],adapter:operation==='inspection.histogram'?'included-native-histogram':nativeRegionOperations.has(operation)?'native-independent-regions':'native-rectangle-view',...(nativeRegionParameterRules[operation]?{nativeRegionParameterRules:structuredClone(nativeRegionParameterRules[operation])}:{})};
 for(const[operation,adapter]of Object.entries(adapters))operations[operation]={shapes:[...new Set([...(operations[operation]?.shapes??[]),...adapter.shapes,...(adapter.shapes.includes('membership')?['native-regions']:[])])],adapter:'registered-native-domain',...(adapter.handledInputs?{handledInputs:[...adapter.handledInputs]}:{}),...(adapter.accepts?{nativeParameterValidation:true}:{}),...(adapter.parameterConstraints?{parameterConstraints:adapter.parameterConstraints}:{}),...(adapter.nativeRegionParameterRules?{nativeRegionParameterRules:structuredClone(adapter.nativeRegionParameterRules)}:{}),...(adapter.parameterRules?{parameterRules:structuredClone(adapter.parameterRules)}:{}),...(adapter.shapeParameterRules?{shapeParameterRules:structuredClone(adapter.shapeParameterRules)}:{})};
 return{schema:'sherloq.source-region-capabilities/1',transport:'task.sourceRegionDomain',identity:'original-identity',operations,localizedPolygonOperations:[...nativePolygons],unsupported:'SOURCE_SCOPE_UNSUPPORTED',coordinateInputs:'Sparse/dense rectangles translate native polygons and validated sparse scopes explicitly; other independent scopes and paired sources require separate adapters.',nativeRegions:{shape:'native-regions',contract:'Independent rectangular acquisitions plus an explicit native envelope; source and target candidates are restricted, envelope RGB context remains computed. No explicit source exclusion is admitted by this route.'},excludedSamples:'Strict membership adapters omit excluded observations; native-regions may retain gaps as the declared envelope context, never explicit source exclusions.'};
}
