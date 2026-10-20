import {createParameterPreview} from './tool-parameter-preview.js?v=0.23.0';
import {createAdaptivePreview} from './adaptive-preview.js?v=0.23.0';
import {renderRetainedPreview,updateRetainedParameters,retainedPreviewWorkingBytes,renderRetainedWindow,planRetainedPreview} from './retained-parameter-preview.js?v=0.23.0';
import {parameterPreviewPolicy} from './parameter-preview-policy.js?v=0.23.0';
import {isExtensionTool,extensionConfiguration} from './extension-tools.js?v=0.23.0';
import {dtdFrame} from './dtd-presentation.js?v=0.23.0';
import {comprintFrame} from './comprint-presentation.js?v=0.23.0';
import {truforHeatFrame} from './trufor-palette.js?v=0.23.0';
import {ritaFrame,ritaDisplayThreshold,ritaDisplayOpacity} from './rita-presentation.js?v=0.23.0';
import {displayGeometry} from './unified-engine/src/display-sampling.js';
import {localFeaturePolicy} from './feature-policy.js?v=0.23.0';
import {composeCloneFrame,sampleCloneField,d2AnalysisKey} from './neural-clone-ui.js?v=0.23.0';
import {samplePixels} from './unified-engine/src/display-sampling.js';
import {individualModels,m2ToolClient} from './tool-models.js?v=0.23.0';
import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {D2PRL_MODEL_IDENTITY} from './unified-engine/src/d2prl-model-identity.js';
import {createExportSink} from './export-sink.js?v=0.23.0';
import {exportPresentationRaster} from './raster-export-client.js?v=0.23.0';
import {EngineError,checkAbort} from './unified-engine/src/errors.js';
import {composeBiomeWindow,biomePresentationWorkingBytes} from './detection-biome-presentation.js?v=0.23.0';

// Dense native counters may exceed JS's exact-number range. Keep their decimal
// values as strings in JSON; borrow scientific typed arrays without copying them.
export function jsonExportValue(value){
 if(typeof value==='bigint')return value.toString();
 if(ArrayBuffer.isView(value))return value instanceof BigInt64Array||value instanceof BigUint64Array?Array.from(value,String):value;
 if(Array.isArray(value))return value.map(jsonExportValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,item])=>!(key==='parameterViews'&&Array.isArray(item)&&item.every(view=>view?.retainedParameterView))).map(([k,v])=>[k,jsonExportValue(v)]));
 return value;
}

export function sparseNpzPreparationBytes(result){
 const bound=v=>ArrayBuffer.isView(v)?v.length*32+2:v===null||typeof v!=='object'?typeof v==='string'?v.length*6+2:32:Object.entries(v).reduce((n,[k,x])=>n+k.length*6+bound(x)+4,2);
 // The native NPZ keeps numeric arrays AND a nested JSON mirror of their rows.
 // Allow both representations and their row headers before serialization.
 return 65536+8*(bound(result.data)+bound(result.provenance)+bound(result.style)+bound(result.visible));
}

