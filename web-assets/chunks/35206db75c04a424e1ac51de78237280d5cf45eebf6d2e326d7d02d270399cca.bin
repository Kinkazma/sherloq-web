import "../../runtime-context.js?v=0.31.0";
import {Budget} from './cache.js';
import {copyTypedArray} from './allocation.js';
import {runRecompressionCodec,recompressionCodecWorkspace} from './recompression-codec-client.js';
import {recompressionFormat} from './recompression-plan.js';
import {createRgbRecompression,rgbRecompressionPlan} from './jpeg-rgb-stream.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {contiguousSurface} from './image-sources.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
const MiB=1024**2;
export async function recompressSurface(image,plan,{budget,signal,onProgress,codecLane=0,exactCapacity=false}={}){
 requireValue(budget&&plan?.stage&&typeof plan.identity==='string','A resolved recompression plan and shared budget are required.');
 checkAbort(signal);const stage=plan.stage,format=recompressionFormat(stage.codec);requireValue(format,'Unregistered recompression codec.');
 const source=image.surface??contiguousSurface(image.pixels,budget),{width,height}=source.descriptor;
 requireValue(source.descriptor.format==='rgb8'&&Number.isSafeInteger(width*height*3),'Recompression requires the admitted Original RGB8 surface.');
 if(format.maximumDimension&&(width>format.maximumDimension||height>format.maximumDimension))throw new EngineError('UNSUPPORTED_FORMAT','Dimensions exceed the selected codec’s technical limit. No resizing was performed.');
 const storage={budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal};
 const native=stage.codec==='jpeg',workspace=native?rgbRecompressionPlan(source):recompressionCodecWorkspace({width,height},stage);
 const future=native?workspace.workingBytes+workspace.windowAllowance+4*MiB:workspace.workingBytes;
 let planning,store,surface,codec,success=false,failure,failed=false,provenance,metrics,admittedCodecWorkspace,written=0;const started=performance.now(),ioBudget=native?null:new Budget(workspace.transportBytes),reserveIO=bytes=>ioBudget.reserve(bytes);
 try{
  if(native){planning=budget.reserve(future);store=await createSegmentedBytes(width*height*3,storage);planning();planning=null;}
  if(native){codec=createRgbRecompression({...image,surface:source},budget);metrics=await codec.visit(stage.quality,{signal,backend:'cpu',onProgress,onBand:async(_,rgb,{y,rows})=>{requireValue(y*width*3===written&&rgb.length===width*rows*3,'Native JPEG bands changed order or geometry.');await store.write(rgb,written);written+=rgb.length;}});provenance={codec:'jpeg',format:'jpeg',lossless:false,quality:stage.quality,encoder:'libjpeg-turbo-3.0.3/emscripten-4.0.15/ISLOW/4:2:0',decoder:'same native scanline codec',depth:8,chroma:'420',milliseconds:performance.now()-started};}
  else{provenance=await runRecompressionCodec({width,height,stage},{budget,signal,onProgress,codecLane,exactCapacity,onAdmitted:async admitted=>{admittedCodecWorkspace=admitted;store=await createSegmentedBytes(width*height*3,storage);},onRequest:async(action,value)=>{
   if(action==='source-band'){
    requireValue(Number.isSafeInteger(value.y)&&Number.isSafeInteger(value.rows)&&value.y>=0&&value.rows>0&&value.rows<=32&&value.y+value.rows<=height&&value.width===width,'Codec source read exceeds its admitted context.');
    const part=await source.readWindow({x:0,y:value.y,width,height:value.rows},{signal,reserve:reserveIO});try{return{bytes:copyTypedArray(part.pixels.data,{label:'recompression-source-band'})};}finally{await part.release();}
   }
   requireValue(action==='decoded-band'&&value.width===width&&value.y*width*3===written&&value.bytes instanceof Uint8Array&&value.bytes.length===width*value.rows*3&&written+value.bytes.length<=store.byteLength,'Decoded recompression bands changed order or geometry.');await store.write(value.bytes,written);written+=value.bytes.length;return{};
  }});metrics={backend:'cpu',kernel:'registered-native-codec-full-context',recompressions:1,codecHeapPeakBytes:provenance.codecHeapPeakBytes,workingReservationBytes:(admittedCodecWorkspace??workspace).workingBytes,setupMilliseconds:provenance.setupMilliseconds??0,cold:provenance.cold===true};}
  requireValue(written===store.byteLength,'Incomplete full-resolution recompression.');await store.flush();checkAbort(signal);store.markCold();surface=createRgbSurface(store,{width,height,budget});
  // The returned surface is a separate owner. Source/session ownership stays
  // with its caller and must outlive this result’s acknowledged retirement.
  const result={surface,store,provenance:{...provenance,plan:structuredClone(plan),coordinates:'full-resolution',input:'admitted Original RGB8',recompressionCount:1},metrics:{...metrics,storage:store.storage,totalMs:performance.now()-started},dispose(){return surface.dispose();}};success=true;return result;
 }catch(error){failed=true;failure=error;throw error;}
 finally{await retireCompositeOwners([()=>codec?.dispose(),()=>!success?(surface??store)?.dispose():undefined,()=>planning?.(),()=>!image.surface?source.dispose():undefined],failed?{primary:failure}:{});}
}
export async function recompressPixels(pixels,plan,{budget,signal,onProgress}={}){
 let result,lease,success=false;try{result=await recompressSurface({pixels},plan,{budget,signal,onProgress});lease=await result.surface.readWindow({x:0,y:0,width:pixels.width,height:pixels.height},{signal});const provenance=result.provenance,metrics=result.metrics;await result.dispose();result=null;success=true;return{pixels:lease.pixels,provenance,metrics,release:()=>lease.release()};}finally{if(!success)await retireCompositeOwners([()=>lease?.release(),()=>result?.dispose()]);}
}
