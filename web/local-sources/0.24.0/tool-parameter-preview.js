/** Bounded, explicitly provisional pixel calculations in a separate worker.
 * This module never receives a native source blob, model or native result ID.
 */
import {createAdaptivePreview,ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './adaptive-preview.js?v=0.24.0';
const MiB=1024**2,DEFAULT_SIDE=192,WORKER_BYTES=192*MiB;
const OPERATIONS=new Set(['inspection.adjust','inspection.magnifier','detail.gradient','detail.echo','colors.space','colors.pca','detail.wavelets','detail.frequency','noise.separation','noise.planes','noise.minmax','pixels.defects','noise.blocking','colors.stats','tampering.contrast','various.illuminant','comparison.image','jpeg.ghosts','noise.noisesniffer']);
const approximations=new Set(['colors.pca','detail.wavelets','detail.frequency','noise.blocking','inspection.magnifier','comparison.image','jpeg.ghosts','noise.noisesniffer']);
// Contiguous-kernel admission units: input is RGB, so scratchFactor multiplies
// three bytes per pixel. Native admission remains the final authority.
const ADMISSION=Object.freeze({'noise.noisesniffer':[320,48*MiB],'colors.pca':[96,32*MiB],'noise.minmax':[36,0],'colors.stats':[9,0],'noise.planes':[15,0],'pixels.defects':[180,0],'tampering.contrast':[48,32*MiB],'various.illuminant':[30,0],'inspection.magnifier':[15,0],'noise.blocking':[192,64*MiB],'comparison.image':[96,0],'jpeg.ghosts':[54,32*MiB]});
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Parameter preview cancelled.');};
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=bytes=>{let c=0xffffffff;for(const v of bytes)c=crcTable[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const be=(bytes,at,value)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(at,value,false);
/** A genuine lossless RGB PNG gives the isolated derived source its own bytes
 * and SHA. No canvas colour conversion, invented original-byte identity or JPEG.
 */
export function encodeParameterPreviewPng(pixels){
 const {width,height,data}=pixels??{};
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>ADAPTIVE_PREVIEW_MAX_SIDE||height>ADAPTIVE_PREVIEW_MAX_SIDE||width*height>ADAPTIVE_PREVIEW_MAX_PIXELS||pixels.format!=='rgb8'||!(data instanceof Uint8Array)||data.length!==width*height*3)fail('INVALID_INPUT','Preview PNG requires bounded RGB8 pixels.');
 const stride=width*3+1,raw=new Uint8Array(stride*height);for(let y=0;y<height;y++)raw.set(data.subarray(y*width*3,(y+1)*width*3),y*stride+1);
 const blocks=Math.ceil(raw.length/65535),z=new Uint8Array(2+raw.length+blocks*5+4);z.set([0x78,0x01]);let at=2,a=1,b=0;
 for(let start=0;start<raw.length;start+=65535){const count=Math.min(65535,raw.length-start);z[at++]=start+count===raw.length?1:0;z[at++]=count&255;z[at++]=count>>>8;z[at++]=(~count)&255;z[at++]=((~count)>>>8)&255;z.set(raw.subarray(start,start+count),at);at+=count;}
 for(const value of raw){a=(a+value)%65521;b=(b+a)%65521;}be(z,at,((b<<16)|a)>>>0);
 const header=new Uint8Array(13);be(header,0,width);be(header,4,height);header[8]=8;header[9]=2;
 const chunks=[['IHDR',header],['IDAT',z],['IEND',new Uint8Array()]],out=new Uint8Array(8+chunks.reduce((n,[,v])=>n+12+v.length,0));out.set([137,80,78,71,13,10,26,10]);at=8;
 for(const [name,value]of chunks){be(out,at,value.length);for(let i=0;i<4;i++)out[at+4+i]=name.charCodeAt(i);out.set(value,at+8);be(out,at+8+value.length,crc(out.subarray(at+4,at+8+value.length)));at+=12+value.length;}
 return out;
}
function frame(value,side){const p=value?.pixels??value;if(!Number.isSafeInteger(p?.width)||!Number.isSafeInteger(p?.height)||p.width<1||p.height<1||p.width>side||p.height>side||p.format!=='rgb8'||!(p.data instanceof Uint8Array)||p.data.length!==p.width*p.height*3)fail('INVALID_INPUT','The source reader must return bounded sampled RGB8 pixels.');return p;}
function resultResources(result){const found=new Map(),seen=new Set();const visit=value=>{if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||seen.has(value))return;seen.add(value);if(typeof value.id==='string'&&Number.isSafeInteger(value.revision)&&typeof value.format==='string')found.set(value.id,{...value,table:Number.isSafeInteger(value.rowCount)});for(const v of Object.values(value))visit(v);};visit(result);return[...found.values()];}
function sourceKey(identity,w,h,side){if(identity===undefined||identity===null||identity==='')fail('INVALID_INPUT','A preview requires the current native source identity.');return JSON.stringify([identity,w,h,side]);}
const defaultFactory=async options=>(await import('./unified-engine/src/worker-client.js')).createWorkerEngine(options);

const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const cellSizes=[32,64,128,256];
const biorLengths={'1.1':2,'1.3':6,'1.5':10,'2.2':6,'2.4':10,'2.6':14,'2.8':18,'3.1':4,'3.3':8,'3.5':12,'3.7':16,'3.9':20,'4.4':10,'5.5':12,'6.8':18};
function waveletLength(name){const match=/^(db|sym|coif|bior)([\d.]+)$/.exec(name);if(!match)return null;const [,family,order]=match,n=Number(order);return family==='bior'?biorLengths[order]??null:family==='coif'&&Number.isInteger(n)&&n>=1&&n<=5?6*n:(family==='db'&&n>=1&&n<=20||family==='sym'&&n>=2&&n<=20)&&Number.isInteger(n)?2*n:null;}
const waveletMaximum=(width,height,length)=>Math.max(0,Math.floor(Math.log2(Math.min(width,height)/(length-1))));
/** Spatial units belong to the sampled grid only. Intensity, percentage and
 * mode controls retain their values; the native request is never mutated.
 */
export function projectParameterPreviewParams(operation,input,{width,height,logicalWidth,logicalHeight}){
 if(![width,height,logicalWidth,logicalHeight].every(v=>Number.isSafeInteger(v)&&v>0))fail('INVALID_INPUT','Preview projection requires positive integer geometry.');
 const params=structuredClone(input??{}),scaleX=Math.min(1,width/logicalWidth),scaleY=Math.min(1,height/logicalHeight),scale=Math.min(scaleX,scaleY),adjustments=[],limitations=[];
 const set=(field,value,requested,reason)=>{if(value!==requested){params[field]=value;adjustments.push({field,requested,preview:value,reason});}};
 const integer=(field,fallback,low,high,project)=>{const value=Object.hasOwn(params,field)?params[field]:fallback;if(!Number.isInteger(value)||value<low||value>high)return;set(field,project(value),value,'Spatial support projected onto the provisional sampled grid.');};
 const radius=(field,fallback,low,high)=>integer(field,fallback,low,high,value=>clamp(Math.round(value*scale),low,high));
 if(operation==='inspection.adjust')integer('sharpen',0,0,100,value=>{const support=Math.floor(value/4),projected=support?Math.max(1,Math.round(support*scale)):0;return projected===support?value:projected*4;});
 if(operation==='detail.echo')radius('radius',2,1,15);
 if(operation==='noise.separation'&&(params.mode??0)!==4)radius('radius',1,1,10);
 if(operation==='noise.minmax')integer('filter',0,0,5,value=>value?clamp(Math.round((value+3)*scale)-3,1,5):0);
 if(operation==='pixels.defects')radius('radius',1,1,2);
 if(operation==='noise.noisesniffer')radius('cellSize',100,1,10000);
 if(operation==='detail.frequency')integer('filter',0,0,15,value=>value?clamp(Math.round(value*scale),1,15):0);
 if(operation==='noise.blocking')integer('block',8,1,100,value=>{
  const nativeMaximum=Math.min(Math.floor((logicalWidth+15)/2),Math.floor((logicalHeight+15)/2));
  if(value>nativeMaximum)fail('INVALID_INPUT','Block size exceeds native detail dimensions.');
  const maximum=Math.min(100,Math.floor((width+15)/2),Math.floor((height+15)/2));
  return clamp(Math.round(value*scale),1,maximum);
 });
 if(operation==='tampering.contrast'||operation==='various.illuminant'){
  const value=Object.hasOwn(params,'block')?params.block:operation==='tampering.contrast'?32:128;
  if(cellSizes.includes(value)){
   const target=value*scale,projected=cellSizes.reduce((best,candidate)=>Math.abs(candidate-target)<Math.abs(best-target)?candidate:best,cellSizes[0]);
   set('block',projected,value,'Spatial cell projected onto the closest supported block size.');
   if(target<32)limitations.push('The supported minimum block size is larger than the proportionally sampled cell.');
  }
 }
 if(operation==='detail.wavelets'){
  const length=waveletLength(Object.hasOwn(params,'wavelet')?params.wavelet:'db1'),level=Object.hasOwn(params,'level')?params.level:null;
  if(length&&(level===null||Number.isSafeInteger(level)&&level>=0&&level<=30)){
   const nativeMaximum=waveletMaximum(logicalWidth,logicalHeight,length),maximum=waveletMaximum(width,height,length),nativeLevel=level===null?(nativeMaximum?Math.max(1,Math.floor(nativeMaximum/2)):0):Math.min(level,nativeMaximum);
   const projected=nativeLevel?clamp(Math.round(nativeLevel+Math.log2(scale)),Math.min(1,maximum),maximum):0;
   if(scale<1||level!==null&&level>maximum)set('level',projected,level,'Dyadic support projected onto the sampled grid and bounded by the selected filter length.');
   if(maximum===0)limitations.push('This sampled grid is too small for a nonzero decomposition level with the selected wavelet.');
  }
 }
 return{params,projection:{schema:'parameter-preview-spatial-projection/1',scaleX,scaleY,scale,adjustments,limitations}};
}

export function createParameterPreview({readSource,readReference,reserve,release,engineFactory=defaultFactory,onMetrics=()=>{},side=ADAPTIVE_PREVIEW_MAX_SIDE,memoryBudgetBytes=WORKER_BYTES,adaptive=createAdaptivePreview(),maximumSourceGrids=3}={}){
 if(typeof readSource!=='function'||typeof engineFactory!=='function'||!Number.isSafeInteger(side)||side<16||side>ADAPTIVE_PREVIEW_MAX_SIDE||!Number.isSafeInteger(memoryBudgetBytes)||memoryBudgetBytes<64*MiB||!Number.isSafeInteger(maximumSourceGrids)||maximumSourceGrids<1||maximumSourceGrids>4)fail('INVALID_INPUT','A bounded source reader and preview worker factory are required.');
 const maximumPixels=Math.min(ADAPTIVE_PREVIEW_MAX_PIXELS,Math.max(256,Math.floor((memoryBudgetBytes-48*MiB)/160))),workingBytes=memoryBudgetBytes+maximumPixels*(maximumSourceGrids*3+12);
 let engine,lease,source,sourceGroup,reference,active,controller,disposed=false,resetting=false,generation=0,serial=0,retiring;
 const sourceGrids=new Map();
 const totals={previews:0,sourceReads:0,referenceReads:0,sourceLoads:0,referenceLoads:0,workerStarts:0,workerDisposals:0,computations:0,maximumInputPixels:0,maximumOutputPixels:0,cancellations:0};
 async function releaseLease(value){if(value===undefined||value===null)return;if(typeof release==='function')await release(value);else if(typeof value==='function')await value();else if(typeof value.release==='function')await value.release();else fail('INVALID_INPUT','Preview reservation has no release callback.');}
 async function retire(){if(retiring)return retiring;const old=engine,held=lease;engine=lease=source=sourceGroup=reference=null;sourceGrids.clear();retiring=(async()=>{let error;try{if(old){await old.dispose();totals.workerDisposals++;}}catch(e){error=e;}try{await releaseLease(held);}catch(e){error??=e;}if(error)throw error;})().finally(()=>{retiring=null;});return retiring;}
 async function ensureWorker(signal){if(engine)return engine;check(signal);lease=await reserve?.({bytes:workingBytes,label:'bounded-parameter-preview-worker'});try{check(signal);engine=await engineFactory({computeProfile:'maximum',memoryBudgetBytes});totals.workerStarts++;check(signal);return engine;}catch(error){await retire();throw error;}}
 async function loadPixels(pixels,name,identity,signal){check(signal);const bytes=encodeParameterPreviewPng(pixels),id='parameter-preview-'+name+'-'+generation+'-'+(++serial),answer=await engine.load({id,bytes,pixels,provenance:{decoder:'bounded-parameter-preview',derived:true,exact:false,parentSourceIdentity:identity,encoding:'lossless-rgb-png',sampling:'native-source-samples'}},{signal});check(signal);return{id,surface:answer.surface,width:pixels.width,height:pixels.height};}
 async function sourceFor(request,signal,gridSide){
  const group=sourceKey(request.sourceIdentity,request.logicalWidth,request.logicalHeight,0),key=sourceKey(request.sourceIdentity,request.logicalWidth,request.logicalHeight,gridSide);
  if(sourceGroup!==undefined&&sourceGroup!==null&&sourceGroup!==group)await retire();
  if(sourceGrids.has(key)){source=sourceGrids.get(key);sourceGrids.delete(key);sourceGrids.set(key,source);return source;}
  check(signal);const answer=await readSource({sourceIdentity:request.sourceIdentity,logicalWidth:request.logicalWidth,logicalHeight:request.logicalHeight,side:gridSide,maxSide:gridSide,signal});check(signal);totals.sourceReads++;const pixels=frame(answer,gridSide);
  if(answer.sourceIdentity!==undefined&&JSON.stringify(answer.sourceIdentity)!==JSON.stringify(request.sourceIdentity))fail('CANCELLED','Native source changed during preview sampling.');
  if(answer.logicalWidth!==undefined&&(answer.logicalWidth!==request.logicalWidth||answer.logicalHeight!==request.logicalHeight))fail('CANCELLED','Native source geometry changed during preview sampling.');
  await ensureWorker(signal);while(sourceGrids.size>=maximumSourceGrids){const [oldKey,old]=sourceGrids.entries().next().value;await engine.unload(old.id);sourceGrids.delete(oldKey);}const loaded=await loadPixels(pixels,'source',request.sourceIdentity,signal);totals.sourceLoads++;totals.maximumInputPixels=Math.max(totals.maximumInputPixels,pixels.width*pixels.height);source={...loaded,key,gridSide};sourceGroup=group;sourceGrids.set(key,source);return source;
 }
 async function referenceFor(request,first,signal){
  if(typeof readReference!=='function')fail('PREVIEW_UNAVAILABLE','Comparison preview requires its native reference image.');
  const answer=await readReference({sourceIdentity:request.sourceIdentity,logicalWidth:request.logicalWidth,logicalHeight:request.logicalHeight,side:first.gridSide,maxSide:first.gridSide,signal});check(signal);totals.referenceReads++;const pixels=frame(answer,first.gridSide);
  if(pixels.width!==first.width||pixels.height!==first.height||answer.logicalWidth!==undefined&&(answer.logicalWidth!==request.logicalWidth||answer.logicalHeight!==request.logicalHeight))fail('INVALID_INPUT','Evidence and reference preview geometry differ.');
  // A reference reader without identity is valid, but cannot justify cache reuse.
  const key=answer.sourceIdentity===undefined?null:JSON.stringify([answer.sourceIdentity,pixels.width,pixels.height]);if(key&&reference?.key===key)return reference;
  if(reference){await engine.unload(reference.id);reference=null;}const loaded=await loadPixels(pixels,'reference',answer.sourceIdentity??'uncached-reference',signal);reference={...loaded,key};totals.referenceLoads++;return reference;
 }
 async function calculate(request,signal,epoch){
  if(!OPERATIONS.has(request?.operation))fail('PREVIEW_UNAVAILABLE','This operation has no generic pixel-proxy contract.');
  const {operation,logicalWidth,logicalHeight}=request;if(!Number.isSafeInteger(logicalWidth)||!Number.isSafeInteger(logicalHeight)||logicalWidth<1||logicalHeight<1)fail('INVALID_INPUT','Native logical dimensions are required.');
  const [scratchBytes,extraBytes]=ADMISSION[operation]??[192,32*MiB];let memory=engine?.capabilities?(await engine.capabilities()).memory:null;check(signal);
  let room=memoryBudgetBytes-Math.max(32*MiB,memory?.knownHeapCapacityBytes??0)-extraBytes-(memory?.retainedBytes??0)-(memory?.activeReservationBytes??0)-2*MiB;
  if(room<scratchBytes+6&&engine){await retire();memory=null;room=memoryBudgetBytes-32*MiB-extraBytes-2*MiB;}
  if(room<scratchBytes+6)fail('MEMORY_LIMIT','No admitted parameter-preview kernel workspace.');
  const admittedPixels=Math.min(maximumPixels,Math.floor(room/(scratchBytes+6))),requestedParams=structuredClone(request.params??{}),costFields=['mode','wavelet','radius','block','filter','sharpen','blockSize','samplesPerBin'],cost=operation==='jpeg.ghosts'?'qualities='+Math.floor(Math.log2(1+Math.max(0,(requestedParams.high??90)-(requestedParams.low??50))/(requestedParams.step??5))):costFields.filter(key=>Object.hasOwn(requestedParams,key)).map(key=>{const v=requestedParams[key],bucket=typeof v==='number'&&!['mode'].includes(key)?v>0?Math.floor(Math.log2(v))+1:0:v;return key+'='+bucket;}).join('/'),minimumSide=operation==='jpeg.ghosts'?Math.ceil(16*Math.max(logicalWidth,logicalHeight)/Math.min(logicalWidth,logicalHeight)):16;
  if(operation==='jpeg.ghosts'&&(Math.min(logicalWidth,logicalHeight)<16||minimumSide>side))fail('PREVIEW_UNAVAILABLE','A JPEG Ghost draft requires complete16px cells on its bounded sampled source.');
  const plan=adaptive?adaptive.plan({key:'pixels/'+operation+'/'+cost,width:logicalWidth,height:logicalHeight,maxSide:side,minSide:minimumSide,maxPixels:admittedPixels,feedback:request.adaptiveFeedback}):null;
  check(signal);const started=performance.now(),cold=!engine||sourceGroup!=null&&sourceGroup!==sourceKey(request.sourceIdentity,logicalWidth,logicalHeight,0),first=await sourceFor(request,signal,plan?.side??Math.min(DEFAULT_SIDE,side)),setupMilliseconds=cold?performance.now()-started:0,{params,projection}=projectParameterPreviewParams(operation,requestedParams,{width:first.width,height:first.height,logicalWidth,logicalHeight}),task={id:'parameter-preview-task-'+(++serial),imageId:first.id,operation,params,backend:'cpu'};let result,failure;
  if(operation==='comparison.image'){const second=await referenceFor(request,first,signal);params.referenceImageId=second.id;params.metrics=false;}
  if(operation==='inspection.magnifier')params.bounds=null;
  try{
   check(signal);result=await engine.run(task,{signal});totals.computations++;check(signal);if(epoch!==generation)fail('CANCELLED','Preview source was reset.');
   let pixels=result.pixels,logicalOutputWidth=logicalWidth,logicalOutputHeight=logicalHeight,ghostView;const view=typeof request.view==='string'?request.view:request.view?.id??request.view?.mode;let selected=result.rgbSurfaces?.[view]??result.surface;
   if(operation==='jpeg.ghosts'){
    const d=result.data,layer=request.view?.layerId??request.view?.id??view,wanted=request.view?.quality??(/^quality-(\d+)$/.exec(layer??'')?.[1]),original=layer==='original'&&params.includeOriginal;
    if(original){pixels=d?.original;selected=d?.originalSurface??selected;}
    else{const qualities=Array.from(d?.qualities??[]);if(!qualities.length)fail('PREVIEW_UNAVAILABLE','The provisional JPEG quality grid is empty.');const index=Number.isFinite(Number(wanted))?qualities.reduce((best,q,i)=>Math.abs(q-Number(wanted))<Math.abs(qualities[best]-Number(wanted))?i:best,0):Math.min(qualities.length-1,Math.max(0,request.view?.index??0));pixels=d.views?.[index]?.pixels;logicalOutputWidth=Math.floor(logicalWidth/16);logicalOutputHeight=Math.floor(logicalHeight/16);ghostView={quality:qualities[index],index,qualities,coordinates:'sampled-16px-block-grid',sampledLattice:true,nativeJpegEvidence:false,phase:[params.x??0,params.y??0]};}
   }
   if(!pixels){if(!selected)fail('PREVIEW_UNAVAILABLE','The proxy calculation produced no RGB image.');if(selected.width>side||selected.height>side||selected.width*selected.height>admittedPixels)fail('INVALID_INPUT','The proxy kernel exceeded bounded display dimensions.');pixels=(await engine.readDisplay({surfaceId:selected.id,revision:selected.revision,tile:{x:0,y:0,w:selected.width,h:selected.height,step:1}},{signal})).pixels;}
   check(signal);pixels=frame(pixels,side);if(pixels.width*pixels.height>admittedPixels)fail('INVALID_INPUT','The proxy kernel exceeded the admitted pixel count.');if(epoch!==generation)fail('CANCELLED','Preview source changed before display.');totals.previews++;totals.maximumOutputPixels=Math.max(totals.maximumOutputPixels,pixels.width*pixels.height);
   const milliseconds=performance.now()-started,cached=result.metrics?.cache?.result===true&&!Object.hasOwn(result.metrics.cache,'view'),adaptiveMetrics=plan?{token:plan.token,milliseconds,setupMilliseconds,cold,cached,pixels:first.width*first.height,feedback:adaptive.observe(plan,{milliseconds,setupMilliseconds,cold,cached,pixels:first.width*first.height})}:null;
   const metrics={schema:'parameter-pixel-proxy/1',operation,field:request.field??null,sourceIdentity:request.sourceIdentity,derivedSourceId:first.id,inputDimensions:[first.width,first.height],outputDimensions:[pixels.width,pixels.height],maximumSide:first.gridSide,admittedPixels,requestedParams,previewParams:structuredClone(params),spatialProjection:projection,adaptivePreview:adaptiveMetrics,...(ghostView?{ghostView}:{}),exact:false,scientificFinalChanged:false,analysisApproximation:approximations.has(operation)?'Global basis/statistics recalculated only on the provisional sampled image.':'Native pixel kernel applied to provisional sampled pixels.',metricsCalculated:false,milliseconds,...totals};try{onMetrics(metrics);}catch{}
   return{pixels:{...pixels,logicalWidth:logicalOutputWidth,logicalHeight:logicalOutputHeight},exact:false,metrics};
  }catch(error){failure=error;throw error;}
  finally{if(result&&engine){const resources=resultResources(result).filter(v=>v.id!==first.surface?.id&&v.id!==reference?.surface?.id);let cleanup;for(const value of resources)try{await engine[value.table?'releaseTable':'releaseSurface'](value.id);}catch(error){cleanup??=error;}if(cleanup){if(failure)failure.previewCleanupError={code:cleanup.code,message:cleanup.message};else throw cleanup;}}}
 }
 async function reset(){generation++;controller?.abort();resetting=true;try{await active?.catch(()=>{});await retire();}finally{resetting=false;}}
 return{
  preview(request){if(disposed)return Promise.reject(Object.assign(Error('Parameter preview disposed.'),{code:'DISPOSED'}));if(active||resetting)return Promise.reject(Object.assign(Error('Only one parameter preview may run at a time.'),{code:'BUSY'}));const epoch=generation;controller=new AbortController();const own=controller,abort=()=>own.abort(),signal=request?.signal;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)own.abort();const task=calculate(request,own.signal,epoch);active=task;return task.catch(async error=>{if(error.code==='CANCELLED')totals.cancellations++;try{await retire();}catch(cleanup){error.previewCleanupError={code:cleanup.code,message:cleanup.message};}throw error;}).finally(()=>{signal?.removeEventListener('abort',abort);if(active===task)active=null;if(controller===own)controller=null;});},
  reset,
  async dispose(){if(disposed)return;disposed=true;await reset();},
  get state(){return{disposed,busy:!!active,resetting,workerResident:!!engine,sourceCached:!!source,cachedSourceGrids:sourceGrids.size,referenceCached:!!reference,reservationActive:lease!==undefined&&lease!==null,generation,metrics:{...totals}};}
 };
}
