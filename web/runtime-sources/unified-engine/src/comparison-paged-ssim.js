import "../../runtime-context.js?v=0.14.5";
import {EngineError,controlCheckpoint} from './errors.js';import {WaveletStripPool} from './wavelet-strip-pool.js';import {createSsimBand} from './comparison-ssim-band.js';import {createFloatPlane} from './segmented-float-plane.js';import {pcaStreamMath} from './pca-stream-math.js';
const MIB=1024**2;
export function pagedSsimPlan(width,height,budget,blockPixels=65536){const room=budget.limit-budget.retained-budget.active,rows=Math.min(height,Math.max(1,Math.floor(blockPixels/width)),Math.floor((room-32*MIB)/(width*128))-Math.min(height,10));if(rows<1)throw new EngineError('MEMORY_LIMIT','One SSIM row with its native halo must fit.');const pixels=Math.min(height,rows+10)*width;return {rows,pixels,workspace:24*MIB+pixels*128};}
export async function comparisonPagedSsim(images,output,{budget,signal,onProgress,profile={},original=false,blockPixels=65536}={}){
 const {width,height}=images[0].surface.descriptor,n=width*height,plan=pagedSsimPlan(width,height,budget,blockPixels),reserve=budget.reserve(plan.workspace),pool=new WaveletStripPool(budget,{...profile,workerHeapBytes:16*MIB,workerPixelBytes:128,workerFactory:globalThis.Worker?()=>new Worker(new URL('./comparison-ssim-worker.js',import.meta.url),{type:'module'}):null});let raw,local;let heapPeak=0,done=0;
 try{raw=await createFloatPlane(width,height,{budget,storage:images[0].session||images[0].ensureTemporarySession?'temporary':'memory',temporarySession:images[0].session,getTemporarySession:images[0].ensureTemporarySession,signal});
 await pool.run({count:Math.ceil(height/plan.rows),pixels:plan.pixels,key:`ssim/${width}/${plan.rows}`,signal,
  prepare:async i=>{await controlCheckpoint(signal);const y=i*plan.rows,rows=Math.min(plan.rows,height-y),top=Math.max(0,y-5),bottom=Math.min(height,y+rows+5),rect={x:0,y:top,width,height:bottom-top};let a,b;try{a=await images[0].surface.readWindow(rect,{signal});b=await images[1].surface.readWindow(rect,{signal});return {first:a.pixels.data,second:b.pixels.data,width,height:bottom-top,top:y-top,rows,original};}finally{a?.release();b?.release();}},
  local:async job=>{local??=await createSsimBand();return local.run(job);},
  consume:async(result,i)=>{const y=i*plan.rows,rows=Math.min(plan.rows,height-y);await raw.write(result.values,0,y,width,rows,{signal});heapPeak=Math.max(heapPeak,result.heapBytes);done+=rows;onProgress?.({phase:'comparison-ssim-convolution',completed:done,total:height});}
 });pool.clear();local?.dispose();local=null;
 const sums=[0,0,0,0];let lo=Infinity,hi=-Infinity,tail=0;
 for(let y=0;y<height;y+=plan.rows){await controlCheckpoint(signal);const rows=Math.min(plan.rows,height-y),values=await raw.read(0,y,width,rows,{signal});for(let i=0;i<values.length;i++){const at=y*width+i,v=values[i];lo=Math.min(lo,v);hi=Math.max(hi,v);if(at<n-n%4)sums[at%4]+=v;else tail+=v;}}
 const score=(((sums[0]+sums[1])+sums[2])+sums[3]+tail)/n;
 if(output){const math=await pcaStreamMath(),limits=new Float64Array([lo,hi]);for(let y=0;y<height;y+=plan.rows){await controlCheckpoint(signal);const rows=Math.min(plan.rows,height-y),values=await raw.read(0,y,width,rows,{signal});await output.write(math.normalize(values,1,limits,n,true),y*width*3);onProgress?.({phase:'comparison-ssim-normalize',completed:y+rows,total:height});}await output.flush();}
 return {score,metrics:{...pool.metrics(),paged:true,workspaceBytes:plan.workspace,coreRows:plan.rows,halo:5,heapPeak,rawBytes:n*8}};
 }finally{pool.clear();local?.dispose();await raw?.dispose();reserve();}
}
