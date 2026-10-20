import "../../runtime-context.js?v=0.24.0";
import {validateParams} from './ela.js';
import {toneTable,fusedCpu} from './ela-lut.js';
import {createRgbRecompression,rgbRecompressionPlan} from './jpeg-rgb-stream.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {createNumericSurface} from './numeric-surface.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {EngineError,checkAbort,createCooperator} from './errors.js';
const MCU=16,HALO=16,BAND=256;
const semantics='Native classical JPEG residual on derived-envelope-grid MCU cores whose complete 4:2:0 support and one-MCU halo are admitted. analysis_scope=1 identifies analysed pixels; other RGB pixels are the unanalysed original for presentation only.';

// The maintained codec uses 4:2:0, integer ISLOW DCT, and the usual local
// downsample/fancy-upsample support. This deliberately conservative one-MCU
// halo is qualified against a full native stream, including original edges.
export async function planElaMembership(view,domain,{budget,signal}={}){
 const columns=Math.ceil(domain.width/MCU),rows=Math.ceil(domain.height/MCU),right=domain.origin[0]+domain.width,bottom=domain.origin[1]+domain.height;
 const stagingBytes=4096+columns*512;budget.retain(stagingBytes);let staged=true;const staging=()=>{if(staged){staged=false;budget.retained-=stagingBytes;}};let owned;try{owned=allocateOwnedTypedArray(Uint8Array,columns*rows,{budget,reserve:bytes=>{budget.retain(bytes);return()=>{budget.retained-=bytes;};},label:'ela-admitted-mcu-support'});}catch(error){staging();throw error;}const flags=owned.data,cooperate=createCooperator();let analysedPixels=0,cores=0;
 function core(column,row){const x=domain.origin[0]+column*MCU,y=domain.origin[1]+row*MCU;return{x,y,width:Math.min(MCU,right-x),height:Math.min(MCU,bottom-y)};}
 function support(rect){const x=Math.max(domain.origin[0],rect.x-HALO),y=Math.max(domain.origin[1],rect.y-HALO);return{x,y,width:Math.min(right,rect.x+rect.width+HALO)-x,height:Math.min(bottom,rect.y+rect.height+HALO)-y};}
 try{
  for(let row=0;row<rows;row++){checkAbort(signal);await cooperate();for(let column=0;column<columns;column++){
   const rect=core(column,row),s=support(rect),local={...s,x:s.x-domain.origin[0],y:s.y-domain.origin[1]};
   if(local.x<0||local.y<0||local.x+local.width>domain.width||local.y+local.height>domain.height||!view.includesRectangle(local))continue;
   flags[row*columns+column]=1;analysedPixels+=rect.width*rect.height;cores++;
  }}
  return{columns,rows,analysedPixels,cores,support,contains:(x,y)=>x>=0&&y>=0&&x<domain.width&&y<domain.height&&flags[Math.floor(y/MCU)*columns+Math.floor(x/MCU)]===1,
   // Merge neighbouring qualified cores without ever adding an unqualified
   // one. At most two narrow row maps exist; no full-size rectangle list grows.
   *regions(){let active=new Map();for(let row=0;row<rows;row++){const next=new Map();for(let column=0;column<columns;){if(!flags[row*columns+column]){column++;continue;}const begin=column;while(column<columns&&flags[row*columns+column]&&column-begin<BAND/MCU)column++;const left=core(begin,row),right=core(column-1,row),rect={...left,width:right.x+right.width-left.x},key=begin+':'+column,prior=active.get(key);if(prior&&prior.y+prior.height===rect.y&&prior.height+rect.height<=BAND)next.set(key,{...prior,height:prior.height+rect.height});else{if(prior)yield prior;next.set(key,rect);}}for(const[key,rect]of active)if(!next.has(key))yield rect;active=next;}yield*active.values();},
   dispose:()=>{owned.release();staging();}};
 }catch(error){owned.release();staging();throw error;}
}

