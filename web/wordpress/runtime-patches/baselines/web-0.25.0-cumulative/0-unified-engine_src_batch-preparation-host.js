import {receiveNativeSourceChannel} from './native-source-channel.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {Budget} from './cache.js';
import {jpegCodec} from './jpeg.js';
import {loadM2SegmentedOriginal,disposeSegmentedImage} from './image-sources.js';
import {resolveComputeProfile} from './profiles.js';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {createForgeryscopeAnalyzer} from './forgeryscope-analyzer.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {ScientificTextDetector} from './scientific-text-detector.js';
import {detectScientificAnnotationBars} from './scientific-annotation-bars.js';

const MAX_WINDOW=4*1024**2;
/** One original decode and one shared native resource budget for both stages.
 * Only compact geometry/provenance crosses the worker boundary. Neither the
 * original surface nor neural output arrays remain pinned by the descriptor.
 */
export function createBatchPreparationHost({post,loadFactory=async url=>(await import(url)).default,sourceLoader=loadM2SegmentedOriginal,sourceDisposer=disposeSegmentedImage,codec=jpegCodec,analyzerFactory=createForgeryscopeAnalyzer,poolFactory=(...args)=>new NeuralGraphPool(...args),detectorFactory=options=>new ScientificTextDetector(options),annotationDetector=detectScientificAnnotationBars}={}){
 let config,budget,profile,panelAnalyzer,textPool,textDetector,next=1,codecBytes=0,closed=false,disposing;
 const pending=new Map(),results=new Map(),operations=new Set();
 const memory=()=>({...budget.snapshot(),residentCodecBytes:codecBytes});
 const send=(id,value,transfer=[])=>post({id,value},transfer);
 function alive(){if(closed)throw new EngineError('DISPOSED','Batch preparation worker disposed.');requireValue(budget,'Initialize batch preparation first.');}
 async function panels(){
  if(panelAnalyzer)return panelAnalyzer;
  requireValue(config.methods?.forgeryscope,'The panel detector is not configured.');
  const options={...config.methods.forgeryscope,budget,computeProfile:config.computeProfile,resourceHints:config.resourceHints};
  for(const key of ['preparation','sift'])if(options[key+'FactoryUrl']){options[key+'Factory']=await loadFactory(options[key+'FactoryUrl']);delete options[key+'FactoryUrl'];}
  panelAnalyzer=analyzerFactory(options);return panelAnalyzer;
 }
 function text(){
  if(textDetector)return textDetector;
  requireValue(config.text?.asset&&config.text?.runtimes,'The scientific text detector is not configured.');
  const pool=poolFactory(budget,profile,{assets:{scientific_text:config.text.asset},runtimes:config.text.runtimes,resourceOwner:'scientific-preparation-text'});
  try{textDetector=detectorFactory({budget,run:(feeds,options)=>pool.run('scientific_text',feeds,options)});textPool=pool;return textDetector;}
  catch(error){pool.dispose();throw error;}
 }
 function releaseResult(id){const result=results.get(id);if(!result)return;results.delete(id);result.release();}
 function chargeIdleCodec(){
  const bytes=codec.memoryBytes();requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid resident codec memory.');
  // The heap already exists, including on decode failure. Charge its measured
  // residency before admission checks, so a refusal cannot hide that heap.
  budget.retained+=bytes-codecBytes;codecBytes=bytes;budget.peak=Math.max(budget.peak,budget.total());budget.room(0);
 }
 async function analyze(id,args){
  const native=!!args.image;
  try{requireValue(args.method==='scientific-preparation'&&(native||args.blob instanceof Blob),'A scientific preparation native source or image Blob is required.');
   if(native)requireValue(args.params?.textOnly===true&&args.image.preparationContext==='envelope-not-scientific-membership','Native preparation windows currently support explicit text detection only.');
  }catch(error){if(native)args.image.port?.close?.();throw error;}
  requireValue(['auto','cpu','webgpu'].includes(args.backend??'auto'),'Invalid preparation backend.');
  requireValue(args.params?.detectText===undefined||typeof args.params.detectText==='boolean','detectText must be a boolean.');
  if(pending.size)throw new EngineError('BUSY','Batch preparation already has an active image.');
  const controller=new AbortController();pending.set(id,controller);const options={signal:controller.signal,backend:args.backend??'auto',onProgress:event=>post({id,progress:event})};
  let image,panelResult,metadataLease,metadata,width,height,failure;
  try{
   try{
    if(native){
     const input=args.image,domain=await compileOriginalSourceRegions(input.sourceRegionDomain);checkAbort(options.signal);
     requireValue(!domain.empty&&input.sha256===domain.sourceSha256&&input.width===domain.width&&input.height===domain.height&&JSON.stringify(input.origin)===JSON.stringify(domain.origin),'Native text preparation differs from its original-source domain.');
     const reader=receiveNativeSourceChannel(input,{budget,signal:options.signal});
     image={sha256:reader.sha256,nativeSourceDispose:reader.dispose,surface:{descriptor:{width:reader.width,height:reader.height,format:'rgb8'},readWindow:reader.readWindow},provenance:{source:'original-native-window-channel',originalSha256:domain.sourceSha256,sourceRegionDomain:domain.descriptor,origin:[...domain.origin],preparationContext:'envelope-not-scientific-membership',encodedSourceRewritten:false},metrics:{nativeWindowTransport:true,maximumTransportBytes:1024*1024}};
    }else{
     const signature=new Uint8Array(await args.blob.slice(0,2).arrayBuffer());
     if(signature[0]===255&&signature[1]===216){budget.retained-=codecBytes;codecBytes=0;}
     let decodeFailure;
     try{image=await sourceLoader(args.blob,{budget,signal:options.signal,onProgress:options.onProgress,name:args.params?.name});}catch(error){decodeFailure=error;}
     finally{try{chargeIdleCodec();}catch(error){if(decodeFailure)decodeFailure.details={...decodeFailure.details,codecAccounting:serializeEngineError(error)};else decodeFailure=error;}}
     if(decodeFailure)throw decodeFailure;
    }
    checkAbort(options.signal);({width,height}=image.surface.descriptor);
    requireValue([width,height].every(value=>Number.isSafeInteger(value)&&value>0),'Invalid decoded preparation dimensions.');
    requireValue(typeof image.sha256==='string'&&/^[a-f0-9]{64}$/.test(image.sha256),'Native original source identity is missing.');
    if(args.params?.textOnly!==true){const api=await panels();checkAbort(options.signal);panelResult=await api.analyze(image,{prepareOnly:true},options);checkAbort(options.signal);requireValue(panelResult.metadata?.preparation?.fullAnalysisExecuted===false,'Panel preparation returned a full analysis instead of classification.');}
    const source={format:'rgb8',width,height,sha256:image.sha256,readWindow:(rect,windowOptions)=>image.surface.readWindow(rect,windowOptions)};
    // A text-only request is an explicit OCR operation (including page rasters).
    // Disabling OCR on ordinary preparation does not disable panel classification
    // or instantiate an OCR pool/model merely to return an empty detection.
    const detectText=args.params?.textOnly===true||args.params?.detectText!==false;
    const textResult=detectText?await text().detect(source,options):{status:'complete',disabled:true,rawDetection:null,width,height,polygons:[],detections:[],warnings:[],metadata:{method:'text-detection-disabled',inferenceExecuted:false,originalPixelsModified:false,coordinateSpace:'original-image-pixels',sourceSha256:image.sha256,reason:'Text detection was explicitly disabled for this preparation.'}};checkAbort(options.signal);
    let annotations=null;
    if(panelResult){const regions=(panelResult.metadata.preparation.panels??[]).filter(p=>['Microscopy','Blots','Body Imaging'].includes(p.label??p.type)).flatMap(p=>{const b=p.rectangle??p.bounds;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite))return [];const r={x0:Math.max(0,b[0]),y0:Math.max(0,b[1]),x1:Math.min(width,b[2]),y1:Math.min(height,b[3])};return r.x1>r.x0&&r.y1>r.y0?[r]:[];});annotations=await annotationDetector({width,height,channels:3,regions,sourceSha256:image.sha256,signal:options.signal,readRows:(y,rows,hooks)=>image.surface.readWindow({x:0,y,width,height:rows},hooks)});checkAbort(options.signal);}
    const information={panels:panelResult?.metadata?.preparation??null,text:textResult,annotations,width,height,sourceSha256:image.sha256,provenance:{originalSourceSha256:image.sha256,decoder:image.provenance,sourceMetrics:image.metrics,panelDetection:panelResult?.provenance??null,coordinateSpace:'original-image-pixels',originalPixelsModified:false}};
    const json=JSON.stringify(information);metadataLease=budget.reserve(json.length*3);metadata=new TextEncoder().encode(json);checkAbort(options.signal);
   }catch(error){failure=error;}
   finally{
    for(const cleanup of [()=>panelResult?.release(),()=>image&&(image.nativeSourceDispose?image.nativeSourceDispose():sourceDisposer(image))])try{await cleanup();}catch(error){if(!failure)failure=error;else failure.details={...failure.details,cleanup:serializeEngineError(error)};}
   }
   if(failure)throw failure;checkAbort(options.signal);
   const resultId=next++;results.set(resultId,{metadata,release:metadataLease});metadataLease=null;
   try{send(id,{id:resultId,method:'scientific-preparation',width,height,fields:{},metadataBytes:metadata.byteLength,memory:memory()});}
   catch(error){releaseResult(resultId);throw error;}
  }finally{metadataLease?.();if(native)args.image.port?.close?.();pending.delete(id);}
 }
 async function dispose(){
  closed=true;for(const controller of pending.values())controller.abort();await Promise.all([...operations]);let failure;
  for(const cleanup of [()=>panelAnalyzer?.dispose(),()=>textPool?.dispose(),()=>{for(const id of [...results.keys()])releaseResult(id);}])try{await cleanup();}catch(error){failure??=error;}
  if(failure)throw failure;return memory();
 }
 async function handle(message){
  const {id,operation,args={}}=message;let finish,temporary;
  const completed=operation==='dispose'?null:new Promise(resolve=>finish=resolve);if(completed)operations.add(completed);
  try{
   if(operation==='initialize'){
    requireValue(!config&&!closed,'Batch preparation already initialized.');const value=structuredClone(args);value.computeProfile??='maximum';
    const selected=resolveComputeProfile(value.computeProfile,value.resourceHints),limit=value.memoryBudgetBytes??4*1024**3;requireValue(Number.isSafeInteger(limit)&&limit>0,'Invalid preparation memory budget.');
    config=value;profile=selected;budget=new Budget(limit);chargeIdleCodec();send(id,{profile,memory:memory(),windowBytes:MAX_WINDOW});return;
   }
   if(operation==='dispose'){requireValue(budget,'Initialize batch preparation first.');disposing??=dispose();send(id,await disposing);return;}
   alive();
   if(operation==='analyzeBlob'||operation==='analyzeNativeSource')await analyze(id,args);
   else if(operation==='cancel'){pending.get(args.requestId)?.abort();send(id,true);}
   else if(operation==='readMetadata'){
    const value=results.get(args.resultId);requireValue(value,'Released or unknown preparation result.');const {offset,count}=args;requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(count)&&offset>=0&&count>0&&offset+count<=value.metadata.length&&count<=MAX_WINDOW,'Preparation metadata window exceeds bounds or 4 MiB.');
    temporary=budget.reserve(count);const copy=value.metadata.slice(offset,offset+count);send(id,copy,[copy.buffer]);
   }else if(operation==='releaseResult'){releaseResult(args.resultId);send(id,true);}
   else if(operation==='memory')send(id,memory());
   else throw new EngineError('INVALID_ARGUMENT','Unknown batch preparation operation.');
  }catch(error){post({id,error:serializeEngineError(error,'BATCH_PREPARATION_WORKER')});}
  finally{temporary?.();if(completed){operations.delete(completed);finish();}}
 }
 return {handle};
}
