import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {PIXEL_OPERATIONS} from './pixel-operations.js';
import {gradientHeapBytes,GRADIENT_HEAP_BYTES,gradientDerivatives,gradientLengths,gradientRender,gradientLut} from './gradient-math.js';
import {echoHeapBytes,ECHO_HEAP_BYTES,echoDerivatives,echoRender} from './echo-math.js';
import {echoLayout} from './echo-layout.js';
import {acquireEchoDerivativeCache} from './echo-cache.js';
import {sourceRegionViewWindowPlan} from './source-region-view.js';
import {ramByteCacheBytes} from './ram-byte-cache.js';
import {deferEchoDebt} from './echo-retirement.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {gradientToneLut} from './segmented-gradient.js';
import {gradientSemantics} from './gradient-parameters.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {sourceRegionLocalCores,sourceRegionLocalSupport} from './source-region-local-support.js';
import {sourceRegionDerivativeBoundaryRuns,sourceRegionObservedDerivatives,observedDerivativeWorkingBytes} from './source-region-observed-derivatives.js';
import {acquireSourceRegionRecompression} from './source-region-recompression.js';
import {createRecompressedSourceRegionView} from './source-region-recompressed-view.js';
import {isGradientField} from './gradient-field-parameters.js';
import {sourceRegionGradientField} from './source-region-gradient-field.js';

// Pure peak of the exact derivative support traversal. No Source read or LUT
// is performed. Masked loans coexist with one actual admitted Source rectangle.
export function echoRegionalReadPlan(view,domain,radius){
 const source=view.originalSource??view,sourceDescriptor=source.descriptor??source,depth=sourceDescriptor.format==='rgb16'?16:8,layout=echoLayout(depth,radius);
 requireValue(view.domain?.fingerprint===domain.fingerprint&&typeof view.admittedRectangles==='function','Echo regional admission needs the actual domain view geometry.');
 let additionalBytes=0,maskedBytes=0,sourceLoanBytes=0,sourceAdditionalBytes=0,supportWindows=0;
 const sourceWindow=rect=>{
  const outputBytes=rect.width*rect.height*layout.inputPixelBytes,originalRect={...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]};let extra;
  if(typeof source.readWindowPlan==='function'){const plan=source.readWindowPlan(originalRect);requireValue(plan?.known===true&&plan.outputBytes===outputBytes&&Number.isSafeInteger(plan.additionalBytes)&&plan.additionalBytes>=0,'Echo regional Source read plan differs from its typed geometry.');extra=plan.additionalBytes;}
  else extra=sourceRegionViewWindowPlan(source,rect).sourceRowScratchBytes;
  return{outputBytes,extra,bytes:outputBytes+extra};
 };
 const cores=function*(){yield*sourceRegionLocalCores(domain,{radius,maxWidth:128,maxHeight:64});yield*sourceRegionDerivativeBoundaryRuns(domain,{radius,maxWidth:128});};
 for(const core of cores()){
  const support=sourceRegionLocalSupport(domain,core,radius);let mask=0,peak={outputBytes:0,extra:0,bytes:0};supportWindows++;
  if(core.observedBoundary){mask=sourceRegionViewWindowPlan(source,support).maskedBytes;for(const part of view.admittedRectangles(support)){const plan=sourceWindow(part);if(plan.bytes>peak.bytes)peak=plan;}}
  else peak=sourceWindow(support);
  const bytes=mask+peak.bytes;if(bytes>additionalBytes){additionalBytes=bytes;maskedBytes=mask;sourceLoanBytes=peak.outputBytes;sourceAdditionalBytes=peak.extra;}
 }
 return Object.freeze({schema:'sherloq.echo-regional-read-plan/1',known:true,depth,radius,additionalBytes,maskedBytes,sourceLoanBytes,sourceAdditionalBytes,supportWindows,domainFingerprint:domain.fingerprint});
}