export function resultResources(result){
 const surfaces=new Map(),tables=new Map();const visit=value=>{if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||value.retainedParameterView)return;
  if(typeof value.id==='string'&&Number.isInteger(value.revision)){if(Number.isInteger(value.rowCount)&&Array.isArray(value.columns))tables.set(value.id,value);else if(Number.isInteger(value.width)&&Number.isInteger(value.height)&&typeof value.format==='string')surfaces.set(value.id,value);}
  for(const v of Object.values(value))visit(v);
 };visit(result);return {surfaces:[...surfaces.values()],tables:[...tables.values()]};
}
// Configuration belongs to the engine, which can outlive an individual tool
// document. Query its actual state so retries and other documents cannot leave
// a client-side variant flag out of sync with the guarded native adapter.
export async function configureSegmentationModel(engine,model,hooks={}){
 checkAbort(hooks.signal);
 const capabilities=await engine.capabilities(),operation=capabilities.operations?.find(value=>value.id==='ai.clones.segmentation');
 if(!operation||!Object.hasOwn(operation,'configuredVariant'))throw new EngineError('UNSUPPORTED_OPERATION','Segmentation configuration state is unavailable.');
 checkAbort(hooks.signal);
 if(operation.configuredVariant===model.variant)return;
 if(operation.configuredVariant!==null)await engine.unloadSegmentationModel();
 checkAbort(hooks.signal);
 await engine.loadSegmentationModel(model,hooks);
}
export async function configureExtensionModels(engine,configuration,hooks={}){
 checkAbort(hooks.signal);const caps=await engine.capabilities();checkAbort(hooks.signal);
 if(!caps.extensions?.configured)await engine.loadExtensionModels(configuration,hooks);
}
export async function createToolClient({computeProfile='maximum',onProgress=()=>{},onInvalidated=()=>{},engineFactory=createWorkerEngine,m2Factory=m2ToolClient,memoryBudgetBytes,m2MemoryBudgetBytes=Infinity,resourceHints}={}){
 const deployment=await (await fetch(new URL('./integrated-config.json?v=0.23.0',import.meta.url))).json();
 const base=new URL(deployment.assetBase,new URL('./integrated-config.json?v=0.23.0',import.meta.url));
 const asset=name=>new URL(name,base).href;
 const engine=engineFactory({computeProfile,...(resourceHints?{resourceHints}:{}),...(memoryBudgetBytes?{memoryBudgetBytes}:{}),...(deployment.memoryExtensionId?{memoryExtensionId:deployment.memoryExtensionId}:{})});
 let queue=Promise.resolve(),disposed=false,controller,source,result,reference,mask,prnu,median,quality,m3Loaded=false,m3OcrLoaded=false,d2Loaded=false,segmentationModels,m2=null,m2Method=null;
 let parameterPreview=null,parameterReferenceInput=null;
 const displayAdaptive=createAdaptivePreview();
 async function previewPixelsBudget(bytesPerPixel=40,fixedBytes=256*1024){
  const memory=(await engine.capabilities()).memory??{};
  const budget=memory.budgetBytes??memoryBudgetBytes??64*1024**2;
  const used=(memory.retainedBytes??0)+(memory.cacheBytes??0)+(memory.activeReservationBytes??0)+(memory.knownHeapCapacityBytes??0);
  const available=Math.max(0,budget-used-fixedBytes),pixels=Math.min(2048**2,Math.floor(available/bytesPerPixel));
  if(pixels<16**2)throw new EngineError('PREVIEW_UNAVAILABLE','No bounded workspace is available for a provisional display.');return pixels;
 }
 async function displayPreviewPlan(display){
  const key='response/'+(display.ritaPresentation?'rita':display.comprintPresentation?'comprint':'dtd')+'/'+(display.ritaPresentation?.mode??display.comprintPresentation?.mode??display.dtdPresentation?.mode??'map');
  const plan=displayAdaptive.plan({key,width:display.width,height:display.height,maxSide:2048,maxPixels:await previewPixelsBudget(40)});
  return{...display,responsePreview:true,previewStep:plan.step,adaptivePreview:{token:plan.token}};
 }

 let d2Analysis=null,responseProxy=null,ritaProxy=null;let sourceInput;const sourceAliases=new Set();
 const invalidated=()=>{void clearResponseProxy();void clearRitaProxy();d2Analysis=null;const resultLost=!!result&&!result.m2Result;if(!result?.m2Result)result=null;source=reference=mask=prnu=median=quality=null;m3Loaded=m3OcrLoaded=d2Loaded=false;onInvalidated({resultLost});};
 engine.onSourceInvalidation?.(invalidated);
 const resolve=value=>Array.isArray(value)?value.map(resolve):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='url'?asset(v):resolve(v)])):value;
 const enqueue=fn=>{const task=queue.then(()=>{if(disposed)throw Object.assign(Error('Outil fermé'),{code:'CANCELLED'});return fn();});queue=task.catch(()=>{});return task;};
 const hooks=()=>({signal:controller?.signal,onProgress});
 const work=async fn=>{controller=new AbortController();try{return await fn();}catch(error){if(m2&&['WORKER_FAILED','WORKER_MESSAGE_FAILED','WORKER_LOAD_FAILED','DISPOSED'].includes(error.code)){const failed=m2;m2=null;m2Method=null;if(result?.m2Result)result=null;await failed.dispose().catch(()=>{});}if(error.imagesCleared){d2Analysis=null;source=result=reference=mask=prnu=median=quality=null;m3Loaded=m3OcrLoaded=d2Loaded=false;}throw error;}finally{controller=null;}};
 async function release(){await clearResponseProxy();await clearRitaProxy();if(!result)return;if(result.m2Result){await m2.release(result.m2Result.id);result=null;return;}const previous=result;result=null;const resources=resultResources(previous);for(const s of resources.surfaces)if(s.id!==source?.surface.id)await engine.releaseSurface(s.id);for(const t of resources.tables)await engine.releaseTable(t.id);}
 async function clearParameterPreview(){const old=parameterPreview;parameterPreview=null;if(old)await old.dispose();}
 async function parameterSource({side=192,maxSide=side,signal}={},paired=false){
  return enqueue(async()=>{
   checkAbort(signal);let image;
   if(paired){
    const blob=parameterReferenceInput;if(!blob)throw new EngineError('INVALID_INPUT','A comparison reference is required.');
    if(reference?.blob!==blob){if(reference){const old=reference;reference=null;await engine.unload(old.id);}const id='reference-'+crypto.randomUUID(),descriptor=await engine.loadBlob({id,blob,layout:'segmented'});reference={id,blob,surface:descriptor.surface};}
    image=reference;
   }else{if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'});sourceAliases.add(source.surface.id);}image=source;}
   if(!image?.surface)throw new EngineError('CACHE_MISS','Preview source is unavailable.');
   const d=image.surface,step=Math.max(1,Math.ceil(Math.max(d.width,d.height)/Math.max(1,Math.min(2048,maxSide)))),lease=await engine.reserveExternalMemory({bytes:Math.ceil(d.width/step)*Math.ceil(d.height/step)*3});
   try{const {pixels}=await engine.readDisplay({surfaceId:d.id,revision:d.revision,tile:{x:0,y:0,w:d.width,h:d.height,step}});checkAbort(signal);return {pixels,logicalWidth:d.width,logicalHeight:d.height,sourceIdentity:image.sha256??image.id};}
   finally{await engine.releaseExternalMemory(lease.id);}
  });
 }
 async function previewParameters(task,{field,signal,extras={}}={}){
  checkAbort(signal);const policy=parameterPreviewPolicy(task.toolId??task.operation,field);
  if(policy.kind==='retained'&&['safire-grouping','stereo-native-cache','zero-native-cache'].includes(policy.strategy)){
   const currentResult=result,currentSource=source;if(!currentResult||!currentSource)return null;
   const maxPixels=await enqueue(()=>previewPixelsBudget(40)),plan=planRetainedPreview({output:currentResult,operation:task.operation,params:task.params,view:task.view,field,source:currentSource.surface,maxPixels});if(!plan)return null;
   return enqueue(async()=>{
    checkAbort(signal);if(result!==currentResult||source!==currentSource)throw new EngineError('CANCELLED','Preview source or result changed.');
    if(typeof engine.previewParameters!=='function')throw new EngineError('PREVIEW_UNAVAILABLE','This engine does not expose retained parameter previews.');
    const lease=await engine.reserveExternalMemory({bytes:plan.pixels*8+65536}),started=performance.now();
    try{
     const memory=(await engine.capabilities()).memory??{},budget=memory.budgetBytes??memoryBudgetBytes??64*1024**2,available=memory.policyAvailableBytes??Math.max(0,budget-(memory.retainedBytes??0)-(memory.cacheBytes??0)-(memory.activeReservationBytes??0)),maxWorkingBytes=Math.max(0,Math.floor(Math.min(budget/3,available))),targetMs=policy.targetMs??(policy.strategy==='safire-grouping'?200:50);
     const answer=await engine.previewParameters({id:'parameter-preview-'+crypto.randomUUID(),imageId:currentSource.id,operation:task.operation,params:task.params,view:task.view,backend:task.backend??'auto'},{preview:{maxSide:plan.side,maxPixels:plan.pixels,maxWorkingBytes,targetMs},signal});checkAbort(signal);
     const pixels=answer?.pixels;if(!pixels||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3||pixels.width*pixels.height>plan.pixels||pixels.width>2048||pixels.height>2048)throw new EngineError('INVALID_INPUT','Retained preview exceeded its admitted transport frame.');
     return{...answer,exact:false,provisional:true,metrics:{...answer.metrics,adaptivePreview:{token:plan.token,milliseconds:performance.now()-started,setupMilliseconds:answer.metrics?.setupMilliseconds??0,cold:!!answer.metrics?.cold,pixels:pixels.width*pixels.height}}};
    }finally{await engine.releaseExternalMemory(lease.id);}
   });
  }
  if(policy.kind==='retained'&&result){const args={output:result,operation:task.operation,params:task.params,view:task.view,field,source:source?.surface,signal,readTile:(display,tile)=>client.readTile(display,tile),readTable:(table,offset,length)=>client.readTable(table,offset,length)},maxPixels=await enqueue(()=>previewPixelsBudget(40,retainedPreviewWorkingBytes({maxSide:1})-40+256*1024)),plan=planRetainedPreview({...args,maxPixels});const lease=await enqueue(()=>engine.reserveExternalMemory({bytes:retainedPreviewWorkingBytes({plan})}));try{const answer=await renderRetainedPreview({...args,adaptivePlan:plan});checkAbort(signal);return answer;}finally{await enqueue(()=>engine.releaseExternalMemory(lease.id));}}
  if(policy.kind!=='pixel-proxy')return null;
  parameterReferenceInput=extras.reference;
  parameterPreview??=createParameterPreview({readSource:parameterSource,readReference:request=>parameterSource(request,true),reserve:({bytes})=>enqueue(()=>engine.reserveExternalMemory({bytes})),release:lease=>engine.releaseExternalMemory(lease.id)});
  return parameterPreview.preview({...task,field,sourceIdentity:source?.sha256??source?.id,logicalWidth:source?.surface.width,logicalHeight:source?.surface.height,signal});
 }
 async function segmentationModel(variant){
  segmentationModels??=await individualModels();const model=segmentationModels.segmentation?.[variant];
  if(!model)throw new EngineError('MODEL_UNAVAILABLE','Segmentation model is not configured.',{details:{variant}});
  return {...resolve(model),variant};
 }
 async function configure(operation,params={}){
  if(operation==='ai.clones.d2prl'&&!d2Loaded){await engine.loadD2prlModel({...D2PRL_MODEL_IDENTITY,url:asset('d2prl/model.json')},hooks());d2Loaded=true;}
  const needsOcr=operation==='tampering.copyMove.sparse'&&params.algorithm==='SIFT + G2NN + RANSAC + Panels + Text';
  if((operation.startsWith('ai.sources.')||operation.startsWith('ai.localization.')||operation==='tampering.copyMove.sparse')&&(!m3Loaded||needsOcr&&!m3OcrLoaded)){
   const manifest=await individualModels();let language;
   // Learned matching and ordinary SIFT do not use OCR. Fetch it only for the
   // requested Panels + Text pass; a failed fetch leaves the image intact.
   if(needsOcr){
    const requestedUrl=asset('ocr/eng.traineddata'),response=await fetch(requestedUrl,{signal:controller?.signal});
    if(!response.ok)throw new EngineError('ASSET_HTTP','OCR dependency could not load.',{details:{requestedUrl,receivedUrl:response.url||requestedUrl,status:response.status,file:'ocr/eng.traineddata',sha256:deployment.englishSha256}});
    language={data:new Uint8Array(await response.arrayBuffer()),sha256:deployment.englishSha256};
   }
   await engine.loadM3Models({models:resolve(manifest.m3),...(language?{language}:{})},hooks());m3Loaded=true;m3OcrLoaded=!!language;
  }
  if(operation==='various.median'&&!median){const manifest=await individualModels();if(!manifest.median)throw Error('Choisissez un modèle médian XGBoost.');const response=await fetch(asset(manifest.median.url),{signal:controller?.signal});if(!response.ok)throw Error('Modèle médian absent.');await engine.loadMedianModel({id:'median-model',blob:await response.blob()},hooks());median='median-model';}
 }
 async function clonePixels(display,tile){
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  const field=display.cloneView==='overlay'?'map':display.cloneView;
  const read=async key=>{
   if(display.m2Result)return sampleCloneField(m2,display,key,tile);
   const d=display.cloneFields[key],p=(await engine.readDisplay({surfaceId:d.id,revision:d.revision,tile,render:{range:d.range??[0,1]}},hooks())).pixels;
   return Float32Array.from({length:p.width*p.height},(_,i)=>p.data[i*3]/255);
  };
  const values=await read(field),support=display.cloneFields.analyzed?await read('analyzed'):null;
  const mask=display.cloneView==='overlay'&&display.cloneMasked?await read('mask'):null;
  const base=display.cloneView==='mask'?null:(await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile},hooks())).pixels.data;
  return composeCloneFrame({width:Math.ceil(tile.w/(tile.step??1)),height:Math.ceil(tile.h/(tile.step??1)),values,support,mask,base,view:display.cloneView,masked:display.cloneMasked});
 }
 async function biomePixels(display,window,sampled=false){
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(!source)throw new EngineError('CACHE_MISS','The original biome source is unavailable.');
  const original={width:source.surface.width,height:source.surface.height,sha256:source.sha256};if(display.width!==original.width||display.height!==original.height)throw new EngineError('INVALID_INPUT','Biome presentation dimensions differ from the original image.');
  const step=sampled?window.step??1:1,width=sampled?Math.ceil(window.w/step):window.width,height=sampled?Math.ceil(window.h/step):window.height,bytes=biomePresentationWorkingBytes(width,height,original.width,original.height,{scoped:!!display.biomePresentation.scope}),lease=await engine.reserveExternalMemory({bytes});
  try{const args={surfaceId:source.surface.id,revision:source.surface.revision,...(sampled?{tile:window}:{rect:window})},base=(await engine[sampled?'readDisplay':'readPixels'](args,hooks())).pixels;return composeBiomeWindow(base,display.biomePresentation.groups,window,{scope:display.biomePresentation.scope,source:original,signal:controller?.signal});}
  finally{await engine.releaseExternalMemory(lease.id);}
 }
 async function clearResponseProxy(){const old=responseProxy;responseProxy=null;if(old)await engine.releaseExternalMemory(old.lease.id).catch(()=>{});}
 async function prepareResponseProxy(display){
  const p=display.comprintPresentation??display.dtdPresentation;if(!p)return null;
  const score=p.score,side=display.adaptivePreview?.token?.side??128,key=score.id+':'+score.revision+':'+side;
  if(responseProxy?.key===key)return responseProxy;
  await clearResponseProxy();
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  if(!source||source.surface.width!==display.width||source.surface.height!==display.height)throw new EngineError('CACHE_MISS','The original image is unavailable for the preview.');
  const step=Math.max(1,Math.ceil(Math.max(display.width,display.height)/side)),tile={x:0,y:0,w:display.width,h:display.height,step},g=displayGeometry(display,tile),comprint=!!display.comprintPresentation,valueBytes=comprint?8:4,span=(g.width-1)*step+1;
  const lease=await engine.reserveExternalMemory({bytes:g.width*g.height*(valueBytes+6)+span*valueBytes});let retained=false;
  try{
   const values=comprint?new Float64Array(g.width*g.height):new Float32Array(g.width*g.height),[lo,hi]=comprint?score.range??[0,1]:[0,1];
   for(let y=0;y<g.height;y++){
    checkAbort(controller?.signal);const answer=await engine.readPlane({surfaceId:score.id,revision:score.revision,rect:{x:0,y:y*step,width:span,height:1}},hooks());
    for(let x=0;x<g.width;x++){const value=answer.plane.data[x*step],level=Number.isFinite(value)?Math.round(Math.max(0,Math.min(1,(value-lo)/(hi-lo||1)))*255):NaN;values[y*g.width+x]=comprint?(Number.isFinite(value)?Math.round(value):NaN):lo+level/255*(hi-lo||1);}
   }
   const base=(await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile},hooks())).pixels.data;
   responseProxy={key,width:g.width,height:g.height,step,values,base,lease};retained=true;return responseProxy;
  }finally{if(!retained)await engine.releaseExternalMemory(lease.id);}
 }
 async function responseProxyPixels(display,tile){
  const proxy=await prepareResponseProxy(display),g=displayGeometry(display,tile),comprint=!!display.comprintPresentation,p=display.comprintPresentation??display.dtdPresentation,overlay=p.mode.endsWith('overlay');
  if(g.width>2048||g.height>2048)throw new EngineError('INVALID_INPUT','Response preview exceeds its bounded grid.');
  const lease=await engine.reserveExternalMemory({bytes:g.width*g.height*((comprint?8:4)+3+(overlay?3:0))});
  try{
   const values=comprint?new Float64Array(g.width*g.height):new Float32Array(g.width*g.height),base=overlay?new Uint8Array(g.width*g.height*3):undefined;
   for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const px=Math.min(proxy.width-1,Math.round((g.x+x*g.step)/proxy.step)),py=Math.min(proxy.height-1,Math.round((g.y+y*g.step)/proxy.step)),from=py*proxy.width+px,to=y*g.width+x;values[to]=proxy.values[from];if(base)base.set(proxy.base.subarray(from*3,from*3+3),to*3);}
   const cutoff=comprint?Math.round(Math.max(0,p.threshold??0)):displayThresholdForProxy(p.threshold,.5);
   return comprint?comprintFrame(g.width,g.height,values,{range:p.score.range,mode:p.mode,opacity:p.opacity,threshold:cutoff,base}):dtdFrame(g.width,g.height,values,{opacity:p.opacity,threshold:cutoff,base});
  }finally{await engine.releaseExternalMemory(lease.id);}
 }
 const displayThresholdForProxy=(value,fallback)=>Math.round((Number.isFinite(value)?value:fallback)*255)/255;
 async function activationPixels(display,tile){
  const g=displayGeometry(display,tile),comprint=!!display.comprintPresentation,presentation=display.comprintPresentation??display.dtdPresentation,score=presentation.score,overlay=presentation.mode.endsWith('overlay'),valueBytes=comprint?8:4;
  if(overlay&&!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  if(overlay&&(!source||source.surface.width!==display.width||source.surface.height!==display.height))throw new EngineError('CACHE_MISS','The original image is unavailable for the overlay.');
  const span=(g.width-1)*g.step+1,rows=g.step===1?Math.max(1,Math.min(32,Math.floor(1024**2/(span*valueBytes)))):1;
  const lease=await engine.reserveExternalMemory({bytes:g.width*g.height*(valueBytes+3+(overlay?3:0))+span*rows*valueBytes});
  try{
   const values=comprint?new Float64Array(g.width*g.height):new Float32Array(g.width*g.height);
   for(let row=0;row<g.height;row+=rows){
    checkAbort(controller?.signal);const count=Math.min(rows,g.height-row),rect={x:g.x,y:g.y+row*g.step,width:span,height:count},part=await engine.readPlane({surfaceId:score.id,revision:score.revision,rect},hooks());
    for(let y=0;y<count;y++)for(let x=0;x<g.width;x++)values[(row+y)*g.width+x]=part.plane.data[y*span+x*g.step];
   }
   const base=overlay?(await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile},hooks())).pixels.data:undefined;
   return comprint?comprintFrame(g.width,g.height,values,{base,opacity:presentation.opacity,threshold:presentation.threshold,mode:presentation.mode,range:score.range}):dtdFrame(g.width,g.height,values,{base,opacity:presentation.opacity,threshold:presentation.threshold});
  }finally{await engine.releaseExternalMemory(lease.id);}
 }
 async function truforPalettePixels(display,tile){
  const g=displayGeometry(display,tile),bytes=g.width*g.height*7+m2.ready.windowBytes,lease=await m2.reserveExternalMemory({bytes});
  try{const values=await sampleCloneField(m2,{...display,cloneFields:display.truforFields},'map',tile);return truforHeatFrame(g.width,g.height,values);}
  finally{await m2.releaseExternalMemory(lease.id);}
 }
 async function clearRitaProxy(){const old=ritaProxy;ritaProxy=null;if(old)await engine.releaseExternalMemory(old.lease.id).catch(()=>{});}
 function ritaResultId(display){
  const id=display.ritaPresentation?.score?.m2Result??display.m2Result;
  if(!m2||!id||result?.m2Result?.id!==id)throw new EngineError('CACHE_MISS','The native RITA result is unavailable.');
  if(display.width!==result.m2Result.width||display.height!==result.m2Result.height||display.ritaPresentation?.score?.field!=='map')throw new EngineError('INVALID_INPUT','RITA display geometry or score identity differs from the native result.');
  return id;
 }
 const ritaWindowElements=()=>Math.max(1,Math.floor(Math.min(4*1024**2,m2.ready.windowBytes)/4));
 // Retained scores are sampled through bounded contiguous strips. Wide or
 // sparse requests also split horizontally; no numeric RPC exceeds 4 MiB.
 async function readRitaValues(display,g){
  const id=ritaResultId(display),out=new Float32Array(g.width*g.height),limit=ritaWindowElements(),span=(g.width-1)*g.step+1,field=display.ritaPresentation.score.field??'map';
  const read=async(offset,length)=>{const values=await m2.readArray(id,field,offset,length);if(!(values instanceof Float32Array)||values.length!==length)throw new EngineError('INVALID_INPUT','Invalid native RITA score window.');return values;};
  for(let row=0;row<g.height;){
   checkAbort(controller?.signal);
   if(span<=limit){
    const count=Math.min(g.height-row,Math.max(1,Math.floor((limit-span)/(display.width*g.step))+1)),length=(count-1)*g.step*display.width+span,values=await read((g.y+row*g.step)*display.width+g.x,length);
    for(let y=0;y<count;y++)for(let x=0;x<g.width;x++)out[(row+y)*g.width+x]=values[y*g.step*display.width+x*g.step];
    row+=count;
   }else{
    const columns=Math.max(1,Math.floor((limit-1)/g.step)+1);
    for(let x=0;x<g.width;x+=columns){const count=Math.min(columns,g.width-x),values=await read((g.y+row*g.step)*display.width+g.x+x*g.step,(count-1)*g.step+1);for(let at=0;at<count;at++)out[row*g.width+x+at]=values[at*g.step];}
    row++;
   }
  }
  return out;
 }
 async function ensureRitaSource(display){
  if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}
  if(!source||source.surface.width!==display.width||source.surface.height!==display.height)throw new EngineError('CACHE_MISS','The original RITA image is unavailable.');
 }
 async function prepareRitaProxy(display){
  const id=ritaResultId(display),side=display.adaptivePreview?.token?.side??128,key=id+':'+display.ritaPresentation.score.revision+':'+side;
  if(ritaProxy?.key===key)return ritaProxy;
  await clearRitaProxy();await ensureRitaSource(display);
  const step=Math.max(1,Math.ceil(Math.max(display.width,display.height)/side)),tile={x:0,y:0,w:display.width,h:display.height,step},g=displayGeometry(display,tile),count=g.width*g.height;
  // Retain the tiny score/base proxy and admit the RGB frame workspace once.
  // The dragging path below performs no worker messages or budget RPCs.
  const lease=await engine.reserveExternalMemory({bytes:count*13});let transient,numeric,retained=false;
  try{
   transient=await engine.reserveExternalMemory({bytes:count*4});numeric=await m2.reserveExternalMemory({bytes:ritaWindowElements()*4});
   const values=await readRitaValues(display,g),levels=new Uint8Array(count),validity=new Uint8Array(count);
   for(let i=0;i<count;i++)if(Number.isFinite(values[i])){validity[i]=1;levels[i]=Math.round(Math.max(0,Math.min(1,values[i]))*255);}
   const base=(await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile},hooks())).pixels.data;
   ritaProxy={key,width:g.width,height:g.height,step,levels,validity,base,lease};retained=true;return ritaProxy;
  }finally{if(numeric)await m2.releaseExternalMemory(numeric.id);if(transient)await engine.releaseExternalMemory(transient.id);if(!retained)await engine.releaseExternalMemory(lease.id);}
 }
 async function ritaProxyPixels(display,tile){
  const proxy=await prepareRitaProxy(display),g=displayGeometry(display,tile),p=display.ritaPresentation;
  if(g.width>2048||g.height>2048)throw new EngineError('INVALID_INPUT','RITA preview exceeds its bounded grid.');
  if(g.x===0&&g.y===0&&g.step===proxy.step&&g.width===proxy.width&&g.height===proxy.height)return ritaFrame(g.width,g.height,proxy.levels,{base:p.mode==='overlay'?proxy.base:undefined,validity:proxy.validity,quantized:true,mode:p.mode,threshold:ritaDisplayThreshold(p.threshold),opacity:p.opacity});
  const count=g.width*g.height,levels=new Uint8Array(count),validity=new Uint8Array(count),base=p.mode==='overlay'?new Uint8Array(count*3):undefined;
  for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const px=Math.min(proxy.width-1,Math.round((g.x+x*g.step)/proxy.step)),py=Math.min(proxy.height-1,Math.round((g.y+y*g.step)/proxy.step)),from=py*proxy.width+px,to=y*g.width+x;levels[to]=proxy.levels[from];validity[to]=proxy.validity[from];if(base)base.set(proxy.base.subarray(from*3,from*3+3),to*3);}
  return ritaFrame(g.width,g.height,levels,{base,validity,quantized:true,mode:p.mode,threshold:ritaDisplayThreshold(p.threshold),opacity:p.opacity});
 }
 async function ritaPixels(display,tile){
  ritaResultId(display);const g=displayGeometry(display,tile),p=display.ritaPresentation,overlay=p.mode==='overlay',lease=await engine.reserveExternalMemory({bytes:g.width*g.height*(overlay?10:7)});let numeric;
  try{
   numeric=await m2.reserveExternalMemory({bytes:ritaWindowElements()*4});const values=await readRitaValues(display,g);
   if(overlay)await ensureRitaSource(display);
   const base=overlay?(await engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile},hooks())).pixels.data:undefined;
   return ritaFrame(g.width,g.height,values,{base,mode:p.mode,threshold:p.threshold,opacity:p.opacity});
  }finally{if(numeric)await m2.releaseExternalMemory(numeric.id);await engine.releaseExternalMemory(lease.id);}
 }
 async function retainedPixels(display,tile){
  const cells=Math.ceil(tile.w/(tile.step??1))*Math.ceil(tile.h/(tile.step??1)),lease=await engine.reserveExternalMemory({bytes:cells*64+65536});
  try{return await renderRetainedWindow({display,tile,readSource:request=>engine.readDisplay({surfaceId:source.surface.id,revision:source.surface.revision,tile:request}).then(answer=>answer.pixels)});}
  finally{await engine.releaseExternalMemory(lease.id);}
 }
 async function pixels(display,rect){
  if(display.retainedParameterView)return retainedPixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.responsePreview)throw new EngineError('INVALID_INPUT','A transient preview cannot be exported.');
  if(display.ritaPresentation)return ritaPixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.dtdPresentation||display.comprintPresentation)return activationPixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.truforPalette)return truforPalettePixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(display.biomePresentation)return biomePixels(display,rect);
  if(display.cloneView)return clonePixels(display,{x:rect.x,y:rect.y,w:rect.width,h:rect.height,step:1});
  if(sourceAliases.has(display.id)){if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(source)display=source.surface;}
  if(display.m2Result){const frame=await m2.renderWindow(display.m2Result,display.view,rect);try{const data=new Uint8Array(frame.bytes);for(let at=0;at<data.length;at+=m2.ready.windowBytes)data.set(await m2.readExport(frame.id,at,Math.min(m2.ready.windowBytes,data.length-at)),at);return {width:frame.width,height:frame.height,format:'rgb8',data};}finally{await m2.releaseExport(frame.id);}}
  if(display.pixels){const input=display.pixels,data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(input.data.subarray(((y+rect.y)*input.width+rect.x)*3,((y+rect.y)*input.width+rect.x+rect.width)*3),y*rect.width*3);return {width:rect.width,height:rect.height,format:'rgb8',data};}
  const input={surfaceId:display.id,revision:display.revision,rect};
  if(display.format==='rgb8')return (await engine.readPixels(input,hooks())).pixels;
  const read=display.format==='mask8'?await engine.readMask(input,hooks()):display.format==='rgb-flags8'?await engine.readFlags(input,hooks()):await engine.readPlane(input,hooks());
  const plane=read.plane??read.mask??read.flags??read.pixels,values=plane.data;const data=new Uint8Array(rect.width*rect.height*3),[lo,hi]=display.range??[0,1];
  for(let i=0;i<rect.width*rect.height;i++){if(display.format==='rgb-flags8'){for(let c=0;c<3;c++)data[i*3+c]=values[i*3+c]?255:0;}else{const value=display.format==='mask8'?(values[i]?255:0):Math.max(0,Math.min(255,Math.round((values[i]-lo)/(hi-lo||1)*255)));data.fill(value,i*3,i*3+3);}}return {width:rect.width,height:rect.height,format:'rgb8',data};
 }
 async function stream(descriptor,sink){try{for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){const {bytes}=await engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},hooks());await sink.write(bytes);}}finally{await engine.releaseExport(descriptor.id);}}
 const client={
  previewParameters,
  updateRetainedParameters:(task,{isCurrent=()=>true}={})=>enqueue(()=>{if(!isCurrent())return null;const next=updateRetainedParameters({output:result,operation:task.operation,params:task.params,view:task.view});if(next&&isCurrent())result=next;return next;}),
  deployment,get source(){return source;},get result(){return result;},capabilities:()=>enqueue(()=>engine.capabilities()),
  reserveExport:async(bytes,display)=>{const owner=display?.m2Result?m2:engine;if(!owner)throw Error('No export source');const lease=await enqueue(()=>owner.reserveExternalMemory({bytes}));return()=>owner.releaseExternalMemory(lease.id);},
  load:input=>{const previewDone=clearParameterPreview();return enqueue(()=>work(async()=>{await previewDone;d2Analysis=null;await release();if(source){const old=source;source=null;await engine.unload(old.id);}sourceInput=input;source=await engine.loadBlob({...input,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);return source;}));},
  release:()=>enqueue(release),
  detectSubimages:()=>enqueue(()=>work(async()=>{
   if(!sourceInput?.blob)throw Object.assign(Error('Source not loaded'),{code:'INVALID_INPUT'});
   // The shipped detector has a full-memory API. Load an explicit temporary
   // input in the SAME engine budget and release it, preserving the current result.
   const reusable=source?.availableOperations?.includes('subimages.detect');
   const id=reusable?source.id:'subimages-'+crypto.randomUUID();let opened=false,failure;
   try{
    if(!reusable){const input=await engine.loadBlob({id,blob:sourceInput.blob,layout:'auto'},hooks());opened=true;
     if(input.availableOperations&&!input.availableOperations.includes('subimages.detect'))throw Object.assign(Error('SUBIMAGES_MEMORY'),{code:'MEMORY_LIMIT'});}
    const output=await engine.run({id:'detect-'+crypto.randomUUID(),imageId:id,operation:'subimages.detect',params:{},backend:'cpu'},hooks());return output.data;
   }catch(error){failure=error;throw error;}
   finally{if(opened)try{await engine.unload(id);}catch(cleanupError){if(failure)failure.cleanupError=cleanupError;else throw cleanupError;}}
  })),
  run:(task,extras={})=>{const previewDone=clearParameterPreview();return enqueue(()=>work(async()=>{
   await previewDone;localFeaturePolicy.assertTaskAvailable(task);
   await release();
   // Auxiliary images/databases belong to their tool; the original and evictable
   // analysis caches survive tool changes without pinning unrelated workspaces.
   if(reference&&task.operation!=='comparison.image'){const old=reference;reference=null;await engine.unload(old.id);}
   if(mask&&(!extras.mask||!['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(task.operation))){const old=mask;mask=null;await engine.unload(old.id);}
   if(prnu&&task.operation!=='noise.prnu'){const old=prnu;prnu=null;await engine.unload(old.id);}
   if(task.operation.startsWith('m2.')){const method=task.operation.slice(3);if(m2&&m2Method!==method){await m2.dispose();m2=null;}if(!m2){const caps=await engine.capabilities(),memory=caps.memory;const reserve=memory.retainedBytes+memory.cacheBytes+memory.knownHeapCapacityBytes+64*1024**2;m2=await m2Factory({method,memoryBudgetBytes:Math.max(32*1024**2,Math.min(m2MemoryBudgetBytes,memory.budgetBytes-reserve)),computeProfile});m2Method=method;}const descriptor=await m2.analyzeBlob(method,extras.file,task.params,{...hooks(),backend:task.backend});let metadata;try{metadata=await m2.metadata(descriptor);}catch(error){await m2.release(descriptor.id);throw error;}const ritaModes=['overlay','probability','mask'],ritaInitial=ritaModes.includes(task.view?.mode)?task.view.mode:'overlay';const views=method==='forgeryscope'?[]:method==='rita'?[ritaInitial,...ritaModes.filter(mode=>mode!==ritaInitial)]:method==='trufor'?['map','confidence','noiseprint_pp']:[0,1,2];result={id:task.id,imageId:source.id,operation:task.operation,status:'ok',data:metadata,provenance:metadata.provenance,metrics:metadata.metrics,m2Result:descriptor,views:views.map(view=>({id:'m2-'+descriptor.id+'-'+view,revision:1,width:descriptor.width,height:descriptor.height,format:'rgb8',m2Result:descriptor.id,view,...(method==='rita'?{ritaPresentation:{mode:view,score:{id:'m2-score-'+descriptor.id,revision:1,m2Result:descriptor.id,field:'map'},threshold:ritaDisplayThreshold(task.view?.threshold),opacity:ritaDisplayOpacity(task.view?.opacity)}}:{})}))};if(method==='trufor'&&descriptor.fields?.map)result.views.push({...result.views[0],id:'m2-'+descriptor.id+'-map-alternative',view:'map_alternative',truforPalette:true,truforFields:descriptor.fields});return result;}
   if(m2){await m2.dispose();m2=null;m2Method=null;}
   if(isExtensionTool(task.operation)){
    const input={...task,imageId:source.id},configuration=extensionConfiguration();
    if(typeof engine.runConfiguredExtension==='function')result=await engine.runConfiguredExtension(input,configuration,hooks());
    else{await configureExtensionModels(engine,configuration,hooks());result=await engine.run(input,hooks());}
    return result;
   }
   await configure(task.operation,task.params);const params={...task.params};
   if(task.operation==='comparison.image'){if(!extras.reference)throw Error('Choisissez une image de référence.');if(reference?.blob!==extras.reference){if(reference){const old=reference;reference=null;await engine.unload(old.id);}const id='reference-'+crypto.randomUUID();await engine.loadBlob({id,blob:extras.reference,layout:'segmented'},hooks());reference={id,blob:extras.reference};}params.referenceImageId=reference.id;}
   if(task.operation==='noise.prnu'){if(!prnu||prnu.file!==extras.database||prnu.training!==extras.training||prnu.camera!==extras.camera){if(prnu){const old=prnu;prnu=null;await engine.unload(old.id);}const id='prnu-'+crypto.randomUUID();if(extras.database)await engine.loadPrnuDatabase({id,blob:extras.database},hooks());else if(extras.training?.length)await engine.buildPrnuDatabase({id,queryImageId:source.id,singleCamera:extras.camera||'Camera',files:extras.training,outputLayout:'pages'},hooks());else throw Error('Choisissez une base PRNU ou des images d’apprentissage.');prnu={id,file:extras.database,training:extras.training,camera:extras.camera};}params.databaseId=prnu.id;}
   if(['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(task.operation)&&extras.mask){if(mask?.blob!==extras.mask){if(mask){const old=mask;mask=null;await engine.unload(old.id);}const id='mask-'+crypto.randomUUID();await engine.loadBlob({id,blob:extras.mask,layout:'segmented'},hooks());mask={id,blob:extras.mask};}params.maskImageId=mask.id;}
   if(task.operation==='various.median')params.modelId=median;
   if(task.operation==='jpeg.quality'){if(!quality){const manifest=await individualModels();if(manifest.quality){const response=await fetch(asset(manifest.quality.url),{signal:controller?.signal});if(!response.ok)throw Error('Modèle de qualité JPEG absent.');await engine.loadQualityModel({id:'quality-model',blob:await response.blob()},hooks());quality='quality-model';}}params.modelId=quality??null;}
   if(task.operation==='metadata.structure'||task.operation==='metadata.location')result={id:task.id,imageId:source.id,operation:task.operation,status:'ok',provenance:{engine:deployment.engineVersion,originalSha256:source.sha256,operation:task.operation,input:'original-encoded-bytes'},...await engine.inspectMetadata({blob:extras.file,mode:task.operation==='metadata.structure'?'headers':'location'},hooks())};
   else {
    const key=task.operation==='ai.clones.d2prl'?d2AnalysisKey({...task,imageId:source.id}):null;
    const previous=key&&d2Analysis?.key===key?d2Analysis:null;
    if(task.operation==='ai.clones.d2prl')d2Analysis=null;
    if(task.operation==='ai.clones.segmentation'){
     const model=await segmentationModel(params.variant),input={...task,imageId:source.id,params};
     // The workspace pool performs configuration and inference in one existing
     // engine queue admission. A standalone engine has no competing documents.
     if(typeof engine.runConfiguredSegmentation==='function')result=await engine.runConfiguredSegmentation(input,model,hooks());
     else{await configureSegmentationModel(engine,model,hooks());result=await engine.run(input,hooks());}
    }else if(previous){
     const refilter={...task,imageId:source.id,regions:undefined,params:{minimum:params.minimum,exclusions:params.exclusions??[],...(params.scientificScope?{scientificScope:params.scientificScope}:{}),refilterOf:previous.analysisId}};
     try{result=await engine.run(refilter,hooks());}
     catch(error){if(error.code!=='CACHE_MISS')throw error;result=await engine.run({...task,imageId:source.id,params},hooks());}
    }else result=await engine.run({...task,imageId:source.id,params},hooks());
    const analysisId=result.data?.metadata?.analysisId;
    if(key&&analysisId)d2Analysis={key,analysisId};
   }return result;
  }));},
  readTable:(table,offset=0,length=128)=>enqueue(()=>engine.readTable({tableId:table.id,revision:table.revision,offset,length},hooks())),
  // Batch decisions read scientific values, never colours from a rendered map.
  readScalar:(descriptor,rect,field)=>enqueue(async()=>{
   if(result?.m2Result){
    const name=field??'map',out=new Float32Array(rect.width*rect.height);
    for(let y=0;y<rect.height;y++)out.set(await m2.readArray(result.m2Result.id,name,(rect.y+y)*result.m2Result.width+rect.x,rect.width),y*rect.width);
    return out;
   }
   const input={surfaceId:descriptor.id,revision:descriptor.revision,rect};
   const answer=await engine[descriptor.format==='mask8'?'readMask':'readPlane'](input,hooks());
   return (answer.mask??answer.labels??answer.plane??answer.pixels).data;
  }),
  derive:patches=>enqueue(()=>work(()=>engine.deriveOriginal({imageId:source.id,patches},hooks()))),
  loadModel:(kind,file)=>enqueue(()=>work(async()=>{const id=kind+'-'+crypto.randomUUID();await engine[kind==='median'?'loadMedianModel':'loadQualityModel']({id,blob:file},hooks());const old=kind==='median'?median:quality;if(old)await engine.unload(old);if(kind==='median')median=id;else quality=id;})),
  planDisplayPreview:display=>enqueue(()=>displayPreviewPlan(display)),
  prepareDisplayPreview:display=>enqueue(async()=>{const bounded=await displayPreviewPlan(display);await(bounded.ritaPresentation?prepareRitaProxy(bounded):prepareResponseProxy(bounded));}),
  readWindow:(display,rect)=>enqueue(()=>pixels(display,rect)),
  readTile:(display,tile)=>enqueue(async()=>{
   if(display.retainedParameterView)return retainedPixels(display,tile);
   if(display.responsePreview){const started=performance.now(),pixels=await(display.ritaPresentation?ritaProxyPixels(display,tile):responseProxyPixels(display,tile));if(display.adaptivePreview?.token){Object.assign(display.adaptivePreview,{milliseconds:performance.now()-started,setupMilliseconds:0,cold:false,pixels:pixels.width*pixels.height});displayAdaptive.observe(display.adaptivePreview.token,display.adaptivePreview);}return pixels;}
   if(display.ritaPresentation)return ritaPixels(display,tile);
   if(display.dtdPresentation||display.comprintPresentation)return activationPixels(display,tile);
   if(display.truforPalette)return truforPalettePixels(display,tile);
   if(display.biomePresentation)return biomePixels(display,tile,true);
   if(display.cloneView)return clonePixels(display,tile);
   if(sourceAliases.has(display.id)){if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(source)display=source.surface;}
   if(display.m2Result)return (await m2.readDisplay(display.m2Result,display.view,tile)).pixels;
   if(display.pixels){const frame=await samplePixels({...display.pixels,format:'rgb8'},tile);try{return frame.pixels;}finally{frame.release();}}
   return (await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile,render:display.format==='rgb8'?undefined:{range:display.range??[0,1]}},hooks())).pixels;
  }),
  export:(format,selected,options={})=>enqueue(()=>work(async()=>{
   if(selected?.responsePreview)throw new EngineError('INVALID_INPUT','A transient preview cannot be exported.');
   if(selected?.retainedParameterView&&['png','webp','avif','heic','tiff'].includes(format)){const surface={width:selected.width,height:selected.height,readPixels:rect=>pixels(selected,rect)};return exportPresentationRaster(surface,{...options,format},{signal:controller.signal,reserve:async bytes=>{const lease=await engine.reserveExternalMemory({bytes});return()=>engine.releaseExternalMemory(lease.id);}});}
   const nativeResult=result?.parameterViews?Object.fromEntries(Object.entries(result).filter(([key])=>key!=='parameterViews')):result;
   const sink=await createExportSink({memoryBudgetBytes:32*1024**2,signal:controller.signal,mime:format==='json'?'application/json':format==='csv'?'text/csv':['png','webp','avif','heic','tiff'].includes(format)?'image/'+format:'application/zip'});
   try{if(format==='npz'&&result?.m2Result){const descriptor=await m2.beginExport(result.m2Result.id,hooks());try{for(let offset=0;offset<descriptor.bytes;offset+=m2.ready.windowBytes)await sink.write(await m2.readExport(descriptor.id,offset,Math.min(m2.ready.windowBytes,descriptor.bytes-offset)));}finally{await m2.releaseExport(descriptor.id);}}
    else if(format==='npz'&&result?.operation==='tampering.copyMove.dense')await stream(await engine.exportSurface({surfaceId:result.surface.id,revision:result.surface.revision,format:'npz',storage:'temporary'},hooks()),sink);
    else if(format==='npz'&&result?.operation==='noise.noisesniffer'){let offset=0;for(;;){const page=await engine.readNpz({surfaceId:result.surface.id,revision:result.surface.revision,offset,length:1024**2},hooks());await sink.write(page.bytes);if(page.done)break;offset=page.nextOffset;}}
    else if(format==='csv'&&['float32','float64','int32'].includes(selected?.format)){await sink.write(new TextEncoder().encode('x,y,value\r\n'));for(let y=0;y<selected.height;y++){const {plane}=await engine.readPlane({surfaceId:selected.id,revision:selected.revision,rect:{x:0,y,width:selected.width,height:1}},hooks());let text='';for(let x=0;x<selected.width;x++)text+=x+','+y+','+plane.data[x]+'\r\n';await sink.write(new TextEncoder().encode(text));}}
    else if(format==='csv'&&selected?.columns){let offset=0;do{const page=await engine.readTableCsv({tableId:selected.id,revision:selected.revision,offset,length:1024},hooks());await sink.write(page.bytes);offset=page.nextOffset;if(page.done)break;}while(true);}
    else if(format==='prnu'){if(!prnu)throw Error('Aucune base PRNU.');await stream(await engine.createPrnuDatabaseExport(prnu.id,hooks()),sink);}
    else if(selected?.id&&!selected.columns)await stream(await engine.exportSurface({...options,surfaceId:selected.id,revision:selected.revision,format,render:format==='npz'?undefined:{range:selected.range??[0,1]},storage:'temporary'},hooks()),sink);
    else if(format==='json')await stream(await engine.exportResultFile(jsonExportValue(result),{format:'json',storage:'temporary'},hooks()),sink);
    else {let maxBytes=32*1024**2;if(format==='npz'&&result.operation==='tampering.copyMove.sparse'){const needed=sparseNpzPreparationBytes(result);const {memory}=await engine.capabilities();maxBytes=Math.max(1,Math.floor(Math.min(Math.max(maxBytes,needed),memory.policyAvailableBytes-memory.knownHeapCapacityBytes)));}const output=await engine.exportResult(nativeResult,{format,maxBytes},hooks());await sink.write(output.bytes);}
    return await sink.finish();
   }catch(error){await sink.abort();throw error;}
  })),
  cancel(){controller?.abort();},
  dispose(){disposed=true;controller?.abort();const previewDone=clearParameterPreview();return queue.then(async()=>{await previewDone;await clearResponseProxy();await clearRitaProxy();await m2?.dispose();await engine.dispose();});}
 };
 return client;
}
