import {createM2WorkerClient} from './unified-engine/src/m2-worker-client.js';
import {scientificPreparationConfiguration} from './tool-models.js?v=0.31.0';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './unified-engine/src/errors.js';
import {serveNativeSourceChannel} from './unified-engine/src/native-source-channel.js';
import {compileOriginalSourceRegions} from './original-source-regions.js?v=0.31.0';
import {clipPolygon} from './batch-scope-geometry.js?v=0.31.0';

async function retirePreparation(actions,failure){
 const errors=[];for(const action of actions)try{await action();}catch(error){errors.push(error);}
 if(!errors.length)return;const primary=failure??errors.shift();
 if(errors.length)primary.details={...primary.details,cleanupErrors:[...(primary.details?.cleanupErrors??[]),...errors.map(error=>serializeEngineError(error,'BATCH_PREPARATION_CLEANUP'))]};
 if(!failure)throw primary;
}

/** Only detector geometry is translated. Native pixels, scores and the
 * detector's crop preprocessing remain unchanged and explicitly identified. */
function projectNativeTextPreparation(prepared,source,domain){
 const decoder=prepared?.provenance?.decoder,text=prepared?.text;
 requireValue(!domain.empty&&source?.sourceSha256===domain.sourceSha256&&source.width===domain.sourceWidth&&source.height===domain.sourceHeight&&prepared?.sourceSha256===source.sourceSha256&&prepared.width===domain.width&&prepared.height===domain.height&&text?.width===domain.width&&text.height===domain.height,'Native text preparation belongs to another source or crop grid.');
 requireValue(decoder?.sourceRegionDomain?.fingerprint===domain.fingerprint&&JSON.stringify(decoder.origin)===JSON.stringify(domain.origin)&&decoder.preparationContext==='envelope-not-scientific-membership'&&decoder.encodedSourceRewritten===false,'Native text preparation provenance is not bound to its original-source envelope.');
 const [dx,dy]=domain.origin,polygon=value=>{const clipped=clipPolygon(value,domain.width,domain.height);requireValue(clipped.length&&JSON.stringify(clipped)===JSON.stringify(value),'Native text polygon exceeds the admitted crop grid.');return value.map(([x,y])=>[x+dx,y+dy]);};
 requireValue(Array.isArray(text.polygons)&&Array.isArray(text.detections),'Native text detections and polygons are required.');
 const projected=structuredClone(prepared);projected.width=source.width;projected.height=source.height;projected.text={...projected.text,width:source.width,height:source.height,polygons:text.polygons.map(polygon),detections:text.detections.map(detection=>{const value={...structuredClone(detection),polygon:polygon(detection.polygon)};if(detection.tile!==undefined){const tile=detection.tile;requireValue(Array.isArray(tile)&&tile.length===4&&tile.every(Number.isFinite)&&tile[0]>=0&&tile[1]>=0&&tile[2]<=domain.width&&tile[3]<=domain.height&&tile[2]>tile[0]&&tile[3]>tile[1],'Native text tile exceeds the admitted crop grid.');value.nativeTile=[...tile];value.tile=[tile[0]+dx,tile[1]+dy,tile[2]+dx,tile[3]+dy];}return value;}),metadata:{...structuredClone(text.metadata),coordinateSpace:'original-image-pixels',preparationInput:{width:domain.width,height:domain.height,origin:[...domain.origin],coordinateSpace:'preparation-envelope-pixels',sourceRegionDomainFingerprint:domain.fingerprint,encodedSourceRewritten:false}}};
 projected.provenance={...projected.provenance,coordinateSpace:'original-image-pixels',coordinateProjection:{from:'preparation-envelope-pixels',to:'original-image-pixels',origin:[...domain.origin],width:domain.width,height:domain.height,sourceRegionDomainFingerprint:domain.fingerprint,originalPixelsModified:false}};return projected;
}

export function reprojectNativeTextPreparation(prepared,source,domain){
 requireValue(prepared?.panels==null&&prepared?.annotations==null,'A text-only preparation cannot contain panel or annotation detections.');return projectNativeTextPreparation(prepared,source,domain);
}
/** The complete batch pipeline uses the same native window source. Reproject
 * compact detector geometry only; model scores and preprocessing remain exact. */
