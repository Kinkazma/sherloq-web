import {brandPackedZero,borrowPackedZero,deferPackedZeroRelease,notePackedZeroRetired,expandPackedZero16,zero16Scale} from './target-zero-cache-private.mjs';
// Experimental native implicit 7C target. No E-sized arrays or JS y copy.
import factory from './target-memory-ringcert-general-kernel.mjs';
import {createFundedMemory,verifiedGrowthBinary} from './target-memory-ringcert-general-growth.mjs';
import {createResidentArray} from '../engine/src/sherloq7c-resident-memory.js';
import {cooperator} from '../engine/src/sherloq7c-math.js';
import {projectNativeComponents,componentProjectionReservationBytes} from './component-projection.mjs';
const MiB=1024**2,page=65536;
const pixelCidMapDiagnostic=info=>({requested:!!info[168],ready:!!info[169],complete:!!info[170],bytes:info[171],builds:info[172],rootReads:info[173],ownerReads:info[174],refusals:info[175],lastRefusal:info[176],completedPixels:info[177],reuseHits:info[178],minimumNativeIc0Footprint:info[179],releases:info[180],decided:!!info[181],extraBytesPerPixel:info[171]?4:0,scientificArithmeticUnchanged:true});
// Research diagnostics of the last committed Newton step, not a certificate.
const newtonStepDiagnostic=info=>info[99]>0?{sweep:info[99],endpointRate:info[100],feasibleRate:info[101],acceptedRate:info[102],backtracks:info[103],maxAbsStep:info[104],limitingLo:info[105],limitingHi:info[106],limitingSlack:info[107],limitingDs:info[108],limitingCountLo:info[109],limitingCountHi:info[110],limitingStepLo:info[111],limitingStepHi:info[112],limitingSourceDifference:info[113],gradientSquaredNorm:info[114],cgSquaredThreshold:info[115],trueResidualSquaredNorm:info[116],recursiveResidualSquaredNorm:info[117],cgIterations:info[118],restarts:info[119],directionalDerivative:info[120],objectiveDifference:Number.isFinite(info[121])?info[121]:null,objectiveDifferenceKind:Number.isFinite(info[121])?'evaluated-log1p':'not-evaluated-taylor-bound',certificateRmsBeforeStep:info[122],forcingRetries:info[123],weightedTrueResidualSquaredNorm:info[124],weightedCgSquaredThreshold:info[125],firstFeasibleRate:info[126],firstWeightedTrueResidualSquaredNorm:info[127],initialCgSquaredThreshold:info[128],trueResidualOrigin:info[129],cgIterationsBeforeForcing:info[130]}:null;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const cleanupFailure=(error,cleanupError,retryCleanup)=>{const failure=error&&typeof error==='object'&&Object.isExtensible(error)?error:Object.assign(new AggregateError([error,cleanupError],'Native target operation and retirement failed.',{cause:error}),{code:error?.code??'CLEANUP_FAILED'});failure.cleanupError=cleanupError;failure.retryCleanup=retryCleanup;return failure;};
const snapshot=value=>{const copy=structuredClone(value),freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};return freeze(copy);};
export function nativeMemoryTargetPlan(width,height,{rowCapacity=65536,solver='mixed',maximumHeapBytes,approximateNewtonSteps=0,relativeRmsTolerance=0}={}){
 if(!Number.isInteger(approximateNewtonSteps)||approximateNewtonSteps<0||approximateNewtonSteps>1000000)throw fail('INVALID_INPUT','Fixed Newton cap must be0 or a positive integer no larger than1000000.');
 if(approximateNewtonSteps>0&&relativeRmsTolerance!==0)throw fail('INVALID_INPUT','Fixed Newton cap cannot be combined with a relative RMS request.');
 const pixels=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(pixels)||pixels>=2**31||!Number.isInteger(rowCapacity)||rowCapacity<8||rowCapacity>65536||(rowCapacity&(rowCapacity-1)))throw fail('INVALID_INPUT','Invalid native implicit target dimensions or row capacity.');
 if(maximumHeapBytes!==undefined&&(!Number.isSafeInteger(maximumHeapBytes)||maximumHeapBytes<=0||maximumHeapBytes>2**32))throw fail('INVALID_INPUT','Explicit native heap cap must be a positive integer no larger than WASM32.');
 const defaultWasmMaximumBytes=Math.min(2**32-page,Math.ceil((245*pixels+64*MiB)/page)*page),wasmMaximumBytes=maximumHeapBytes===undefined?defaultWasmMaximumBytes:Math.min(defaultWasmMaximumBytes,Math.floor(maximumHeapBytes/page)*page),arenaBytes=Math.ceil((29*pixels+16*MiB)/page)*page;
 if(wasmMaximumBytes<Math.max(16*MiB,arenaBytes))throw fail('MEMORY_LIMIT','Explicit native heap cap cannot admit the target arena.',{maximumHeapBytes,wasmMaximumBytes,arenaBytes});
 if(!['mixed','bgs'].includes(solver))throw fail('INVALID_INPUT','Unknown implicit solver.');
 if(approximateNewtonSteps>0&&solver!=='mixed')throw fail('INVALID_INPUT','Fixed Newton cap requires the mixed Newton solver.');
 if(wasmMaximumBytes>=2**32)throw fail('MEMORY_LIMIT','Implicit target exceeds its WASM32 heap plan.',{pixels,wasmMaximumBytes});
 return{pixels,wasmMaximumBytes,requestedHeapMaximumBytes:maximumHeapBytes??null,arenaBytes,sourceBytes:6*pixels,exportBytes:(approximateNewtonSteps>0?8:4)*pixels,sourceExportHeapMaximumBytes:(approximateNewtonSteps>0?14:10)*pixels+wasmMaximumBytes,maximumExternalTransferBytes:Math.min(pixels,65536)*4,sourceExportHeapAndTransferMaximumBytes:(approximateNewtonSteps>0?14:10)*pixels+wasmMaximumBytes+Math.min(pixels,65536)*4,transferBytes:Math.min(pixels,65536)*2,rowCapacity,solver};
}
export async function createNativeMemoryTarget(source,{reserve,registerBacking,availableBytes,notifyBackingRelease,signal,onProgress,rowCapacity=65536,blockWork=65536,solver='mixed',memoryReservation='dynamic',preconditioner='auto',krylovVectors=3,beforeNativeAdmission,maximumHeapBytes,approximateNewtonSteps=0,relativeRmsTolerance=0}={}){
 let sourceIdentity=source;
 const {width,height}=source,plan=nativeMemoryTargetPlan(width,height,{rowCapacity,solver,maximumHeapBytes,approximateNewtonSteps,relativeRmsTolerance}),N=plan.pixels,defaultApproximateNewtonSteps=approximateNewtonSteps;let data=source.data;
 if(krylovVectors!==3)throw fail('INVALID_INPUT','Compact target requires three Krylov vectors.');
 if(!['auto','pairs','sgs'].includes(preconditioner))throw fail('INVALID_INPUT','Unknown bounded preconditioner.');
 if(!['dynamic','fixed'].includes(memoryReservation))throw fail('INVALID_INPUT','Unknown memory reservation mode.');
 if((!(data instanceof Uint16Array)&&typeof source.maxAt!=='function')||(data&&data.length!==3*N)||!Number.isInteger(blockWork)||blockWork<1||blockWork>65536)throw fail('INVALID_INPUT','Native RGB16 source required.');
 let initializerEpoch=0;
 let privateCertificate=null;
 let funding,growthProof,transferLease,heapBacking,retiredHeapBytes=0,transferBacking,seedLease,seedBacking,constructionCleanup,m,memory,handle=0,busy=false,closed=false,retirementPending=false,solved=false,solveStarted=false,transitioned=false,projectInput=null,metrics=null,rootView=null,yView=null,infoView=null,nonrootBits=null,nonrootPrefix=null,parents=null,layout=0,seedBorrow=null;
 const packedOwners=new WeakMap(),componentSeeds=new WeakMap(),compactExports=new Set(),exportCleanups=new Set(),initializerViewRetirements=new Set();let componentBase=null;
 const retireInitializerViews=()=>{for(const retireViews of initializerViewRetirements)retireViews();initializerViewRetirements.clear();};
 const cooperate=cooperator(signal),read=()=>{const ptr=m._tm_info(handle)>>>0;if(!infoView||infoView.buffer!==m.HEAPU8.buffer)infoView=new Float64Array(m.HEAPU8.buffer,ptr,206);return infoView;};
 const noteHeap=()=>heapBacking?.resize?.(m?.HEAPU8.buffer.byteLength??memory.buffer.byteLength);
 const error=code=>fail(code===-3?'QUANTILE_AMBIGUOUS':code===-5?'TARGET_ROW_LIMIT':code===-4?'NUMERIC_RANGE':'MEMORY_ALLOCATION',code===-3?'Histogram intervals cannot certify the exact historical quantiles.':code===-5?'A local component block exceeds its bounded edge cache.':code===-4?'Native implicit target lost numerical feasibility.':'Native implicit target allocation failed.',{nativeStatus:code});
 const retireSeed=()=>{if(seedBacking){seedBacking();seedBacking=null;}if(seedLease){seedLease();seedLease=null;}};
 const retire=()=>{
  retireInitializerViews();
  const errors=[],attempt=fn=>{try{fn();}catch(error){errors.push(error);}};
  if(seedBorrow)attempt(()=>seedBorrow.api.release());
  if(componentBase)attempt(()=>{componentBase.dispose();componentBase=null;});
  if(projectInput?.kind==='components')attempt(()=>projectInput.graph.releaseViews());
  if(constructionCleanup)attempt(()=>{constructionCleanup();constructionCleanup=null;});
  if(handle&&m)attempt(()=>{m._tm_destroy(handle);handle=0;});
  if(!handle){rootView=yView=infoView=nonrootBits=nonrootPrefix=parents=null;m=memory=data=source=sourceIdentity=null;
   if(heapBacking)attempt(()=>{const actual=funding?.stats().materializedBytes??0,retired=heapBacking();retiredHeapBytes=retired??actual;heapBacking=null;});
   if(!heapBacking&&funding)attempt(()=>{funding.dispose();funding=null;});
   // Registration retirement alone is insufficient: funded memory still owns
   // the WebAssembly.Memory until disposal acknowledges its references/leases.
   // Preserve this extent across a refused disposal and announce it only once.
   if(!heapBacking&&!funding&&retiredHeapBytes)attempt(()=>{notifyBackingRelease?.('wasm',retiredHeapBytes);retiredHeapBytes=0;});
  }
  if(transferBacking)attempt(()=>{transferBacking();transferBacking=null;});
  if(!transferBacking&&transferLease)attempt(()=>{transferLease();transferLease=null;});
  attempt(retireSeed);for(const cleanup of [...exportCleanups])attempt(cleanup);
  if(projectInput){if(projectInput.bank)attempt(()=>{projectInput.bank.dispose();projectInput.bank=null;});if(projectInput.releaseSource)attempt(()=>{projectInput.releaseSource();projectInput.releaseSource=null;});if(!projectInput.bank&&!projectInput.releaseSource){projectInput.state='retired';projectInput.levelSource=null;projectInput=null;}}
  if(errors.length){const first=errors[0];if(first&&typeof first==='object'&&Object.isExtensible(first)&&errors.length>1)try{first.cleanupErrors=errors.slice(1);}catch{}throw first;}
 };
 try{
  await cooperate();growthProof=await verifiedGrowthBinary(factory);funding=createFundedMemory({maximumBytes:plan.wasmMaximumBytes,mode:memoryReservation==='dynamic'&&growthProof.verified?'dynamic':'fixed',reserve,signal,onGrow:bytes=>heapBacking?.resize?.(bytes)});transferLease=reserve?.(plan.transferBytes)??(()=>{});
  memory=funding.memory;heapBacking=registerBacking?.('wasm',memory.buffer.byteLength,{identity:memory,owner:'7c-implicit-target',label:'native implicit global target'});m=await factory({wasmMemory:memory,wasmBinary:growthProof.bytes,sherloqBudgetAvailable:()=>availableBytes?.()??0});funding.checkFailure();handle=m._tm_create(width,height,plan.wasmMaximumBytes,rowCapacity);funding.checkFailure();noteHeap();if(!handle)throw error(-1);
  let transfer=new Uint16Array(plan.transferBytes/2);transferBacking=registerBacking?.('array-buffer',transfer.byteLength,{identity:transfer.buffer,owner:'7c-implicit-target',label:'input level band'});const ptr=(m._tm_array(handle,0)>>>0)/2;
  for(let at=0;at<N;at+=transfer.length){const count=Math.min(transfer.length,N-at);for(let j=0;j<count;j++){const pixel=at+j,v=data?Math.max(data[3*pixel],data[3*pixel+1],data[3*pixel+2]):source.maxAt(pixel);if(!Number.isInteger(v)||v<0||v>65535)throw fail('INVALID_INPUT','maxAt must return an unsigned 16-bit level.');transfer[j]=v;}m.HEAPU16.set(transfer.subarray(0,count),ptr+at);await cooperate();}
  transfer=null;transferBacking?.();transferBacking=null;transferLease();transferLease=null;
  let status=0,prior=-1;while(status!==1){status=m._tm_prepare(handle,blockWork);funding.checkFailure();noteHeap();if(status<0)throw error(status);const info=read();if(info[0]!==prior){prior=info[0];onProgress?.({phase:'native-implicit-prepare',nativePhase:prior,components:info[1],edges:info[2]});}await cooperate();}
  data=source=null;const arenaBase=m._tm_array(handle,12)>>>0,arenaRange=(field,length,bytesPerElement)=>{const pointer=m._tm_array(handle,field)>>>0;return pointer?{offset:pointer-arenaBase,length,bytesPerElement,bytes:length*bytesPerElement}:null;};const info=read();const arenaLayout={level:arenaRange(0,N,2),root:arenaRange(1,N,4),target:arenaRange(2,info[1],8),step:arenaRange(14,info[1],4),residual:arenaRange(15,info[1],4),direction:arenaRange(16,info[1],4),curvatures:arenaRange(13,3*N,2),visited:arenaRange(17,Math.ceil(info[1]/8),1)};metrics={preparationBackend:'native-implicit-compact',arenaLayout,components:info[1],edges:info[2],sourceMin:info[3]/65535,sourceMax:info[4]/65535,median:info[5],weakScale:info[6],minNeighborGap:info[167]>0?info[167]/65535:null,minNeighborGapCodes:info[167],normalizer:info[7],legacyQuantilesCertified:!!info[17],exactQuantileTapeUsed:!!info[64],exactQuantileTapeBytes:info[65],exactQuantileScratchBytes:info[66],exactQuantileTemporaryBytes:info[67],exactQuantileAdditions:info[68],exactQuantileTerms:info[69],exactQuantileTotal:info[64]?info[72]:null,exactQuantileMetadataBytes:info[73],quantileReplayUsed:!!info[59],quantileReplayRuns:info[60],quantileReplayAdditions:info[61],quantileReplayTotal:info[59]?info[62]:null,quantileRunsUniform:info[60]?!!info[63]:null,quantileRoundoffGuard:info[18],singleton:!!info[21],graphLayout:['constant','identity','dense','bitmap-rank'][info[43]],nonrootPixels:info[44],nontrivialComponents:info[45],arenaBytes:info[46],arenaUsedBytes:info[47],graphBytes:info[49],massPaletteEntries:info[92],massPaletteBytes:info[93],massPaletteOverflow:!!info[96],stateVectorBytes:20*info[1],heapMaximumBytes:plan.wasmMaximumBytes,requestedHeapMaximumBytes:plan.requestedHeapMaximumBytes,heapBytes:m.HEAPU8.buffer.byteLength,heapFunding:{...funding.stats(),proofVerified:growthProof.verified}};
 }catch(cause){if(typeof cause?.retryCleanup==='function')constructionCleanup=cause.retryCleanup;const primary=signal?.aborted&&cause?.code!=='CANCELLED'?fail('CANCELLED','Implicit target preparation cancelled.'):cause;let cleanup,failed=false;try{retire();}catch(error){cleanup=error;failed=true;}if(failed){const error=new AggregateError([primary,cleanup],'Implicit target preparation and retirement failed.',{cause:primary});error.code=primary?.code??'CLEANUP_FAILED';error.retryCleanup=()=>retire();throw error;}throw primary;}
 const open=()=>{if(closed||retirementPending)throw fail('DISPOSED','Implicit target is closed or awaiting retirement.');};
 const pop=bits=>{bits-=bits>>>1&0x55555555;bits=(bits&0x33333333)+(bits>>>2&0x33333333);return Math.imul((bits+(bits>>>4))&0x0f0f0f0f,0x01010101)>>>24;};
 const rankAt=pixel=>{const block=Math.floor(pixel/64),word=pixel>>>5,bit=pixel&31;return nonrootPrefix[block]+((word&1)?pop(nonrootBits[word-1]):0)+pop(nonrootBits[word]&(bit?0xffffffff>>>(32-bit):0));};
 const ownerAt=pixel=>layout===0?0:layout===1?pixel:rootView?(rootView[pixel]>=0?rootView[pixel]:pixel):((nonrootBits[pixel>>>5]>>>(pixel&31))&1)?parents[rankAt(pixel)]:pixel;
 const cidAt=root=>layout===0?0:layout===1?root:root-rankAt(root);
 const scalar=pixel=>yView[cidAt(ownerAt(pixel))];
 // Read existing native partition/linked boundary lists. Views are rebound
 // after memory growth; this object never materializes a pixel label copy.
 const componentGraph=()=>{
  const C=metrics.components,kind=layout;
  if(C>64||C<1)return null;
  if(kind!==0&&kind!==1&&(!(m._tm_array(handle,21)>>>0)||kind===2&&!(m._tm_array(handle,22)>>>0)))return null;
  let graphClosed=false,buffer,levels,roots,dense,nextDense,bits,prefix,parent,special,specialPrefix,counts,heads,nextSparse;
  const refresh=()=>{open();if(graphClosed)throw fail('DISPOSED','Compact graph views were retired.');if(buffer===m.HEAPU8.buffer)return;buffer=m.HEAPU8.buffer;
   const view=(Type,field,length)=>{const pointer=m._tm_array(handle,field)>>>0;return pointer?new Type(buffer,pointer,length):null;};
   levels=view(Uint16Array,0,N);roots=view(Uint32Array,21,C);
   if(kind>=2){bits=view(Uint32Array,3,2*Math.ceil(N/64));prefix=view(Uint32Array,4,Math.ceil(N/64)+1);}
   if(kind===2){dense=view(Int32Array,1,N);nextDense=view(Uint32Array,22,N);}
   if(kind===3){parent=view(Uint32Array,5,metrics.nonrootPixels);special=view(Uint32Array,7,2*Math.ceil(N/64));specialPrefix=view(Uint32Array,8,Math.ceil(N/64)+1);counts=view(Uint32Array,9,metrics.nontrivialComponents);heads=view(Uint32Array,10,metrics.nontrivialComponents);nextSparse=view(Uint32Array,11,metrics.nonrootPixels);}
  };
  const marked=(bank,i)=>(bank[i>>>5]>>>(i&31))&1;
  const rank=(bank,pref,i)=>pref[Math.floor(i/64)]+((i>>>5)&1?pop(bank[(i>>>5)-1]):0)+pop(bank[i>>>5]&((i&31)?0xffffffff>>>(32-(i&31)):0));
  const componentAt=i=>{refresh();if(kind===0)return 0;if(kind===1)return i;const r=kind===2?(dense[i]<0?i:dense[i]):marked(bits,i)?parent[rank(bits,prefix,i)]:i;return r-rank(bits,prefix,r);};
  return {components:C,edges:metrics.edges,componentAt,
   releaseViews(){graphClosed=true;buffer=levels=roots=dense=nextDense=bits=prefix=parent=special=specialPrefix=counts=heads=nextSparse=null;},
   rootAt(c){refresh();return kind===0?0:kind===1?c:roots[c];},
   levelAt(i){refresh();return levels[i];},
   countAt(r){refresh();return kind===0?N:kind===1?1:kind===2?-dense[r]:marked(special,r)?counts[rank(special,specialPrefix,r)]:1;},
   nextMember(i){refresh();return kind<2?0xffffffff:kind===2?nextDense[i]:marked(bits,i)?nextSparse[rank(bits,prefix,i)]:marked(special,i)?heads[rank(special,specialPrefix,i)]:0xffffffff;}
  };
 };
 const result={width,height,plan,preparation:snapshot(metrics),
  initializerGraph(){
   open();if(busy||transitioned)throw fail('BUSY','Native initializer topology is unavailable.');
   const epoch=initializerEpoch;let viewsRetired=false,buffer,kind,root,bits,prefix,parent,special,specialPrefix,counts,levels;
   const retireViews=()=>{viewsRetired=true;buffer=kind=root=bits=prefix=parent=special=specialPrefix=counts=levels=null;};initializerViewRetirements.add(retireViews);
   const refresh=()=>{open();if(viewsRetired||busy||transitioned||epoch!==initializerEpoch)throw fail('NOT_READY','Native initializer graph epoch expired.');if(buffer===m.HEAPU8.buffer)return;buffer=m.HEAPU8.buffer;const info=read();kind=info[43];const view=(T,field,length)=>{const p=m._tm_array(handle,field)>>>0;return p?new T(buffer,p,length):null;};
    levels=view(Uint16Array,0,N);root=view(Int32Array,1,N);if(kind>=2){bits=view(Uint32Array,3,2*info[48]);prefix=view(Uint32Array,4,info[48]+1);}
    if(kind===3){parent=view(Uint32Array,5,info[44]);special=view(Uint32Array,7,2*info[48]);specialPrefix=view(Uint32Array,8,info[48]+1);counts=view(Uint32Array,9,info[45]);}
   };
   const rank=(b,p,i)=>p[Math.floor(i/64)]+((i>>>5)&1?pop(b[(i>>>5)-1]):0)+pop(b[i>>>5]&((i&31)?0xffffffff>>>(32-(i&31)):0));
   return{readLevelSpan(target,first=0){refresh();if(!(target instanceof Uint16Array)||!Number.isSafeInteger(first)||first<0||first>N-target.length||target.buffer===m.HEAPU8.buffer)throw fail('INVALID_INPUT','Native level copies require an independent Uint16 span.');target.set(levels.subarray(first,first+target.length));return target;},
    ownerAt(i){refresh();if(kind===0)return 0;if(kind===1)return i;if(kind===2)return root[i]<0?i:root[i];return (bits[i>>>5]>>>(i&31))&1?parent[rank(bits,prefix,i)]:i;},
    countAt(r){refresh();return kind===0?N:kind===1?1:kind===2?-root[r]:(special[r>>>5]>>>(r&31))&1?counts[rank(special,specialPrefix,r)]:1;}};
  },

  async solve(micro,{maxError=.002,tolerance=2e-4,maxSweeps=1000,blockSize=16,innerSteps=8,signal,onProgress,profilePhases=false,armijoBound=false,rawApReuse=false,stablePairBlocks=false,pixelCidMap=false,exactCgCandidate=false,exactCgScreen=false,approximateNewtonSteps=defaultApproximateNewtonSteps,relativeRmsTolerance=0,repairInitial=false,repairInitialGuard=1e-5,initial,onInitialConsumed,certifyInitialFirst=false}={}){
   open();if(approximateNewtonSteps>0&&relativeRmsTolerance!==0)throw fail('INVALID_INPUT','Fixed Newton cap cannot be combined with a relative RMS request.');if(!Number.isInteger(approximateNewtonSteps)||approximateNewtonSteps<0||approximateNewtonSteps>1000000||approximateNewtonSteps>0&&(solver!=='mixed'||defaultApproximateNewtonSteps===0))throw fail('INVALID_INPUT','Fixed Newton solve requires its opt-in mixed-solver factory plan and a positive integer cap.');if(typeof repairInitial!=='boolean'||repairInitial&&(solver!=='mixed'||transitioned||projectInput||initial===undefined||!Number.isFinite(repairInitialGuard)||repairInitialGuard<1e-7||repairInitialGuard>.01))throw fail('INVALID_INPUT','PDHG repair requires an explicit seed, mixed solver, live graph and historical guard.');if(typeof exactCgScreen!=='boolean')throw fail('INVALID_INPUT','Exact CG witness screen flag must be boolean.');if(typeof exactCgCandidate!=='boolean')throw fail('INVALID_INPUT','Exact CG candidate flag must be boolean.');if(typeof pixelCidMap!=='boolean')throw fail('INVALID_INPUT','Pixel CID map flag must be boolean.');if(typeof stablePairBlocks!=='boolean')throw fail('INVALID_INPUT','Stable pair flag must be boolean.');if(typeof rawApReuse!=='boolean')throw fail('INVALID_INPUT','RAW AP reuse flag must be boolean.');if(typeof armijoBound!=='boolean')throw fail('INVALID_INPUT','Armijo bound flag must be boolean.');if(busy)throw fail('BUSY','Implicit target already running.');if(solved)throw fail('BUSY','An implicit target session owns one immutable result; create another session for a new target.');if(!(micro>=0&&micro<=1)||!(maxError===null||Number.isFinite(maxError)&&maxError>0)||!Number.isFinite(tolerance)||tolerance<=0||!Number.isInteger(maxSweeps)||maxSweeps<0||maxSweeps>1000000||!Number.isInteger(blockSize)||blockSize<1||blockSize>32||!Number.isInteger(innerSteps)||innerSteps<1||innerSteps>32)throw fail('INVALID_INPUT','Invalid implicit target solve options.');
   if(initial!==undefined&&(solver!=='mixed'||!(typeof initial==='function'||typeof initial?.get==='function'||(ArrayBuffer.isView(initial)&&initial.length===N))))throw fail('INVALID_INPUT','Initial seed requires mixed solver and a pixel function, resident bank, or native-length typed array.');
   if(seedBorrow&&(seedBorrow.phase!==0||initial!==seedBorrow.api))throw fail('BUSY','The borrowed seed destination must be consumed explicitly or released before another solve.');
   const borrowedInitial=seedBorrow,componentInitial=componentSeeds.get(initial);
   if(componentInitial&&(componentInitial.state!=='live'||componentInitial.graph.components!==metrics.components))throw fail('DISPOSED','The private component seed is no longer live.');
   if(typeof certifyInitialFirst!=='boolean'||certifyInitialFirst&&initial===undefined)throw fail('INVALID_INPUT','Certificate-first admission requires an explicit initial seed.');
   if(onInitialConsumed!==undefined&&typeof onInitialConsumed!=='function')throw fail('INVALID_INPUT','onInitialConsumed must be a function.');
   const hasInitial=initial!==undefined,pause=cooperator(signal),start=performance.now();let readSeed=null,seedCopied=false,initialConsumed=false,solveFailed=false,solveError;const consumeInitial=async()=>{if(!hasInitial||initialConsumed)return;readSeed=null;initial=null;initialConsumed=true;const callback=onInitialConsumed;onInitialConsumed=null;await callback?.({copied:seedCopied,willReadAgain:false});};busy=true;solveStarted=true;retireInitializerViews();initializerEpoch++;
   try{await pause();const begin=m._tm_begin(handle,micro,maxError??-1,tolerance,approximateNewtonSteps>0?Math.min(maxSweeps,approximateNewtonSteps):maxSweeps,blockSize,innerSteps,solver==='mixed'?1:0,preconditioner==='auto'?2:preconditioner==='sgs'?1:0,krylovVectors|(armijoBound?0x200:0)|(rawApReuse?0x20000000:0)|(stablePairBlocks?0x10000000:0)|(pixelCidMap?0x01000000:0)|(exactCgCandidate?0x00400000:0)|(exactCgScreen?0x00100000:0));funding.checkFailure();noteHeap();if(begin<0)throw error(begin);
    if(repairInitial&&read()[205]!==14220261104)throw fail('NATIVE_ABI_MISMATCH','PDHG F64 repair requires the rebuilt native kernel.');m._tm_seed(handle,0);
    if(hasInitial){if(componentInitial){
     const C=componentInitial.graph.components,pointer=m._tm_array(handle,14)>>>0,seed=new Float32Array(m.HEAPU8.buffer,pointer,C);
     for(let c=0;c<C;c++)seed[c]=componentInitial.bank.get(c);
     seedCopied=true;m._tm_seed(handle,repairInitial?3:certifyInitialFirst?2:1,repairInitialGuard);
    }else if(borrowedInitial){
     if(borrowedInitial.phase!==0||seedBorrow!==borrowedInitial)throw fail('DISPOSED','Borrowed native seed was released before admission.');
     // Identity-graph seed already occupies cgStep. Native begin preserves it;
     // admitting it directly avoids a full pixel pass and its transfer band.
     borrowedInitial.phase=2;
     if(borrowedInitial.compact){for(let first=0;first<N;first+=65536){const count=Math.min(65536,N-first),status=m._tm_seed_compact(handle,first,count);if(status<0)throw fail('MEMORY_OWNERSHIP','Cannot compact borrowed native pixel seed.');await pause();}}
     seedCopied=true;m._tm_seed(handle,repairInitial?3:certifyInitialFirst?2:1,repairInitialGuard);
    }else{readSeed=typeof initial==='function'?initial:typeof initial.get==='function'?i=>initial.get(i):i=>initial[i];const bytes=Math.min(N,65536)*4;let band,seedError,seedFailed=false;seedLease=reserve?.(bytes)??(()=>{});
     try{band=new Float32Array(bytes/4);seedBacking=registerBacking?.('array-buffer',band.byteLength,{identity:band.buffer,owner:'7c-implicit-target',label:'initial seed band'});const ptr=(m._tm_array(handle,6)>>>0)/4;for(let at=0;at<N;at+=band.length){const length=Math.min(band.length,N-at);for(let j=0;j<length;j++)band[j]=readSeed(at+j);m.HEAPF32.set(band.subarray(0,length),ptr);const status=m._tm_seed_band(handle,at,length);funding.checkFailure();if(status<0)throw error(status);await pause();}seedCopied=true;m._tm_seed(handle,repairInitial?3:certifyInitialFirst?2:1,repairInitialGuard);}catch(error){seedError=error;seedFailed=true;}finally{band=null;readSeed=null;initial=null;if(borrowedInitial&&borrowedInitial.phase!==3)borrowedInitial.phase=2;}
     try{retireSeed();}catch(cleanup){retirementPending=true;if(seedFailed){const error=new AggregateError([seedError,cleanup],'Implicit target seed transfer and retirement failed.',{cause:seedError});error.code=seedError?.code??'CLEANUP_FAILED';throw error;}throw cleanup;}if(seedFailed)throw seedError;}await consumeInitial();await pause();}
    if(beforeNativeAdmission){if(typeof beforeNativeAdmission!=='function')throw fail('INVALID_INPUT','Invalid private admission callback.');beforeNativeAdmission([2,3,4,5].map(field=>m._tm_pack_info(handle,field)));}
    let status=0,previous=-1,previousNativeState=-1;const history=[],phaseTimes={};let maximumNativeCallMs=0;
    while(status!==1){const phase=profilePhases?read()[8]:0,at=profilePhases?performance.now():0;status=m._tm_solve(handle,blockWork);if(profilePhases){const duration=performance.now()-at;phaseTimes[phase]=(phaseTimes[phase]??0)+duration;maximumNativeCallMs=Math.max(maximumNativeCallMs,duration);}funding.checkFailure();if(status<0)throw error(status);const info=read();if(info[9]!==previous){previous=info[9];const row={sweep:info[9],maxErrorBound:info[10],rmsErrorBound:info[11],state:info[8],newtonStep:info[99]===info[9]?newtonStepDiagnostic(info):null,apCache:{bytes:info[137],products:info[138],contactVisits:info[142],updates:info[143]}};history.push(row);onProgress?.({phase:'native-implicit-target',...row});}if(profilePhases&&(info[8]!==previousNativeState||info[8]===48))onProgress?.({phase:'native-implicit-target-state',state:info[8],seedRestoredComponents:info[82]});previousNativeState=info[8];await pause();}
    const info=read();metrics={...metrics,componentSeedValues:componentInitial?metrics.components:0,converged:!!info[13],maxErrorBound:info[10],rmsErrorBound:info[11],roundoffAllowance:info[12],sweeps:info[9],localNewtonSteps:info[14],blockSolves:info[15],coarseAccepted:info[16],incidentVisits:info[19],rowReplays:info[20],linearMaxErrorBound:info[24],nodeBarrierMaxErrorBound:info[25],seedProvided:!!info[41],seedAccepted:!!info[42],seedCertificateProbes:info[77],seedCertificateAccepted:!!info[78],seedCertificateFallbacks:info[79],seedCompactedPixels:info[80],seedCompactedComponents:info[81],seedRestoredComponents:info[82],paletteCoefficientCache:!!info[51],uniqueLevels:info[52],singleEdgeCertificate:!!info[53],ringCertificate:!!info[74],ringCertificateSlots:info[75],ringCertificateScratchBytes:info[76],certificateEdgeEvaluations:info[54],certificatePasses:info[55],coefficientCalls:info[39],coefficientHits:info[40],coefficientHitRate:info[39]?info[40]/info[39]:0,pairCacheReady:!!info[56],pairCacheBuilds:info[57],matchedPairVertices:info[58],curvatureCacheBits:info[83]?0:info[35]?12:0,krylovVectors:info[83]?4:info[36]?3:4,curvatureBuilds:info[37],curvatureRangeClamps:info[38],newtonDerivativesCached:!!info[90],newtonDerivativeCacheBytes:info[91],preconditioner:info[83]?'ic0':info[34]?'sgs':'pairs',preconditionerWorkspaceBytes:info[84],ic0WorkStorage:{allocatedBytes:m._tm_pack_info(handle,8),prefixCapacity:m._tm_pack_info(handle,9),reductionPrefixCapacity:m._tm_pack_info(handle,10),allocationRefusals:m._tm_pack_info(handle,11),additionalMaterializedBytes:m._tm_pack_info(handle,8)?8*m._tm_pack_info(handle,10):0},massPaletteEntries:info[92],massPaletteBytes:info[93],nativeMassEncodingBits:8*info[94],nativeMassBankBytes:info[95],massPaletteOverflow:!!info[96],ic0CompactArc:!!info[97],ic0ComponentIndexBytes:info[98],compactDiagonalCacheReady:!!info[131],compactDiagonalCacheBytes:info[132],compactDiagonalCacheBuilds:info[133],compactDiagonalCacheReads:info[134],compactDiagonalCacheRefusals:info[135],compactDiagonalCacheTransferredBytes:info[136],apCacheBytes:info[137],apCacheProducts:info[138],apCacheRefusals:info[139],apCacheTransferredBytes:info[140],apCacheReady:!!info[141],apCacheContactVisits:info[142],apCacheUpdates:info[143],ic0PatternReady:!!info[85],ic0Factors:info[86],ic0Products:info[87],exactCoefficientCache:!!info[88],exactCoefficientCacheBytes:info[89],warmupSkippedForWideBlock:!!info[33],knotIterations:info[30],cgIterations:info[26],residualRestarts:info[27],trueResidualChecks:info[28],exactCgWitnessScreen:{enabled:!!m._tm_pack_info(handle,112),rounds:m._tm_pack_info(handle,113),rows:m._tm_pack_info(handle,114),contacts:m._tm_pack_info(handle,115),rejections:m._tm_pack_info(handle,116),skips:m._tm_pack_info(handle,117),witnesses:m._tm_pack_info(handle,118),lastContribution:m._tm_pack_info(handle,119),maximumWitnesses:16,maximumContactsPerWitness:128,additionalNCEBytes:0},exactCgCandidate:{enabled:!!m._tm_pack_info(handle,12),borrowedArenaBytes:m._tm_pack_info(handle,13),attempts:m._tm_pack_info(handle,14),certifiedCandidates:m._tm_pack_info(handle,15),committedCandidates:m._tm_pack_info(handle,16),probeRows:m._tm_pack_info(handle,17),lastMaximumBound:m._tm_pack_info(handle,18),lastCgIteration:m._tm_pack_info(handle,19),storageRefusals:m._tm_pack_info(handle,20),additionalNCEBytes:0},solver:info[29]?'mixed':'bgs',elapsedMs:performance.now()-start,history,armijoBound:{enabled:!!info[144],skippedObjectivePasses:info[145],lastKind:info[146],lastUpperBound:Number.isFinite(info[147])?info[147]:null,tau:info[148],energy:info[149],roundoffMargin:info[150],lastAcceptedSweep:info[151]},pixelCidMap:pixelCidMapDiagnostic(info),stablePairBlocks:{requested:!!info[160],cacheStoresPositiveRemainders:!!info[161],anchorComputations:info[162],anchorCacheReads:info[163],pairApplications:info[164],anchorsBelowCouplingUlp:info[165],numericFallbacks:info[166],applied:info[164]>0,extraBankBytes:0},rawApReuse:{requested:!!info[152],active:!!info[153],role:info[154],zBuilds:info[155],zRows:info[156],directionRows:info[157],rawUpdateRows:info[158],epoch:info[159],applied:info[155]>0,extraBankBytes:0},seedRepair:{requested:!!info[182],attempted:!!info[183],dagCompleted:!!info[184],objectiveAccepted:!!info[185],rejected:!!info[186],preservedFloat64:!!info[187],epsilon:info[188],contactMargin:info[189],initializedRoots:info[190],contactVisits:info[191],objectiveDifference:Number.isFinite(info[192])?info[192]:null,reason:info[193],fixedHeadBytes:info[194],allocatedFixedHeads:!!info[195],readyF64:!!info[196],backwardRoots:info[197],forwardRoots:info[198],clampedRoots:info[199],nonfiniteSeedValues:info[200],maximumSeedChange:info[201],feasibilityFailures:info[202],control:info[203],elapsedMs:info[204],systematic:true,additionalNCEMemoryBytes:0},newtonDiagnostics:history.map(row=>row.newtonStep).filter(Boolean),maximumNativeCallMs:profilePhases?maximumNativeCallMs:undefined,phaseTimes:profilePhases?phaseTimes:undefined,micro,workingPrecision:'float64',numericContract:'unique historical component pairs; original Float64 target and certificate',heapBytes:m.HEAPU8.buffer.byteLength,heapFunding:{...funding.stats(),proofVerified:growthProof.verified}};
    if(approximateNewtonSteps>0){
     if(info[9]>Math.min(maxSweeps,approximateNewtonSteps))throw fail('NUMERIC_CONTRACT','Native Newton step count exceeds the experimental cap.',metrics);
     metrics={...metrics,termination:'fixed-newton-steps',approximateNewtonSteps,appliedNewtonStepCap:Math.min(maxSweeps,approximateNewtonSteps),strictConverged:metrics.converged,
      guaranteedConvergenceFraction:false,approximationContract:{kind:'empirical-fixed-newton-steps',nativeEndpointOnly:true,maximumNewtonSteps:approximateNewtonSteps,appliedNewtonStepCap:Math.min(maxSweeps,approximateNewtonSteps),guaranteedConvergenceFraction:false,doesNotCertifyMaximumPixelError:true,doesNotCertifyRelativeRmsError:true},
      numericContract:'experimental native endpoint after a fixed Newton cap; empirical approximation without a convergence-fraction guarantee'};
    }else if(!metrics.converged)throw fail('NUMERIC_PRECISION','Implicit target did not reach the requested certificate.',metrics);
    layout=info[43];const rootPtr=m._tm_array(handle,1)>>>0,yPtr=m._tm_array(handle,2)>>>0;rootView=rootPtr?new Int32Array(m.HEAPU8.buffer,rootPtr,N):null;yView=new Float64Array(m.HEAPU8.buffer,yPtr,info[1]);if(layout>=2){nonrootBits=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,3)>>>0,2*info[48]);nonrootPrefix=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,4)>>>0,info[48]+1);if(layout===3)parents=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,5)>>>0,info[44]);}privateCertificate={micro,bound:info[10],reference:maxError===null,...(approximateNewtonSteps>0?{kind:'fixed-newton-steps'}:{})};solved=true;result.metrics=snapshot(metrics);return result;
   }catch(error){if(error&&typeof error==="object"&&Object.isExtensible(error))error.nativeInfo=Array.from(read());solveFailed=true;solveError=error;throw error;}finally{if(borrowedInitial&&borrowedInitial.phase!==3)borrowedInitial.phase=2;busy=false;try{await consumeInitial();}catch(cleanup){if(solveFailed){const error=new AggregateError([solveError,cleanup],'Implicit solve and initial-seed release failed.',{cause:solveError});error.code=solveError?.code??'INITIAL_RELEASE_FAILED';throw error;}throw cleanup;}}
  },
  // Borrow the full dead N-pixel root region, after proving it is disjoint
  // from the compressed graph. Bitmap layouts compact root values on admission.
  createSeedDestination(){
   open();if(busy||transitioned||!solved&&solveStarted)throw fail('NOT_READY','A prepared or completed native target is required for borrowed initialization.');
   if(seedBorrow)throw fail('BUSY','A native seed destination is already borrowed.');
   if(solver!=='mixed'||!['identity','bitmap-rank'].includes(metrics.graphLayout)||m._tm_seed_pixel_capacity(handle)!==N)return null;
   const owner={pointer:m._tm_array(handle,14)>>>0,view:null,phase:0,api:null,compact:metrics.graphLayout==='bitmap-rank'};
   if(!owner.pointer)throw fail('MEMORY_OWNERSHIP','Native seed scratch is unavailable.');
   const check=write=>{open();if(owner.phase>=2)throw fail('DISPOSED','Borrowed native seed was consumed or released.');if(busy&&(write||owner.phase!==1))throw fail('BUSY','Native seed scratch is being mutated.');if(!owner.view||owner.view.buffer!==m.HEAPU8.buffer)owner.view=new Float32Array(m.HEAPU8.buffer,owner.pointer,N);return owner.view;};
   const pixel=i=>{if(!Number.isSafeInteger(i)||i<0||i>=N)throw fail('INVALID_INPUT','Invalid borrowed seed pixel.');};
   const api={length:N,storage:'borrowed-native-float32',
    get(i){const view=check(false);pixel(i);return view[i];},
    set(i,value){const view=check(true);pixel(i);view[i]=value;},
    readInto(target,first=0){const view=check(false);if(!(target instanceof Float32Array)||!Number.isSafeInteger(first)||first<0||first>N-target.length)throw fail('INVALID_INPUT','Invalid borrowed seed read span.');target.set(view.subarray(first,first+target.length));return target;},
    writeSpan(first,values){const view=check(true);if(!(values instanceof Float32Array)||!Number.isSafeInteger(first)||first<0||first>N-values.length)throw fail('INVALID_INPUT','Invalid borrowed seed write span.');view.set(values,first);},
    clearSpan(first,count){const view=check(true);if(!Number.isSafeInteger(first)||!Number.isSafeInteger(count)||first<0||count<0||first>N-count)throw fail('INVALID_INPUT','Invalid borrowed seed span.');view.fill(0,first,first+count);},
    release(){if(owner.phase===3)return;owner.phase=3;owner.view=null;if(seedBorrow===owner)seedBorrow=null;}
   };owner.api=api;seedBorrow=owner;return api;
  },
  scalarAt(pixel){open();if(!solved||transitioned)throw fail('NOT_READY','Implicit target is not certified.');if(!Number.isSafeInteger(pixel)||pixel<0||pixel>=N)throw fail('INVALID_INPUT','Invalid implicit target pixel.');return scalar(pixel);},
  async exportTarget({budget,levelSource,signal,segmentBytes=32*MiB,compact=false,cachePrecision,cache16=false,projectionTarget,approximation}={}){
   open();const fast=approximation==='fixed-newton-steps';if(approximation!==undefined&&!fast)throw fail('INVALID_INPUT','Unknown native endpoint approximation.');if(fast&&cache16)throw fail('INVALID_INPUT','Fast endpoints require U32 pixel packing.');if(!solved||busy||transitioned)throw fail('NOT_READY','A completed immutable target is required for export.');
   if(seedBorrow)throw fail('BUSY','Release the borrowed native seed before packing.');
   if(!levelSource?.immutable||typeof levelSource.retain!=='function'||typeof levelSource.maxAt!=='function'||levelSource.width!==width||levelSource.height!==height)throw fail('INVALID_INPUT','Feasible packing requires a retained immutable RGB16 source.');
   if(typeof compact!=='boolean'||typeof cache16!=='boolean'||cache16&&(compact||cachePrecision===undefined))throw fail('INVALID_INPUT','Invalid compact target export option.');
   if(privateCertificate?.kind==='fixed-newton-steps'&&!fast){
    if(compact||cache16||cachePrecision!==undefined||projectionTarget!==undefined||levelSource!==sourceIdentity)throw fail('NUMERIC_CONTRACT','Fixed-Newton target export is native Float64 only; strict cache/projection packing requires its own contract.');
    const pause=cooperator(signal);let bank,releaseSource;busy=true;
    try{
     releaseSource=levelSource.retain();bank=await createResidentArray(Float64Array,N,{budget,signal,segmentBytes,label:'owned native fixed-Newton endpoint'});
     for(let first=0;first<N;first+=32768){const end=Math.min(N,first+32768);for(let i=first;i<end;i++)bank.set(i,scalar(i));await pause();}
     const owner={bank,releaseSource,state:'live'};
     const valid=()=>{if(owner.state!=='live')throw fail('DISPOSED','Fixed-Newton endpoint was released.');};
     const exported={width,height,storage:'float64-fixed-newton-native-target',byteLength:8*N,metrics:snapshot({...metrics,packingErrorBound:0,contractDomain:'native endpoint only; no final projected-product guarantee'}),
      scalarAt(i){valid();if(!Number.isSafeInteger(i)||i<0||i>=N)throw fail('INVALID_INPUT','Invalid native fixed-Newton pixel.');return owner.bank.get(i);},
      release(){if(owner.state==='retired')return;owner.state='retiring';if(owner.bank){owner.bank.dispose();owner.bank=null;}if(owner.releaseSource){owner.releaseSource();owner.releaseSource=null;}owner.state='retired';}};
     bank=releaseSource=null;return exported;
    }catch(error){const cleanup=()=>{if(bank){bank.dispose();bank=null;}if(releaseSource){releaseSource();releaseSource=null;}exportCleanups.delete(cleanup);};try{cleanup();}catch(cleanupError){exportCleanups.add(cleanup);throw cleanupFailure(error,cleanupError,cleanup);}throw error;}finally{busy=false;}
   }
   const projectionOwner=fast?null:projectionTarget===undefined?null:packedOwners.get(projectionTarget);
   if(!fast&&projectionTarget!==undefined&&(projectionOwner?.state!=='live'||projectionOwner.kind==='components'||projectionOwner.packingBits===16||projectionOwner.levelSource!==sourceIdentity))throw fail('INVALID_INPUT','Projection allowance requires the matching private target.');
   if(!fast&&cachePrecision!==undefined&&(!privateCertificate||privateCertificate.micro!==0||levelSource!==sourceIdentity||privateCertificate.reference!==(cachePrecision==='reference')))throw fail('INVALID_INPUT','Zero cache requires the exact source and private precision contract.');
   let graph=compact&&!fast?componentGraph():null,workspaceLease;
   if(graph){
    if(levelSource!==sourceIdentity)throw fail('INVALID_INPUT','Compact export requires the exact immutable source used by this native owner.');
    try{budget.room?.(componentProjectionReservationBytes(graph.components)+16*graph.components);workspaceLease=budget.reserve(componentProjectionReservationBytes(graph.components));}
    catch(error){if(error?.code!=='MEMORY_LIMIT')throw error;graph.releaseViews();graph=null;}
   }
   if(graph){
    const pause=cooperator(signal);let bank,releaseSource;busy=true;
    try{
     await pause();releaseSource=levelSource.retain();bank=await createResidentArray(Float64Array,graph.components,{budget,signal,segmentBytes,label:'immutable native component target'});
     const values=new Float64Array(m.HEAPU8.buffer,m._tm_array(handle,2)>>>0,graph.components);bank.write(values);
     const owner={kind:'components',bank,budget,graph,workspaceLease,releaseSource,levelSource,state:'live',micro:metrics.micro,bound:metrics.maxErrorBound};
     const valid=()=>{if(owner.state!=='live')throw fail('DISPOSED','Component target was released or consumed.');};
     const scalarAt=i=>{valid();if(!Number.isSafeInteger(i)||i<0||i>=N)throw fail('INVALID_INPUT','Invalid component target pixel.');return owner.bank.get(owner.graph.componentAt(i));};
     const token=Object.freeze({get:scalarAt});componentSeeds.set(token,owner);
     const packed={width,height,storage:'float64-native-components',byteLength:8*graph.components,
      metrics:snapshot({...metrics,packingErrorBound:0,edgeFeasibilityPreserved:true,maxErrorBound:owner.bound}),scalarAt,
      release(){if(owner.state==='retired'||owner.state==='consumed')return;owner.state='retiring';if(owner.bank){owner.bank.dispose();owner.bank=null;}if(owner.releaseSource){owner.releaseSource();owner.releaseSource=null;}owner.levelSource=null;if(owner.workspaceLease){owner.workspaceLease();owner.workspaceLease=null;}owner.graph.releaseViews();owner.state='retired';compactExports.delete(owner);}};
     Object.defineProperty(packed,'nativeInitial',{value:token});packedOwners.set(packed,owner);compactExports.add(owner);workspaceLease=null;return packed;
    }catch(error){const cleanup=()=>{if(bank){bank.dispose();bank=null;}if(releaseSource){releaseSource();releaseSource=null;}if(workspaceLease){workspaceLease();workspaceLease=null;}graph.releaseViews();exportCleanups.delete(cleanup);};try{cleanup();}catch(cleanupError){exportCleanups.add(cleanup);throw cleanupFailure(error,cleanupError,cleanup);}throw error;}finally{busy=false;}
   }
   const pause=cooperator(signal);let bank,releaseSource;busy=true;
   try{
    releaseSource=levelSource.retain();let packingBits=cache16&&['1e-2','1e-4'].includes(cachePrecision)?16:32,quantizationBound;const packingAttempts=[];
    for(;;){
     if(cachePrecision!==undefined)bank=await createResidentArray(packingBits===16?Uint16Array:Uint32Array,N,{budget,signal,segmentBytes,label:'certified immutable zero target'});
     let status=fast?m._tm_pack_begin(handle,32|0x100):packingBits===16?m._tm_pack_begin(handle,16):m._tm_pack_begin(handle);funding.checkFailure();noteHeap();if(status<0)throw fail('MEMORY_ALLOCATION','Cannot initialize feasible packing.');
     if(packingBits===16&&(m._tm_pack_info(handle,6)!==16||m._tm_pack_info(handle,7)!==zero16Scale))throw fail('NATIVE_ABI_MISMATCH','This native kernel does not support certified U16 zero packing.');
     while(status!==1){status=m._tm_pack_step(handle,blockWork);if(status<0)break;await pause();}
     if(status<0&&packingBits!==16)throw fail('NUMERIC_PRECISION','Feasible packing failed original constraints.',{nativeStatus:status});
     quantizationBound=status===1?m._tm_pack_info(handle,0)+2*Number.EPSILON:Infinity;
     const candidateBound=privateCertificate.bound+quantizationBound,tolerance=Number(cachePrecision),trialBound=2**-31+8*Number.EPSILON;
     const accepted=packingBits!==16||status===1&&Number.isFinite(candidateBound)&&candidateBound<tolerance*.45&&(!projectionOwner||projectionOwner.bound+candidateBound+trialBound<tolerance);
     packingAttempts.push({storageBits:packingBits,accepted,nativeStatus:status,packingErrorBound:Number.isFinite(quantizationBound)?quantizationBound:null,maxErrorBound:Number.isFinite(candidateBound)?candidateBound:null});
     if(accepted)break;
     // Only dead packing scratch was touched. Y is still the certified F64
     // target, so retry U32 directly without another solve or seed.
     if(bank){bank.dispose();bank=null;}packingBits=32;await pause();
    }
    const info=read(),buffer=m.HEAPU8.buffer;layout=info[43];const rootPtr=m._tm_array(handle,1)>>>0;rootView=rootPtr?new Int32Array(buffer,rootPtr,N):null;yView=new Float64Array(buffer,m._tm_array(handle,2)>>>0,info[1]);
    if(layout>=2){nonrootBits=new Uint32Array(buffer,m._tm_array(handle,3)>>>0,2*info[48]);nonrootPrefix=new Uint32Array(buffer,m._tm_array(handle,4)>>>0,info[48]+1);if(layout===3)parents=new Uint32Array(buffer,m._tm_array(handle,5)>>>0,info[44]);}
    const codes=new Uint32Array(buffer,m._tm_array(handle,18)>>>0,info[1]),levels=new Uint16Array(buffer,m._tm_array(handle,0)>>>0,N);
    if(!bank)bank=await createResidentArray(Uint32Array,N,{budget,signal,segmentBytes,label:'feasible packed 7C target'});let at=0;
    for(const segment of bank.segments)for(let j=0;j<segment.length;j++,at++){if(levelSource.maxAt(at)!==levels[at])throw fail('INVALID_INPUT','Packed source differs from certified source.');segment[j]=codes[cidAt(ownerAt(at))];if((j&65535)===0)await pause();}
    const slope=.1+2**-32,owner={bank,budget,releaseSource,levelSource,state:'live',packingBits,micro:privateCertificate.micro,bound:privateCertificate.bound+quantizationBound,...(fast?{approximation:'fixed-newton-steps'}:{})};
    const packingProfile={storageBits:packingBits,nominalScale:packingBits===16?zero16Scale:2147483648,expandedScale:2147483648,decoder:packingBits===16?'u16-rational-rounded-to-u32-affine':'u32-affine',requestedU16:cache16,attempts:packingAttempts};
    const packed={width,height,storage:packingBits===16?'uint16-affine-feasible-zero':'uint32-affine-feasible',byteLength:(packingBits/8)*N,metrics:snapshot({...metrics,packingProfile,packingErrorBound:quantizationBound,edgeFeasibilityPreserved:true,packingMinimumMargin:m._tm_pack_info(handle,1),maxErrorBound:fast?null:owner.bound,...(fast?{computationMode:'fast',converged:false,strictConverged:false,rmsErrorBound:null,nativeEndpointStrictRmsErrorBound:metrics.rmsErrorBound,nativeEndpointStrictConverged:metrics.converged,strictEndpointMaxErrorBound:owner.bound,guaranteedConvergenceFraction:false,numericContract:'feasible packed Fast endpoint; no strict target accuracy guarantee'}:{})}),
     codeAt(i){if(owner.state!=='live')throw fail('DISPOSED','Packed target was released or consumed.');return owner.bank.get(i);},
     scalarAt(i){if(owner.state!=='live')throw fail('DISPOSED','Packed target was released or consumed.');const code=owner.bank.get(i);return (owner.packingBits===16?expandPackedZero16(code):code)/2147483648-slope+slope*(owner.levelSource.maxAt(i)/65535);},
     release(){if(owner.state==='retired'||owner.state==='consumed')return;if(deferPackedZeroRelease(packed,()=>packed.release()))return;owner.state='retiring';if(owner.bank){owner.bank.dispose();owner.bank=null;}if(owner.releaseSource){owner.releaseSource();owner.releaseSource=null;}owner.levelSource=null;owner.state='retired';notePackedZeroRetired(packed);}};
    if(cachePrecision!==undefined){if(!privateCertificate||privateCertificate.micro!==0||levelSource!==sourceIdentity||!fast&&privateCertificate.reference!==(cachePrecision==='reference'))throw fail('INVALID_INPUT','Zero cache requires the exact source and private precision contract.');brandPackedZero(packed,owner,{source:sourceIdentity,budget,precision:cachePrecision,...(fast?{quality:'fast'}:{}),summary:fast?packed.metrics:{...metrics,packingProfile,maxErrorBound:owner.bound,packingErrorBound:quantizationBound}});}
    packedOwners.set(packed,owner);return packed;
   }catch(error){const cleanup=()=>{if(bank){bank.dispose();bank=null;}if(releaseSource){releaseSource();releaseSource=null;}exportCleanups.delete(cleanup);};try{cleanup();}catch(cleanupError){exportCleanups.add(cleanup);throw cleanupFailure(error,cleanupError,cleanup);}throw error;}finally{busy=false;}
  },
  async replaceTarget(micro,{reuseInitial=false,...options}={}){
   open();if(busy||transitioned||!solved)throw fail('BUSY','Only an unborrowed completed native target can be replaced.');
   if(typeof reuseInitial!=='boolean'||reuseInitial&&(solver!=='mixed'||options.initial!==undefined))throw fail('INVALID_INPUT','Retained initialization requires the mixed solver and no explicit initial state.');
   if(seedBorrow&&(seedBorrow.phase!==0||options.initial!==seedBorrow.api||reuseInitial))throw fail('BUSY','The borrowed seed destination must be the explicit replacement initializer.');
   // Native begin leaves Y and graph ownership intact. The existing bounded
   // seed transfer reads every old Y value into cgStep before the first solve
   // call resets Y in state 0. No full-image copy or second heap is required.
   const initial=reuseInitial?i=>m._tm_value(handle,i):options.initial;
   solved=false;rootView=yView=nonrootBits=nonrootPrefix=parents=null;return result.solve(micro,{...options,initial});
  },
  // Consumes the external Tb bank into trial codes. The same native arena then
  // receives Tb, trial and the forest; no second pixel bank or heap is admitted.
  canProjectWithCachedZero(tb,zeroTarget,precision,{approximation}={}){
   open();const fast=approximation==='fixed-newton-steps';if(approximation!==undefined&&!fast)return false;if(!fast&&privateCertificate?.kind==='fixed-newton-steps')return false;const owner=packedOwners.get(tb);if(owner?.state!=='live'||owner.kind==='components'||owner.packingBits===16||owner.levelSource!==sourceIdentity||zeroTarget===tb||!!owner.approximation!==fast)return false;
   let borrow;try{borrow=borrowPackedZero(zeroTarget,{source:sourceIdentity,budget:owner.budget,precision,...(fast?{quality:'fast'}:{})});return fast||precision==='reference'||Number(precision)>owner.bound+borrow.bound+2**-31+8*Number.EPSILON;}catch(error){if(error?.code==='INVALID_INPUT'||error?.code==='DISPOSED')return false;throw error;}finally{borrow?.release();}
  },
  async projectWithPacked(tb,{revelation=.5,precision='1e-2',prepareRevelationRange=false,signal,onProgress,zeroTarget,approximation}={}){
   open();const fast=approximation==='fixed-newton-steps';if(approximation!==undefined&&!fast)throw fail('INVALID_INPUT','Unknown native projection approximation.');if(!fast&&privateCertificate?.kind==='fixed-newton-steps')throw fail('NUMERIC_CONTRACT','Fixed-Newton native endpoints cannot enter the strict projection controller.');if(busy||!solved||transitioned||(zeroTarget===undefined&&metrics.micro!==0))throw fail('NOT_READY','A certified zero-micro target is required.');
   if(seedBorrow)throw fail('BUSY','Release the borrowed native seed before projection.');
   const owner=packedOwners.get(tb);if(owner?.state!=='live'||owner.packingBits===16||!(revelation>=0&&revelation<1)||typeof prepareRevelationRange!=='boolean'||!['reference','1e-2','1e-4','1e-7'].includes(precision)||!!owner.approximation!==fast||fast&&precision==='reference')throw fail('INVALID_INPUT','Matching live packed target and finite precision required.');
   if(zeroTarget!==undefined&&(owner.kind==='components'||zeroTarget===tb||owner.levelSource!==sourceIdentity))throw fail('INVALID_INPUT','External zero requires distinct pixel banks from the exact source.');
   if(owner.kind==='components'){
    const started=performance.now(),zeroBound=metrics.maxErrorBound,targetBound=owner.bound;
    const allowance=precision==='reference'?Infinity:Number(precision)-targetBound-zeroBound;
    if(!(allowance>0))throw fail('NUMERIC_PRECISION','Component target certificates consume requested precision.');
    busy=true;transitioned=true;owner.state='consumed';projectInput=owner;compactExports.delete(owner);
    try{
     const admittedWorkspace=owner.workspaceLease;owner.workspaceLease=null;
     const projected=await projectNativeComponents({width,height,components:owner.graph.components,graph:owner.graph,workspaceLease:admittedWorkspace,
      targetAt:c=>owner.bank.get(c),zeroAt:c=>new Float64Array(m.HEAPU8.buffer,m._tm_array(handle,2)>>>0,owner.graph.components)[c],
      budget:owner.budget,certificateTolerance:precision==='reference'?undefined:allowance*.95,signal,onProgress});
     componentBase=projected.bank;
     const baseExtraBound=zeroBound+projected.certificate,boundFor=r=>targetBound+(1-r)*baseExtraBound;
     const certifiedBound=boundFor(prepareRevelationRange?0:revelation),bound=boundFor(revelation);
     if(!Number.isFinite(certifiedBound)||precision!=='reference'&&certifiedBound>Number(precision))throw fail('NUMERIC_PRECISION','Combined component result misses requested precision.');
     const finalMetrics={...metrics,pixelCidMap:pixelCidMapDiagnostic(read()),backend:'native-component-target-projection',micro:owner.micro,zeroMicro:0,projection:projected.metrics,
      maxErrorBound:bound,...(prepareRevelationRange?{rangeMaxErrorBound:certifiedBound,certifiedRevelationRange:[0,1]}:{}),
      targetBound,zeroBound,trialPackingBound:0,minimumMargin:projected.metrics.minimumMargin,
      projectionElapsedMs:performance.now()-started,componentTargetBytes:owner.bank.byteLength,componentBaseBytes:componentBase.byteLength,
      forestPayloadBytes:0,forestNewBackingBytes:0};result.metrics=snapshot(finalMetrics);
     const validate=r=>{open();if(!Number.isFinite(r)||r<0||r>1||!prepareRevelationRange&&r!==revelation)throw fail('INVALID_INPUT','Revelation is outside the certified component range.');};
     const value=(i,r)=>{const c=owner.graph.componentAt(i),a=componentBase.get(c),b=owner.bank.get(c);if(r===0||a===b)return a+0;if(r===1)return b+0;return (1-r)*a+r*b;};
     return{width,height,metrics:snapshot(finalMetrics),supportsRevelationRange:prepareRevelationRange,
      boundAt(r=revelation){validate(r);return boundFor(r);},
      scalarAt(i,r=revelation){validate(r);if(!Number.isSafeInteger(i)||i<0||i>=N)throw fail('INVALID_INPUT','Invalid projected component pixel.');return value(i,r);},
      readScalarSpan(first,count,r=revelation){validate(r);if(!Number.isSafeInteger(first)||!Number.isSafeInteger(count)||first<0||count<1||count>32768||first>N-count)throw fail('INVALID_INPUT','Invalid component scalar span.');const band=new Float64Array(m.HEAPU8.buffer,m._tm_array(handle,6)>>>0,count);for(let j=0;j<count;j++)band[j]=value(first+j,r);return band;},
      dispose(){result.dispose();}};
    }finally{busy=false;}
   }
   const zeroBorrow=zeroTarget===undefined?null:borrowPackedZero(zeroTarget,{source:sourceIdentity,budget:owner.budget,precision,...(fast?{quality:'fast'}:{})});
   const pause=cooperator(signal),started=performance.now(),zeroBound=zeroBorrow?.bound??metrics.maxErrorBound,targetBound=owner.bound,trialPackingBound=2**-31+(zeroBorrow?8:4)*Number.EPSILON;
   // The base at R=0 has the strongest projection-accuracy requirement.
   // Certify it once for a reusable range; retain the historical default otherwise.
   const certificationRevelation=prepareRevelationRange?0:revelation;
   const allowance=fast?Number(precision)-trialPackingBound:precision==='reference'?Infinity:Number(precision)-targetBound-(1-certificationRevelation)*(zeroBound+trialPackingBound);if(!(allowance>0)){zeroBorrow?.release();throw fail('NUMERIC_PRECISION','Target certificates consume requested precision.');}
   busy=true;transitioned=true;owner.state='consumed';projectInput=owner;tb=null;
   try{await pause();
    if(m._tm_project_prepare(handle,(zeroBorrow?1:0)|(fast?2:0))!==0)throw fail('NOT_READY','Cannot stage native projection.');
    const band=new Uint32Array(m.HEAPU8.buffer,m._tm_array(handle,6)>>>0,65536);
    for(let first=0,stride=zeroBorrow?32768:65536;first<N;first+=stride){const length=Math.min(stride,N-first),view=band.subarray(0,length);owner.bank.readInto(view,first);if(zeroBorrow)zeroBorrow.readInto(band.subarray(32768,32768+length),first);if(m._tm_project_band(handle,first,length)!==0)throw fail('NUMERIC_RANGE','Cannot construct packed projection trial.');owner.bank.write(view,first);await pause();}
    if(m._tm_project_relayout(handle)!==0)throw fail('MEMORY_OWNERSHIP','Cannot transition native projection arena.');rootView=yView=nonrootBits=nonrootPrefix=parents=null;
    for(let first=0;first<N;first+=65536){const length=Math.min(65536,N-first);owner.bank.readInto(band.subarray(0,length),first);if(m._tm_project_trial_band(handle,first,length)!==0)throw fail('MEMORY_OWNERSHIP','Cannot import projection trial.');await pause();}
    owner.bank.dispose();owner.bank=null;
    let status=m._tm_project_begin(handle,certificationRevelation,allowance*.95/(1-certificationRevelation)),previous=-1,calls=0,maximumNativeCallMs=0;
    if(status<0)throw fail('INVALID_INPUT','Native forest rejected its arena.');
    while(status===0){await pause();const at=performance.now();status=m._tm_project_step(handle,blockWork);maximumNativeCallMs=Math.max(maximumNativeCallMs,performance.now()-at);calls++;const info=new Float64Array(m.HEAPU8.buffer,m._tm_project_info(handle)>>>0,17);if(info[11]!==previous){previous=info[11];onProgress?.({phase:'native-pixel-projection',nativePhase:previous,pivots:info[3]});}}
    let info=new Float64Array(m.HEAPU8.buffer,m._tm_project_info(handle)>>>0,17);if(status<0)throw fail('NUMERIC_PRECISION','Native forest did not certify its result.',{status,phase:info[11],reason:info[12],certificateMax:info[6]});
    status=0;while(status===0){status=m._tm_project_check(handle,blockWork);if(status<0)throw fail('NUMERIC_PRECISION','Final blend violates original constraints.',{projectionInfo:Array.from(new Float64Array(m.HEAPU8.buffer,m._tm_project_info(handle)>>>0,17)),nativeInfo:Array.from(read())});await pause();}
    info=new Float64Array(m.HEAPU8.buffer,m._tm_project_info(handle)>>>0,17);
    const projectionGuardBound=info[16]?info[16]+4*Number.EPSILON:0,projectionCertificate=info[6]+projectionGuardBound,baseExtraBound=zeroBound+trialPackingBound+projectionCertificate;
    const boundFor=r=>fast?null:targetBound+(1-r)*baseExtraBound;
    const certifiedBound=boundFor(certificationRevelation),bound=boundFor(revelation);
    if(!fast&&(!Number.isFinite(certifiedBound)||precision!=='reference'&&!(certifiedBound<=Number(precision))))throw fail('NUMERIC_PRECISION','Combined result misses requested precision.');
    const projection={...(fast?{certificateDomain:'projection relative to packed Fast endpoints only',requestedTolerance:Number(precision)}:{}),backend:'native-pixel-equality-forest',maximumPivots:Math.max(1000000,Math.min(0xffffffff,16*N)),components:info[0],largestComponent:info[1],equalityEdges:info[2],pivots:info[3],cuts:info[4],passes:info[5],certificateMax:projectionCertificate,rawForestCertificateMax:info[6],feasibilityGuard:info[16],projectionGuardBound,certificateRMS:info[7]+projectionGuardBound,rawForestCertificateRMS:info[7],minimumMargin:info[13],rawForestMinimumMargin:info[8],gap:info[9],acceptedByCertificate:!!info[10],totalTreeVisits:info[14],dependentSteps:info[15],calls,maximumNativeCallMs,workspaceBytes:18*N,algorithmOwnedAllocationBytes:0};
    const finalMetrics={...metrics,pixelCidMap:pixelCidMapDiagnostic(read()),backend:'native-compact-target-forest-arena',micro:owner.micro,zeroMicro:0,projection,maxErrorBound:bound,...(prepareRevelationRange?(fast?{rangeMaxErrorBound:null,preparedRevelationRange:[0,1]}:{rangeMaxErrorBound:certifiedBound,certifiedRevelationRange:[0,1]}):{}),...(fast?{computationMode:'fast',converged:false,strictConverged:false,rmsErrorBound:null,nativeZeroStrictRmsErrorBound:metrics.rmsErrorBound,guaranteedConvergenceFraction:false,nativeTargetStrictMaxErrorBound:targetBound,nativeZeroStrictMaxErrorBound:zeroBound,projectionApproximationErrorBound:trialPackingBound+projectionCertificate,numericContract:'affine revelation of feasible Fast endpoints; projection tolerance is separate from endpoint accuracy'}:{targetBound,zeroBound}),trialPackingBound,minimumMargin:info[13],projectionElapsedMs:performance.now()-started,heapBytes:m.HEAPU8.buffer.byteLength,forestPayloadBytes:18*N,forestNewBackingBytes:0};result.metrics=snapshot(finalMetrics);
    const validateRevelation=r=>{if(!Number.isFinite(r)||r<0||r>1||!prepareRevelationRange&&r!==revelation)throw fail('INVALID_INPUT','Revelation is outside the certified retained range.');};
    return{width,height,metrics:snapshot(finalMetrics),supportsRevelationRange:prepareRevelationRange,
     boundAt(r=revelation){open();validateRevelation(r);return boundFor(r);},
     scalarAt(i,r=revelation){open();validateRevelation(r);if(!Number.isSafeInteger(i)||i<0||i>=N)throw fail('INVALID_INPUT','Invalid projected pixel.');return m._tm_project_value_at(handle,i,r);},
     // Borrowed native scratch: consume synchronously before another span read.
     // No calculation, certificate or stored endpoint is changed by this read.
     readScalarSpan(first,count,r=revelation){
      open();validateRevelation(r);
      if(!Number.isSafeInteger(first)||!Number.isSafeInteger(count)||first<0||count<1||count>32768||first>N-count)throw fail('INVALID_INPUT','Invalid projected scalar span; maximum 32768 samples.');
      if(m._tm_project_values_at(handle,first,count,r)!==0)throw fail('MEMORY_OWNERSHIP','Cannot read the retained native projection span.');
      return new Float64Array(m.HEAPU8.buffer,m._tm_array(handle,6)>>>0,count);
     },
     dispose(){result.dispose();}};
   }finally{busy=false;zeroBorrow?.release();}
  },
  dispose(){if(closed)return;if(busy||compactExports.size)throw fail('BUSY','Await native target work and release compact exports before disposal.');retirementPending=true;retire();closed=true;retirementPending=false;},
  memory(){return{closed,busy,solved,retirementPending,heapMaximumBytes:plan.wasmMaximumBytes,requestedHeapMaximumBytes:plan.requestedHeapMaximumBytes,heapBytes:m?.HEAPU8.buffer.byteLength??funding?.stats().materializedBytes??0,accountedHeapBytes:funding?.stats().reservedBytes??0};}
 };return result;
}