// Shared admission/execution costs. The raw cache and segmented raw store are
// alternatives; already-financed heap capacity is subtracted exactly once.
export function echoRegionalExecutionPlan(view,domain,radius,{loadedHeapBytes=0}={}){
 requireValue(Number.isSafeInteger(loadedHeapBytes)&&loadedHeapBytes>=0&&Number.isSafeInteger(domain.countIncluded)&&domain.countIncluded>0&&Number.isSafeInteger(domain.countIncluded*12)&&Number.isSafeInteger(domain.width*domain.height*3),'Invalid Echo regional execution admission.');
 const read=echoRegionalReadPlan(view,domain,radius),rawStoreBytes=domain.countIncluded*12,outputStoreBytes=domain.width*domain.height*3,scopeStoreBytes=domain.width*domain.height,presentationRows=Math.max(1,Math.floor(32768/domain.width)),presentationWindow=Object.freeze({x:domain.origin[0],y:domain.origin[1],width:domain.width,height:Math.min(presentationRows,domain.height)});
 const stagingBytes=Math.max((128+2*radius)*(64+2*radius)*32,observedDerivativeWorkingBytes(128,radius,12,read.depth===16?{sampleBytes:2}:undefined))+131072+12288;
 return Object.freeze({schema:'sherloq.echo-regional-execution-plan/1',known:true,missingHeapBytes:Math.max(0,ECHO_HEAP_BYTES-loadedHeapBytes),stagingBytes,read,rawStoreBytes,optionalRawCacheBytes:ramByteCacheBytes(rawStoreBytes,48),outputStoreBytes,scopeStoreBytes,presentationRows,presentationWindow,presentationScopeStageBytes:presentationWindow.width*presentationWindow.height});
}

export async function sourceRegionDerivatives(input){
 let cacheAllowed=true;
 for(;;)try{const result=await sourceRegionDerivativesAttempt(input,{cacheAllowed});if(!cacheAllowed)result.metrics.echoCacheRetry={code:'ECHO_CACHE_ALLOCATION',taskExecutions:2,preflightExecutions:0};return result;}
 catch(error){if(input.task.operation!=='detail.echo'||!cacheAllowed||error?.cleanupOwner||error?.code!=='ECHO_CACHE_ALLOCATION')throw error;checkAbort(input.signal);cacheAllowed=false;}
}

