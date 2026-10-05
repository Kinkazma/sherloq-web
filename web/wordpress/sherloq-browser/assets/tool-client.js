import {composeCloneFrame,sampleCloneField,d2AnalysisKey} from './neural-clone-ui.js';
import {samplePixels} from './unified-engine/src/display-sampling.js';
import {individualModels,m2ToolClient} from './tool-models.js';
import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {D2PRL_MODEL_IDENTITY} from './unified-engine/src/d2prl-model-identity.js';
import {createExportSink} from './export-sink.js';

export function resultResources(result){
 const surfaces=new Map(),tables=new Map();const visit=value=>{if(!value||typeof value!=='object'||ArrayBuffer.isView(value))return;
  if(typeof value.id==='string'&&Number.isInteger(value.revision)){if(Number.isInteger(value.rowCount)&&Array.isArray(value.columns))tables.set(value.id,value);else if(Number.isInteger(value.width)&&Number.isInteger(value.height)&&typeof value.format==='string')surfaces.set(value.id,value);}
  for(const v of Object.values(value))visit(v);
 };visit(result);return {surfaces:[...surfaces.values()],tables:[...tables.values()]};
}
export async function createToolClient({computeProfile='maximum',onProgress=()=>{},onInvalidated=()=>{},engineFactory=createWorkerEngine,m2Factory=m2ToolClient}={}){
 const deployment=await (await fetch(new URL('./integrated-config.json',import.meta.url))).json();
 const base=new URL(deployment.assetBase,new URL('./integrated-config.json',import.meta.url));
 const asset=name=>new URL(name,base).href;
 const engine=engineFactory({computeProfile,...(deployment.memoryExtensionId?{memoryExtensionId:deployment.memoryExtensionId}:{})});
 let queue=Promise.resolve(),disposed=false,controller,source,result,reference,mask,prnu,median,quality,m3Loaded=false,d2Loaded=false,segmentationVariant=null,m2=null,m2Method=null;
 let d2Analysis=null;let sourceInput;const sourceAliases=new Set();
 const invalidated=()=>{d2Analysis=null;const resultLost=!!result&&!result.m2Result;if(!result?.m2Result)result=null;source=reference=mask=prnu=median=quality=null;m3Loaded=d2Loaded=false;segmentationVariant=null;onInvalidated({resultLost});};
 engine.onSourceInvalidation?.(invalidated);
 const resolve=value=>Array.isArray(value)?value.map(resolve):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='url'?asset(v):resolve(v)])):value;
 const enqueue=fn=>{const task=queue.then(()=>{if(disposed)throw Object.assign(Error('Outil fermé'),{code:'CANCELLED'});return fn();});queue=task.catch(()=>{});return task;};
 const hooks=()=>({signal:controller?.signal,onProgress});
 const work=async fn=>{controller=new AbortController();try{return await fn();}catch(error){if(m2&&['WORKER_FAILED','DISPOSED'].includes(error.code)){const failed=m2;m2=null;m2Method=null;if(result?.m2Result)result=null;await failed.dispose().catch(()=>{});}if(error.imagesCleared){d2Analysis=null;source=result=reference=mask=prnu=median=quality=null;m3Loaded=d2Loaded=false;segmentationVariant=null;}throw error;}finally{controller=null;}};
 async function release(){if(!result)return;if(result.m2Result){await m2.release(result.m2Result.id);result=null;return;}const previous=result;result=null;const resources=resultResources(previous);for(const s of resources.surfaces)if(s.id!==source?.surface.id)await engine.releaseSurface(s.id);for(const t of resources.tables)await engine.releaseTable(t.id);}
 async function configure(operation,params={}){
  if(operation==='ai.clones.segmentation'&&segmentationVariant!==params.variant){if(segmentationVariant){segmentationVariant=null;await engine.unloadSegmentationModel();}const manifest=await individualModels();await engine.loadSegmentationModel(resolve(manifest.segmentation[params.variant]),hooks());segmentationVariant=params.variant;}
  if(operation==='ai.clones.d2prl'&&!d2Loaded){await engine.loadD2prlModel({...D2PRL_MODEL_IDENTITY,url:asset('d2prl/model.json')},hooks());d2Loaded=true;}
  if((operation.startsWith('ai.sources.')||operation.startsWith('ai.localization.')||operation==='tampering.copyMove.sparse')&&!m3Loaded){
   const manifest=await individualModels();
   const resolve=value=>Array.isArray(value)?value.map(resolve):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='url'?asset(v):resolve(v)])):value;
   const language=new Uint8Array(await(await fetch(asset('ocr/eng.traineddata'),{signal:controller?.signal})).arrayBuffer());
   await engine.loadM3Models({models:resolve(manifest.m3),language:{data:language,sha256:deployment.englishSha256}},hooks());m3Loaded=true;
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
 async function pixels(display,rect){
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
 return {
  deployment,get source(){return source;},get result(){return result;},capabilities:()=>enqueue(()=>engine.capabilities()),
  reserveExport:async(bytes,display)=>{const owner=display?.m2Result?m2:engine;if(!owner)throw Error('No export source');const lease=await enqueue(()=>owner.reserveExternalMemory({bytes}));return()=>owner.releaseExternalMemory(lease.id);},
  load:input=>enqueue(()=>work(async()=>{d2Analysis=null;await release();if(source){const old=source;source=null;await engine.unload(old.id);}sourceInput=input;source=await engine.loadBlob({...input,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);return source;})),
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
  run:(task,extras={})=>enqueue(()=>work(async()=>{
   await release();
   // Auxiliary images/databases belong to their tool; the original and evictable
   // analysis caches survive tool changes without pinning unrelated workspaces.
   if(reference&&task.operation!=='comparison.image'){const old=reference;reference=null;await engine.unload(old.id);}
   if(mask&&(!extras.mask||!['tampering.copyMove.brisk','tampering.copyMove.akaze','tampering.copyMove.orb'].includes(task.operation))){const old=mask;mask=null;await engine.unload(old.id);}
   if(prnu&&task.operation!=='noise.prnu'){const old=prnu;prnu=null;await engine.unload(old.id);}
   if(task.operation.startsWith('m2.')){const method=task.operation.slice(3);if(m2&&m2Method!==method){await m2.dispose();m2=null;}if(!m2){const caps=await engine.capabilities(),memory=caps.memory;const reserve=memory.retainedBytes+memory.cacheBytes+memory.knownHeapCapacityBytes+64*1024**2;m2=await m2Factory({method,memoryBudgetBytes:Math.max(32*1024**2,memory.budgetBytes-reserve),computeProfile});m2Method=method;}const descriptor=await m2.analyzeBlob(method,extras.file,task.params,{...hooks(),backend:task.backend});let metadata;try{metadata=await m2.metadata(descriptor);}catch(error){await m2.release(descriptor.id);throw error;}const views=method==='forgeryscope'?[]:method==='trufor'?['map','confidence','noiseprint_pp']:[0,1,2];result={id:task.id,imageId:source.id,operation:task.operation,status:'ok',data:metadata,provenance:metadata.provenance,metrics:metadata.metrics,m2Result:descriptor,views:views.map(view=>({id:'m2-'+descriptor.id+'-'+view,revision:1,width:descriptor.width,height:descriptor.height,format:'rgb8',m2Result:descriptor.id,view}))};return result;}
   if(m2){await m2.dispose();m2=null;m2Method=null;}
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
    if(previous){
     const refilter={...task,imageId:source.id,regions:undefined,params:{minimum:params.minimum,exclusions:params.exclusions??[],refilterOf:previous.analysisId}};
     try{result=await engine.run(refilter,hooks());}
     catch(error){if(error.code!=='CACHE_MISS')throw error;result=await engine.run({...task,imageId:source.id,params},hooks());}
    }else result=await engine.run({...task,imageId:source.id,params},hooks());
    const analysisId=result.data?.metadata?.analysisId;
    if(key&&analysisId)d2Analysis={key,analysisId};
   }return result;
  })),
  readTable:(table,offset=0,length=128)=>enqueue(()=>engine.readTable({tableId:table.id,revision:table.revision,offset,length},hooks())),
  derive:patches=>enqueue(()=>work(()=>engine.deriveOriginal({imageId:source.id,patches},hooks()))),
  loadModel:(kind,file)=>enqueue(()=>work(async()=>{const id=kind+'-'+crypto.randomUUID();await engine[kind==='median'?'loadMedianModel':'loadQualityModel']({id,blob:file},hooks());const old=kind==='median'?median:quality;if(old)await engine.unload(old);if(kind==='median')median=id;else quality=id;})),
  readWindow:(display,rect)=>enqueue(()=>pixels(display,rect)),
  readTile:(display,tile)=>enqueue(async()=>{
   if(display.cloneView)return clonePixels(display,tile);
   if(sourceAliases.has(display.id)){if(!source&&sourceInput){source=await engine.loadBlob({...sourceInput,layout:'segmented'},hooks());sourceAliases.add(source.surface.id);}if(source)display=source.surface;}
   if(display.m2Result)return (await m2.readDisplay(display.m2Result,display.view,tile)).pixels;
   if(display.pixels){const frame=await samplePixels({...display.pixels,format:'rgb8'},tile);try{return frame.pixels;}finally{frame.release();}}
   return (await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile,render:display.format==='rgb8'?undefined:{range:display.range??[0,1]}},hooks())).pixels;
  }),
  export:(format,selected,options={})=>enqueue(()=>work(async()=>{
   const sink=await createExportSink({memoryBudgetBytes:32*1024**2,signal:controller.signal,mime:format==='json'?'application/json':format==='csv'?'text/csv':['png','webp','avif','heic','tiff'].includes(format)?'image/'+format:'application/zip'});
   try{if(format==='npz'&&result?.m2Result){const descriptor=await m2.beginExport(result.m2Result.id,hooks());try{for(let offset=0;offset<descriptor.bytes;offset+=m2.ready.windowBytes)await sink.write(await m2.readExport(descriptor.id,offset,Math.min(m2.ready.windowBytes,descriptor.bytes-offset)));}finally{await m2.releaseExport(descriptor.id);}}
    else if(format==='npz'&&result?.operation==='tampering.copyMove.dense')await stream(await engine.exportSurface({surfaceId:result.surface.id,revision:result.surface.revision,format:'npz',storage:'temporary'},hooks()),sink);
    else if(format==='npz'&&result?.operation==='noise.noisesniffer'){let offset=0;for(;;){const page=await engine.readNpz({surfaceId:result.surface.id,revision:result.surface.revision,offset,length:1024**2},hooks());await sink.write(page.bytes);if(page.done)break;offset=page.nextOffset;}}
    else if(format==='csv'&&['float32','int32'].includes(selected?.format)){await sink.write(new TextEncoder().encode('x,y,value\r\n'));for(let y=0;y<selected.height;y++){const {plane}=await engine.readPlane({surfaceId:selected.id,revision:selected.revision,rect:{x:0,y,width:selected.width,height:1}},hooks());let text='';for(let x=0;x<selected.width;x++)text+=x+','+y+','+plane.data[x]+'\r\n';await sink.write(new TextEncoder().encode(text));}}
    else if(format==='csv'&&selected?.columns){let offset=0;do{const page=await engine.readTableCsv({tableId:selected.id,revision:selected.revision,offset,length:1024},hooks());await sink.write(page.bytes);offset=page.nextOffset;if(page.done)break;}while(true);}
    else if(format==='prnu'){if(!prnu)throw Error('Aucune base PRNU.');await stream(await engine.createPrnuDatabaseExport(prnu.id,hooks()),sink);}
    else if(selected?.id&&!selected.columns)await stream(await engine.exportSurface({...options,surfaceId:selected.id,revision:selected.revision,format,render:format==='npz'?undefined:{range:selected.range??[0,1]},storage:'temporary'},hooks()),sink);
    else if(format==='json')await stream(await engine.exportResultFile(result,{format:'json',storage:'temporary'},hooks()),sink);
    else {let maxBytes=32*1024**2;if(format==='npz'&&result.operation==='tampering.copyMove.sparse'){const bound=v=>ArrayBuffer.isView(v)?v.length*32+2:v===null||typeof v!=='object'?typeof v==='string'?v.length*6+2:32:Object.entries(v).reduce((n,[k,x])=>n+k.length*6+bound(x)+4,2);const needed=32768+4*(bound(result.data)+bound(result.provenance)+bound(result.style)+bound(result.visible));const {memory}=await engine.capabilities();maxBytes=Math.max(1,Math.floor(Math.min(Math.max(maxBytes,needed),memory.policyAvailableBytes-memory.knownHeapCapacityBytes)));}const output=await engine.exportResult(result,{format,maxBytes},hooks());await sink.write(output.bytes);}
    return await sink.finish();
   }catch(error){await sink.abort();throw error;}
  })),
  cancel(){controller?.abort();},
  dispose(){disposed=true;controller?.abort();return queue.then(async()=>{await m2?.dispose();await engine.dispose();});}
 };
}
