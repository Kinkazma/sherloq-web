import "../../runtime-context.js?v=0.25.0";
import {createOcrRetirementOwner,retireOcrLeases} from './ocr-owned-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createTesseractOcr} from './tesseract-ocr.js';
import {ocrParameters,ocrTextLines,immutableOcr} from './ocr-structure.js';
import {prepareSourceRegionOcr,analyzeSourceRegionOcr} from './source-region-ocr.js';
export const validateOcrParams=ocrParameters;

/** Conservative ownership bound for a structured-clone reply. No JSON string
 * or duplicate full transcript needs to be created to calculate admission. */
export function ocrPayloadBytes(value){
 const seen=new Set();let bytes=8192;
 const visit=item=>{if(typeof item==='string'){bytes+=item.length*4+64;return;}if(!item||typeof item!=='object'){bytes+=16;return;}if(seen.has(item))return;seen.add(item);bytes+=128;if(ArrayBuffer.isView(item)){bytes+=item.byteLength;return;}if(item instanceof ArrayBuffer){bytes+=item.byteLength;return;}for(const [key,child]of Object.entries(item)){bytes+=key.length*4+32;visit(child);}};
 visit(value);requireValue(Number.isSafeInteger(bytes),'OCR response exceeds safe memory accounting.');return bytes;
}

