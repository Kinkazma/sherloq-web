import "../../runtime-context.js?v=0.25.0";
import {ghostSpatialBackground} from './ghost-spatial-presentation.js';
import {planGhostNativeContexts,GHOST_CONTEXT_PLAN_VERSION} from './ghost-native-context-plan.js';
import {ghostParams} from './ghost-maps.js';
import {jpegBlockError} from './jpeg-block-error.js';
import {GHOST_PALETTES} from './ghost-palettes.js';
import {nativeGhostContextAdmission} from './source-region-fragmented-ghost.js';
import {reservePreview,previewRoom} from './cached-parameter-preview.js';
import {checkAbort,requireValue,EngineError,createCooperator} from './errors.js';
const MiB=1024**2;
const unavailable=message=>{throw new EngineError('PREVIEW_UNAVAILABLE',message);};
const qualityList=p=>Array.from({length:Math.floor((p.high-p.low)/p.step)+1},(_,i)=>p.low+i*p.step);
export function ghostPreviewQuality(qualities,view={}){
 const wanted=view.quality??(/^quality-(\d+)$/.exec(view.layerId??view.id??'')?.[1]);
 if(wanted!==undefined){requireValue(Number.isFinite(Number(wanted)),'Invalid Ghost quality selection.');return qualities.reduce((a,b)=>Math.abs(b-Number(wanted))<Math.abs(a-Number(wanted))?b:a);}
 requireValue(Number.isFinite(view.index??0),'Invalid Ghost layer index.');return qualities[Math.max(0,Math.min(qualities.length-1,Math.trunc(view.index??0)))];
}
function shape(rect,step){const sx=Math.min(step,Math.max(1,Math.floor(rect.width/16))),sy=Math.min(step,Math.max(1,Math.floor(rect.height/16)));return{width:Math.ceil(rect.width/sx),height:Math.ceil(rect.height/sy),stepX:sx,stepY:sy};}
/** The limit covers ALL context inputs together. Every evaluable native
 * context retains at least one complete provisional 16x16 cell. */
export function planScopedGhostPreview(contexts,preview={},available=Infinity){
 const maxSide=preview.maxSide??128,maxPixels=preview.maxPixels??2048**2,maxWorkingBytes=preview.maxWorkingBytes??128*MiB;
 requireValue(Number.isSafeInteger(maxSide)&&maxSide>=16&&maxSide<=2048&&Number.isSafeInteger(maxPixels)&&maxPixels>0&&maxPixels<=2048**2&&Number.isSafeInteger(maxWorkingBytes)&&maxWorkingBytes>=0,'Invalid scoped Ghost preview bounds.');
 const active=contexts.filter(c=>c.evaluable);if(!active.length)unavailable('No exact context has a complete native Ghost cell.');
 const cap=Math.min(maxPixels,maxSide*maxSide,Math.floor((Math.min(available,maxWorkingBytes)-34*MiB)/64));
 const largest=active.reduce((n,c)=>Math.max(n,c.rect.width,c.rect.height),1);let lo=1,hi=largest;
 const pixels=s=>active.reduce((n,c)=>{const g=shape(c.rect,s);return n+g.width*g.height;},0);
 const minimumPixels=pixels(largest);if(cap<minimumPixels)unavailable('The aggregate preview budget cannot retain one complete sampled Ghost cell per evaluable context.');
 while(lo<hi){const mid=lo+Math.floor((hi-lo)/2);if(pixels(mid)<=cap)hi=mid;else lo=mid+1;}
 const grids=active.map(c=>({...shape(c.rect,lo),id:c.id}));return{grids,pixels:grids.reduce((n,g)=>n+g.width*g.height,0),step:lo,minimumPixels,maximumPixels:cap};
}
/** Optional sampled sources and raw quality planes. Reservation shares are
 * transferred, never credited twice; an active request pins its whole cache.
 * No reader, signal, derived store, normalized map or published result is kept. */