export function reprojectNativeScientificPreparation(prepared,source,domain){
 const output=projectNativeTextPreparation(prepared,source,domain),[dx,dy]=domain.origin;
 const rectangle=value=>{requireValue(Array.isArray(value)&&value.length===4&&value.every(Number.isFinite)&&value[0]>=0&&value[1]>=0&&value[2]<=domain.width&&value[3]<=domain.height&&value[2]>value[0]&&value[3]>value[1],'Native preparation rectangle exceeds its source envelope.');return[value[0]+dx,value[1]+dy,value[2]+dx,value[3]+dy];};
 const polygon=value=>{const clipped=clipPolygon(value,domain.width,domain.height);requireValue(clipped.length&&JSON.stringify(clipped)===JSON.stringify(value),'Native preparation polygon exceeds its source envelope.');return value.map(([x,y])=>[x+dx,y+dy]);};
 requireValue(prepared.panels&&prepared.panels.width===domain.width&&prepared.panels.height===domain.height&&Array.isArray(prepared.panels.panels),'Complete native preparation requires source-bound panel classifications.');
 output.panels={...structuredClone(prepared.panels),width:source.width,height:source.height,coordinates:'original-pixels',panels:prepared.panels.panels.map(panel=>({...structuredClone(panel),nativeRectangle:[...panel.rectangle],rectangle:rectangle(panel.rectangle),...(panel.polygon?{polygon:polygon(panel.polygon)}:{})}))};
 requireValue(prepared.annotations&&prepared.annotations.width===domain.width&&prepared.annotations.height===domain.height&&prepared.annotations.sourceSha256===source.sourceSha256&&Array.isArray(prepared.annotations.polygons)&&Array.isArray(prepared.annotations.detections),'Complete native preparation requires source-bound annotation geometry.');
 output.annotations={...structuredClone(prepared.annotations),width:source.width,height:source.height,coordinates:'original-pixels',polygons:prepared.annotations.polygons.map(polygon),detections:prepared.annotations.detections.map(d=>({...structuredClone(d),...(d.polygon?{polygon:polygon(d.polygon)}:{}),...(d.rectangle?{nativeRectangle:[...d.rectangle],rectangle:rectangle(d.rectangle)}:{}),...(d.coreRectangle?{nativeCoreRectangle:[...d.coreRectangle],coreRectangle:rectangle(d.coreRectangle)}:{})}))};
 output.provenance.coordinateProjection.stages=['panel-classification','scientific-text','annotation-bars'];return output;
}

export async function createBatchPreparationClient({computeProfile='maximum',memoryBudgetBytes=4*1024**3,configuration,workerFactory=()=>new Worker(new URL('./batch-preparation-worker.js?v=0.31.0',import.meta.url),{type:'module'}),clientFactory=createM2WorkerClient}={}){
 const configured=configuration??await scientificPreparationConfiguration({computeProfile,memoryBudgetBytes});
 const client=await clientFactory({...configured,computeProfile,memoryBudgetBytes},{workerFactory});let disposed=false;
 return {
  ready:client.ready,
  async prepare(blob,{textOnly=false,detectText=true,signal,onProgress,backend='auto',name}={}){
   if(disposed)throw new EngineError('DISPOSED','Batch preparation client disposed.');requireValue(typeof detectText==='boolean','detectText must be a boolean.');checkAbort(signal);let descriptor,failure;
   try{descriptor=await client.analyzeBlob('scientific-preparation',blob,{textOnly,detectText,name},{signal,onProgress,backend});checkAbort(signal);const metadata=await client.metadata(descriptor);checkAbort(signal);return metadata;}
   catch(error){failure=error;throw error;}finally{await retirePreparation([()=>descriptor&&!disposed?client.release(descriptor.id):undefined],failure);}
  },
  async prepareNativeSource(reader,{sourceRegionDomain=reader?.sourceRegionDomain,textOnly=true,detectText=true,signal,onProgress,backend='auto',name}={}){
   if(disposed)throw new EngineError('DISPOSED','Batch preparation client disposed.');checkAbort(signal);
   requireValue(typeof textOnly==='boolean'&&typeof detectText==='boolean'&&(!textOnly||detectText),'Native preparation requires explicit classification/text options.');
   if(typeof client.analyzeNativeSource!=='function')throw new EngineError('SOURCE_SCOPE_OCR_UNSUPPORTED','The preparation worker does not support native source windows.');
   const domain=await compileOriginalSourceRegions(sourceRegionDomain);checkAbort(signal);
   requireValue(!domain.empty&&reader?.format==='rgb8'&&typeof reader.readWindow==='function'&&reader.sha256===domain.sourceSha256&&reader.width===domain.width&&reader.height===domain.height&&reader.sourceRegionDomain?.fingerprint===domain.fingerprint&&JSON.stringify(reader.origin)===JSON.stringify(domain.origin)&&reader.preparationContext==='envelope-not-scientific-membership','Native text preparation must use the admitted original-source envelope.');
   const channel=new MessageChannel();let descriptor,provider,failure;
   try{
    provider=serveNativeSourceChannel(channel.port1,reader,{signal,...(typeof reader.reserveMemory==='function'?{reserve:bytes=>reader.reserveMemory(bytes)}:{})});
    const image={format:'rgb8-window-source',width:reader.width,height:reader.height,sha256:reader.sha256,origin:[...reader.origin],sourceRegionDomain:domain.descriptor,preparationContext:'envelope-not-scientific-membership',port:channel.port2};
    descriptor=await client.analyzeNativeSource('scientific-preparation',image,{textOnly,detectText,name},{signal,onProgress,backend});checkAbort(signal);
    const metadata=await client.metadata(descriptor);checkAbort(signal);return metadata;
   }catch(error){failure=error;throw error;}finally{await retirePreparation([()=>descriptor&&!disposed?client.release(descriptor.id):undefined,()=>provider?.dispose(),()=>channel.port1.close(),()=>channel.port2.close()],failure);}
  },
  memory:()=>client.memory(),
  dispose(){disposed=true;return client.dispose();}
 };
}
