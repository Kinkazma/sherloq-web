import {TextRegionEngine} from './text-ocr.js';
import {createForgeryscopeBoundedSource} from './forgeryscope-bounded-source.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {localizeSourceRegionTask} from './source-region-localize.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {checkAbort,controlCheckpoint,requireValue} from './errors.js';
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
// Scientific identity excludes diagnostics (duration, heaps, retries and workers).
// Their complete native records remain in scope.text.metadata.providers.
const nativeTextMethod=metadata=>Object.fromEntries(['engine','nativeVersion','runtime','language','languageSha256','psm','tileEdge','overlap','backend'].filter(key=>Object.hasOwn(metadata,key)).map(key=>[key,metadata[key]]));
const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;};
/** This conversion is ONLY for TextRegionEngine's inclusive integer boxes.
 * Native centre polygons remain recorded; the strict RGB domain and editor
 * receive the complete physical cell support, including right/bottom pixels. */
export function textRegionInclusivePixelSupport(box,{width,height,origin=[0,0]}={}){
 requireValue(Array.isArray(box)&&box.length===4&&box.every(Number.isSafeInteger)&&[width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Array.isArray(origin)&&origin.length===2&&origin.every(Number.isSafeInteger)&&box[0]>=0&&box[1]>=0&&box[2]>=box[0]&&box[3]>=box[1]&&box[2]<width&&box[3]<height,'Inclusive TextRegionEngine bounds differ from their native fragment.');
 const[x,y,r,b]=box.map((n,i)=>n+origin[i%2]),bounds=[x,y,r+1,b+1];return{nativeBounds:[x,y,r,b],nativePolygon:[[x,y],[r,y],[r,b],[x,b]],bounds,polygon:[[x,y],[r+1,y],[r+1,b+1],[x,b+1]],contract:'TextRegionEngine/inclusive-integer-boxes/1'};
}
/** One owned native OCR preparation is reused across the aggregate's groups.
 * The engine, method, confidence filtering and PSM11 are the native scientific
 * TextRegionEngine; all source windows are restricted before that engine. */
export function createAutomaticNativeTextPreparation({budget,profile,engineFactory=(b,p)=>new TextRegionEngine(b,p)}={}){
 let engine,cache,active=false,closed=false,finished,controller;
 const unpin=entry=>{if(entry&&--entry.refs===0)for(const release of entry.leases)release();};
 const loan=(entry,cacheHit)=>{entry.refs++;let released=false;return{task:entry.task,scientificScope:entry.task.params.scientificScope,metadata:{...entry.metadata,cacheHit},release(){if(!released){released=true;unpin(entry);}}};};
 return{async prepare(prepared,{language,backend='auto',signal,onProgress}={}){
  requireValue(!closed&&!active,'Automatic native text preparation is busy or closed.');requireValue(language?.data instanceof Uint8Array&&/^[a-f0-9]{64}$/.test(language.sha256??''),'Actual verified native English language owner required.');
  active=true;controller=new AbortController();const joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;let finish;finished=new Promise(resolve=>finish=resolve);let reader,native,returned=false,primary;const leases=[];
  try{
   checkAbort(joined);const input=prepared.originalTask.params?.scientificScope;requireValue(input&&input.text?.status!=='complete','Only incomplete scientific text uses the native OCR preparation.');
   leases.push(budget.reserve(65536+sourceRegionTransportBytes(prepared.originalTask,{allowAliases:true,allowUndefined:true})*6));
   const key=JSON.stringify([prepared.sourceDomain.sourceSha256,prepared.fingerprint,language.sha256,backend,'native-tesseract-eng-psm11-fragments/1',prepared.originalTask]);if(cache?.key===key){checkAbort(joined);for(const release of leases.splice(0))release();returned=true;return loan(cache,true);}
   reader=await createForgeryscopeBoundedSource(prepared,{budget,signal:joined});checkAbort(joined);const textPolygons=[],nativeBoxes=[],providers=[];
   engine??=engineFactory(budget,profile);
   for(const[index,fragment]of reader.metadata.fragments.entries()){
    await controlCheckpoint(joined);const[x,y,r,b]=fragment.bounds,w=r-x,h=b-y,image={width:w,height:h,format:'rgb8',readWindow:(rect,hooks)=>reader.image.surface.readWindow({...rect,x:x+rect.x,y:y+rect.y},hooks)};
    native=await engine.detect(image,{language,backend,signal:joined,onProgress:event=>onProgress?.({...event,phase:'automatic-native-text',fragment:index,fragments:reader.metadata.fragments.length})});checkAbort(joined);
    requireValue(Array.isArray(native.boxes)&&Array.isArray(native.polygons)&&native.boxes.length===native.polygons.length,'The actual native OCR box/polygon contract is required.');leases.push(budget.reserve(8192+sourceRegionTransportBytes([native.boxes,native.polygons,native.metadata],{allowAliases:true,allowUndefined:true})*4));
    for(const[boxIndex,box]of native.boxes.entries()){const local=textRegionInclusivePixelSupport(box.bounds,{width:w,height:h});requireValue(Number.isFinite(box.confidence)&&JSON.stringify(native.polygons[boxIndex])===JSON.stringify(local.nativePolygon),'Only the actual axis-aligned TextRegionEngine polygon contract may use inclusive-box support conversion.');const support=textRegionInclusivePixelSupport(box.bounds,{width:w,height:h,origin:fragment.originalBounds.slice(0,2)});nativeBoxes.push({...support,confidence:box.confidence,fragment:index,acquisition:fragment.acquisition});textPolygons.push(support.polygon);}
    providers.push({fragment:index,acquisition:fragment.acquisition,originalBounds:[...fragment.originalBounds],native:structuredClone(native.metadata)});await native.release();native=null;
   }
   await reader.dispose();reader=null;checkAbort(joined);
   const task=structuredClone(prepared.originalTask),scope=task.params.scientificScope,unique=[...new Map(textPolygons.map(p=>[JSON.stringify(p),p])).values()];
   scope.excluded=[...new Map([...scope.excluded,...unique].map(p=>[JSON.stringify(p),p])).values()];scope.text={status:'complete',polygons:unique,metadata:{model:{id:'Tesseract / eng / PSM 11',languageSha256:language.sha256},sourceContract:'TextRegionEngine/inclusive-integer-boxes/1',nativeBoxes,providers,rgbSupport:'Complete native inclusive box cell support [x,y,right+1,bottom+1]; native centre polygons retained separately.',upstream:'Only admitted acquisition fragment pixels enter OCR; source Original is unchanged.'}};
   scope.fingerprint=await digest(['automatic-native-text-preparation/2',scope.fingerprint,prepared.fingerprint,language.sha256,backend,unique,nativeBoxes,providers.map(p=>({originalBounds:p.originalBounds,native:nativeTextMethod(p.native)}))]);checkAbort(joined);
   const localized=await localizeSourceRegionTask(task,prepared.sourceDomain,{signal:joined,strictAutomaticFragments:true});checkAbort(joined);frozen(localized);
   const entry={key,task:localized,leases:[...leases],refs:1,metadata:{schema:'sherloq.automatic-native-text/1',engine:'TextRegionEngine',languageSha256:language.sha256,fragments:providers.length,nativeBoxes:nativeBoxes.length,scopeFingerprint:localized.params.scientificScope.fingerprint,nativePreparationExecuted:true}},old=cache;cache=entry;unpin(old);returned=true;return loan(entry,false);
  }catch(error){primary=error;throw error;}finally{try{await retireCompositeOwners([()=>native?.release(),()=>reader?.dispose(),...(!returned?leases.map(l=>()=>l()):[])],primary?{primary}:{});}finally{active=false;controller=null;finish();}}
 },async dispose(){if(closed)return;closed=true;controller?.abort();await finished;const old=cache;cache=null;await retireCompositeOwners([()=>unpin(old),()=>engine?.dispose()]);},snapshot(){return{active,closed,cacheEntries:cache?1:0};}};
}