export function createSourceRegionGhostPreview({budget,codec,cacheBytes=16*MiB}={}){
 requireValue(budget&&typeof codec?.recompress==='function'&&Number.isSafeInteger(cacheBytes)&&cacheBytes>=0,'Scoped Ghost preview needs an admitted native codec.');
 const cache=new Map(),pins=new Set();let bytes=0,active=false,closed=false,identity;
 const retire=key=>{const entry=cache.get(key);if(!entry)return;cache.delete(key);bytes-=entry.bytes;entry.release();};
 const clear=()=>{for(const key of [...cache.keys()])retire(key);};
 const unregister=budget.registerReclaimer(()=>{if(!active)clear();},{allocationKind:'array-buffer',owner:'jpeg.ghosts',label:'idle-scoped-ghost-proxy'});
 const get=key=>{const e=cache.get(key);if(e){cache.delete(key);cache.set(key,e);pins.add(key);}return e?.value;};
 const keep=(key,value,size,held)=>{if(size>cacheBytes||!size)return;for(const candidate of [...cache.keys()]){if(bytes+size<=cacheBytes)break;if(!pins.has(candidate))retire(candidate);}if(bytes+size>cacheBytes)return;cache.set(key,{value,bytes:size,release:held.split(size)});pins.add(key);bytes+=size;};
 return{
  async preview({task,original,derived,view,domain,preview={},signal,onProgress}={}){
   if(closed)throw new EngineError('DISPOSED','Scoped Ghost preview is closed.');if(active)throw new EngineError('BUSY','A scoped Ghost preview is already active.');checkAbort(signal);
   requireValue(task?.operation==='jpeg.ghosts'&&domain?.fingerprint&&view?.domain?.fingerprint===domain.fingerprint,'Scoped Ghost preview needs the verified native source domain.');
   if(task.backend==='webgpu')throw new EngineError('UNSUPPORTED_BACKEND','Scoped Ghost recompression preserves the native CPU codec contract.');
   if((task.view?.layerId??task.view?.id)==='original')unavailable('The Original display layer does not require Ghost recompression.');
   const p=ghostParams(task.params),qualities=qualityList(p),quality=ghostPreviewQuality(qualities,task.view),palette=GHOST_PALETTES[p.grayscale?'gray':'viridis'],cooperate=createCooperator(signal),nextIdentity=JSON.stringify([GHOST_CONTEXT_PLAN_VERSION,domain.sourceSha256,domain.fingerprint]);
   if(identity!==nextIdentity){clear();identity=nextIdentity;}pins.clear();active=true;
   let planning,contextPlan,held,primary,failed=false;const contexts=[],started=performance.now(),stats={recompressions:0,sourceReads:0,sourceSamples:0,nativePlaneHits:0,proxyPlaneHits:0,sourceGridHits:0};
   try{
    // Metadata admission precedes each fragment allocation, including tiny
    // native contexts that will be reported rather than silently promoted.
    const metadata=[];planning=()=>{for(const release of metadata)release();};let atlasWidth=0,atlasHeight=0;
    contextPlan=await planGhostNativeContexts(view,{budget,signal,roll:[p.x,p.y]});for(const planned of contextPlan.contexts){const rect=planned.rect;await cooperate();metadata.push(reservePreview(budget,2048));const admission=nativeGhostContextAdmission(rect),c={id:contexts.length,rect,ownedRectangles:planned.ownedRectangles,...admission,bounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height]};if(c.evaluable){c.atlasY=atlasHeight;atlasWidth=Math.max(atlasWidth,c.columns);atlasHeight+=c.rows;}contexts.push(c);}
    requireValue(contextPlan.selectedPixels===domain.countIncluded,'Ghost preview contexts lost admitted pixels.');
    if(!atlasWidth||!atlasHeight)unavailable('No exact context has a complete native Ghost cell.');
    // Native raw planes are cache-owned. This read-only path does not allocate
    // JPEG work or mutate the authoritative cache. No allocator runs while a
    // borrowed plane is live except the already admitted preview workspace.
    const nativeIdentity=derived?.ghostCache?.sourceRegionIdentity===nextIdentity&&!derived.ghostCache.disposed;
    const nativePlanes=new Map();let allNative=!!nativeIdentity;
    if(nativeIdentity)for(const c of contexts.filter(c=>c.evaluable)){const entry=derived.ghostCache.entries.get(c.bounds.join('/'));if(!entry){allNative=false;break;}const list=qualities.map(q=>budget.get(task.imageId+'\0source-region/ghost-v2/'+c.bounds.join('/')+'/plane/'+p.x+'/'+p.y+'/'+q)?.value);if(list.some(a=>!(a instanceof Float64Array)||a.length!==c.columns*c.rows)){allNative=false;break;}nativePlanes.set(c.id,list);}
    if(!allNative)nativePlanes.clear();
    const maxPixels=preview.maxPixels??2048**2,maxSide=preview.maxSide??128;requireValue(Number.isSafeInteger(maxPixels)&&maxPixels>0&&maxPixels<=2048**2&&Number.isSafeInteger(maxSide)&&maxSide>=16&&maxSide<=2048,'Invalid Ghost display preview bounds.');
    let displayStep=Math.max(1,Math.ceil(Math.max(domain.width,domain.height)/maxSide));while(Math.ceil(domain.width/displayStep)*Math.ceil(domain.height/displayStep)>maxPixels)displayStep++;
    const width=Math.ceil(domain.width/displayStep),height=Math.ceil(domain.height/displayStep),displayBytes=width*height*3;
    // Optional idle samples may be dropped before planning a new request. No
    // native result/cache is evicted merely to make a provisional frame fit.
    const nestedReaderBytes=3*MiB+65536+(allNative?0:contexts.reduce((n,c)=>c.evaluable?Math.max(n,c.rect.width*6):n,0)),workingLimit=preview.maxWorkingBytes??128*MiB;requireValue(Number.isSafeInteger(workingLimit)&&workingLimit>=0,'Invalid Ghost preview working limit.');
    let plan;if(!allNative){const bounds={...preview,maxWorkingBytes:Math.max(0,workingLimit-nestedReaderBytes)};try{plan=planScopedGhostPreview(contexts,bounds,previewRoom(budget)-displayBytes-nestedReaderBytes);}catch(error){clear();plan=planScopedGhostPreview(contexts,bounds,previewRoom(budget)-displayBytes-nestedReaderBytes);}}
    const peak=allNative?displayBytes+65536:34*MiB+displayBytes+plan.pixels*64;
    if(peak+nestedReaderBytes>workingLimit)unavailable('The aggregate scoped Ghost frame exceeds the preview working limit.');
    // Native raw reuse wins over our optional sampled source cache. This is
    // still before borrowing any proxy arrays; authoritative native planes
    // remain in their own cache and are never reclaimed for a draft.
    if(peak+nestedReaderBytes>previewRoom(budget))clear();
    held=reservePreview(budget,peak);const data=new Uint8Array(displayBytes),frames=new Map(),gridById=new Map(plan?.grids.map(g=>[g.id,g])??[]),evaluableCount=contexts.reduce((n,c)=>n+Number(c.evaluable),0);
    for(const c of contexts){await cooperate();if(!c.evaluable)continue;let planes,cols,rows;
     if(allNative){planes=nativePlanes.get(c.id);cols=c.columns;rows=c.rows;stats.nativePlaneHits+=planes.length;}
     else{
      const g=gridById.get(c.id),gridKey=JSON.stringify([identity,c.bounds,g.width,g.height,g.stepX,g.stepY]),phaseKey=gridKey+'/'+p.x+'/'+p.y;let sampled=get(gridKey);
      if(sampled)stats.sourceGridHits++;else{const sampledData=new Uint8Array(g.width*g.height*3);for(let y=0;y<g.height;y++){await cooperate();const lease=await view.readWindow({x:c.rect.x,y:c.rect.y+y*g.stepY,width:c.rect.width,height:1},{signal});try{checkAbort(signal);stats.sourceReads++;for(let x=0;x<g.width;x++){const at=x*g.stepX*3,dst=(y*g.width+x)*3;sampledData[dst]=lease.pixels.data[at];sampledData[dst+1]=lease.pixels.data[at+1];sampledData[dst+2]=lease.pixels.data[at+2];}}finally{lease.release();}}sampled={width:g.width,height:g.height,format:'rgb8',data:sampledData};keep(gridKey,sampled,sampledData.byteLength,held);}
      stats.sourceSamples+=g.width*g.height;cols=Math.floor(g.width/16);rows=Math.floor(g.height/16);planes=[];let shifted;
      for(const q of qualities){await cooperate();const planeKey=phaseKey+'/'+q;let plane=get(planeKey);if(plane)stats.proxyPlaneHits++;else{if(!shifted){if(!p.x&&!p.y)shifted=sampled;else{const rolled=new Uint8Array(sampled.data.length);for(let y=0;y<g.height;y++){await cooperate();for(let x=0;x<g.width;x++){const at=(((y-p.y+g.height)%g.height)*g.width+(x-p.x+g.width)%g.width)*3,dst=(y*g.width+x)*3;rolled[dst]=sampled.data[at];rolled[dst+1]=sampled.data[at+1];rolled[dst+2]=sampled.data[at+2];}}shifted={...sampled,data:rolled};}}plane=await jpegBlockError(shifted,q,{signal},codec);checkAbort(signal);stats.recompressions++;keep(planeKey,plane,plane.byteLength,held);}planes.push(plane);}
     }
     frames.set(c.id,{planes,cols,rows,...(allNative?{width:c.rect.width,height:c.rect.height,stepX:1,stepY:1}:gridById.get(c.id))});onProgress?.({phase:'source-region-ghost-proxy',sourceFragment:c.id,completed:frames.size,total:evaluableCount});
    }
    // Only the selected layer is normalized/colored. Its normalization always
    // includes EVERY requested quality, even when only one layer is visible.
    requireValue(original?.surface?.descriptor?.format==='rgb8','Spatial Ghost drafts need the borrowed Original presentation source.');
    const backgroundBytes=await ghostSpatialBackground({background:original.surface,origin:domain.origin,geometry:{x:0,y:0,step:displayStep,width,height},target:data,signal,reserve:bytes=>reservePreview(budget,bytes)});
    // The provisional phase is exact on each declared sampled input lattice.
    // Native cache reuse has stepX=stepY=1 and thus the exact native phase.
    const qi=qualities.indexOf(quality);for(let ci=contexts.length-1;ci>=0;ci--){const c=contexts[ci];if(!c.evaluable)continue;const frame=frames.get(c.id),top=Math.max(0,Math.ceil(c.rect.y/displayStep)),bottom=Math.min(height,Math.ceil((c.rect.y+c.rect.height)/displayStep));for(let y=top;y<bottom;y++){await cooperate();const sy=(Math.min(frame.height-1,Math.floor((y*displayStep-c.rect.y)/frame.stepY))+p.y)%frame.height;if(sy>=frame.rows*16)continue;const row=Math.floor(sy/16),left=Math.max(0,Math.ceil(c.rect.x/displayStep)),right=Math.min(width,Math.ceil((c.rect.x+c.rect.width)/displayStep));for(let x=left;x<right;x++){const sx=(Math.min(frame.width-1,Math.floor((x*displayStep-c.rect.x)/frame.stepX))+p.x)%frame.width;if(sx>=frame.cols*16)continue;const cell=row*frame.cols+Math.floor(sx/16);let min=Infinity,max=-Infinity;for(const plane of frame.planes){min=Math.min(min,plane[cell]);max=Math.max(max,plane[cell]);}const normalized=max===min?0:(frame.planes[qi][cell]-min)/(max-min),at=Math.max(0,Math.min(255,Math.floor(normalized*256)))*3,dst=(y*width+x)*3;data[dst]=palette[at];data[dst+1]=palette[at+1];data[dst+2]=palette[at+2];}}}
    checkAbort(signal);const milliseconds=performance.now()-started;return{pixels:{width,height,format:'rgb8',data,logicalWidth:domain.width,logicalHeight:domain.height},logicalWidth:domain.width,logicalHeight:domain.height,provisional:true,exact:allNative&&displayStep===1,approximate:!allNative||displayStep!==1,metrics:{...stats,presentationOnlyOriginalBackground:true,presentationBackgroundBytes:backgroundBytes,totalMs:milliseconds,cacheOnly:allNative||stats.recompressions===0,nativeAnalysisCalls:0,inferenceCalls:0,scientificFinalChanged:false,nativeQuality:quality,qualities:[...qualities],samplePixels:allNative?width*height:plan.pixels,admittedPreviewBytes:peak+nestedReaderBytes,nestedReaderBytes,retainedProxyBytes:bytes,contexts:contexts.length,evaluatedContexts:frames.size,sourceRegionFingerprint:domain.fingerprint},preview:{provisional:true,kind:allNative?'retained-native-raw-renormalization':'independent-context-JPEG-proxy',quality,qualities:[...qualities],displayStep,sampling:plan?.grids??null,normalization:'min/max across every requested quality in the same context and sampled lattice',scientificFinalChanged:false,coordinates:'source-region-native-pixels',presentationBackground:'Original only; never a Ghost score',excludedParticipation:'absent before sampling/roll/JPEG/error/normalization'}};
   }catch(error){failed=true;primary=error;throw error;}finally{try{held?.();planning?.();contextPlan?.release();}catch(error){if(!failed)throw error;}finally{pins.clear();active=false;}}
  },
  dispose(){if(active)throw new EngineError('BUSY','Settle scoped Ghost preview before disposal.');if(closed)return;closed=true;clear();unregister();},
  get state(){return{closed,active,bytes,entries:cache.size,identity};}
 };
}
