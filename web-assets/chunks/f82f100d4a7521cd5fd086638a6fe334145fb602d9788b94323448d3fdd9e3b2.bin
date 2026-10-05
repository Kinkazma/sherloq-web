import {parallelZeroBands,zeroStreamWorkerBytes} from './zero-stream-pool.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbRecompression,rgbRecompressionPlan} from './jpeg-rgb-stream.js';
const MiB=1024**2;
export function zeroStreamPlan(surface){
 const {width,height}=surface.descriptor,n=width*height;requireValue(Number.isInteger(width)&&Number.isInteger(height)&&width>=16&&height>=16&&width<=65500&&height<=65500&&Number.isSafeInteger(n)&&n<2**31,'ZERO source exceeds its integer/grid domain.');
 const rows=64,maxRows=Math.min(height,rows+14),samples=width*maxRows,heapMaximumBytes=Math.ceil((8*MiB+samples*24)/(16*MiB))*16*MiB;
 if(heapMaximumBytes>128*MiB)throw new EngineError('MEMORY_LIMIT','ZERO band exceeds bounded native heap.');
 return {width,height,n,rows,maxRows,samples,heapMaximumBytes,workingBytes:heapMaximumBytes+8*MiB,windowAllowance:rgbRecompressionPlan(surface).windowAllowance};
}
export function zeroWinningGrid(counts,last){let winner=-1;for(let grid=0;grid<64;grid++)if(counts[grid]>0&&(winner<0||counts[grid]>counts[winner]||counts[grid]===counts[winner]&&last[grid]<last[winner]))winner=grid;return winner;}
export async function createZeroStreamKernel(plan,{budget,signal,reference=false}={}){
 const release=budget.reserve(plan.workingBytes);let m;const pointers=[];
 try{
  const {default:create}=await import('../vendor/zero-stream/zero-stream.js');m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536})});checkAbort(signal);
  for(const size of [plan.samples*3,plan.samples,plan.samples,256,512]){const p=m._malloc(size);if(!p)throw new EngineError('MEMORY_LIMIT','ZERO band allocation failed.');pointers.push(p);}
  const [input,luminance,votes,pc,ps]=pointers;
  return {
   luminance(rgb){m.HEAPU8.set(rgb,input);m._zero_luminance_bytes(input,luminance,rgb.length/3);return m.HEAPU8.subarray(luminance,luminance+rgb.length/3);},
   votes(bytes,rows){m.HEAPU8.set(bytes,input);if(!(reference?m._zero_reference_votes_bytes:m._zero_votes_bytes)(input,votes,plan.width,rows))throw new EngineError('MEMORY_LIMIT','ZERO native vote workspace allocation failed.');return {values:new Int8Array(m.HEAPU8.buffer,votes,bytes.length),fallbacks:m._zero_fallback_count()};},
   scores(counts,last){new Int32Array(m.HEAPU8.buffer,pc,64).set(counts);const main=m._zero_scores_from_counts(pc,plan.width,plan.height,zeroWinningGrid(counts,last),ps);return {main_grid:main,grid_log10_nfa:new Float64Array(m.HEAPU8.buffer,ps,64).slice()};},
   heapBytes:()=>m.HEAPU8.buffer.byteLength,
   dispose(){for(const p of pointers)m._free(p);m=null;release();}
  };
 }catch(error){if(m)for(const p of pointers)m._free(p);release();throw error;}
}