export function createOcrAnalyzer({budget,profile,configuration={},tesseractFactory=createTesseractOcr,ppocrFactory}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isSafeInteger(profile.maxWorkers)&&profile.maxWorkers>0,'OCR requires shared memory and CPU admission.');
 const engines=new Map(),sources=new WeakMap(),strictOwners=new Set(),transientOwners=new Set(),entries=new Set();let nextSource=1,cache=null,running=false,closed=false,activeTask,controller,calls=0,hits=0,disposal,maintenance;
 const own=release=>{let owner;owner=createOcrRetirementOwner(release,{onReleased:()=>transientOwners.delete(owner)});transientOwners.add(owner);return owner;};
 const retire=entry=>{if(!entry||--entry.refs)return;return entry.retirement.release();};
 const retireStrict=async owner=>{if(!owner)return;await owner.dispose();strictOwners.delete(owner);};
 const retirePending=()=>retireCompositeOwners([...strictOwners].map(owner=>()=>retireStrict(owner)).concat([...transientOwners].map(owner=>()=>owner.release()),[...entries].filter(entry=>entry.refs===0).map(entry=>()=>entry.retirement.release())));
 const dropCache=()=>{const old=cache;cache=null;if(old)old.refs--;};
 async function engine(algorithm){
  if(engines.has(algorithm))return engines.get(algorithm);
  const create=algorithm==='tesseract'?tesseractFactory:ppocrFactory??(await import('./ppocr-analyzer.js')).createPpocrAnalyzer;
  const value=await create({budget,profile,configuration:algorithm==='tesseract'?configuration:configuration.ppocr??configuration});engines.set(algorithm,value);return value;
 }
 function sourceInput(image){
  const d=image.surface?.descriptor??image,width=image.width??d.width,height=image.height??d.height;
  const source={...image,width,height,format:'rgb8'};
  if(!source.readWindow&&image.surface?.readWindow)source.readWindow=(rect,hooks)=>image.surface.readWindow(rect,hooks);
  return source;
 }
 function keyFor(image,p,backend){
  let identity=image.sha256;if(!/^[0-9a-f]{64}$/.test(identity??'')){if(!sources.has(image))sources.set(image,nextSource++);identity='source-object/'+sources.get(image);}
  return JSON.stringify([identity,image.width??image.surface?.descriptor.width,image.height??image.surface?.descriptor.height,p.algorithm,p.algorithm==='tesseract'?[p.language,p.psm]:[p.orientationCorrection,p.bitmapThreshold,p.boxThreshold,p.unclipRatio],backend,...(image.sourceRegionDomain?[image.sourceRegionDomain.fingerprint]:[])]);
 }
 function lease(entry,cacheHit){
  entry.refs++;let released=false;
  return {data:entry.data,metadata:entry.metadata,metrics:{...entry.metrics,cache:{analysis:cacheHit},inferenceExecuted:!cacheHit},release(){if(released)return entry.refs===0?entry.retirement.release():undefined;released=true;return retire(entry);}};
 }
 async function run(image,parameters,hooks){
  const p=ocrParameters(parameters),source=sourceInput(image),backend=hooks.backend??'auto';requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid OCR backend.');
  let strict,native,workspace,nativeOwner,workspaceOwner,committed=false,failed=false,primary;
  try{
   await retirePending();
   if(source.sourceRegionDomain){strict=await prepareSourceRegionOcr(source,{budget,signal:hooks.signal,onOwner:owner=>{strict=owner;strictOwners.add(owner);}});source.sourceRegionDomain=strict.view.domain.descriptor;source.sourceRegionOrigin=[...strict.view.domain.origin];source.sha256=strict.sha256;}
   const key=keyFor(strict?source:image,p,backend);checkAbort(hooks.signal);if(cache?.key===key){await retireStrict(strict);hits++;return lease(cache,true);}
   const api=await engine(p.algorithm);checkAbort(hooks.signal);
   calls++;native=strict?await analyzeSourceRegionOcr(strict,p,{...hooks,api,budget,payloadBytes:ocrPayloadBytes}):await api.analyze(source,p,hooks);const answer=native;nativeOwner=own(()=>answer.release?.());checkAbort(hooks.signal);
   const raw=native.regions??native.data?.regions;requireValue(Array.isArray(raw),'OCR analyzer returned no native regions.');
   // Admit the derived geometry/text view before making its owned containers.
   workspace=budget.reserve(ocrPayloadBytes({regions:raw,nativeText:native.nativeText,metadata:native.metadata})*2);workspaceOwner=own(workspace);
   const regions=raw.map((region,index)=>{
    const bounds=region.bounds;requireValue(typeof region.text==='string'&&Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]>bounds[0]&&bounds[3]>bounds[1]&&bounds[2]<=source.width&&bounds[3]<=source.height&&Number.isFinite(region.confidence)&&Number.isFinite(region.score)&&region.score>=0&&region.score<=1,'OCR returned invalid native text geometry or confidence.');
    return {...region,id:region.id??'ocr-region-'+index,bounds:[...bounds],...(region.polygon?{polygon:region.polygon.map(point=>[...point])}:{})};
   });
   const lines=ocrTextLines(regions),text=native.nativeText??lines.map(line=>line.text).join('\n');
   const data=immutableOcr({text,regions,lines,width:source.width,height:source.height});
   const metadata=immutableOcr({...native.metadata,algorithm:p.algorithm,recognition:true,sourceSha256:source.sha256??null,coordinateSpace:source.sourceRegionDomain?'source-region-native-pixels':'original-image-pixels',...(source.sourceRegionDomain?{sourceRegionFingerprint:source.sourceRegionDomain.fingerprint,sourceRegionOrigin:[...source.sourceRegionOrigin]}:{}),bounds:'exclusive-right-bottom',originalPixelsModified:false,thresholdPolicy:'presentation-only; all native regions and confidences retained',confidencePolicy:'native engine confidence, not calibrated across algorithms'});
   await retireStrict(strict);checkAbort(hooks.signal);const old=cache;cache=null;await retire(old);checkAbort(hooks.signal);
   const entry={key,data,metadata,metrics:native.metrics??{},refs:1};
   entry.retirement=createOcrRetirementOwner(()=>retireOcrLeases([()=>nativeOwner.release(),()=>workspaceOwner.release()]),{onReleased:()=>entries.delete(entry)});
   entries.add(entry);transientOwners.delete(nativeOwner);transientOwners.delete(workspaceOwner);cache=entry;committed=true;return lease(entry,false);
  }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([...(committed?[]:[()=>nativeOwner?.release(),()=>workspaceOwner?.release()]),()=>retireStrict(strict)],failed?{primary}:{});}
 }
 return {
  analyze(image,params={},hooks={}){
   requireValue(!closed&&!running&&!maintenance,'OCR analyzer is closed or already running.');running=true;controller=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal;
   const task=run(image,params,{...hooks,signal});activeTask=task;
   return task.finally(()=>{if(activeTask===task){running=false;controller=null;activeTask=null;}});
  },
  clearCache(){try{requireValue(!running&&!disposal,'OCR recognition is active.');}catch(error){return Promise.reject(error);}if(maintenance)return maintenance;const task=retireCompositeOwners([dropCache,retirePending,...[...engines.values()].map(api=>()=>api.clearCache?.())]);maintenance=task.finally(()=>{maintenance=undefined;});return maintenance;},
  dispose(){closed=true;controller?.abort();if(disposal)return disposal;const task=(async()=>{await activeTask?.catch(()=>{});await maintenance?.catch(()=>{});await retireCompositeOwners([dropCache,retirePending,...[...engines].map(([key,api])=>async()=>{await api.dispose?.();engines.delete(key);})]);})();disposal=task.finally(()=>{disposal=undefined;});return disposal;},
  snapshot(){return {closed,running,cacheEntries:cache?1:0,analyses:calls,cacheHits:hits,engines:[...engines.keys()]};}
 };
}
