import {TypedPages,finishCorrespondences} from './m3-typed-pages.js';
import {copyTreeRanks} from './copy-tree.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError,normalizeResourceError} from './errors.js';
const f=Math.fround;
export function numpyFloat32Sum(a,start=0,n=a.length){
  if(n<8){let sum=-0;for(let i=0;i<n;i++)sum=f(sum+a[start+i]);return sum;}
  if(n<=128){const r=Array.from(a.subarray(start,start+8));let i=8;for(;i<n-n%8;i+=8)for(let j=0;j<8;j++)r[j]=f(r[j]+a[start+i+j]);let sum=f(f(f(r[0]+r[1])+f(r[2]+r[3]))+f(f(r[4]+r[5])+f(r[6]+r[7])));for(;i<n;i++)sum=f(sum+a[start+i]);return sum;}
  let cut=Math.floor(n/2);cut-=cut%8;return f(numpyFloat32Sum(a,start,cut)+numpyFloat32Sum(a,start+cut,n-cut));
}
export async function normalizeSiftDescriptors(descriptors,root=false,{signal,reserveMemory}={}){
  requireValue(descriptors instanceof Float32Array&&descriptors.length%128===0&&typeof reserveMemory==='function','Invalid SIFT normalization input.');
  checkAbort(signal);reserveMemory(descriptors.byteLength+512);const out=new Float32Array(descriptors.length),squared=new Float32Array(128);
  for(let i=0;i<descriptors.length;i+=128){
    for(let j=0;j<128;j++){const value=descriptors[i+j];requireValue(Number.isFinite(value)&&value>=0,'Invalid SIFT descriptor.');squared[j]=root?value:f(value*value);}
    const sum=numpyFloat32Sum(squared),norm=Math.max(f(1e-12),root?sum:f(Math.sqrt(sum)));
    for(let j=0;j<128;j++){const value=f(descriptors[i+j]/norm);out[i+j]=root?f(Math.sqrt(value)):value;}
    if(i%524288===0)await controlCheckpoint(signal);
  }
  checkAbort(signal);return out;
}
export function compactCopyPoints(points,axes){
  const coords=new Float64Array(points.length/7*2);
  const interp=(x,a)=>{if(x<=0)return a[0];if(x>=a.length-1)return a.at(-1);const k=Math.floor(x);return a[k]+(x-k)*(a[k+1]-a[k]);};
  for(let i=0;i<points.length/7;i++)for(let d=0;d<2;d++)coords[i*2+d]=axes?interp(points[i*7+d],axes[d]):points[i*7+d];return coords;
}
const popcount=Uint8Array.from({length:256},(_,i)=>{let n=0;for(;i;i>>>=1)n+=i&1;return n;});
// Exact spatial filtering precedes descriptor distance. A sparse pixel grid
// bounds candidate storage; only accepted pairs are retained, with ROI context.
export async function spatialCopyMatches({points,descriptors,descriptorSize,members,zoneCount,radius,minimum,threshold,binary=false,compare=false,radii=null,gap=[0,0],axes=null},
 {signal,onProgress,onGpuSubmitted,reserveMemory,maxPairs=Number.MAX_SAFE_INTEGER,budget,backend='auto',binaryTransportState=null,floatDistanceContract=null}={}){
  requireValue(typeof reserveMemory==='function'&&(points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0,'Invalid sparse points or memory admission.');
  const n=points.length/7;
  requireValue(Number.isSafeInteger(descriptorSize)&&descriptorSize>0&&descriptorSize<=1024&&descriptors instanceof (binary?Uint8Array:Float32Array)&&descriptors.length===n*descriptorSize,'Invalid sparse descriptors.');
  requireValue(Number.isSafeInteger(zoneCount)&&zoneCount>0&&zoneCount<=10000&&members instanceof Uint8Array&&members.length===n*zoneCount&&members.every(x=>x<2)&&(!compare||zoneCount===2),'Invalid sparse memberships.');
  requireValue(Number.isFinite(radius)&&radius>0&&Number.isFinite(minimum)&&minimum>=0&&minimum<=radius&&Number.isFinite(threshold)&&threshold>0&&threshold<=1&&Number.isSafeInteger(maxPairs)&&maxPairs>=0&&maxPairs<=Number.MAX_SAFE_INTEGER,'Invalid sparse matching settings.');
  requireValue(Array.isArray(gap)&&gap.length===2&&gap.every(Number.isFinite)&&(!radii||radii.length===zoneCount&&Array.from(radii).every(x=>Number.isFinite(x)&&x>=0)),'Invalid sparse search distances.');
  requireValue(!axes||axes.length===2&&axes.every(a=>(a instanceof Float32Array||a instanceof Float64Array)&&a.length&&a.every(Number.isFinite)),'Invalid compact coordinates.');
  requireValue(points.every(Number.isFinite)&&descriptors.every(Number.isFinite),'Nonfinite sparse input.');
  reserveMemory(n*208+zoneCount*16+descriptorSize*4+8192);checkAbort(signal);
  const coords=compactCopyPoints(points,axes),queryRadius=radius+Math.sqrt(gap[0]*gap[0]+gap[1]*gap[1]),grid=new Map(),cell=x=>Math.floor(x/queryRadius),address=(x,y)=>x+','+y;
  for(let i=0;i<n;i++){const x=cell(coords[i*2]),y=cell(coords[i*2+1]);requireValue(Number.isSafeInteger(x)&&Number.isSafeInteger(y),'Spatial coordinate range exceeded.');const k=address(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
  const ranks=await copyTreeRanks(coords,{signal,reserveMemory}),rows=new TypedPages(Float64Array,5,reserveMemory),squared=new Float32Array(descriptorSize),round=points instanceof Float32Array&&!axes?f:x=>x;let evaluated=0,checks=0,lastYield=performance.now();
  const yieldIfNeeded=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
  let gpu,gpuStats,gpuFallback,stageFree,pairBuffer,distanceBuffer,pendingCount=0,attempted=false;
  requireValue(binaryTransportState===null||(binaryTransportState instanceof Map||binaryTransportState instanceof WeakMap),'Invalid binary transport owner');const previous=binaryTransportState?.get(descriptors),profileChoice=(profile,pairs,cold)=>{const cpu=profile.cpuMsPerPair*pairs,gpu=profile.gpuMsPerPair*pairs+(cold?profile.initializationMs:0);return Number.isFinite(cpu)&&Number.isFinite(gpu)&&cpu>0&&gpu<cpu*.9?'gpu':'cpu';};
  const floatTransport=backend==='webgpu'&&floatDistanceContract==='signed-unit'&&!binary&&[64,128].includes(descriptorSize)&&descriptors.every(v=>Number.isFinite(v)&&v>=-1&&v<=1);
  // Automatic backend choice belongs to the useful-work caller before ownership.
  // An unresolved Auto request keeps the historical CPU calculation; no forced
  // CPU/GPU page exploration is issued to learn a machine profile.
  let batchBinary=(binary||floatTransport)&&!!budget?.reserve&&backend==='webgpu'&&descriptorSize<=128;
  const capacity=262144,page=32768,denominator=descriptorSize*8;let scratch;let autoChoice=['cpu','gpu'].includes(previous?.winner)?previous.winner:null,observation=null;const transport={cpuPairs:0,gpuPairs:0,cpuScoringMs:0,cpuScoringControlMs:0,gpuScoringMs:0,initializationMs:0,policy:backend==='auto'?'actual-disjoint-consumed-pages':'explicit-backend'};
  const floatScore=(i,j)=>{for(let k=0;k<descriptorSize;k++){const d=f(descriptors[j*descriptorSize+k]-descriptors[i*descriptorSize+k]);squared[k]=f(d*d);}return f(Math.sqrt(numpyFloat32Sum(squared)));};
  const hammingCount=(i,j)=>{let count=0;for(let k=0;k<descriptorSize;k++)count+=popcount[descriptors[i*descriptorSize+k]^descriptors[j*descriptorSize+k]];return count;};const hamming=(i,j)=>hammingCount(i,j)/denominator;
  const publish=(i,j,score,distance,contexts)=>{if(!(score<=threshold))return;
   if(!contexts){contexts=[];if(compare)contexts.push(-1);else for(let zone=0;zone<zoneCount;zone++)if(members[i*zoneCount+zone]&&members[j*zoneCount+zone]&&(!radii||distance<=radii[zone]))contexts.push(zone);}
   for(const zone of contexts){if(rows.length>=maxPairs)throw new EngineError('MEMORY_LIMIT','Correspondences exceed the explicit caller limit.');rows.push(i,j,score,distance,zone);}
  };
  let mayFallback;
  const cpuRange=async(begin,end)=>{for(let first=begin;first<end;first+=page){const last=Math.min(end,first+page);if(scratch){for(let block=first;block<last;block+=4096){checkAbort(signal);const until=Math.min(last,block+4096),started=performance.now();for(let k=block;k<until;k++)scratch[k-first]=floatTransport?floatScore(pairBuffer[k*2],pairBuffer[k*2+1]):hammingCount(pairBuffer[k*2],pairBuffer[k*2+1]);transport.cpuScoringMs+=performance.now()-started;const control=performance.now();await yieldIfNeeded();transport.cpuScoringControlMs+=performance.now()-control;}}for(let k=first;k<last;k++){publish(pairBuffer[k*2],pairBuffer[k*2+1],scratch?(floatTransport?scratch[k-first]:scratch[k-first]/denominator):floatTransport?floatScore(pairBuffer[k*2],pairBuffer[k*2+1]):hamming(pairBuffer[k*2],pairBuffer[k*2+1]),distanceBuffer[k]);if((k-first)%4096===0)await yieldIfNeeded();}transport.cpuPairs+=last-first;await yieldIfNeeded();}};
  const gpuRange=async(begin,end)=>{
   let result,failed=false,primary;
   try{
    if(!attempted){attempted=true;const initialization=performance.now();try{if(floatTransport){const {createSparseFloatSquaredDistanceGpu,mayFallbackSparseFloatSquaredGpu}=await import('./sparse-sift-float-distance-gpu.js');mayFallback=mayFallbackSparseFloatSquaredGpu;gpu=await createSparseFloatSquaredDistanceGpu(descriptors,descriptorSize,{budget,signal,descriptorDomain:'signed-unit'});}else{const {createSparseBinaryDistanceGpu,mayFallbackSparseBinaryGpu}=await import('./sparse-binary-distance-gpu.js');mayFallback=mayFallbackSparseBinaryGpu;gpu=await createSparseBinaryDistanceGpu(descriptors,descriptorSize,{budget,signal});}transport.initializationMs+=performance.now()-initialization;}catch(error){if(error.gpuCleanup)try{await error.gpuCleanup();}catch(cleanup){try{error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];}catch{}throw error;}checkAbort(signal);if(mayFallback&&!mayFallback(error))throw error;gpuFallback={code:error.code??'GPU_FAILED',message:error.message};}}
    if(gpu){const start=performance.now();try{result=await gpu.distances(pairBuffer.subarray(begin*2,end*2),{signal,onSubmitted:onGpuSubmitted});transport.gpuScoringMs+=performance.now()-start;transport.gpuPairs+=end-begin;}catch(error){checkAbort(signal);gpuFallback={code:error.code??'GPU_FAILED',message:error.message};const owner=gpu;try{await owner.dispose();}catch(cleanup){try{error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];}catch{}throw error;}gpuStats=owner.stats;gpu=null;if(mayFallback&&!mayFallback(error))throw error;}}
    if(!result){autoChoice='cpu';await cpuRange(begin,end);return false;}
    for(let k=begin;k<end;k++){publish(pairBuffer[k*2],pairBuffer[k*2+1],floatTransport?f(Math.sqrt(result.values[k-begin])):result.values[k-begin]/denominator,distanceBuffer[k]);if((k-begin)%4096===0)await yieldIfNeeded();}return true;
   }catch(error){failed=true;primary=error;throw error;}
   finally{try{await result?.release();}catch(cleanup){if(failed)try{primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}else throw cleanup;}}
  };
  const flush=async()=>{
   if(!pendingCount)return;
   try{
    if(backend==='cpu'){await cpuRange(0,pendingCount);return;}
    if(backend==='webgpu'||floatTransport){await gpuRange(0,pendingCount);return;}
    await cpuRange(0,pendingCount);
   }finally{pendingCount=0;}
  };
  let failed=false,primary;
  try{
   if(batchBinary)try{stageFree=budget.reserve(capacity*16+(backend!=='webgpu'?page*4:0));pairBuffer=new Uint32Array(capacity*2);distanceBuffer=new Float64Array(capacity);if(backend!=='webgpu')scratch=floatTransport?new Float32Array(page):new Uint32Array(page);}catch(error){pairBuffer=distanceBuffer=scratch=null;try{await stageFree?.();}catch(cleanup){try{error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];}catch{}throw error;}stageFree=null;batchBinary=false;const allocation=normalizeResourceError(error);if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(allocation?.code))throw error;gpuFallback={code:allocation.code,message:allocation.message};}
  for(let i=0;i<n;i++){
    checkAbort(signal);const x=cell(coords[i*2]),y=cell(coords[i*2+1]),candidates=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of grid.get(address(x+dx,y+dy))??[])if(j>i)candidates.push(j);
    candidates.sort((a,b)=>ranks[a]-ranks[b]);
    for(const j of candidates){
      const rawX=coords[j*2]-coords[i*2],rawY=coords[j*2+1]-coords[i*2+1];if(rawX*rawX+rawY*rawY>queryRadius*queryRadius)continue;
      let dx=round(rawX),dy=round(rawY),normRound=round;
      if(compare&&(gap[0]||gap[1])){const direction=members[i*2]&&members[j*2+1]?1:-1;dx-=direction*gap[0];dy-=direction*gap[1];normRound=x=>x;}
      const distance=normRound(Math.sqrt(normRound(normRound(dx*dx)+normRound(dy*dy))));if(distance<minimum||distance>radius)continue;
      const contexts=[];
      if(compare){if(!(members[i*2]&&members[j*2+1]||members[i*2+1]&&members[j*2]))continue;contexts.push(-1);}
      else for(let zone=0;zone<zoneCount;zone++)if(members[i*zoneCount+zone]&&members[j*zoneCount+zone]&&(!radii||distance<=radii[zone]))contexts.push(zone);
      if(!contexts.length)continue;evaluated++;
      if(batchBinary){pairBuffer[pendingCount*2]=i;pairBuffer[pendingCount*2+1]=j;distanceBuffer[pendingCount++]=distance;if(pendingCount===capacity)await flush();}
      else{let score=0;
       if(binary){transport.cpuPairs++;score=hamming(i,j);}
       else{for(let k=0;k<descriptorSize;k++){const d=f(descriptors[j*descriptorSize+k]-descriptors[i*descriptorSize+k]);squared[k]=f(d*d);}score=f(Math.sqrt(numpyFloat32Sum(squared)));}
       publish(i,j,score,distance,contexts);
      }
      if(++checks%512===0)await yieldIfNeeded();
    }
    if(i%32===0){onProgress?.((i+1)/Math.max(1,n));await yieldIfNeeded();}
  }
  await flush();gpuStats=gpu?.stats??gpuStats;
  const {pairs,pairSearchRegions}=finishCorrespondences(rows,{maxPairs});
  checkAbort(signal);onProgress?.(1);checkAbort(signal);return {pairs,pairSearchRegions,candidateComparisons:evaluated,backend:gpuStats?.calls?'hybrid':'cpu',preflightExecutions:0,...(batchBinary||gpuFallback||previous?{metadata:{distance:floatTransport?'unchanged normalized float distance; NumPy8-lane squared sum and CPU square root':'unchanged normalized binary Hamming',candidateGeometry:'unchanged CPU precision/order before descriptor scoring',gpu:gpuStats??null,gpuFallback:gpuFallback??null,transport:{...transport,selected:transport.gpuPairs?(transport.cpuPairs?'hybrid':'gpu'):'cpu',preferred:autoChoice,cpuTiming:batchBinary?'scoring-only-paged-path':'unchanged-inline-CPU-path',observation:observation??previous??null}}}:{})};
  }catch(error){failed=true;primary=error;throw error;}finally{const cleanup=[];try{await gpu?.dispose();}catch(error){cleanup.push(error);}try{rows.dispose();}catch(error){cleanup.push(error);}try{await stageFree?.();}catch(error){cleanup.push(error);}if(cleanup.length){if(failed)try{primary.cleanupErrors=[...(primary.cleanupErrors??[]),...cleanup];}catch{}else throw cleanup[0];}if(!failed&&backend==='auto'&&observation){checkAbort(signal);binaryTransportState?.set(descriptors,observation);}}
}
