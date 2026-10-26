import "../../runtime-context.js?v=0.24.0";
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
const nativePolygons=new Set(SOURCE_REGION_LOCAL_GEOMETRY_OPERATIONS);
// A source crop does not by itself translate independent scientific polygons,
// prepared scopes or a paired mask/reference. Refuse them until an adapter has
// localized both their geometry and their source identity explicitly.
export function sourceRegionUnlocalizedInput(task={},operation=task.operation){
 const present=value=>value!==undefined&&value!==null&&value!==false&&(!Array.isArray(value)||value.length>0);
 for(const owner of [['task',task],['params',task.params??{}]]){
  for(const key of ['scientificScope','selection','regions','fourierRegions','excluded','guides','maskImageId','referenceImageId','referenceId'])if(present(owner[1][key])){
   if(neuralRegions.has(operation)&&((owner[0]==='params'&&['selection','scientificScope','exclusions'].includes(key))||(owner[0]==='task'&&['regions','scientificScope'].includes(key))))continue;
   if(owner[0]==='params'&&nativePolygons.has(operation)&&['regions','excluded','guides'].includes(key))continue;
   if(owner[0]==='params'&&operation==='tampering.resampling'&&['regions','fourierRegions'].includes(key))continue;
   if(owner[0]==='task'&&key==='scientificScope'&&operation==='tampering.copyMove.sparse')continue;
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
 return domain.countIncluded===domain.width*domain.height?'rectangle':'membership';
}
export function sourceRegionOperationCapability(operation,{shape='identity',params,task,capabilities,adapters={}}={}){
 const published=capabilities?.operations?.[operation],adapter=adapters[operation],extraShapes=published?.shapes??adapter?.shapes??[];
 const unlocalized=shape==='identity'?null:sourceRegionUnlocalizedInput({...task,params:params??task?.params},operation);let supported=false,method=null;
 if(shape==='identity'){supported=true;method='original-identity';}
 else if(unlocalized){/* This rejection precedes all scientific computation. */}
 else if(operation==='inspection.histogram'&&['rectangle','membership'].includes(shape)){supported=true;method='included-native-histogram';}
 else if(extraShapes.includes(shape)){supported=typeof adapter?.accepts!=='function'||adapter.accepts(adapter.validateParams?adapter.validateParams(params??{}):params??{});method=supported?(published?.adapter??'registered-native-domain'):null;}
 else if(shape==='rectangle'&&rectangles.has(operation)){supported=true;method='native-rectangle-view';}
 return{operation,shape,supported,adapter:method,encodedOriginalPreserved:true,...(!supported?{...(unlocalized?{unlocalizedInput:unlocalized}:{}),reason:shape==='empty'?'The source selection admits no original pixels.':unlocalized?'Scientific coordinates or a paired source require a qualified localization adapter for this original-source crop.':'This operation has no qualified adapter for this original-source domain. No excluded samples are replaced or silently re-admitted.'}:{})};
}
export function assertSourceRegionOperation(operation,options={}){
 const value=sourceRegionOperationCapability(operation,options);
 if(!value.supported)throw new EngineError(value.shape==='empty'?'SOURCE_SCOPE_EMPTY':'SOURCE_SCOPE_UNSUPPORTED',value.reason,{details:{operation,shape:value.shape,sourceRegionCapability:value}});
 return value;
}
export function sourceRegionCapabilities(adapters={}){
 const operations={};for(const operation of SOURCE_REGION_RECTANGLE_OPERATIONS)operations[operation]={shapes:operation==='inspection.histogram'?['rectangle','membership']:['rectangle'],adapter:operation==='inspection.histogram'?'included-native-histogram':'native-rectangle-view'};
 for(const[operation,adapter]of Object.entries(adapters))operations[operation]={shapes:[...new Set([...(operations[operation]?.shapes??[]),...adapter.shapes])],adapter:'registered-native-domain',...(adapter.accepts?{nativeParameterValidation:true}:{}),...(adapter.parameterConstraints?{parameterConstraints:adapter.parameterConstraints}:{})};
 return{schema:'sherloq.source-region-capabilities/1',transport:'task.sourceRegionDomain',identity:'original-identity',operations,localizedPolygonOperations:[...nativePolygons],unsupported:'SOURCE_SCOPE_UNSUPPORTED',coordinateInputs:'Sparse/dense rectangles translate native polygons and validated sparse scopes explicitly; other independent scopes and paired sources require separate adapters.',excludedSamples:'absent, never black observations'};
}
