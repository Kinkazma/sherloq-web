import {createFrequencyPreviewSizing,FREQUENCY_SIZING_BYTES,frequencyPreviewDiagnostics} from './frequency-preview-sizing.js';
import {parameterRegionDerivedDomain,frameParameterRegionPixels} from './parameter-preview-source-regions.js';
/** Bounded, explicitly provisional pixel calculations in a separate worker.
 * This module never receives a native source blob, model or native result ID.
 */
import {createAdaptivePreview,ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './adaptive-preview.js';
const MiB=1024**2,DEFAULT_SIDE=192,WORKER_BYTES=192*MiB;
const OPERATIONS=new Set(['inspection.adjust','inspection.magnifier','detail.gradient','detail.echo','colors.space','colors.pca','detail.wavelets','detail.frequency','noise.separation','noise.planes','noise.minmax','pixels.defects','noise.blocking','colors.stats','tampering.contrast','various.illuminant','comparison.image','jpeg.ghosts','noise.noisesniffer']);
export const supportsScopedParameterPreview=operation=>OPERATIONS.has(operation)&&!['comparison.image','jpeg.ghosts'].includes(operation);
const approximations=new Set(['colors.pca','detail.wavelets','detail.frequency','noise.blocking','inspection.magnifier','comparison.image','jpeg.ghosts','noise.noisesniffer']);
// Contiguous-kernel admission units: input is RGB, so scratchFactor multiplies
// three bytes per pixel. Native admission remains the final authority.
const ADMISSION=Object.freeze({'noise.noisesniffer':[320,48*MiB],'colors.pca':[96,32*MiB],'noise.minmax':[36,0],'colors.stats':[9,0],'noise.planes':[15,0],'pixels.defects':[180,0],'tampering.contrast':[48,32*MiB],'various.illuminant':[30,0],'inspection.magnifier':[15,0],'noise.blocking':[192,64*MiB],'comparison.image':[96,0],'jpeg.ghosts':[54,32*MiB]});
// Fixed native arithmetic capacities exported by gradient/echo/separation/adjust/contrast-math.js.
const SCOPED_HEAPS=Object.freeze({'detail.gradient':['gradient',64*MiB],'detail.echo':['echo',64*MiB],'noise.separation':['separation',64*MiB],'inspection.adjust':['adjust',64*MiB],'tampering.contrast':['contrast',64*MiB]});
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const check=signal=>{if(signal?.aborted)fail('CANCELLED','Parameter preview cancelled.');};
const acknowledgePreviewRetirement=async task=>{const answer=await task;if(answer===0||answer===false)throw answer;return answer;};
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

// OpenCV's padded DFT axes are the smallest dimensions with factors2,3,5.
// This describes presentation geometry only; transform values remain in the engine.
function frequencyDimension(n){let best=2147483647;for(let a=1;a<best;a*=2)for(let b=a;b<best;b*=3){let c=b;while(c<n)c*=5;if(c<best)best=c;}if(best===2147483647)fail('INVALID_INPUT','Frequency preview geometry exceeds native DFT dimensions.');return best;}
function frequencyViewName(view){const value=(typeof view==='string'?view:view?.id??view?.mode)??'low';if(typeof value!=='string')fail('PREVIEW_UNAVAILABLE','Frequency draft layer must be named explicitly.');const name=value.split('.').at(-1);if(!['low','high','magnitude','phase'].includes(name))fail('PREVIEW_UNAVAILABLE','The selected frequency layer is not a raster draft.');return name;}
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
  const value=Object.hasOwn(params,'block')?params.block:operation==='tampering.contrast'?64:128;
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

export function createParameterPreview({readSource,readReference,reserve,release,updateReservation,engineFactory=defaultFactory,onMetrics=()=>{},side=ADAPTIVE_PREVIEW_MAX_SIDE,memoryBudgetBytes=WORKER_BYTES,adaptive:providedAdaptive,maximumSourceGrids=3,sourceRegions=false}={}){
 if(typeof readSource!=='function'||typeof engineFactory!=='function'||!Number.isSafeInteger(side)||side<16||side>ADAPTIVE_PREVIEW_MAX_SIDE||!Number.isSafeInteger(memoryBudgetBytes)||memoryBudgetBytes<64*MiB||!Number.isSafeInteger(maximumSourceGrids)||maximumSourceGrids<1||maximumSourceGrids>4||typeof sourceRegions!=='boolean')fail('INVALID_INPUT','A bounded source reader and preview worker factory are required.');
 const adaptive=providedAdaptive===undefined?createAdaptivePreview():providedAdaptive,frequencyAdaptive=providedAdaptive===undefined?createFrequencyPreviewSizing():null;
 const maximumPixels=Math.min(ADAPTIVE_PREVIEW_MAX_PIXELS,Math.max(256,Math.floor((memoryBudgetBytes-48*MiB)/160))),workingBytes=memoryBudgetBytes+maximumPixels*(maximumSourceGrids*(sourceRegions?4:3)+12)+(sourceRegions?maximumSourceGrids*(4*MiB+65536):0)+(frequencyAdaptive?FREQUENCY_SIZING_BYTES:0);
 let engine,lease,source,sourceGroup,reference,active,controller,starting,preparing,preparationController,disposed=false,resetting=false,generation=0,serial=0,retiring,retirementRecord,idleOwnedBytes=0,frequencyInFlightChoice=null,frequencyReturnedSourceId=null,frequencyActiveSourceId=null;
 const sourceGrids=new Map(),loadedScopedHeaps=new Set();
 // Presence comes from the actual source owners, not an imported timing row.
 // This observed epoch only invalidates known misses; it is no Core FFT lease.
 const frequencyOwner=record=>generation+'/'+record.id+'/'+(record.frequencyBasisEpoch??0);
 function ownedFrequencyGrids(request,view,admittedPixels,padded,key,environment){
  if(!engine||sourceGroup!==sourceKey(request.sourceIdentity,request.logicalWidth,request.logicalHeight,0))return[];
  const out=[];for(const record of sourceGrids.values()){
   if(record.frequencyRetiring)continue;
   if(padded){const w=frequencyDimension(record.width),h=frequencyDimension(record.height);if(w>side||h>side||w*h>admittedPixels)continue;}
   const layout=record.frequencyLayouts?.[view];let outputWidth=0,outputHeight=0;
   if(layout){const step=layout.atlas?Math.max(1,Math.ceil(Math.max(layout.width,layout.height)/side),Math.ceil(Math.sqrt(layout.width*layout.height/admittedPixels))):1;outputWidth=Math.ceil(layout.width/step);outputHeight=Math.ceil(layout.height/step);}
   out.push({sourceId:record.id,ownerKey:frequencyOwner(record),deferredLatest:record.frequencyDeferredLatest?.key===key&&record.frequencyDeferredLatest?.environment===environment&&record.frequencyDeferredLatest?.ownerKey===frequencyOwner(record),width:record.width,height:record.height,side:record.gridSide,step:record.sourceRegionSamples?.step??Math.max(1,Math.ceil(Math.max(request.logicalWidth,request.logicalHeight)/record.gridSide)),outputWidth,outputHeight});
  }return out;
 }
 function frequencyAdmission(memory,scratchBytes,extraBytes){
  const knownHeapBytes=memory?.knownHeapCapacityBytes??0,retainedBytes=memory?.retainedBytes??0,activeReservationBytes=memory?.activeReservationBytes??0,roomBytes=memoryBudgetBytes-Math.max(32*MiB,knownHeapBytes)-extraBytes-retainedBytes-activeReservationBytes-2*MiB;
  return{budgetBytes:memoryBudgetBytes,knownHeapBytes,retainedBytes,activeReservationBytes,extraBytes,roomBytes,admittedPixels:Math.min(maximumPixels,Math.floor(roomBytes/(scratchBytes+6)))};
 }
 function frequencyPublication(request,plan){
  let snapshot;try{snapshot=request.previewControl?.publicationSnapshot?.();}catch{return null;}
  if(snapshot?.schema!=='frequency-publication-owner/1'||snapshot.operation!=='detail.frequency'||snapshot.field!==request.field||snapshot.gestureEpoch!==request.previewControl?.gestureEpoch||snapshot.controlRequestId!==request.previewControl?.controlRequestId||snapshot.pendingPublication!==false||snapshot.scope!==plan?.token.scope||snapshot.environment!==plan?.token.environment||JSON.stringify(snapshot.sourceIdentity)!==JSON.stringify(request.sourceIdentity)||typeof snapshot.isCurrent!=='function')return null;
  const visible=[...sourceGrids.values()].find(record=>record.id===snapshot.sourceId);
  if(!visible||visible.frequencyRetiring||visible.width!==snapshot.width||visible.height!==snapshot.height||frequencyOwner(visible)!==snapshot.ownerKey)return null;
  try{return snapshot.isCurrent()===true?snapshot:null;}catch{return null;}
 }
 function idleFrequencyOwner(request,plan,info,snapshot){
  if(!snapshot||!info)return null;
  const protectedIds=new Set([snapshot.sourceId,source?.id,frequencyReturnedSourceId,frequencyActiveSourceId,plan?.token.selectedSource?.sourceId,...info.protectedSourceIds]);
  for(const record of sourceGrids.values())if(record.frequencyDeferredLatest)protectedIds.add(record.id);
  const group=sourceKey(request.sourceIdentity,request.logicalWidth,request.logicalHeight,0);
  if(sourceGroup!==group)return null;
  return [...sourceGrids].find(([,record])=>record.proxyOwner===true&&record.key===sourceKey(request.sourceIdentity,request.logicalWidth,request.logicalHeight,record.gridSide)&&!protectedIds.has(record.id))??null;
 }
 async function unloadFrequencyOwner(selected,expectedEngine){
  const [key,record]=selected;record.frequencyRetiring=true;
  try{await acknowledgePreviewRetirement(expectedEngine.unload(record.id));}catch{return false;}
  if(engine===expectedEngine&&sourceGrids.get(key)===record){sourceGrids.delete(key);frequencyAdaptive?.retireSource(record.id);}return true;
 }
 const totals={previews:0,sourceReads:0,referenceReads:0,sourceLoads:0,referenceLoads:0,workerStarts:0,workerDisposals:0,computations:0,preparations:0,setupWorkerMilliseconds:0,maximumInputPixels:0,maximumOutputPixels:0,cancellations:0,supersededBeforeNative:0};
 async function releaseLease(value){if(value===undefined||value===null)return;if(typeof release==='function')await acknowledgePreviewRetirement(release(value));else if(typeof value==='function')await acknowledgePreviewRetirement(value());else if(typeof value.release==='function')await acknowledgePreviewRetirement(value.release());else fail('INVALID_INPUT','Preview reservation has no release callback.');}
 async function retire({reclaimed=false}={}){if(reclaimed){generation++;controller?.abort();preparationController?.abort();if(retirementRecord)retirementRecord.reclaimed=true;}if(retiring)return retiring;const record=retirementRecord??{old:engine,held:lease,destroyed:false};record.reclaimed=reclaimed;retirementRecord=record;engine=lease=source=sourceGroup=reference=null;frequencyReturnedSourceId=frequencyActiveSourceId=null;sourceGrids.clear();frequencyAdaptive?.reset({preserveProgression:true});loadedScopedHeaps.clear();idleOwnedBytes=0;retiring=(async()=>{if(!record.destroyed&&record.old){await acknowledgePreviewRetirement(record.old.dispose());totals.workerDisposals++;}record.destroyed=true;if(!record.reclaimed)await releaseLease(record.held);if(retirementRecord===record)retirementRecord=null;})().finally(()=>{retiring=null;});return retiring;}
 async function ensureWorker(signal,beforeCreate=()=>{}){if(retirementRecord)await retire();check(signal);if(engine&&!starting)return engine;if(starting){await starting;check(signal);return engine;}
  const begun=performance.now(),epoch=generation;
  const task=(async()=>{lease=await reserve?.({bytes:workingBytes,label:'bounded-parameter-preview-worker'},{onReclaim:()=>retire({reclaimed:true})});check(signal);beforeCreate();if(disposed||resetting||generation!==epoch)fail('CANCELLED','Preview preparation changed before Worker creation.');engine=await engineFactory({computeProfile:'maximum',memoryBudgetBytes});totals.workerStarts++;await engine.capabilities?.();check(signal);if(disposed||resetting||generation!==epoch)fail('CANCELLED','Preview preparation changed during Worker startup.');totals.setupWorkerMilliseconds+=performance.now()-begun;return engine;})();starting=task;
  try{return await task;}finally{if(starting===task)starting=null;}
 }
 async function loadPixels(pixels,name,identity,signal,samples){check(signal);const bytes=encodeParameterPreviewPng(pixels),id='parameter-preview-'+name+'-'+generation+'-'+(++serial),sha256=samples?[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''):null,answer=await engine.load({id,bytes,pixels,provenance:{decoder:'bounded-parameter-preview',derived:true,exact:false,parentSourceIdentity:identity,encoding:'lossless-rgb-png',sampling:'native-source-samples'}},{signal});check(signal);
  if(samples&&answer.sha256!==sha256)fail('SOURCE_REGIONS_INVALID','The proxy worker did not confirm the independently encoded PNG identity.');
  const sourceRegionDomain=samples?await parameterRegionDerivedDomain(samples,sha256):undefined;check(signal);return{id,surface:answer.surface,width:pixels.width,height:pixels.height,...(samples?{sourceRegionDomain,sourceRegionSamples:samples}:{})};}
 async function sourceFor(request,signal,gridSide,preserveSourceIds=[],frequencyLane){
  const group=sourceKey(request.sourceIdentity,request.logicalWidth,request.logicalHeight,0),key=sourceKey(request.sourceIdentity,request.logicalWidth,request.logicalHeight,gridSide);
  if(sourceGroup!==undefined&&sourceGroup!==null&&sourceGroup!==group)await retire();
  if(sourceGrids.has(key)){const cachedSource=sourceGrids.get(key);if(cachedSource.frequencyRetiring)return null;source=cachedSource;sourceGrids.delete(key);sourceGrids.set(key,source);return source;}
  let answer,failed=false;
  try{check(signal);answer=await readSource({sourceIdentity:request.sourceIdentity,logicalWidth:request.logicalWidth,logicalHeight:request.logicalHeight,side:gridSide,maxSide:gridSide,signal});check(signal);totals.sourceReads++;const pixels=frame(answer,gridSide);if(frequencyLane?.used()&&!frequencyLane.current())return null;
   if(answer.sourceIdentity!==undefined&&JSON.stringify(answer.sourceIdentity)!==JSON.stringify(request.sourceIdentity))fail('CANCELLED','Native source changed during preview sampling.');
   if(answer.logicalWidth!==undefined&&(answer.logicalWidth!==request.logicalWidth||answer.logicalHeight!==request.logicalHeight))fail('CANCELLED','Native source geometry changed during preview sampling.');
   if(sourceRegions&&!answer.sourceRegionSamples)fail('SOURCE_REGIONS_INVALID','A scoped preview source must provide its admitted sampled membership.');
   await ensureWorker(signal);if(frequencyLane?.used()&&!frequencyLane.current())return null;while(sourceGrids.size>=maximumSourceGrids){if(request.operation==='detail.frequency'){const snapshot=frequencyPublication(request,frequencyLane?.plan),selected=idleFrequencyOwner(request,frequencyLane?.plan,frequencyLane?.info,snapshot);if(!selected||!frequencyLane||!await frequencyLane.retireOne(selected,snapshot))return null;continue;}const protectedIds=new Set(preserveSourceIds.slice(0,Math.max(0,maximumSourceGrids-1))),[oldKey,old]=[...sourceGrids].find(([,r])=>!protectedIds.has(r.id))??sourceGrids.entries().next().value;await engine.unload(old.id);sourceGrids.delete(oldKey);frequencyAdaptive?.retireSource(old.id);}if(frequencyLane?.used()&&(!frequencyLane.current()||pixels.width*pixels.height>frequencyLane.admission().admittedPixels))return null;const loaded=await loadPixels(pixels,'source',request.sourceIdentity,signal,answer.sourceRegionSamples);totals.sourceLoads++;totals.maximumInputPixels=Math.max(totals.maximumInputPixels,pixels.width*pixels.height);source={...loaded,key,gridSide,proxyOwner:true,frequencyBasisEpoch:0,frequencyLayouts:Object.create(null)};sourceGroup=group;sourceGrids.set(key,source);return source;
  }catch(error){failed=true;throw error;}finally{try{await answer?.release?.();}catch(error){if(!failed)throw error;}}
 }
 async function referenceFor(request,first,signal){
  if(typeof readReference!=='function')fail('PREVIEW_UNAVAILABLE','Comparison preview requires its native reference image.');
  const answer=await readReference({sourceIdentity:request.sourceIdentity,logicalWidth:request.logicalWidth,logicalHeight:request.logicalHeight,side:first.gridSide,maxSide:first.gridSide,signal});check(signal);totals.referenceReads++;const pixels=frame(answer,first.gridSide);
  if(pixels.width!==first.width||pixels.height!==first.height||answer.logicalWidth!==undefined&&(answer.logicalWidth!==request.logicalWidth||answer.logicalHeight!==request.logicalHeight))fail('INVALID_INPUT','Evidence and reference preview geometry differ.');
  // A reference reader without identity is valid, but cannot justify cache reuse.
  const key=answer.sourceIdentity===undefined?null:JSON.stringify([answer.sourceIdentity,pixels.width,pixels.height]);if(key&&reference?.key===key)return reference;
  if(reference){await engine.unload(reference.id);reference=null;}const loaded=await loadPixels(pixels,'reference',answer.sourceIdentity??'uncached-reference',signal);reference={...loaded,key};totals.referenceLoads++;return reference;
 }
 async function activate(signal){if(!engine||typeof updateReservation!=='function')return;const held=lease,answer=await updateReservation(held,{bytes:Math.max(workingBytes,idleOwnedBytes),idle:false});check(signal);if(answer?.reclaimed||held!==lease||!engine)fail('CANCELLED','Preview cache was reclaimed before activation.');}
 async function park(){if(!engine||!lease||typeof updateReservation!=='function')return;const old=engine,held=lease,memory=(await old.capabilities()).memory??{};if(engine!==old||lease!==held)return;const bytes=Math.max(32*MiB,memory.knownHeapCapacityBytes??0)+(memory.retainedBytes??0)+(memory.cacheBytes??0)+(memory.activeReservationBytes??0)+65536+(sourceRegions?[...sourceGrids.values()].reduce((n,r)=>n+(r.sourceRegionSamples?.membership.byteLength??0)+(r.sourceRegionSamples?.metadataBytes??0),0):0);idleOwnedBytes=bytes;const answer=await updateReservation(held,{bytes,idle:true});if(answer?.reclaimed&&engine===old)await retire({reclaimed:true});}
 async function reclaimIdleWorkspace(request,signal,scratchBytes,extraBytes,memory){
  const old=engine;if(!old||typeof old.reserveExternalMemory!=='function'||typeof old.releaseExternalMemory!=='function')return memory;
  // Ask the existing Core budget to retire idle endpoints before discarding
  // direct native basis owners. No source read or provisional calculation.
  let pixels=256;for(const record of sourceGrids.values()){
   pixels=Math.max(pixels,record.width*record.height);
   for(const layout of Object.values(record.frequencyLayouts??{})){const step=layout.atlas?Math.max(1,Math.ceil(Math.max(layout.width,layout.height)/side),Math.ceil(Math.sqrt(layout.width*layout.height/maximumPixels))):1;pixels=Math.max(pixels,Math.ceil(layout.width/step)*Math.ceil(layout.height/step));}
  }
  pixels=Math.min(maximumPixels,pixels);
  const bytes=extraBytes+2*MiB+Math.max(0,32*MiB-(memory?.knownHeapCapacityBytes??0))+pixels*(scratchBytes+6);let held,failed=false,failure;
  try{held=await old.reserveExternalMemory({bytes});check(signal);if(engine!==old)fail('CANCELLED','Preview owner changed during idle workspace retirement.');}
  catch(error){if(!held&&error?.code==='MEMORY_LIMIT')return memory;failed=true;failure=error;throw error;}
  finally{if(held)try{await old.releaseExternalMemory(held.id);}catch(error){if(!failed)throw error;if(failure&&typeof failure==='object'&&Object.isExtensible(failure))try{failure.previewCleanupError={code:error?.code,message:error?.message};}catch{}}}
  check(signal);if(engine!==old)fail('CANCELLED','Preview owner changed after idle workspace acknowledgement.');
  const current=(await old.capabilities()).memory;check(signal);return current;
 }
 async function calculate(request,signal,epoch){
  if(!OPERATIONS.has(request?.operation))fail('PREVIEW_UNAVAILABLE','This operation has no generic pixel-proxy contract.');
  const {operation,logicalWidth,logicalHeight}=request;if(!Number.isSafeInteger(logicalWidth)||!Number.isSafeInteger(logicalHeight)||logicalWidth<1||logicalHeight<1)fail('INVALID_INPUT','Native logical dimensions are required.');
  const diagnosticStarted=operation==='detail.frequency'?performance.now():null;
  const control=operation==='detail.frequency'?request.previewControl:null,controlTiming=()=>control?{gestureEpoch:control.gestureEpoch,controlRequestId:control.controlRequestId,lastAdmittedInput:control.lastAdmittedInput,clock:control.clock,inputAt:control.inputAt,admittedInputAt:control.admittedInputAt,enqueuedAt:control.enqueuedAt,inputAgeAvailable:control.inputAgeAvailable,ageOrigin:control.ageOrigin,preQueueMs:control.preQueueMs,previewOrdinal:control.previewOrdinal,previewIntentionOrdinal:control.previewIntentionOrdinal,refreshPhase:control.refreshPhase,refinement:control.refinement===true,refinementOrdinal:control.refinementOrdinal??0,dispatchedAt:control.dispatchedAt,queueWaitMs:control.queueWaitMs,intentAgeMilliseconds:typeof control.ageMilliseconds==='function'?control.ageMilliseconds():0,queueAgeMilliseconds:typeof control.queueAgeMilliseconds==='function'?control.queueAgeMilliseconds():null}:null;
  const superseded=phase=>{check(signal);if(control?.yieldBeforeNative?.()!==true)return false;totals.supersededBeforeNative++;control.report?.({phase,...controlTiming(),sourceIdentity:request.sourceIdentity,...totals});return true;};
  if(control&&retirementRecord)await retire();if(operation==='detail.frequency'&&sourceGroup&&sourceGroup!==sourceKey(request.sourceIdentity,logicalWidth,logicalHeight,0))await retire();if(superseded('superseded-before-proxy-preparation'))return null;
  await activate(signal);const [scratchBytes,ordinaryExtra]=ADMISSION[operation]??[192,32*MiB],scopedHeap=sourceRegions?SCOPED_HEAPS[operation]:null,extraBytes=Math.max(ordinaryExtra,scopedHeap&&!loadedScopedHeaps.has(scopedHeap[0])?scopedHeap[1]:0);let capabilities=engine?.capabilities?await engine.capabilities():null,memory=capabilities?.memory;check(signal);
  let room=memoryBudgetBytes-Math.max(32*MiB,memory?.knownHeapCapacityBytes??0)-extraBytes-(memory?.retainedBytes??0)-(memory?.activeReservationBytes??0)-2*MiB;
  if(room<scratchBytes+6&&engine){memory=await reclaimIdleWorkspace(request,signal,scratchBytes,extraBytes,memory);if(superseded('superseded-after-idle-workspace-retirement'))return null;room=memoryBudgetBytes-Math.max(32*MiB,memory?.knownHeapCapacityBytes??0)-extraBytes-(memory?.retainedBytes??0)-(memory?.activeReservationBytes??0)-2*MiB;}
  if(room<scratchBytes+6&&engine){await retire();memory=null;room=memoryBudgetBytes-32*MiB-extraBytes-2*MiB;}
  if(room<scratchBytes+6)fail('MEMORY_LIMIT','No admitted parameter-preview kernel workspace.');
  let admittedPixels=Math.min(maximumPixels,Math.floor(room/(scratchBytes+6)));const requestedParams=structuredClone(request.params??{}),costFields=['mode','wavelet','radius','block','filter','sharpen','blockSize','samplesPerBin'],cost=operation==='jpeg.ghosts'?'qualities='+Math.floor(Math.log2(1+Math.max(0,(requestedParams.high??90)-(requestedParams.low??50))/(requestedParams.step??5))):costFields.filter(key=>Object.hasOwn(requestedParams,key)).map(key=>{const v=requestedParams[key],bucket=typeof v==='number'&&!['mode'].includes(key)?v>0?Math.floor(Math.log2(v))+1:0:v;return key+'='+bucket;}).join('/'),minimumSide=operation==='jpeg.ghosts'?Math.ceil(16*Math.max(logicalWidth,logicalHeight)/Math.min(logicalWidth,logicalHeight)):16;
  if(operation==='jpeg.ghosts'&&(Math.min(logicalWidth,logicalHeight)<16||minimumSide>side))fail('PREVIEW_UNAVAILABLE','A JPEG Ghost draft requires complete16px cells on its bounded sampled source.');
  const diagnosticSizingStarted=operation==='detail.frequency'?performance.now():null,frequencyView=operation==='detail.frequency'?frequencyViewName(request.view):null,paddedFrequency=['magnitude','phase'].includes(frequencyView);
  const sizing=operation==='detail.frequency'&&frequencyAdaptive?frequencyAdaptive:adaptive,sizingKey='pixels/'+operation+'/'+cost+(operation==='detail.frequency'?'/view='+frequencyViewName(request.view):''),frequencyEnvironment=operation==='detail.frequency'?JSON.stringify({profile:'maximum',backend:'cpu',maxWorkers:capabilities?.resourceProfile?.maxWorkers??null,memoryBudgetBytes,hardwareConcurrency:globalThis.navigator?.hardwareConcurrency??null}):null;
  const makePlan=()=>sizing?sizing.plan({key:sizingKey,width:logicalWidth,height:logicalHeight,maxSide:side,minSide:minimumSide,maxPixels:admittedPixels,feedback:request.adaptiveFeedback,...(sizing===frequencyAdaptive?{intentAgeMilliseconds:controlTiming()?.intentAgeMilliseconds??0,gestureEpoch:control?.gestureEpoch,controlRequestId:control?.controlRequestId,liveGrids:ownedFrequencyGrids(request,frequencyView,admittedPixels,paddedFrequency,sizingKey,frequencyEnvironment),progressionRequested:control?.refinement===true,identity:sourceKey(request.sourceIdentity,logicalWidth,logicalHeight,0),environment:frequencyEnvironment}:{})}):null;let plan=makePlan(),frequencyLane=null;

  if(sizing===frequencyAdaptive&&frequencyAdaptive){
   const expectedEngine=engine,expectedGroup=sourceKey(request.sourceIdentity,logicalWidth,logicalHeight,0),live=()=>ownedFrequencyGrids(request,frequencyView,admittedPixels,paddedFrequency,sizingKey,frequencyEnvironment);
   let snapshot=frequencyPublication(request,plan),used=false,reclaimDiagnostics=null;
   const current=()=>{try{const age=control?.ageMilliseconds?.();return !signal.aborted&&!disposed&&!resetting&&epoch===generation&&engine===expectedEngine&&sourceGroup===expectedGroup&&snapshot?.isCurrent()===true&&Number.isFinite(age)&&age>=0&&age<plan.token.targetMs;}catch{return false;}};
   frequencyLane={plan,used:()=>used,info:frequencyAdaptive.retirementInfo(plan,live()),current,admission:()=>frequencyAdmission(memory,scratchBytes,extraBytes),diagnostics:()=>reclaimDiagnostics,async retireOne(selected,proof){
    if(used||!proof)return false;snapshot=proof;if(!current())return false;used=true;
    reclaimDiagnostics={schema:'frequency-obsolete-owner-reclaim/1',attempted:true,acknowledged:false,before:frequencyAdmission(memory,scratchBytes,extraBytes),after:null,outcome:'pending'};
    const acknowledged=await unloadFrequencyOwner(selected,expectedEngine);reclaimDiagnostics.acknowledged=acknowledged;
    if(!acknowledged){reclaimDiagnostics.outcome='nack-owner-retained';control?.report?.({phase:'frequency-old-owner-retirement',reclaim:reclaimDiagnostics});return false;}
    if(!current()){reclaimDiagnostics.outcome='revoked-after-unload';control?.report?.({phase:'frequency-old-owner-retirement',reclaim:reclaimDiagnostics});return false;}
    let fresh;try{fresh=await expectedEngine.capabilities();}catch{reclaimDiagnostics.outcome='ack-capabilities-unavailable';control?.report?.({phase:'frequency-old-owner-retirement',reclaim:reclaimDiagnostics});return false;}if(fresh?.memory&&['knownHeapCapacityBytes','retainedBytes','activeReservationBytes'].every(key=>Number.isSafeInteger(fresh.memory[key])&&fresh.memory[key]>=0))reclaimDiagnostics.after=frequencyAdmission(fresh.memory,scratchBytes,extraBytes);if(!current()){reclaimDiagnostics.outcome='revoked-after-capabilities';control?.report?.({phase:'frequency-old-owner-retirement',reclaim:reclaimDiagnostics});return false;}
    const observed=fresh?.memory;if(!observed||!['knownHeapCapacityBytes','retainedBytes','activeReservationBytes'].every(key=>Number.isSafeInteger(observed[key])&&observed[key]>=0)){reclaimDiagnostics.outcome='ack-no-complete-memory-snapshot';control?.report?.({phase:'frequency-old-owner-retirement',reclaim:reclaimDiagnostics});return false;}const execution=JSON.stringify({profile:'maximum',backend:'cpu',maxWorkers:fresh?.resourceProfile?.maxWorkers??null,memoryBudgetBytes,hardwareConcurrency:globalThis.navigator?.hardwareConcurrency??null});if(execution!==frequencyEnvironment){reclaimDiagnostics.after=frequencyAdmission(observed,scratchBytes,extraBytes);reclaimDiagnostics.outcome='ack-execution-environment-changed';control?.report?.({phase:'frequency-old-owner-retirement',reclaim:reclaimDiagnostics});return false;}capabilities=fresh;memory=observed;const admitted=frequencyAdmission(memory,scratchBytes,extraBytes);room=admitted.roomBytes;admittedPixels=admitted.admittedPixels;reclaimDiagnostics.after=admitted;reclaimDiagnostics.outcome='ack-capabilities-reread';return true;
   }};
   const required=frequencyLane.info?.next;
   if(required&&snapshot&&memory&&['knownHeapCapacityBytes','retainedBytes','activeReservationBytes'].every(key=>Number.isSafeInteger(memory[key])&&memory[key]>=0)){
    const selected=idleFrequencyOwner(request,plan,frequencyLane.info,snapshot);
    if(selected){
     if(!await frequencyLane.retireOne(selected,snapshot))return null;
     if(!frequencyLane.current()||room<scratchBytes+6){const d=frequencyLane.diagnostics();d.requiredPixels=required.requiredPixels;d.outcome=room<scratchBytes+6?'ack-no-admitted-workspace':'revoked-before-replan';control?.report?.({phase:'frequency-old-owner-retirement',reclaim:d});return null;}
     // Exactly the same admission and current-input plan, using only fresh real
     // capabilities. The mathematical requirement above never becomes a plan.
     plan=makePlan();frequencyLane.plan=plan;frequencyLane.info=frequencyAdaptive.retirementInfo(plan,live());
     const d=frequencyLane.diagnostics();d.requiredPixels=required.requiredPixels;d.outcome=admittedPixels<required.requiredPixels?'ack-insufficient-admission':plan.token.progression.requested?'ack-finer-admitted':'ack-no-current-refinement';
     control?.report?.({phase:'frequency-old-owner-retirement',reclaim:d});
     if(!frequencyLane.current()||plan.token.deadlineExceeded)return null;
    }
   }
  }

  const diagnosticSizingEnded=operation==='detail.frequency'?performance.now():null;if(operation==='detail.frequency')frequencyInFlightChoice=plan;if(plan?.token.progression?.exhausted){control?.report?.({phase:'visible-refinement-exhausted',...controlTiming()});return null;}
  check(signal);const started=performance.now(),workerSetupBefore=totals.setupWorkerMilliseconds,requestedSide=plan?.side??Math.min(DEFAULT_SIDE,side),cold=!engine||!sourceGrids.has(sourceKey(request.sourceIdentity,logicalWidth,logicalHeight,requestedSide));let first=await sourceFor(request,signal,plan?.side??Math.min(DEFAULT_SIDE,side),plan?.token.progression?.preserveSourceIds,frequencyLane);
  if(!first)return null;
  if(paddedFrequency)for(;;){const w=frequencyDimension(first.width),h=frequencyDimension(first.height);if(w<=side&&h<=side&&w*h<=admittedPixels)break;if(plan?.token.selectedSource)fail('MEMORY_LIMIT','The selected owned frequency source no longer fits its admitted padded grid.');const ratio=Math.min(side/Math.max(w,h),Math.sqrt(admittedPixels/(w*h))),next=Math.min(first.gridSide-1,Math.floor(first.gridSide*ratio));if(next<16)fail('MEMORY_LIMIT','Padded frequency draft does not fit the admitted display grid.');first=await sourceFor(request,signal,next,plan?.token.progression?.preserveSourceIds,frequencyLane);if(!first)return null;}
  const selectedFrequencySource=sizing===frequencyAdaptive?plan?.token.selectedSource:null;if(selectedFrequencySource&&(first.id!==selectedFrequencySource.sourceId||frequencyOwner(first)!==selectedFrequencySource.ownerKey||first.width!==selectedFrequencySource.width||first.height!==selectedFrequencySource.height))fail('CANCELLED','Selected frequency source owner changed before its request.');
  const sourcePhaseMilliseconds=performance.now()-started,setupWorkerMilliseconds=totals.setupWorkerMilliseconds-workerSetupBefore,setupSourceMilliseconds=cold?Math.max(0,sourcePhaseMilliseconds-setupWorkerMilliseconds):0,setupMilliseconds=cold?sourcePhaseMilliseconds:0,{params,projection}=projectParameterPreviewParams(operation,requestedParams,{width:first.width,height:first.height,logicalWidth,logicalHeight}),task={id:'parameter-preview-task-'+(++serial),imageId:first.id,operation,params,backend:'cpu',...(first.sourceRegionDomain?{sourceRegionDomain:first.sourceRegionDomain}:{})};let result,failure,failed=false,frequencyDiagnostics;
  if(operation==='comparison.image'){const second=await referenceFor(request,first,signal);params.referenceImageId=second.id;params.metrics=false;}
  if(operation==='inspection.magnifier')params.bounds=null;
  try{
   check(signal);if(frequencyLane?.used()&&!frequencyLane.current()){if(plan?.token.progression?.requested===true&&epoch===generation&&sourceGrids.get(first.key)===first)first.frequencyDeferredLatest={key:sizingKey,environment:frequencyEnvironment,ownerKey:frequencyOwner(first)};control?.report?.({phase:'revoked-after-old-owner-before-native'});return null;}if(superseded('superseded-after-source-before-native')){
    if(operation==='detail.frequency'&&plan?.token.progression?.requested===true&&!plan.token.progression.exhausted&&sourceGrids.get(first.key)===first)first.frequencyDeferredLatest={key:sizingKey,environment:frequencyEnvironment,ownerKey:frequencyOwner(first)};
    return null;
   }
   // Keep only an already owned, unmeasured refinement eligible for current
   // user inputs. A native miss changes its basis epoch, never certifies warmth.
   const deferredFrequencyLatest=operation==='detail.frequency'&&first.frequencyDeferredLatest?.key===sizingKey&&first.frequencyDeferredLatest?.environment===frequencyEnvironment&&first.frequencyDeferredLatest?.ownerKey===frequencyOwner(first)?first.frequencyDeferredLatest:null;
   if(operation==='detail.frequency')delete first.frequencyDeferredLatest;
   if(plan?.token.progression?.warmOpportunityUsed===true&&!frequencyAdaptive.consumeWarmOpportunity(plan))fail('CANCELLED','The one-use warm frequency opportunity changed before its current input.');
   const diagnosticNativeStarted=operation==='detail.frequency'?performance.now():null;if(operation==='detail.frequency')frequencyActiveSourceId=first.id;result=await engine.run(task,{signal});const diagnosticNativeEnded=operation==='detail.frequency'?performance.now():null;if(scopedHeap)loadedScopedHeaps.add(scopedHeap[0]);totals.computations++;if(operation==='detail.frequency'&&result.metrics?.baseCached!==true){frequencyAdaptive?.invalidateSource(first.id);first.frequencyBasisEpoch++;}check(signal);if(epoch!==generation)fail('CANCELLED','Preview source was reset.');
   if(deferredFrequencyLatest&&sourceGrids.get(first.key)===first)first.frequencyDeferredLatest={...deferredFrequencyLatest,ownerKey:frequencyOwner(first)};
   if(first.sourceRegionDomain&&result.sourceRegionDomain?.fingerprint!==first.sourceRegionDomain.fingerprint)fail('SOURCE_REGIONS_INVALID','The preview worker did not retain its admitted derived source domain.');
   let pixels=result.pixels,logicalOutputWidth=logicalWidth,logicalOutputHeight=logicalHeight,ghostView,scopedFrequencyAtlas=!!first.sourceRegionSamples&&paddedFrequency;const view=typeof request.view==='string'?request.view:request.view?.id??request.view?.mode;let selected=result.rgbSurfaces?.[view]??result.surface;
   if(frequencyView){pixels=frequencyView==='low'?result.pixels:result.data?.[frequencyView];selected=frequencyView==='low'?result.surface:result.rgbSurfaces?.[frequencyView];if(scopedFrequencyAtlas){[logicalOutputWidth,logicalOutputHeight]=result.data?.frequencyDimensions??[];if(logicalOutputWidth!==selected?.width||logicalOutputHeight!==selected?.height)fail('SOURCE_REGIONS_INVALID','Independent native frequency atlas dimensions differ.');}else if(paddedFrequency){logicalOutputWidth=frequencyDimension(logicalWidth);logicalOutputHeight=frequencyDimension(logicalHeight);}if(!pixels&&!selected)fail('PREVIEW_UNAVAILABLE','The selected frequency layer is absent from its draft result.');}
   if(operation==='jpeg.ghosts'){
    const d=result.data,layer=request.view?.layerId??request.view?.id??view,wanted=request.view?.quality??(/^quality-(\d+)$/.exec(layer??'')?.[1]),original=layer==='original'&&params.includeOriginal;
    if(original){pixels=d?.original;selected=d?.originalSurface??selected;}
    else{const qualities=Array.from(d?.qualities??[]);if(!qualities.length)fail('PREVIEW_UNAVAILABLE','The provisional JPEG quality grid is empty.');const index=Number.isFinite(Number(wanted))?qualities.reduce((best,q,i)=>Math.abs(q-Number(wanted))<Math.abs(qualities[best]-Number(wanted))?i:best,0):Math.min(qualities.length-1,Math.max(0,request.view?.index??0));pixels=d.views?.[index]?.pixels;logicalOutputWidth=Math.floor(logicalWidth/16);logicalOutputHeight=Math.floor(logicalHeight/16);ghostView={quality:qualities[index],index,qualities,coordinates:'sampled-16px-block-grid',sampledLattice:true,nativeJpegEvidence:false,phase:[params.x??0,params.y??0]};}
   }
   let outputStep=1;if(!pixels){if(!selected)fail('PREVIEW_UNAVAILABLE','The proxy calculation produced no RGB image.');if(scopedFrequencyAtlas)outputStep=Math.max(1,Math.ceil(Math.max(selected.width,selected.height)/side),Math.ceil(Math.sqrt(selected.width*selected.height/admittedPixels)));else if(selected.width>side||selected.height>side||selected.width*selected.height>admittedPixels)fail('INVALID_INPUT','The proxy kernel exceeded bounded display dimensions.');pixels=(await engine.readDisplay({surfaceId:selected.id,revision:selected.revision,tile:{x:0,y:0,w:selected.width,h:selected.height,step:outputStep}},{signal})).pixels;}
   if(first.sourceRegionSamples){if(scopedFrequencyAtlas){const mask=result.maskSurfaces?.frequency_scope;if(!mask||mask.width!==selected.width||mask.height!==selected.height)fail('SOURCE_REGIONS_INVALID','Independent native frequency atlas scope is absent.');const scope=(await engine.readDisplay({surfaceId:mask.id,revision:mask.revision,tile:{x:0,y:0,w:mask.width,h:mask.height,step:outputStep},render:{range:[0,1]}},{signal})).pixels;if(scope.width!==pixels.width||scope.height!==pixels.height||scope.format!=='rgb8')fail('SOURCE_REGIONS_INVALID','Frequency atlas membership dimensions differ.');pixels={...pixels,membership:Uint8Array.from({length:scope.width*scope.height},(_,i)=>scope.data[i*3]?1:0),previewCoordinates:'independent-native-frequency-atlas'};}else pixels=frameParameterRegionPixels(pixels,first.sourceRegionSamples,first.sourceRegionDomain);}
   check(signal);pixels=frame(pixels,side);if(pixels.width*pixels.height>admittedPixels)fail('INVALID_INPUT','The proxy kernel exceeded the admitted pixel count.');if(epoch!==generation)fail('CANCELLED','Preview source changed before display.');totals.previews++;totals.maximumOutputPixels=Math.max(totals.maximumOutputPixels,pixels.width*pixels.height);
   const diagnosticCompleted=operation==='detail.frequency'?performance.now():null;
   if(frequencyView)first.frequencyLayouts[frequencyView]={width:scopedFrequencyAtlas?selected.width:pixels.width,height:scopedFrequencyAtlas?selected.height:pixels.height,atlas:scopedFrequencyAtlas};
   const milliseconds=performance.now()-started,cached=result.metrics?.cache?.result===true&&!Object.hasOwn(result.metrics.cache,'view'),adaptiveMetrics=plan?{token:plan.token,milliseconds,setupMilliseconds,setupWorkerMilliseconds,setupSourceMilliseconds,cold,cached,pixels:first.width*first.height,...(sizing===frequencyAdaptive?{basisWarm:result.metrics?.baseCached===true,calibrationVersion:'frequency-owned-visible-grid/7',basisResidencyGuaranteed:false}:{}),feedback:sizing.observe(plan,{milliseconds,setupMilliseconds,cold,cached:cached||operation==='detail.frequency'&&result.metrics?.analysisCached===true,basisWarm:result.metrics?.baseCached===true,pixels:first.width*first.height,inputWidth:first.width,inputHeight:first.height,...(sizing===frequencyAdaptive?{sourceId:first.id,ownerKey:frequencyOwner(first),outputWidth:pixels.width,outputHeight:pixels.height}:{})})}:null;
   if(operation==='detail.frequency'&&sizing===frequencyAdaptive)frequencyDiagnostics=adaptiveMetrics.diagnostics=frequencyPreviewDiagnostics(plan,{inputDimensions:[first.width,first.height],outputDimensions:[pixels.width,pixels.height],queueWaitMilliseconds:control?.queueWaitMs,cold,cached,basisWarm:result.metrics?.baseCached===true,timings:{preSizingMilliseconds:diagnosticSizingStarted-diagnosticStarted,sizingMilliseconds:diagnosticSizingEnded-diagnosticSizingStarted,sourcePreparationMilliseconds:sourcePhaseMilliseconds,nativeRequestMilliseconds:diagnosticNativeEnded-diagnosticNativeStarted,outputPreparationMilliseconds:diagnosticCompleted-diagnosticNativeEnded,proxyInclusiveMilliseconds:milliseconds,workerStartupMilliseconds:setupWorkerMilliseconds,coldSourceSetupMilliseconds:setupSourceMilliseconds}});
   const metrics={...(frequencyLane?.diagnostics()?{frequencyOwnerReclaim:frequencyLane.diagnostics()}:{}),schema:'parameter-pixel-proxy/1',operation,field:request.field??null,sourceIdentity:request.sourceIdentity,derivedSourceId:first.id,inputDimensions:[first.width,first.height],outputDimensions:[pixels.width,pixels.height],maximumSide:first.gridSide,admittedPixels,requestedParams,previewParams:structuredClone(params),spatialProjection:projection,adaptivePreview:adaptiveMetrics,...(ghostView?{ghostView}:{}),...(frequencyView?{frequencyView,coordinates:scopedFrequencyAtlas?'independent-native-frequency-atlas':paddedFrequency?'frequency':'source'}:{}),...(first.sourceRegionSamples?{nativeKernelMetrics:result.metrics,nativeHeapAdmission:scopedHeap?{family:scopedHeap[0],capacityBytes:scopedHeap[1],additionalAdmissionBytes:extraBytes,workerBudgetBytes:memoryBudgetBytes}:undefined,sourceRegionSampling:{schema:first.sourceRegionSamples.schema,parentFingerprint:first.sourceRegionSamples.parentFingerprint,derivedFingerprint:first.sourceRegionDomain.fingerprint,step:first.sourceRegionSamples.step,origin:first.sourceRegionSamples.origin,includedSamples:first.sourceRegionSamples.included,missingSamples:first.width*first.height-first.sourceRegionSamples.included,sourceReads:first.sourceRegionSamples.sourceReads}}:{}),exact:false,scientificFinalChanged:false,analysisApproximation:approximations.has(operation)?'Global basis/statistics recalculated only on the provisional sampled image.':'Native pixel kernel applied to provisional sampled pixels.',metricsCalculated:false,...(control?{previewControl:controlTiming()}:{}),milliseconds,...totals,setupWorkerMilliseconds,setupSourceMilliseconds};try{onMetrics(metrics);}catch{}
   return{pixels:{...pixels,logicalWidth:logicalOutputWidth,logicalHeight:logicalOutputHeight},exact:false,metrics};
  }catch(error){failed=true;failure=error;throw error;}
  finally{const diagnosticRetirementStarted=frequencyDiagnostics?performance.now():null;let diagnosticRetirementAcknowledged=!result||!!engine;try{if(result&&engine){const resources=resultResources(result).filter(v=>v.id!==first.surface?.id&&v.id!==reference?.surface?.id);let cleanup,cleanupFailed=false;for(const value of resources)try{await engine[value.table?'releaseTable':'releaseSurface'](value.id);}catch(error){diagnosticRetirementAcknowledged=false;if(!cleanupFailed){cleanup=error;cleanupFailed=true;}}if(cleanupFailed){if(!failed)throw cleanup;if(failure&&typeof failure==='object'&&Object.isExtensible(failure))try{failure.previewCleanupError={code:cleanup?.code,message:cleanup?.message};}catch{}}}}finally{if(frequencyDiagnostics){frequencyDiagnostics.timings.resultRetirementMilliseconds=performance.now()-diagnosticRetirementStarted;frequencyDiagnostics.resultRetirementAcknowledged=diagnosticRetirementAcknowledged;}if(operation==='detail.frequency')frequencyActiveSourceId=null;}}
 }
 async function reset(){frequencyAdaptive?.reset();generation++;controller?.abort();preparationController?.abort();resetting=true;try{await Promise.allSettled([active,preparing]);await retire();}finally{resetting=false;}}
 return{
  prepare({signal,isCurrent}={}){
   if(disposed)return Promise.reject(Object.assign(Error('Parameter preview disposed.'),{code:'DISPOSED'}));
   if(typeof isCurrent!=='function'||!isCurrent())return Promise.resolve({prepared:false,reason:'not-current'});
   if(active||resetting)return Promise.resolve({prepared:false,reason:'preview-active'});if(preparing)return preparing;
   const own=preparationController=new AbortController(),abort=()=>own.abort(),before={...totals},epoch=generation;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)own.abort();
   const current=()=>{check(own.signal);if(epoch!==generation||!isCurrent())fail('CANCELLED','Adopted preview result is no longer current.');};
   const task=(async()=>{current();await ensureWorker(own.signal,current);current();await park();current();totals.preparations++;return{prepared:true,workerReady:true,sourceReady:sourceGrids.size>0,setupWorkerMilliseconds:totals.setupWorkerMilliseconds-before.setupWorkerMilliseconds,sourceReads:totals.sourceReads-before.sourceReads,sourceLoads:totals.sourceLoads-before.sourceLoads,computations:totals.computations-before.computations};})();
   const completed=task.catch(async error=>{if(!active)try{await retire();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))error.previewCleanupError={code:cleanup?.code,message:cleanup?.message};}throw error;}).finally(()=>{signal?.removeEventListener('abort',abort);if(preparing===completed)preparing=null;if(preparationController===own)preparationController=null;});preparing=completed;return completed;
  },
  preview(request){if(disposed)return Promise.reject(Object.assign(Error('Parameter preview disposed.'),{code:'DISPOSED'}));if(active||resetting)return Promise.reject(Object.assign(Error('Only one parameter preview may run at a time.'),{code:'BUSY'}));const diagnosticOwnerStarted=request?.operation==='detail.frequency'?performance.now():null,epoch=generation;controller=new AbortController();const own=controller,abort=()=>own.abort(),signal=request?.signal;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)own.abort();const task=Promise.resolve(preparing).then(()=>calculate(request,own.signal,epoch));const completed=task.then(async answer=>{const diagnostics=answer?.metrics?.adaptivePreview?.diagnostics,diagnosticParkStarted=diagnostics?performance.now():null;await park();check(own.signal);if(diagnostics){diagnostics.timings.parkMilliseconds=performance.now()-diagnosticParkStarted;diagnostics.timings.ownerCompletionMilliseconds=performance.now()-diagnosticOwnerStarted;}if(answer?.metrics?.operation==='detail.frequency')frequencyReturnedSourceId=answer.metrics.derivedSourceId;return answer;}).catch(async error=>{if(error?.code==='CANCELLED')totals.cancellations++;frequencyAdaptive?.reject(frequencyInFlightChoice,{code:error?.name==='AbortError'?'CANCELLED':error?.code});try{await retire();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))try{error.previewCleanupError={code:cleanup?.code,message:cleanup?.message};}catch{}}throw error;}).finally(()=>{signal?.removeEventListener('abort',abort);if(active===completed){active=null;frequencyInFlightChoice=null;}if(controller===own)controller=null;});active=completed;return completed;},
  async settle(){if(active)controller?.abort();preparationController?.abort();await Promise.allSettled([active,preparing]);if(typeof updateReservation!=='function')await reset();},
  reset,
  async dispose(){if(disposed)return retiring??(retirementRecord?retire():undefined);disposed=true;await reset();},
  get state(){return{...(frequencyAdaptive?{frequencySizing:frequencyAdaptive.state}:{}),disposed,busy:!!active,preparing:!!preparing,starting:!!starting,resetting,workerResident:!!engine,sourceCached:!!source,cachedSourceGrids:sourceGrids.size,referenceCached:!!reference,reservationActive:lease!==undefined&&lease!==null,generation,metrics:{...totals}};}
 };
}
