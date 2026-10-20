import {EngineError,requireValue,checkAbort} from './errors.js';
import {createTesseractOcr} from './tesseract-ocr.js';
import {ocrParameters,ocrTextLines,immutableOcr} from './ocr-structure.js';
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
 const engines=new Map(),sources=new WeakMap();let nextSource=1,cache=null,running=false,closed=false,activeTask,controller,calls=0,hits=0;
 const retire=entry=>{if(!entry||--entry.refs)return;entry.native.release?.();entry.workspace();};
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
  return {data:entry.data,metadata:entry.metadata,metrics:{...entry.metrics,cache:{analysis:cacheHit},inferenceExecuted:!cacheHit},release(){if(released)return;released=true;retire(entry);}};
 }
 async function run(image,parameters,hooks){
  const p=ocrParameters(parameters),source=sourceInput(image),backend=hooks.backend??'auto';requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid OCR backend.');
  const key=keyFor(image,p,backend);checkAbort(hooks.signal);if(cache?.key===key){hits++;return lease(cache,true);}
  const api=await engine(p.algorithm);checkAbort(hooks.signal);let native,workspace,committed=false;
  try{
   calls++;native=await api.analyze(source,p,hooks);checkAbort(hooks.signal);
   const raw=native.regions??native.data?.regions;requireValue(Array.isArray(raw),'OCR analyzer returned no native regions.');
   // Admit the derived geometry/text view before making its owned containers.
   workspace=budget.reserve(ocrPayloadBytes({regions:raw,nativeText:native.nativeText,metadata:native.metadata})*2);
   const regions=raw.map((region,index)=>{
    const bounds=region.bounds;requireValue(typeof region.text==='string'&&Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]>bounds[0]&&bounds[3]>bounds[1]&&bounds[2]<=source.width&&bounds[3]<=source.height&&Number.isFinite(region.confidence)&&Number.isFinite(region.score)&&region.score>=0&&region.score<=1,'OCR returned invalid native text geometry or confidence.');
    return {...region,id:region.id??'ocr-region-'+index,bounds:[...bounds],...(region.polygon?{polygon:region.polygon.map(point=>[...point])}:{})};
   });
   const lines=ocrTextLines(regions),text=native.nativeText??lines.map(line=>line.text).join('\n');
   const data=immutableOcr({text,regions,lines,width:source.width,height:source.height});
   const metadata=immutableOcr({...native.metadata,algorithm:p.algorithm,recognition:true,sourceSha256:image.sha256??null,coordinateSpace:image.sourceRegionDomain?'source-region-native-pixels':'original-image-pixels',...(image.sourceRegionDomain?{sourceRegionFingerprint:image.sourceRegionDomain.fingerprint,sourceRegionOrigin:[...image.sourceRegionOrigin]}:{}),bounds:'exclusive-right-bottom',originalPixelsModified:false,thresholdPolicy:'presentation-only; all native regions and confidences retained',confidencePolicy:'native engine confidence, not calibrated across algorithms'});
   const entry={key,native,workspace,data,metadata,metrics:native.metrics??{},refs:1},old=cache;cache=entry;native=null;workspace=null;committed=true;retire(old);return lease(entry,false);
  }finally{if(!committed){native?.release?.();workspace?.();}}
 }
 return {
  analyze(image,params={},hooks={}){
   requireValue(!closed&&!running,'OCR analyzer is closed or already running.');running=true;controller=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,controller.signal]):controller.signal;
   const task=run(image,params,{...hooks,signal});activeTask=task;
   return task.finally(()=>{if(activeTask===task){running=false;controller=null;activeTask=null;}});
  },
  async clearCache(){requireValue(!running,'OCR recognition is active.');const old=cache;cache=null;retire(old);for(const api of engines.values())await api.clearCache?.();},
  async dispose(){if(closed)return;closed=true;controller?.abort();await activeTask?.catch(()=>{});const old=cache;cache=null;retire(old);await Promise.all([...engines.values()].map(api=>api.dispose?.()));engines.clear();},
  snapshot(){return {closed,running,cacheEntries:cache?1:0,analyses:calls,cacheHits:hits,engines:[...engines.keys()]};}
 };
}
