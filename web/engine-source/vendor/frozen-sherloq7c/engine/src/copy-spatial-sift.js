import {copyTreeRanks} from './copy-tree.js';
import {buildSortedCellNeighborhoods} from './copy-spatial-candidates.js';
import {TypedPages,finishCorrespondences} from './m3-typed-pages.js';
import {spatialCopyMatches,numpyFloat32Sum,compactCopyPoints} from './copy-spatial.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError,normalizeResourceError} from './errors.js';
import {openDistance} from './copy-spatial-native-backend.js';
const f=Math.fround;
export async function spatialSiftCopyMatches(input,options={}){
  if(options.nativeDistance!==true||input.binary)return spatialCopyMatches(input,options);
  return privateFloatMatch(input,options);
}
async function privateFloatMatch({points,descriptors,descriptorSize,members,zoneCount,radius,minimum,threshold,binary=false,compare=false,radii=null,gap=[0,0],axes=null},
 {signal,onProgress,onGpuSubmitted,reserveMemory,maxPairs=Number.MAX_SAFE_INTEGER,nativeVariant="simd-ordered",budget,backend='cpu',floatTransportState=null}={}){
  requireValue(typeof reserveMemory==='function'&&(points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0,'Invalid sparse points or memory admission.');
  const n=points.length/7;requireValue(Number.isSafeInteger(n)&&n<=20000,'Classical SIFT point count exceeds its declared public limit.');
  requireValue(Number.isSafeInteger(descriptorSize)&&descriptorSize>0&&descriptorSize<=1024&&descriptors instanceof (binary?Uint8Array:Float32Array)&&descriptors.length===n*descriptorSize,'Invalid sparse descriptors.');
  requireValue(Number.isSafeInteger(zoneCount)&&zoneCount>0&&zoneCount<=10000&&members instanceof Uint8Array&&members.length===n*zoneCount&&members.every(x=>x<2)&&(!compare||zoneCount===2),'Invalid sparse memberships.');
  requireValue(Number.isFinite(radius)&&radius>0&&Number.isFinite(minimum)&&minimum>=0&&minimum<=radius&&Number.isFinite(threshold)&&threshold>0&&threshold<=1&&Number.isSafeInteger(maxPairs)&&maxPairs>=0&&maxPairs<=Number.MAX_SAFE_INTEGER,'Invalid sparse matching settings.');
  requireValue(Array.isArray(gap)&&gap.length===2&&gap.every(Number.isFinite)&&(!radii||radii.length===zoneCount&&Array.from(radii).every(x=>Number.isFinite(x)&&x>=0)),'Invalid sparse search distances.');
  requireValue(!axes||axes.length===2&&axes.every(a=>(a instanceof Float32Array||a instanceof Float64Array)&&a.length&&a.every(Number.isFinite)),'Invalid compact coordinates.');
  requireValue(points.every(Number.isFinite)&&descriptors.every(Number.isFinite),'Nonfinite sparse input.');
  requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid SIFT backend.');
  if(budget){const {retireSparseFloatGpuFailure}=await import('./sparse-sift-float-distance-gpu.js');await retireSparseFloatGpuFailure(null,budget);checkAbort(signal);}
  reserveMemory(n*208+zoneCount*16+descriptorSize*4+8192);checkAbort(signal);
  const coords=compactCopyPoints(points,axes),queryRadius=radius+Math.sqrt(gap[0]*gap[0]+gap[1]*gap[1]),grid=new Map(),cell=x=>Math.floor(x/queryRadius),address=(x,y)=>x+','+y;
  for(let i=0;i<n;i++){const x=cell(coords[i*2]),y=cell(coords[i*2+1]);requireValue(Number.isSafeInteger(x)&&Number.isSafeInteger(y),'Spatial coordinate range exceeded.');const k=address(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
  const native=budget?.reserve&&Number.isFinite(budget.limit)&&budget.limit-budget.total()<64*1024**2+coords.length*2?{ranks:await copyTreeRanks(coords,{signal,reserveMemory}),distance:()=>null,metrics:{mode:'js',fallbackReason:'native-sidecar-admission'},dispose(){}}:await openDistance(coords,descriptors,descriptorSize,{signal,reserveMemory,variant:nativeVariant});let rows,gpu,stageFree,observation,failed=false,primary;
  try{
  const ranks=native.ranks,orderedCells=await buildSortedCellNeighborhoods(grid,ranks,{signal,reserveMemory:bytes=>{try{reserveMemory(bytes);return true;}catch(error){checkAbort(signal);if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(normalizeResourceError(error)?.code))return false;throw error;}},cooperate:()=>controlCheckpoint(signal),check:()=>checkAbort(signal)});rows=new TypedPages(Float64Array,5,reserveMemory);const squared=new Float32Array(descriptorSize),round=points instanceof Float32Array&&!axes?f:x=>x;let evaluated=0,checks=0,lastYield=performance.now();
  const yieldIfNeeded=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
  requireValue(descriptorSize===128&&descriptors.every(v=>v>=0&&v<=1),'Normalized SIFT/RootSIFT128D required.');
  requireValue(floatTransportState===null||floatTransportState instanceof WeakMap,'Invalid SIFT transport owner.');
  const capacity=262144,page=32768,previous=floatTransportState?.get(descriptors),transport={cpuPairs:0,gpuPairs:0,cpuScoringMs:0,gpuScoringMs:0,initializationMs:0,policy:backend==='auto'?'actual-disjoint-consumed-pages':'explicit-backend'};
  let pairsBuffer,distanceBuffer,scores,pendingCount=0,attempted=false,gpuStats,gpuFallback,choice=previous?.winner;
  let batched=backend!=='cpu'&&!!budget?.reserve;
  if(batched)try{stageFree=budget.reserve(capacity*20);pairsBuffer=new Uint32Array(capacity*2);distanceBuffer=new Float64Array(capacity);scores=new Float32Array(capacity);}catch(error){await stageFree?.();stageFree=null;if(backend==='webgpu'||!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;batched=false;gpuFallback={code:error.code,message:error.message};}
  const cpuScore=(i,j)=>{const fast=native.distance(i,j);if(fast!==null)return fast;for(let k=0;k<descriptorSize;k++){const d=f(descriptors[j*descriptorSize+k]-descriptors[i*descriptorSize+k]);squared[k]=f(d*d);}return f(Math.sqrt(numpyFloat32Sum(squared)));};
  const publish=(i,j,score,distance,contexts)=>{if(!(score<=threshold))return;if(!contexts){contexts=[];if(compare)contexts.push(-1);else for(let zone=0;zone<zoneCount;zone++)if(members[i*zoneCount+zone]&&members[j*zoneCount+zone]&&(!radii||distance<=radii[zone]))contexts.push(zone);}for(const zone of contexts){if(rows.length>=maxPairs)throw new EngineError('MEMORY_LIMIT','Correspondences exceed the explicit caller limit.');rows.push(i,j,score,distance,zone);}};
  const cpuRange=async(begin,end)=>{for(let block=begin;block<end;block+=4096){checkAbort(signal);const until=Math.min(end,block+4096),began=performance.now();for(let k=block;k<until;k++)scores[k]=cpuScore(pairsBuffer[k*2],pairsBuffer[k*2+1]);transport.cpuScoringMs+=performance.now()-began;for(let k=block;k<until;k++)publish(pairsBuffer[k*2],pairsBuffer[k*2+1],scores[k],distanceBuffer[k]);transport.cpuPairs+=until-block;await yieldIfNeeded();}};
  const gpuRange=async(begin,end)=>{
   let result,rangeFailed=false,rangePrimary;
   try{
    if(!attempted){attempted=true;const began=performance.now();try{const{createSparseFloatSquaredDistanceGpu}=await import('./sparse-sift-float-distance-gpu.js');gpu=await createSparseFloatSquaredDistanceGpu(descriptors,128,{budget,signal});transport.initializationMs+=performance.now()-began;}catch(error){const{retireSparseFloatGpuFailure,mayFallbackSparseFloatSquaredGpu}=await import('./sparse-sift-float-distance-gpu.js');try{await retireSparseFloatGpuFailure(error,budget);}catch(cleanup){if(error&&typeof error==='object')try{(error.cleanupErrors??=[]).push(cleanup);}catch{}throw error;}checkAbort(signal);if(backend==='webgpu'||!mayFallbackSparseFloatSquaredGpu(error))throw error;gpuFallback={code:error.code,message:error.message};}}
    if(gpu){try{const began=performance.now();result=await gpu.distances(pairsBuffer.subarray(begin*2,end*2),{signal,onSubmitted:detail=>onGpuSubmitted?.(detail)});const values=result.values;for(let k=begin;k<end;k++)scores[k]=f(Math.sqrt(values[k-begin]));transport.gpuScoringMs+=performance.now()-began;transport.gpuPairs+=end-begin;}catch(error){const{mayFallbackSparseFloatSquaredGpu}=await import('./sparse-sift-float-distance-gpu.js');try{await gpu.dispose();}catch(cleanup){if(error&&typeof error==='object')try{(error.cleanupErrors??=[]).push(cleanup);}catch{}throw error;}gpuStats=gpu.stats;gpu=null;checkAbort(signal);if(backend==='webgpu'||!mayFallbackSparseFloatSquaredGpu(error))throw error;gpuFallback={code:error.code,message:error.message};}}
    if(!result){choice='cpu';await cpuRange(begin,end);return false;}
    for(let k=begin;k<end;k++){publish(pairsBuffer[k*2],pairsBuffer[k*2+1],scores[k],distanceBuffer[k]);if((k-begin)%4096===0)await yieldIfNeeded();}return true;
   }catch(error){rangeFailed=true;rangePrimary=error;throw error;}finally{try{await result?.release();}catch(cleanup){if(rangeFailed){if(rangePrimary&&typeof rangePrimary==='object')try{(rangePrimary.cleanupErrors??=[]).push(cleanup);}catch{}}else throw cleanup;}}
  };
  const profileChoice=(p,n,cold)=>p&&p.cpuMsPerPair*n>0&&p.gpuMsPerPair*n+(cold?p.initializationMs:0)<p.cpuMsPerPair*n*.9?'gpu':'cpu';
  const flush=async()=>{if(!pendingCount)return;try{
   if(backend==='webgpu'){await gpuRange(0,pendingCount);return;}
   if(choice){if(choice==='gpu'&&profileChoice(observation??previous,pendingCount,!attempted)==='gpu')await gpuRange(0,pendingCount);else await cpuRange(0,pendingCount);return;}
   // A partial first page stays on modern native CPU: cold GPU setup cannot be
   // justified by an unmeasured short operation. Full pages are useful outputs.
   if(pendingCount<capacity){await cpuRange(0,pendingCount);return;}
   const cp=transport.cpuPairs,gp=transport.gpuPairs,cm=transport.cpuScoringMs,gm=transport.gpuScoringMs;await cpuRange(0,page);const gotGpu=await gpuRange(page,pendingCount);
   observation={winner:'cpu',cpuMsPerPair:(transport.cpuScoringMs-cm)/(transport.cpuPairs-cp),gpuMsPerPair:gotGpu?(transport.gpuScoringMs-gm)/(transport.gpuPairs-gp):0,initializationMs:transport.initializationMs,cpuObservedPairs:transport.cpuPairs-cp,gpuObservedPairs:transport.gpuPairs-gp,scope:'actual-disjoint-consumed-native-pairs'};observation.winner=gotGpu&&observation.gpuMsPerPair>0?profileChoice(observation,pendingCount,false):'cpu';choice=observation.winner;
  }finally{pendingCount=0;}};
  for(let i=0;i<n;i++){
    checkAbort(signal);const x=cell(coords[i*2]),y=cell(coords[i*2+1]),candidates=orderedCells?orderedCells.lists.get(address(x,y)):[];if(!orderedCells){for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of grid.get(address(x+dx,y+dy))??[])if(j>i)candidates.push(j);candidates.sort((a,b)=>ranks[a]-ranks[b]);}
    for(const j of candidates){if(j<=i)continue;
      const rawX=coords[j*2]-coords[i*2],rawY=coords[j*2+1]-coords[i*2+1];if(rawX*rawX+rawY*rawY>queryRadius*queryRadius)continue;
      let dx=round(rawX),dy=round(rawY),normRound=round;
      if(compare&&(gap[0]||gap[1])){const direction=members[i*2]&&members[j*2+1]?1:-1;dx-=direction*gap[0];dy-=direction*gap[1];normRound=x=>x;}
      const distance=normRound(Math.sqrt(normRound(normRound(dx*dx)+normRound(dy*dy))));if(distance<minimum||distance>radius)continue;
      const contexts=[];
      if(compare){if(!(members[i*2]&&members[j*2+1]||members[i*2+1]&&members[j*2]))continue;contexts.push(-1);}
      else for(let zone=0;zone<zoneCount;zone++)if(members[i*zoneCount+zone]&&members[j*zoneCount+zone]&&(!radii||distance<=radii[zone]))contexts.push(zone);
      if(!contexts.length)continue;evaluated++;
      if(batched){pairsBuffer[pendingCount*2]=i;pairsBuffer[pendingCount*2+1]=j;distanceBuffer[pendingCount++]=distance;if(pendingCount===capacity)await flush();}
      else{transport.cpuPairs++;publish(i,j,cpuScore(i,j),distance,contexts);}
      if(++checks%512===0)await yieldIfNeeded();
    }
    if(i%32===0){onProgress?.((i+1)/Math.max(1,n));await yieldIfNeeded();}
  }
  await flush();gpuStats=gpu?.stats??gpuStats;
  const {pairs,pairSearchRegions}=finishCorrespondences(rows,{maxPairs});
  checkAbort(signal);onProgress?.(1);checkAbort(signal);const result={pairs,pairSearchRegions,candidateComparisons:evaluated,backend:transport.gpuPairs?'hybrid':'cpu',preflightExecutions:0,metadata:{distance:'unchanged128DnormalizedSIFTNumPy8lane-f32-and-CPU-sqrt64',candidateGeometry:'unchanged-native-order-and-membership-before-scoring',gpu:gpuStats??null,gpuFallback:gpuFallback??null,transport:{...transport,selected:transport.gpuPairs?(transport.cpuPairs?'hybrid':'gpu'):'cpu',preferred:backend==='webgpu'?'gpu':backend==='cpu'?'cpu':choice??'cpu',cpuTiming:batched?'scoring-only':'inline-not-isolated',cpuScoringMs:batched?transport.cpuScoringMs:null,observation:observation??previous??null}}};Object.defineProperty(result,'nativeDistanceMetrics',{value:native.metrics,enumerable:false});return result;
  }catch(error){failed=true;primary=error;throw error;}finally{let cleanupFailed=false,cleanupPrimary;for(const close of[()=>gpu?.dispose(),()=>rows?.dispose(),()=>native.dispose(),()=>stageFree?.()])try{await close();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}}if(cleanupFailed){if(failed){if(primary&&typeof primary==='object')try{(primary.cleanupErrors??=[]).push(cleanupPrimary);}catch{}}else throw cleanupPrimary;}if(!failed&&backend==='auto'&&observation){checkAbort(signal);floatTransportState?.set(descriptors,observation);}}
}
