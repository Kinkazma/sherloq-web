// Experimental native implicit 7C target. No E-sized arrays or JS y copy.
import factory from './target-memory-bounded-kernel.mjs';
import {createFundedMemory,verifiedGrowthBinary} from './target-memory-bounded-growth.mjs';
import {createResidentArray} from '../engine/src/sherloq7c-resident-memory.js';
import {cooperator} from '../engine/src/sherloq7c-math.js';
const MiB=1024**2,page=65536;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const snapshot=value=>{const copy=structuredClone(value),freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};return freeze(copy);};
export function nativeMemoryTargetPlan(width,height,{rowCapacity=65536,solver='mixed'}={}){
 const pixels=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(pixels)||pixels>=2**31||!Number.isInteger(rowCapacity)||rowCapacity<8||rowCapacity>65536||(rowCapacity&(rowCapacity-1)))throw fail('INVALID_INPUT','Invalid native implicit target dimensions or row capacity.');
 const wasmMaximumBytes=Math.ceil((29*pixels+64*MiB)/page)*page;
 if(!['mixed','bgs'].includes(solver))throw fail('INVALID_INPUT','Unknown implicit solver.');
 if(wasmMaximumBytes>=2**32)throw fail('MEMORY_LIMIT','Implicit target exceeds its WASM32 heap plan.',{pixels,wasmMaximumBytes});
 return{pixels,wasmMaximumBytes,arenaBytes:Math.ceil((29*pixels+16*MiB)/page)*page,sourceBytes:6*pixels,exportBytes:4*pixels,sourceExportHeapMaximumBytes:10*pixels+wasmMaximumBytes,maximumExternalTransferBytes:Math.min(pixels,65536)*4,sourceExportHeapAndTransferMaximumBytes:10*pixels+wasmMaximumBytes+Math.min(pixels,65536)*4,transferBytes:Math.min(pixels,65536)*2,rowCapacity,solver};
}
export async function createNativeMemoryTarget(source,{reserve,registerBacking,signal,onProgress,rowCapacity=65536,blockWork=65536,solver='mixed',memoryReservation='dynamic',preconditioner='pairs',krylovVectors=3}={}){
 const {width,height}=source,plan=nativeMemoryTargetPlan(width,height,{rowCapacity,solver}),N=plan.pixels;let data=source.data;
 if(krylovVectors!==3)throw fail('INVALID_INPUT','Compact target requires three Krylov vectors.');
 if(preconditioner!=='pairs')throw fail('INVALID_INPUT','Compact target requires the bounded pair preconditioner.');
 if(!['dynamic','fixed'].includes(memoryReservation))throw fail('INVALID_INPUT','Unknown memory reservation mode.');
 if((!(data instanceof Uint16Array)&&typeof source.maxAt!=='function')||(data&&data.length!==3*N)||!Number.isInteger(blockWork)||blockWork<1||blockWork>65536)throw fail('INVALID_INPUT','Native RGB16 source required.');
 let funding,growthProof,transferLease,heapBacking,transferBacking,seedLease,seedBacking,constructionCleanup,m,memory,handle=0,busy=false,closed=false,retirementPending=false,solved=false,transitioned=false,projectInput=null,metrics=null,rootView=null,yView=null,infoView=null,nonrootBits=null,nonrootPrefix=null,parents=null,layout=0;
 const packedOwners=new WeakMap(),exportCleanups=new Set();
 const cooperate=cooperator(signal),read=()=>{const ptr=m._tm_info(handle)>>>0;if(!infoView||infoView.buffer!==m.HEAPU8.buffer)infoView=new Float64Array(m.HEAPU8.buffer,ptr,74);return infoView;};
 const noteHeap=()=>heapBacking?.resize?.(m?.HEAPU8.buffer.byteLength??memory.buffer.byteLength);
 const error=code=>fail(code===-3?'QUANTILE_AMBIGUOUS':code===-5?'TARGET_ROW_LIMIT':code===-4?'NUMERIC_RANGE':'MEMORY_ALLOCATION',code===-3?'Histogram intervals cannot certify the exact historical quantiles.':code===-5?'A local component block exceeds its bounded edge cache.':code===-4?'Native implicit target lost numerical feasibility.':'Native implicit target allocation failed.',{nativeStatus:code});
 const retireSeed=()=>{if(seedBacking){seedBacking();seedBacking=null;}if(seedLease){seedLease();seedLease=null;}};
 const retire=()=>{
  const errors=[],attempt=fn=>{try{fn();}catch(error){errors.push(error);}};
  if(constructionCleanup)attempt(()=>{constructionCleanup();constructionCleanup=null;});
  if(handle&&m)attempt(()=>{m._tm_destroy(handle);handle=0;});
  if(!handle){rootView=yView=infoView=nonrootBits=nonrootPrefix=parents=null;m=memory=data=source=null;
   if(heapBacking)attempt(()=>{heapBacking();heapBacking=null;});
   if(!heapBacking&&funding)attempt(()=>{funding.dispose();funding=null;});
  }
  if(transferBacking)attempt(()=>{transferBacking();transferBacking=null;});
  if(!transferBacking&&transferLease)attempt(()=>{transferLease();transferLease=null;});
  attempt(retireSeed);for(const cleanup of [...exportCleanups])attempt(cleanup);
  if(projectInput){if(projectInput.bank)attempt(()=>{projectInput.bank.dispose();projectInput.bank=null;});if(projectInput.releaseSource)attempt(()=>{projectInput.releaseSource();projectInput.releaseSource=null;});if(!projectInput.bank&&!projectInput.releaseSource){projectInput.state='retired';projectInput.levelSource=null;projectInput=null;}}
  if(errors.length){const first=errors[0];if(first&&typeof first==='object'&&Object.isExtensible(first)&&errors.length>1)try{first.cleanupErrors=errors.slice(1);}catch{}throw first;}
 };
 try{
  await cooperate();growthProof=await verifiedGrowthBinary(factory);funding=createFundedMemory({maximumBytes:plan.wasmMaximumBytes,mode:memoryReservation==='dynamic'&&growthProof.verified?'dynamic':'fixed',reserve,signal,onGrow:bytes=>heapBacking?.resize?.(bytes)});transferLease=reserve?.(plan.transferBytes)??(()=>{});
  memory=funding.memory;heapBacking=registerBacking?.('wasm',memory.buffer.byteLength,{identity:memory,owner:'7c-implicit-target',label:'native implicit global target'});m=await factory({wasmMemory:memory,wasmBinary:growthProof.bytes});funding.checkFailure();handle=m._tm_create(width,height,plan.wasmMaximumBytes,rowCapacity);funding.checkFailure();noteHeap();if(!handle)throw error(-1);
  let transfer=new Uint16Array(plan.transferBytes/2);transferBacking=registerBacking?.('array-buffer',transfer.byteLength,{identity:transfer.buffer,owner:'7c-implicit-target',label:'input level band'});const ptr=(m._tm_array(handle,0)>>>0)/2;
  for(let at=0;at<N;at+=transfer.length){const count=Math.min(transfer.length,N-at);for(let j=0;j<count;j++){const pixel=at+j,v=data?Math.max(data[3*pixel],data[3*pixel+1],data[3*pixel+2]):source.maxAt(pixel);if(!Number.isInteger(v)||v<0||v>65535)throw fail('INVALID_INPUT','maxAt must return an unsigned 16-bit level.');transfer[j]=v;}m.HEAPU16.set(transfer.subarray(0,count),ptr+at);await cooperate();}
  transfer=null;transferBacking?.();transferBacking=null;transferLease();transferLease=null;
  let status=0,prior=-1;while(status!==1){status=m._tm_prepare(handle,blockWork);funding.checkFailure();noteHeap();if(status<0)throw error(status);const info=read();if(info[0]!==prior){prior=info[0];onProgress?.({phase:'native-implicit-prepare',nativePhase:prior,components:info[1],edges:info[2]});}await cooperate();}
  data=source=null;const arenaBase=m._tm_array(handle,12)>>>0,arenaRange=(field,length,bytesPerElement)=>{const pointer=m._tm_array(handle,field)>>>0;return pointer?{offset:pointer-arenaBase,length,bytesPerElement,bytes:length*bytesPerElement}:null;};const info=read();const arenaLayout={level:arenaRange(0,N,2),root:arenaRange(1,N,4),target:arenaRange(2,info[1],8),step:arenaRange(14,info[1],4),residual:arenaRange(15,info[1],4),direction:arenaRange(16,info[1],4),curvatures:arenaRange(13,3*N,2),visited:arenaRange(17,Math.ceil(info[1]/8),1)};metrics={preparationBackend:'native-implicit-compact',arenaLayout,components:info[1],edges:info[2],sourceMin:info[3]/65535,sourceMax:info[4]/65535,median:info[5],weakScale:info[6],normalizer:info[7],legacyQuantilesCertified:!!info[17],exactQuantileTapeUsed:!!info[64],exactQuantileTapeBytes:info[65],exactQuantileScratchBytes:info[66],exactQuantileTemporaryBytes:info[67],exactQuantileAdditions:info[68],exactQuantileTerms:info[69],exactQuantileTotal:info[64]?info[72]:null,exactQuantileMetadataBytes:info[73],quantileReplayUsed:!!info[59],quantileReplayRuns:info[60],quantileReplayAdditions:info[61],quantileReplayTotal:info[59]?info[62]:null,quantileRunsUniform:info[60]?!!info[63]:null,quantileRoundoffGuard:info[18],singleton:!!info[21],graphLayout:['constant','identity','dense','bitmap-rank'][info[43]],nonrootPixels:info[44],nontrivialComponents:info[45],arenaBytes:info[46],arenaUsedBytes:info[47],graphBytes:info[49],stateVectorBytes:20*info[1],heapMaximumBytes:plan.wasmMaximumBytes,heapBytes:m.HEAPU8.buffer.byteLength,heapFunding:{...funding.stats(),proofVerified:growthProof.verified}};
 }catch(cause){if(typeof cause?.retryCleanup==='function')constructionCleanup=cause.retryCleanup;const primary=signal?.aborted&&cause?.code!=='CANCELLED'?fail('CANCELLED','Implicit target preparation cancelled.'):cause;let cleanup,failed=false;try{retire();}catch(error){cleanup=error;failed=true;}if(failed){const error=new AggregateError([primary,cleanup],'Implicit target preparation and retirement failed.',{cause:primary});error.code=primary?.code??'CLEANUP_FAILED';error.retryCleanup=()=>retire();throw error;}throw primary;}
 const open=()=>{if(closed||retirementPending)throw fail('DISPOSED','Implicit target is closed or awaiting retirement.');};
 const pop=bits=>{bits-=bits>>>1&0x55555555;bits=(bits&0x33333333)+(bits>>>2&0x33333333);return Math.imul((bits+(bits>>>4))&0x0f0f0f0f,0x01010101)>>>24;};
 const rankAt=pixel=>{const block=Math.floor(pixel/64),word=pixel>>>5,bit=pixel&31;return nonrootPrefix[block]+((word&1)?pop(nonrootBits[word-1]):0)+pop(nonrootBits[word]&(bit?0xffffffff>>>(32-bit):0));};
 const ownerAt=pixel=>layout===0?0:layout===1?pixel:rootView?(rootView[pixel]>=0?rootView[pixel]:pixel):((nonrootBits[pixel>>>5]>>>(pixel&31))&1)?parents[rankAt(pixel)]:pixel;
 const cidAt=root=>layout===0?0:layout===1?root:root-rankAt(root);
 const scalar=pixel=>yView[cidAt(ownerAt(pixel))];
 const result={width,height,plan,preparation:snapshot(metrics),
  async solve(micro,{maxError=.002,tolerance=2e-4,maxSweeps=1000,blockSize=16,innerSteps=8,signal,onProgress,profilePhases=false,initial,onInitialConsumed}={}){
   open();if(busy)throw fail('BUSY','Implicit target already running.');if(solved)throw fail('BUSY','An implicit target session owns one immutable result; create another session for a new target.');if(!(micro>=0&&micro<=1)||!(maxError===null||Number.isFinite(maxError)&&maxError>0)||!Number.isFinite(tolerance)||tolerance<=0||!Number.isInteger(maxSweeps)||maxSweeps<0||maxSweeps>1000000||!Number.isInteger(blockSize)||blockSize<1||blockSize>32||!Number.isInteger(innerSteps)||innerSteps<1||innerSteps>32)throw fail('INVALID_INPUT','Invalid implicit target solve options.');
   if(initial!==undefined&&(solver!=='mixed'||!(typeof initial==='function'||typeof initial?.get==='function'||(ArrayBuffer.isView(initial)&&initial.length===N))))throw fail('INVALID_INPUT','Initial seed requires mixed solver and a pixel function, resident bank, or native-length typed array.');
   if(onInitialConsumed!==undefined&&typeof onInitialConsumed!=='function')throw fail('INVALID_INPUT','onInitialConsumed must be a function.');
   const hasInitial=initial!==undefined,pause=cooperator(signal),start=performance.now();let readSeed=null,seedCopied=false,initialConsumed=false,solveFailed=false,solveError;const consumeInitial=async()=>{if(!hasInitial||initialConsumed)return;readSeed=null;initial=null;initialConsumed=true;const callback=onInitialConsumed;onInitialConsumed=null;await callback?.({copied:seedCopied,willReadAgain:false});};busy=true;
   try{await pause();const begin=m._tm_begin(handle,micro,maxError??-1,tolerance,maxSweeps,blockSize,innerSteps,solver==='mixed'?1:0,preconditioner==='sgs'?1:0,krylovVectors);funding.checkFailure();noteHeap();if(begin<0)throw error(begin);
    m._tm_seed(handle,0);
    if(hasInitial){readSeed=typeof initial==='function'?initial:typeof initial.get==='function'?i=>initial.get(i):i=>initial[i];const bytes=Math.min(N,65536)*4;let band,seedError,seedFailed=false;seedLease=reserve?.(bytes)??(()=>{});
     try{band=new Float32Array(bytes/4);seedBacking=registerBacking?.('array-buffer',band.byteLength,{identity:band.buffer,owner:'7c-implicit-target',label:'initial seed band'});const ptr=(m._tm_array(handle,6)>>>0)/4;for(let at=0;at<N;at+=band.length){const length=Math.min(band.length,N-at);for(let j=0;j<length;j++)band[j]=readSeed(at+j);m.HEAPF32.set(band.subarray(0,length),ptr);const status=m._tm_seed_band(handle,at,length);funding.checkFailure();if(status<0)throw error(status);await pause();}seedCopied=true;m._tm_seed(handle,1);}catch(error){seedError=error;seedFailed=true;}finally{band=null;readSeed=null;initial=null;}
     try{retireSeed();}catch(cleanup){retirementPending=true;if(seedFailed){const error=new AggregateError([seedError,cleanup],'Implicit target seed transfer and retirement failed.',{cause:seedError});error.code=seedError?.code??'CLEANUP_FAILED';throw error;}throw cleanup;}if(seedFailed)throw seedError;await consumeInitial();await pause();}
    let status=0,previous=-1;const history=[],phaseTimes={};let maximumNativeCallMs=0;
    while(status!==1){const phase=profilePhases?read()[8]:0,at=profilePhases?performance.now():0;status=m._tm_solve(handle,blockWork);if(profilePhases){const duration=performance.now()-at;phaseTimes[phase]=(phaseTimes[phase]??0)+duration;maximumNativeCallMs=Math.max(maximumNativeCallMs,duration);}funding.checkFailure();if(status<0)throw error(status);const info=read();if(info[9]!==previous){previous=info[9];const row={sweep:info[9],maxErrorBound:info[10],rmsErrorBound:info[11],state:info[8]};history.push(row);onProgress?.({phase:'native-implicit-target',...row});}await pause();}
    const info=read();metrics={...metrics,converged:!!info[13],maxErrorBound:info[10],rmsErrorBound:info[11],roundoffAllowance:info[12],sweeps:info[9],localNewtonSteps:info[14],blockSolves:info[15],coarseAccepted:info[16],incidentVisits:info[19],rowReplays:info[20],linearMaxErrorBound:info[24],nodeBarrierMaxErrorBound:info[25],seedProvided:!!info[41],seedAccepted:!!info[42],paletteCoefficientCache:!!info[51],uniqueLevels:info[52],coefficientCalls:info[39],coefficientHits:info[40],coefficientHitRate:info[39]?info[40]/info[39]:0,pairCacheReady:!!info[56],pairCacheBuilds:info[57],matchedPairVertices:info[58],curvatureCacheBits:info[35]?12:0,krylovVectors:info[36]?3:4,curvatureBuilds:info[37],curvatureRangeClamps:info[38],preconditioner:info[34]?'sgs':'pairs',warmupSkippedForWideBlock:!!info[33],knotIterations:info[30],cgIterations:info[26],residualRestarts:info[27],trueResidualChecks:info[28],solver:info[29]?'mixed':'bgs',elapsedMs:performance.now()-start,history,maximumNativeCallMs:profilePhases?maximumNativeCallMs:undefined,phaseTimes:profilePhases?phaseTimes:undefined,micro,workingPrecision:'float64',numericContract:'unique historical component pairs; original Float64 target and certificate',heapBytes:m.HEAPU8.buffer.byteLength,heapFunding:{...funding.stats(),proofVerified:growthProof.verified}};
    if(!metrics.converged)throw fail('NUMERIC_PRECISION','Implicit target did not reach the requested certificate.',metrics);
    layout=info[43];const rootPtr=m._tm_array(handle,1)>>>0,yPtr=m._tm_array(handle,2)>>>0;rootView=rootPtr?new Int32Array(m.HEAPU8.buffer,rootPtr,N):null;yView=new Float64Array(m.HEAPU8.buffer,yPtr,info[1]);if(layout>=2){nonrootBits=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,3)>>>0,2*info[48]);nonrootPrefix=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,4)>>>0,info[48]+1);if(layout===3)parents=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,5)>>>0,info[44]);}solved=true;result.metrics=snapshot(metrics);return result;
   }catch(error){solveFailed=true;solveError=error;throw error;}finally{busy=false;try{await consumeInitial();}catch(cleanup){if(solveFailed){const error=new AggregateError([solveError,cleanup],'Implicit solve and initial-seed release failed.',{cause:solveError});error.code=solveError?.code??'INITIAL_RELEASE_FAILED';throw error;}throw cleanup;}}
  },
  scalarAt(pixel){open();if(!solved||transitioned)throw fail('NOT_READY','Implicit target is not certified.');if(!Number.isSafeInteger(pixel)||pixel<0||pixel>=N)throw fail('INVALID_INPUT','Invalid implicit target pixel.');return scalar(pixel);},
  async exportTarget({budget,levelSource,signal,segmentBytes=32*MiB}={}){
   open();if(!solved||busy||transitioned)throw fail('NOT_READY','A certified immutable target is required for export.');
   if(!levelSource?.immutable||typeof levelSource.retain!=='function'||typeof levelSource.maxAt!=='function'||levelSource.width!==width||levelSource.height!==height)throw fail('INVALID_INPUT','Feasible packing requires a retained immutable RGB16 source.');
   const pause=cooperator(signal);let bank,releaseSource;busy=true;
   try{
    releaseSource=levelSource.retain();let status=m._tm_pack_begin(handle);funding.checkFailure();noteHeap();if(status<0)throw fail('MEMORY_ALLOCATION','Cannot initialize feasible packing.');
    while(status!==1){status=m._tm_pack_step(handle,blockWork);if(status<0)throw fail('NUMERIC_PRECISION','Feasible packing failed original constraints.',{nativeStatus:status});await pause();}
    const info=read(),buffer=m.HEAPU8.buffer;layout=info[43];const rootPtr=m._tm_array(handle,1)>>>0;rootView=rootPtr?new Int32Array(buffer,rootPtr,N):null;yView=new Float64Array(buffer,m._tm_array(handle,2)>>>0,info[1]);
    if(layout>=2){nonrootBits=new Uint32Array(buffer,m._tm_array(handle,3)>>>0,2*info[48]);nonrootPrefix=new Uint32Array(buffer,m._tm_array(handle,4)>>>0,info[48]+1);if(layout===3)parents=new Uint32Array(buffer,m._tm_array(handle,5)>>>0,info[44]);}
    const codes=new Uint32Array(buffer,m._tm_array(handle,18)>>>0,info[1]),levels=new Uint16Array(buffer,m._tm_array(handle,0)>>>0,N);
    bank=await createResidentArray(Uint32Array,N,{budget,signal,segmentBytes,label:'feasible packed 7C target'});let at=0;
    for(const segment of bank.segments)for(let j=0;j<segment.length;j++,at++){if(levelSource.maxAt(at)!==levels[at])throw fail('INVALID_INPUT','Packed source differs from certified source.');segment[j]=codes[cidAt(ownerAt(at))];if((j&65535)===0)await pause();}
    const quantizationBound=m._tm_pack_info(handle,0)+2*Number.EPSILON,slope=.1+2**-32,owner={bank,releaseSource,levelSource,state:'live',micro:metrics.micro,bound:metrics.maxErrorBound+quantizationBound};
    const packed={width,height,storage:'uint32-affine-feasible',byteLength:4*N,metrics:snapshot({...metrics,packingErrorBound:quantizationBound,edgeFeasibilityPreserved:true,packingMinimumMargin:m._tm_pack_info(handle,1),maxErrorBound:owner.bound}),
     codeAt(i){if(owner.state!=='live')throw fail('DISPOSED','Packed target was released or consumed.');return owner.bank.get(i);},
     scalarAt(i){if(owner.state!=='live')throw fail('DISPOSED','Packed target was released or consumed.');return owner.bank.get(i)/2147483648-slope+slope*(owner.levelSource.maxAt(i)/65535);},
     release(){if(owner.state==='retired'||owner.state==='consumed')return;owner.state='retiring';if(owner.bank){owner.bank.dispose();owner.bank=null;}if(owner.releaseSource){owner.releaseSource();owner.releaseSource=null;}owner.levelSource=null;owner.state='retired';}};
    packedOwners.set(packed,owner);return packed;
   }catch(error){const cleanup=()=>{if(bank){bank.dispose();bank=null;}if(releaseSource){releaseSource();releaseSource=null;}exportCleanups.delete(cleanup);};try{cleanup();}catch(cleanupError){exportCleanups.add(cleanup);error.cleanupError=cleanupError;error.retryCleanup=cleanup;}throw error;}finally{busy=false;}
  },
  async replaceTarget(micro,options={}){
   open();if(busy||transitioned||!solved)throw fail('BUSY','Only an unborrowed completed native target can be replaced.');
   solved=false;rootView=yView=nonrootBits=nonrootPrefix=parents=null;return result.solve(micro,options);
  },
  // Consumes the external Tb bank into trial codes. The same native arena then
  // receives Tb, trial and the forest; no second pixel bank or heap is admitted.
  async projectWithPacked(tb,{revelation=.5,precision='1e-2',signal,onProgress}={}){
   open();if(busy||!solved||transitioned||metrics.micro!==0)throw fail('NOT_READY','A certified zero-micro target is required.');
   const owner=packedOwners.get(tb);if(owner?.state!=='live'||!(revelation>=0&&revelation<1)||!['reference','1e-2','1e-4','1e-7'].includes(precision))throw fail('INVALID_INPUT','Matching live packed target and finite precision required.');
   const pause=cooperator(signal),started=performance.now(),zeroBound=metrics.maxErrorBound,targetBound=owner.bound,trialPackingBound=2**-31+4*Number.EPSILON;
   const allowance=precision==='reference'?Infinity:Number(precision)-targetBound-(1-revelation)*(zeroBound+trialPackingBound);if(!(allowance>0))throw fail('NUMERIC_PRECISION','Target certificates consume requested precision.');
   busy=true;transitioned=true;owner.state='consumed';projectInput=owner;tb=null;
   try{await pause();
    if(m._tm_project_prepare(handle)!==0)throw fail('NOT_READY','Cannot stage native projection.');
    const band=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,6)>>>0,65536);
    for(let first=0;first<N;first+=65536){const length=Math.min(65536,N-first),view=band.subarray(0,length);owner.bank.readInto(view,first);if(m._tm_project_band(handle,first,length)!==0)throw fail('NUMERIC_RANGE','Cannot construct packed projection trial.');owner.bank.write(view,first);await pause();}
    if(m._tm_project_relayout(handle)!==0)throw fail('MEMORY_OWNERSHIP','Cannot transition native projection arena.');rootView=yView=nonrootBits=nonrootPrefix=parents=null;
    for(let first=0;first<N;first+=65536){const length=Math.min(65536,N-first);owner.bank.readInto(band.subarray(0,length),first);if(m._tm_project_trial_band(handle,first,length)!==0)throw fail('MEMORY_OWNERSHIP','Cannot import projection trial.');await pause();}
    owner.bank.dispose();owner.bank=null;
    let status=m._tm_project_begin(handle,revelation,allowance*.95/(1-revelation)),previous=-1,calls=0,maximumNativeCallMs=0;
    if(status<0)throw fail('INVALID_INPUT','Native forest rejected its arena.');
    while(status===0){await pause();const at=performance.now();status=m._tm_project_step(handle,blockWork);maximumNativeCallMs=Math.max(maximumNativeCallMs,performance.now()-at);calls++;const info=new Float64Array(m.HEAPU8.buffer,m._tm_project_info(handle)>>>0,16);if(info[11]!==previous){previous=info[11];onProgress?.({phase:'native-pixel-projection',nativePhase:previous,pivots:info[3]});}}
    let info=new Float64Array(m.HEAPU8.buffer,m._tm_project_info(handle)>>>0,16);if(status<0)throw fail('NUMERIC_PRECISION','Native forest did not certify its result.',{status,phase:info[11],reason:info[12],certificateMax:info[6]});
    status=0;while(status===0){status=m._tm_project_check(handle,blockWork);if(status<0)throw fail('NUMERIC_PRECISION','Final blend violates original constraints.');await pause();}
    info=new Float64Array(m.HEAPU8.buffer,m._tm_project_info(handle)>>>0,16);const bound=targetBound+(1-revelation)*(zeroBound+trialPackingBound+info[6]);if(!Number.isFinite(bound)||precision!=='reference'&&!(bound<=Number(precision)))throw fail('NUMERIC_PRECISION','Combined result misses requested precision.');
    const projection={backend:'native-pixel-equality-forest',maximumPivots:Math.max(1000000,Math.min(0xffffffff,16*N)),components:info[0],largestComponent:info[1],equalityEdges:info[2],pivots:info[3],cuts:info[4],passes:info[5],certificateMax:info[6],certificateRMS:info[7],minimumMargin:info[8],gap:info[9],acceptedByCertificate:!!info[10],totalTreeVisits:info[14],dependentSteps:info[15],calls,maximumNativeCallMs,workspaceBytes:18*N,algorithmOwnedAllocationBytes:0};
    const finalMetrics={...metrics,backend:'native-compact-target-forest-arena',micro:owner.micro,zeroMicro:0,projection,maxErrorBound:bound,targetBound,zeroBound,trialPackingBound,minimumMargin:info[13],projectionElapsedMs:performance.now()-started,heapBytes:m.HEAPU8.buffer.byteLength,forestPayloadBytes:18*N,forestNewBackingBytes:0};result.metrics=snapshot(finalMetrics);
    return{width,height,metrics:snapshot(finalMetrics),scalarAt(i){open();if(!Number.isSafeInteger(i)||i<0||i>=N)throw fail('INVALID_INPUT','Invalid projected pixel.');return m._tm_project_value(handle,i);},dispose(){result.dispose();}};
   }finally{busy=false;}
  },
  dispose(){if(closed)return;if(busy)throw fail('BUSY','Await native target cancellation before disposal.');retirementPending=true;retire();closed=true;retirementPending=false;},
  memory(){return{closed,busy,solved,retirementPending,heapMaximumBytes:plan.wasmMaximumBytes,heapBytes:m?.HEAPU8.buffer.byteLength??funding?.stats().materializedBytes??0,accountedHeapBytes:funding?.stats().reservedBytes??0};}
 };return result;
}
