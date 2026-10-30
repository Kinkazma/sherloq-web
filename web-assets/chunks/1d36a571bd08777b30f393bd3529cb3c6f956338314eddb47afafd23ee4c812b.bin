import "../../runtime-context.js?v=0.30.0";
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {needsBiomeFormation,biomeFormationSelectionCounts} from './sparse-biome-correspondence.js';
import {biomeAreaMetadataBytes} from './sparse-biome-area.js';
import {renderSparseCopy} from './sparse-copy-view.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {checkAbort} from './errors.js';
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,cleanupDenseOwners} from './dense-owner-retirement.js';
// Native global drawing is retained. Rendering happens after feature workers are
// released and is admitted separately; storage/window reads do not redraw fits.
export async function createSparseSurface(image,data,view,{budget,signal,onOwner,tracePrefixCache,traceCommands}={}){
 const derivedAreas=data.params?.algorithm!=='SSG'&&needsBiomeFormation(view);
 if(onOwner===undefined&&derivedAreas){
  const pool=new WaveletStripPool(budget,{workerFactory:null,resourceOwner:'copy-move-presentation'});let registered;
  const record=await createSparseSurface(image,data,view,{budget,signal,tracePrefixCache,traceCommands,onOwner:owner=>{const dispose=owner.dispose;registered=pool.ownCleanup(()=>dispose());owner.dispose=()=>registered.retire();}});
  record.surface.dispose=onceDenseRetirement(()=>registered.retire());return record;
 }
 const reserveAreaMetadata=async()=>{
  const bytes=biomeAreaMetadataBytes(data,biomeFormationSelectionCounts(data,view));if(traceCommands)await traceCommands.prepareFrame(bytes);checkAbort(signal);
  return tracePrefixCache?.reserveFrame?tracePrefixCache.reserveFrame(bytes,n=>budget.reserve(n),{signal}):budget.reserve(bytes);
 };

 if(onOwner===undefined){
 const releases=[],reserveMemory=n=>{const f=budget.reserve(n);releases.push(f);return f;};let source,store,complete=false;
 try{
  source=image.pixels?{pixels:image.pixels,release(){}}:await image.surface.readWindow({}, {signal});
  const {pixels,...style}=await renderSparseCopy(source.pixels,data,view,{signal,reserveMemory,tracePrefixCache,traceCommands,analysisImage:image});
  source.release();source=null;
  store=await createSegmentedBytes(pixels.data.byteLength,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  for(let at=0;at<pixels.data.length;at+=4*1024**2){checkAbort(signal);await store.write(pixels.data.subarray(at,at+4*1024**2),at);}await store.flush();checkAbort(signal);
  const surface=createRgbSurface(store,{width:pixels.width,height:pixels.height,budget});complete=true;return {surface,...style};
 }finally{source?.release();releases.forEach(f=>f());if(!complete)await store?.dispose();}
 }
 const releases=[],reserveMemory=n=>{const f=budget.reserve(n);releases.push(f);return f;};let source,store,retireSurface,areaFree,complete=false,failed=false,primary,finish;const construction=new Promise(resolve=>finish=resolve);
 const dropSource=onceDenseRetirement(async()=>{const previous=source;await acknowledgeDenseRetirement(()=>previous?.release());if(source===previous)source=null;}),dropScratch=onceDenseRetirement(async()=>{await retireDenseOwners(releases);releases.length=0;}),dropArea=onceDenseRetirement(()=>areaFree?.()),owner={dispose:onceDenseRetirement(async()=>{await construction;await acknowledgeDenseRetirement(()=>retireSurface?retireSurface():store?.dispose());await dropSource();await dropScratch();if(areaFree)await dropArea();})};
 try{
  // Additive construction ownership only; the native renderer receives exactly
  // its historical data/view/options and the same reserveMemory callback shape.
  onOwner?.(owner);
  if(derivedAreas)areaFree=await reserveAreaMetadata();
  source=image.pixels?{pixels:image.pixels,release(){}}:await image.surface.readWindow({}, {signal});
  const {pixels,...style}=await renderSparseCopy(source.pixels,data,view,{signal,reserveMemory,tracePrefixCache,traceCommands,analysisImage:image});
  await dropSource();
  store=await createSegmentedBytes(pixels.data.byteLength,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  for(let at=0;at<pixels.data.length;at+=4*1024**2){checkAbort(signal);await store.write(pixels.data.subarray(at,at+4*1024**2),at);}await store.flush();checkAbort(signal);
  const surface=createRgbSurface(store,{width:pixels.width,height:pixels.height,budget});retireSurface=surface.dispose.bind(surface);complete=true;return {surface,...style};
 }catch(error){failed=true;primary=error;throw error;}finally{finish();if(complete)await dropScratch();else await cleanupDenseOwners(()=>owner.dispose(),{failed,primary});}
}