async function cacheFor(derived,view,domain,budget,signal){
 if(derived.rgbRecompression){if(!derived.rgbRecompression.sourceRegionEla)throw new EngineError('INVALID_RESULT','The source-domain JPEG cache belongs to another grid.');return derived.rgbRecompression;}
 const plan=await planElaMembership(view,domain,{budget,signal});if(!plan.analysedPixels){plan.dispose();throw new EngineError('SOURCE_SCOPE_EMPTY','No admitted derived-envelope JPEG MCU core has its complete native support and halo.',{details:{selectedPixels:domain.countIncluded,analysedPixels:0,unanalysablePixels:domain.countIncluded,mcu:MCU,halo:HALO}});}
 const entries=new Map(),pending=new Set(),pinned=new Set();let closed=false;
 const retire=entry=>{const task=Promise.resolve(entry.store.dispose());pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;};
 const unregister=budget.registerReclaimer?.(bytes=>{for(const[q,entry]of entries){if(budget.total()+bytes<=budget.limit)break;if(pinned.has(q)||entry.store.storage!=='memory')continue;entries.delete(q);void retire(entry);}});
 const cache={sourceRegionEla:true,plan,entries,pinned,async dispose(){if(closed)return;closed=true;unregister?.();for(const entry of entries.values())retire(entry);entries.clear();plan.dispose();const results=await Promise.allSettled([...pending]);const failed=results.find(x=>x.status==='rejected');if(failed)throw failed.reason;}};
 derived.rgbRecompression=cache;return cache;
}
function boundedImage(view,rect,original){return{surface:{descriptor:{width:rect.width,height:rect.height,sourceWidth:original.surface.descriptor.width,format:'rgb8'},readWindow:(part,hooks)=>view.readWindow({...part,x:rect.x-view.domain.origin[0]+part.x,y:rect.y-view.domain.origin[1]+part.y},hooks)},get session(){return original.session;},ensureTemporarySession:original.ensureTemporarySession};}
function storageOptions(original,budget,signal){return{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal};}
export async function sourceRegionJpegPlan({derived,view,domain,budget,signal}){return(await cacheFor(derived,view,domain,budget,signal)).plan;}
// A borrowed quality is pinned until its consumer finishes its native plane.
// This provider never supplies absent pixels as a full RGB image.
export async function acquireSourceRegionJpeg({quality,original,derived,view,domain,budget,signal,onProgress}){
 const cache=await cacheFor(derived,view,domain,budget,signal),plan=cache.plan,width=domain.width,height=domain.height,hit=cache.entries.has(quality);let entry=cache.entries.get(quality),creating,planning,recompressions=0;cache.pinned.add(quality);
 try{if(!entry){const shape=rgbRecompressionPlan({descriptor:{width:Math.min(width,BAND+2*HALO),height:Math.min(height,BAND+2*HALO)}});planning=budget.reserve(shape.workingBytes+shape.windowAllowance+1024**2);while(cache.entries.size>=2){const candidate=[...cache.entries].find(([q])=>!cache.pinned.has(q));if(!candidate)break;const[q,old]=candidate;cache.entries.delete(q);await old.store.dispose();}creating=await createSegmentedBytes(width*height*3,storageOptions(original,budget,signal));planning();planning=null;
  let completed=0;for(const core of plan.regions()){
   checkAbort(signal);const support=plan.support(core),image=boundedImage(view,support,original),codec=createRgbRecompression(image,budget);
   try{await codec.visit(quality,{signal,onBand:async(_,rgb,{y,rows})=>{for(let row=Math.max(0,core.y-support.y-y);row<Math.min(rows,core.y+core.height-support.y-y);row++){const at=(row*support.width+core.x-support.x)*3,start=((support.y+y+row-domain.origin[1])*width+core.x-domain.origin[0])*3;await creating.write(rgb.subarray(at,at+core.width*3),start);}}});recompressions++;}
   finally{await codec.dispose();}
   completed+=core.width*core.height;onProgress?.({phase:'source-region-ela-jpeg',fraction:completed/plan.analysedPixels});
  }await creating.flush();checkAbort(signal);creating.markCold();entry={store:creating};cache.entries.set(quality,entry);creating=null;
 }
  let released=false;return{store:entry.store,plan,metrics:{recompressions,recompressedCache:hit},release(){if(!released){released=true;cache.pinned.delete(quality);}}};
 }catch(error){cache.pinned.delete(quality);throw error;}finally{await creating?.dispose();planning?.();}
}
export async function sourceRegionEla({task,original,derived,view,domain,budget,signal,onProgress,publishResult}){
 const params=validateParams(task.params),borrowed=await acquireSourceRegionJpeg({quality:params.quality,original,derived,view,domain,budget,signal,onProgress}),plan=borrowed.plan,entry={store:borrowed.store},width=domain.width,height=domain.height,shape=rgbRecompressionPlan({descriptor:{width:Math.min(domain.width,BAND+2*HALO),height:Math.min(domain.height,BAND+2*HALO)}});
 let output,scope,surface,scopeSurface,published=false,planning,tableLease;const hit=borrowed.metrics.recompressedCache,recompressions=borrowed.metrics.recompressions;let regions=0;
 try{
  planning=budget.reserve(shape.workingBytes+shape.windowAllowance+1024**2);
  output=await createSegmentedBytes(width*height*3,storageOptions(original,budget,signal));scope=await createSegmentedBytes(width*height*4,storageOptions(original,budget,signal));planning();planning=null;
  // Read excluded RGB solely for the explicitly unanalysed display background.
  const bandRows=Math.max(1,Math.min(height,Math.floor(262144/width)));
  for(let y=0;y<height;y+=bandRows){checkAbort(signal);const h=Math.min(bandRows,height-y),part=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});try{await output.write(part.pixels.data,y*width*3);}finally{part.release();}}
  tableLease=budget.reserve(1024**2);const key=task.imageId+'\0source-region/ela-tone/'+params.scale+'/'+params.contrast+'/'+params.linear;let table=budget.get(key);const tableCached=!!table;if(!table){table=await toneTable(params,{signal});budget.put(key,table);}
  let completed=0;for(const core of plan.regions()){
   checkAbort(signal);const rect={...core,x:core.x-domain.origin[0],y:core.y-domain.origin[1]},lease=budget.reserve(core.width*core.height*6+core.width*4);let part;
   try{part=await view.readWindow(rect,{signal});const recompressed=new Uint8Array(core.width*core.height*3);for(let row=0;row<core.height;row++)await entry.store.readInto(recompressed.subarray(row*core.width*3,(row+1)*core.width*3),((rect.y+row)*width+rect.x)*3);const rendered=await fusedCpu(part.pixels.data,recompressed,params,table,{signal}),ones=new Int32Array(core.width).fill(1);for(let row=0;row<core.height;row++){await output.write(rendered.subarray(row*core.width*3,(row+1)*core.width*3),((rect.y+row)*width+rect.x)*3);await scope.write(new Uint8Array(ones.buffer),((rect.y+row)*width+rect.x)*4);}}
   finally{part?.release();lease();}regions++;completed+=core.width*core.height;onProgress?.({phase:'source-region-ela-render',fraction:completed/plan.analysedPixels});
  }
  await output.flush();await scope.flush();checkAbort(signal);output.markCold();scope.markCold();surface=createRgbSurface(output,{width,height,budget});scopeSurface=createNumericSurface(scope,{width,height,format:'int32',budget,semantics:'1 only for a native derived-envelope-grid MCU core with complete admitted JPEG support; 0 means unanalysed, not a score.'});
  const metrics={selectedPixels:domain.countIncluded,analysedPixels:plan.analysedPixels,unanalysablePixels:domain.countIncluded-plan.analysedPixels,mcu:MCU,halo:HALO,regions,recompressions,recompressedCache:hit,tableCached,storage:output.storage,sourceRegionPolicy:'complete-envelope-mcu-support-only'},record={surface,planeRecords:{analysis_scope:{surface:scopeSurface}},semantics,metrics},bundle=publishResult(task.imageId,record);published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,analysis_scope:bundle.planeSurfaces?.analysis_scope,semantics,metrics,provenance:{params,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-recompression',presentationOutsideAnalysedSupport:'original-unanalysed',jpegGrid:{phase:'derived-native-envelope',origin:[0,0],originalOrigin:[...domain.origin],mcu:MCU,halo:HALO,sampling:'420',dct:'ISLOW'},analysisScope:'analysis_scope=1 only; unanalysable selected pixels are not scientific observations'}};
 }catch(error){if(!published){await surface?.dispose();if(!surface)await output?.dispose();await scopeSurface?.dispose();if(!scopeSurface)await scope?.dispose();}throw error;}
 finally{borrowed.release();planning?.();tableLease?.();}
}