async function sourceRegionDerivativesAttempt({task,original,derived,view,domain,budget,signal,onProgress,publishResult,nativeEcho},{cacheAllowed}){
 if(task.operation==='detail.gradient'&&isGradientField(task.params))return sourceRegionGradientField({task,original,derived,view,domain,budget,signal,onProgress,publishResult});
 const gradient=task.operation==='detail.gradient';if(!gradient&&task.operation!=='detail.echo')throw new EngineError('INVALID_INPUT','A native derivative operation is required.');
 const native16Echo=!gradient&&nativeEcho?.depth===16;
 requireValue(nativeEcho===undefined||native16Echo&&nativeEcho.returnRecord===true&&nativeEcho.view?.descriptor?.format==='rgb16'&&nativeEcho.view.domain?.fingerprint===domain.fingerprint&&typeof nativeEcho.cacheIdentity==='string'&&nativeEcho.cacheIdentity.length>0&&typeof nativeEcho.assertCurrent==='function','Invalid typed Echo regional execution context.');
 if(native16Echo)nativeEcho.assertCurrent();
 const p=PIXEL_OPERATIONS[task.operation].validate(task.params),method=gradient?p.method:'sobel',krawetz=gradient&&method==='krawetz',width=domain.width,height=domain.height,radius=gradient?1:p.radius,bpp=gradient?4:12,cooperate=createCooperator(signal),completeCores=()=>sourceRegionLocalCores(domain,{radius,maxWidth:128,maxHeight:64}),cores=function*(){yield*completeCores();yield*sourceRegionDerivativeBoundaryRuns(domain,{radius,maxWidth:128});},baseKey=task.imageId+'\0source-region/derivatives-observed-boundary-v1/'+task.operation+'/'+domain.fingerprint+'/'+radius+(krawetz?'/krawetz':'')+(native16Echo?'/native16/'+nativeEcho.cacheIdentity:'')+(!gradient?'/echo-raw-chunks-v1':''),rawLayout=native16Echo?echoLayout(16,radius):null;
 let completePixels=0;for(const core of completeCores())completePixels+=core.width*core.height;const analysed=domain.countIncluded,boundaryPixels=analysed-completePixels;if(!analysed)throw new EngineError('SOURCE_SCOPE_EMPTY','No selected derivative centre has its complete native support.',{details:{selectedPixels:domain.countIncluded,analysedPixels:0,unanalysablePixels:domain.countIncluded,halo:radius}});if(gradient&&p.equalize&&analysed>2147483647)throw new EngineError('NUMERIC_RANGE','Native gradient equalization requires at most2147483647 admitted observations.');
 requireValue(Number.isSafeInteger(analysed*bpp+48)&&Number.isSafeInteger(width*height*3),'Native derivative storage exceeds exact integer addressing.');
 const cacheBytes=analysed*bpp+48,make=bytes=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});
 let key=baseKey,cached,derivativeView=native16Echo?nativeEcho.view:view,recompression,output,scope,slopes,surface,scopeSurface,extraHeap,staging,cacheLease,cacheData,echoCache,echoReadPlan,echoPlan,published=false,failure,stats,reads=0,jobs=0;
 async function scatter(core,bytes){for(let row=0;row<core.height;row++)await output.write(bytes.subarray(row*core.width*3,(row+1)*core.width*3),((core.y+row)*width+core.x)*3);}
 async function raw(offset,length){if(gradient&&cached)return cached.bytes.subarray(offset,offset+length);const bytes=new Uint8Array(length);await slopes.readInto(bytes,offset);return bytes;}
 function reduce(bytes){const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let at=0;at<bytes.length;at+=bpp)if(gradient){const dx=data.getInt16(at,true),dy=data.getInt16(at+2,true),m=Math.abs(dx)+Math.abs(dy);stats[0]=Math.max(stats[0],Math.abs(dx));stats[1]=Math.max(stats[1],Math.abs(dy));stats[2]=Math.min(stats[2],m);stats[3]=Math.max(stats[3],m);}else for(let c=0;c<3;c++){const value=rawLayout?.rawKind==='int32'?data.getInt32(at+c*4,true):data.getFloat32(at+c*4,true);stats[c*2]=Math.min(stats[c*2],value);stats[c*2+1]=Math.max(stats[c*2+1],value);}}
 try{
  if(gradient&&p.recompression!==undefined){
   requireValue(derived,'A derived Original-domain owner is required for gradient recompression.');
   recompression=await acquireSourceRegionRecompression({params:p,original,derived,view,domain,budget,signal,onProgress});
   derivativeView=createRecompressedSourceRegionView(view,domain,recompression.store,{budget,signal});
   key+='/recompression/'+recompression.codecPlan.identity;
  }
  if(gradient)cached=budget.get(key)?.value;
  const loaded=gradient?gradientHeapBytes():echoHeapBytes(),capacity=gradient?GRADIENT_HEAP_BYTES:ECHO_HEAP_BYTES;if(!gradient)echoPlan=echoRegionalExecutionPlan(derivativeView,domain,radius,{loadedHeapBytes:loaded});extraHeap=budget.reserve(gradient?Math.max(0,capacity-loaded):echoPlan.missingHeapBytes);if(cached)cacheLease=budget.reserve(cacheBytes);
  staging=budget.reserve(gradient?Math.max((128+2*radius)*(64+2*radius)*32,observedDerivativeWorkingBytes(128,radius,bpp))+131072+12288:echoPlan.stagingBytes);stats=new Float64Array(cached?.stats??(gradient?[0,0,Infinity,0,Infinity,0]:[Infinity,0,Infinity,0,Infinity,0]));if(gradient){stats[4]=Infinity;stats[5]=0;}
  output=await make(gradient?width*height*3:echoPlan.outputStoreBytes);scope=await make(gradient?width*height:echoPlan.scopeStoreBytes);if(gradient&&!cached){slopes=await make(analysed*bpp);if(cacheBytes<=budget.limit-budget.total()){cacheLease=budget.reserve(cacheBytes);cacheData=new Uint8Array(analysed*bpp);}}
  const group=gradient?Math.max(1,Math.floor(32768/width)):echoPlan.presentationRows;for(let y=0;y<height;y+=group){await cooperate();const h=Math.min(group,height-y),lease=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});let loanFailed=false,loanPrimary;try{await output.write(lease.pixels.data,y*width*3);}catch(error){loanFailed=true;loanPrimary=error;throw error;}finally{if(!gradient)await retireCompositeOwners([()=>lease.release()],loanFailed?{primary:loanPrimary,requireAck:true}:{requireAck:true});else lease.release();}const release=budget.reserve(width*h);try{await scope.write(new Uint8Array(width*h),y*width);}finally{release();}}
  if(!gradient){
   echoReadPlan=echoPlan.read;
   echoCache=cacheAllowed?acquireEchoDerivativeCache(budget,key,echoPlan.rawStoreBytes,echoReadPlan.additionalBytes):null;
   cached=echoCache?.hit??false;if(cached)stats.set(echoCache.limits);
   slopes=echoCache?.store??await make(echoPlan.rawStoreBytes);
  }
  let offset=0,completed=0;if(!cached){for(const core of cores()){
   await cooperate();checkAbort(signal);if(native16Echo)nativeEcho.assertCurrent();let bytes;
   if(core.observedBoundary){bytes=await sourceRegionObservedDerivatives(derivativeView,domain,core,{radius,gradient,method,signal,...(gradient?{cooperate}:{})});reads++;}
   else{const support=sourceRegionLocalSupport(domain,core,radius),lease=await derivativeView.readWindow(support,{signal});reads++;let loanFailed=false,loanPrimary;
    try{const native=gradient?await gradientDerivatives(lease.pixels,core.y-support.y,core.height,{signal,cooperate,method}):await echoDerivatives(lease.pixels,core.y-support.y,core.height,radius,{signal});bytes=new Uint8Array(core.width*core.height*bpp);if(native16Echo)requireValue(native.inputDepth===16&&native.rawKind===rawLayout.rawKind,'Echo16 returned another raw representation.');checkAbort(signal);for(let row=0;row<core.height;row++){const at=(row*support.width+core.x-support.x)*bpp;bytes.set(native.bytes.subarray(at,at+core.width*bpp),row*core.width*bpp);}}catch(error){loanFailed=true;loanPrimary=error;throw error;}finally{if(!gradient)await retireCompositeOwners([()=>lease.release()],loanFailed?{primary:loanPrimary,requireAck:true}:{requireAck:true});else lease.release();}
   }
   reduce(bytes);await slopes.write(bytes,offset);if(gradient)cacheData?.set(bytes,offset);offset+=bytes.length;completed+=core.width*core.height;onProgress?.({phase:'source-region-derivatives',fraction:.35*completed/analysed,observedBoundary:!!core.observedBoundary});
  }await slopes.flush();}
  if(gradient&&!krawetz&&p.mode===3){offset=0;for(const core of cores()){await cooperate();checkAbort(signal);const bytes=await raw(offset,core.width*core.height*bpp),limits=await gradientLengths(bytes,stats,p.invert,{signal,cooperate});stats[4]=Math.min(stats[4],limits[0]);stats[5]=Math.max(stats[5],limits[1]);offset+=bytes.length;onProgress?.({phase:'source-region-gradient-lengths',fraction:.35+.15*offset/(analysed*bpp)});}}
  const histogram=gradient?new Float64Array(768):null;offset=0;completed=0;for(const core of cores()){
   await cooperate();checkAbort(signal);const bytes=await raw(offset,core.width*core.height*bpp);let rendered;if(gradient){const native=await gradientRender(bytes,stats,p,analysed,{signal,cooperate});rendered=native.bytes;for(let i=0;i<768;i++)histogram[i]+=native.histogram[i];}else rendered=await echoRender(bytes,stats,p,analysed,{signal,...(native16Echo?{depth:16,rawKind:rawLayout.rawKind}:{})});await scatter(core,rendered);const ones=new Uint8Array(core.width).fill(1);for(let row=0;row<core.height;row++)await scope.write(ones,(core.y+row)*width+core.x);offset+=bytes.length;completed+=core.width*core.height;jobs++;onProgress?.({phase:'source-region-derivative-render',fraction:.5+.3*completed/analysed});
  }
  if(gradient&&(p.equalize||Math.trunc(p.intensity/100*127)>0)){const lut=gradientToneLut(histogram,analysed,p);completed=0;for(const core of cores()){await cooperate();checkAbort(signal);const bytes=new Uint8Array(core.width*core.height*3);for(let row=0;row<core.height;row++)await output.readInto(bytes.subarray(row*core.width*3,(row+1)*core.width*3),((core.y+row)*width+core.x)*3);await scatter(core,await gradientLut(bytes,lut,{signal,cooperate}));completed+=core.width*core.height;onProgress?.({phase:'source-region-gradient-tone',fraction:.8+.2*completed/analysed});}}
  await output.flush();await scope.flush();checkAbort(signal);if(!gradient){const rawOwner=slopes;slopes=null;await retireCompositeOwners([()=>rawOwner?.dispose()],{requireAck:true});}else{await slopes?.dispose();slopes=null;}cacheLease?.();cacheLease=null;if(cacheData){if(native16Echo)nativeEcho.assertCurrent();const baseStats=stats.slice();if(gradient){baseStats[4]=Infinity;baseStats[5]=0;}budget.put(key,{value:{bytes:cacheData,stats:baseStats},byteLength:cacheBytes},[task.imageId]);}
  if(echoCache){if(native16Echo)nativeEcho.assertCurrent();echoCache.commit(stats);echoCache.close();echoCache=null;}
  surface=createRgbSurface(output,{width,height,budget});scopeSurface=createMaskSurface(scope,{width,height,budget,range:[0,1],semantics:krawetz?'1=admitted Krawetz derivative centre; only available admitted neighbours participate;0=excluded original display background.':'1=admitted derivative centre, with explicit observed ROI boundary extension where needed;0=excluded original display background, not zero derivative.'});
  const nativeSemantics=krawetz?gradientSemantics(method):gradient?'Native Sobel luminance derivatives over every admitted centre, with observed centred-reflection ROI boundaries and one union-global directional/magnitude/length/histogram reduction.':'Native Echo coefficients, radius and '+(native16Echo&&rawLayout.rawKind==='int32'?'exact Int32':'FMA')+' derivatives over every admitted centre, with observed centred-reflection ROI boundaries and one union-global minimum/maximum per channel.',semantics=nativeSemantics+(recompression?' Derivatives consume one selected recompression of each admitted Original context; excluded observations and derivative boundary rules are unchanged.':''),metrics={...(gradient?{gradientMethod:method,reconstructedMethod:krawetz}:{}),...(recompression?{recompression:{...recompression.metrics,plan:recompression.codecPlan}}:{}),selectedPixels:domain.countIncluded,analysedPixels:analysed,unanalysablePixels:domain.countIncluded-analysed,completeSupportPixels:completePixels,boundaryPixels,halo:radius,jobs,sourceReads:reads,analysisCacheHit:!!cached,...(!gradient?{derivativeStore:'shared-echo-raw-store',regionalReadPlan:echoReadPlan}:{}),sourceRegionPolicy:krawetz?'krawetz-available-neighbours-local-direction-admitted-histogram':'native-derivatives-observed-boundaries-global-admitted-reduction',...(native16Echo?{inputDepth:16,sampleMaximum:65535,rawKind:rawLayout.rawKind,normalization:rawLayout.rawKind==='int32'?'exact-int32-to-float64-global-per-channel':'ordered-float32-global-per-channel'}:{})};
  // A native Echo caller receives the same common calculation before registry
  // publication. It owns both output records and the separate typed view.
  if(native16Echo){checkAbort(signal);nativeEcho.assertCurrent?.();const record={surface,maskRecords:{analysis_scope:{surface:scopeSurface}},semantics,metrics,provenance:{params:p,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-derivatives-global-extrema',selectionBoundary:'Missing native tap uses its admitted reflected opposite, otherwise the admitted centre.',presentationOutsideAnalysedSupport:'original-unanalysed',originalEncodedBytesPreserved:true}};published=true;return record;}
  const bundle=publishResult(task.imageId,{surface,maskRecords:{analysis_scope:{surface:scopeSurface}},semantics,metrics});published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,semantics,metrics,provenance:{params:p,...(gradient?{gradientMethod:method,reconstructedMethod:krawetz}:{}),...(recompression?{recompression:recompression.provenance}:{}),sourceRegionDomain:domain.descriptor,excludedParticipation:krawetz?'omitted-before-luminance-neighbour-differences-direction-amplitude-and-histograms':'omitted-before-derivatives-global-extrema-lengths-and-histograms',presentationOutsideAnalysedSupport:'original-unanalysed',nativeBorderGrid:'new-native-envelope',selectionBoundary:krawetz?'Unavailable or excluded neighbours are omitted before weighted centre differences. Every admitted centre is retained; no full-image context equivalence is asserted.':'Missing native tap uses its reflected opposite if admitted, otherwise its admitted centre. Complete-support derivatives are unchanged; no full-image context equivalence is asserted.',originalEncodedBytesPreserved:true}};
 }catch(error){failure=normalizeResourceError(error);if(!gradient&&failure!==error&&error?.cleanupOwner)failure=withRetirementOwner(failure,error.cleanupOwner,error);throw failure;}
 finally{
  if(!gradient){
   const owners=[slopes,...(!published?[surface??output,scopeSurface??scope]:[])].filter(Boolean),releaseCredits=()=>{echoCache?.close();echoCache=null;cacheLease?.();cacheLease=null;staging?.();staging=null;extraHeap?.();extraHeap=null;};
   // retireCompositeOwners may continue independent resources after a NACK.
   // Credits therefore form a separate barrier, never an action in that list.
   if(failure?.cleanupOwner)throw deferEchoDebt(failure,[...owners,releaseCredits]);
   try{await retireCompositeOwners(owners.map(owner=>()=>owner.dispose()),failure?{primary:failure,requireAck:true}:{requireAck:true});}
   catch(error){throw deferEchoDebt(error,[releaseCredits]);}
   releaseCredits();
  }else{
   cacheLease?.();staging?.();extraHeap?.();const cleanup=[];
   for(const owner of[slopes,...(!published?[surface??output,scopeSurface??scope]:[])])if(owner)try{await owner.dispose();}catch(error){cleanup.push(normalizeResourceError(error));}
   try{await recompression?.release();}catch(error){cleanup.push(normalizeResourceError(error));}
   if(cleanup.length){if(failure)failure.details={...failure.details,cleanupErrors:cleanup.map(({code,message})=>({code,message}))};else throw cleanup[0];}
  }
 }
}