// Internal stage: native integer luminance and votes are losslessly stored in
// one byte each. Global regions and public views/exports consume these stores.
export async function segmentedZeroVotes(image,{budget,signal,onProgress,companion=false,storage='auto',reference=false,maxWorkers=1,adaptive=new AdaptiveConcurrency()}={}){
 const plan=zeroStreamPlan(image.surface);let native,luminance,votes,planning,bufferRelease;
 try{
  planning=budget.reserve(plan.workingBytes+plan.windowAllowance+plan.samples+(companion?rgbRecompressionPlan(image.surface).workingBytes:0));
  const storeOptions={budget,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal};luminance=await createSegmentedBytes(plan.n,storeOptions);votes=await createSegmentedBytes(plan.n,storeOptions);planning();planning=null;
  native=await createZeroStreamKernel(plan,{budget,signal,reference});let jpegMetrics=null;
  if(companion){image.rgbRecompression??=createRgbRecompression(image,budget);jpegMetrics=await image.rgbRecompression.visit(99,{sampling:'444',signal,onProgress,onBand:async(_original,rgb,{y})=>luminance.write(native.luminance(rgb),y*plan.width)});}
  else for(let y=0;y<plan.height;y+=32){await controlCheckpoint(signal);const rows=Math.min(32,plan.height-y),part=await image.surface.readWindow({x:0,y,width:plan.width,height:rows},{signal});try{await luminance.write(native.luminance(part.pixels.data),y*plan.width);}finally{part.release();}onProgress?.({phase:'zero-luminance',fraction:(y+rows)/plan.height});}
  await luminance.flush();const counts=new Int32Array(64),last=new Float64Array(64),done=new Uint8Array(Math.ceil(plan.height/plan.rows));last.fill(Infinity);let fallbacks=0,completedRows=0,workers=1,poolMetrics=null,retry=null,completedBandsPreserved=0;
  const accept=async(selected,{y,end,lo,fallbacks:bandFallbacks})=>{
   for(let i=0;i<selected.length;i++)if(selected[i]>=0)selected[i]=selected[i]%8+((Math.floor(selected[i]/8)+lo)%8)*8;
   await votes.write(new Uint8Array(selected.buffer,selected.byteOffset,selected.byteLength),y*plan.width);
   for(let row=y;row<end;row++)for(let x=0;x<plan.width;x++){const grid=selected[(row-y)*plan.width+x];if(grid>=0){counts[grid]++;const position=x*plan.height+row;if(!Number.isFinite(last[grid])||position>last[grid])last[grid]=position;}}
   done[y/plan.rows]=1;completedRows+=end-y;fallbacks+=bandFallbacks;onProgress?.({phase:'zero-votes',fraction:completedRows/plan.height,workers});
  };
  const maximum=!reference&&typeof Worker!=='undefined'&&plan.n>=1048576?Math.max(1,Math.min(maxWorkers,done.length)):1,key=plan.width+'/'+plan.height,started=performance.now();let scheduling={count:1,maximum,policy:'immediate-useful-work',preflightExecutions:0};
  if(maximum>1){native.dispose();native=null;scheduling={...adaptive.select(key,maximum,budget,count=>count>1?count*zeroStreamWorkerBytes(plan):plan.workingBytes+plan.samples),preflightExecutions:0};workers=scheduling.count;}
  if(workers>1)try{poolMetrics=await parallelZeroBands(luminance,plan,workers,{budget,signal,onBand:accept});}catch(error){checkAbort(signal);if(!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,workers);completedBandsPreserved=done.reduce((a,b)=>a+b,0);retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:workers,completedBandsPreserved};workers=1;}
  if(workers===1){native??=await createZeroStreamKernel(plan,{budget,signal,reference});bufferRelease=budget.reserve(plan.samples);const buffer=new Uint8Array(plan.samples);
   for(let y=0;y<plan.height;y+=plan.rows){if(done[y/plan.rows])continue;await controlCheckpoint(signal);const end=Math.min(plan.height,y+plan.rows),lo=Math.max(0,y-7),hi=Math.min(plan.height,end+7),part=buffer.subarray(0,(hi-lo)*plan.width);await luminance.readInto(part,lo*plan.width);checkAbort(signal);const result=native.votes(part,hi-lo);await accept(result.values.subarray((y-lo)*plan.width,(end-lo)*plan.width),{y,end,lo,fallbacks:result.fallbacks});}
  }
  if(maximum>1)adaptive.observe(key,{count:workers,maximum,milliseconds:performance.now()-started,units:plan.n});native??=await createZeroStreamKernel(plan,{budget,signal,reference});
  await votes.flush();checkAbort(signal);const global=native.scores(counts,last);
  return {width:plan.width,height:plan.height,luminance,votes,...global,dispose:async()=>{try{await luminance.dispose();}finally{await votes.dispose();}},metrics:{workers,scheduling:{...scheduling,retry,completedBandsPreserved},...(poolMetrics??{}),kernel:reference?'zero-reference-overlapping-bands':'zero-native-overlapping-bands',rowsPerChunk:plan.rows,haloRows:7,heapCapacityBytes:native.heapBytes(),heapMaximumBytes:plan.heapMaximumBytes,thresholdFallbacks:fallbacks,luminanceStorage:luminance.storage,voteStorage:votes.storage,retainedPlaneBytes:2*plan.n,...(jpegMetrics?{jpeg99:jpegMetrics}:{})}};
 }catch(error){try{await luminance?.dispose();}finally{await votes?.dispose();}throw error;}finally{bufferRelease?.();planning?.();native?.dispose();}
}
