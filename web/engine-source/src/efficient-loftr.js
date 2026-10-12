import {EngineError,requireValue,checkAbort} from './errors.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {EFFICIENT_LOFTR_ASSET,efficientLoFtrRuntimes} from './efficient-loftr-assets.js';
import {efficientLoFtrParams,efficientLoFtrCrop,efficientLoFtrVariants,efficientLoFtrShape,efficientLoFtrWorkspace,
 prepareEfficientLoFtr,transformEfficientLoFtr,mapEfficientLoFtrPoint,efficientLoFtrInside} from './efficient-loftr-input.js';
import {pairedBiomes} from './copy-biomes.js';
import {verifyCopyGeometry,createGeometryKernel,rejectSelfCopies} from './copy-geometry.js';
import {copyPalette} from './copy-subbiomes.js';
import {sparseStageCache} from './sparse-stage-cache.js';
import {registerArrayViews} from './allocation.js';

const valueBytes=value=>ArrayBuffer.isView(value)?value.byteLength:typeof value==='string'?value.length*2:!value||typeof value!=='object'?8:Object.values(value).reduce((sum,x)=>sum+valueBytes(x)+32,64);
let nextId=0;

/** Genuine EfficientLoFTR pairwise comparison, with no self-image identity
 * shortcut or substitute detector. All transformations share the common
 * admission broker; only an active, independently finishing job may be waited
 * upon. A caller owns the result lease and can render/export without inference.
 */
export class EfficientLoFtrEngine{
 constructor(image,budget,profile,{poolFactory=(...args)=>new NeuralGraphPool(...args)}={}){
  requireValue(image?.format==='rgb8'&&Number.isSafeInteger(image.width)&&image.width>0&&Number.isSafeInteger(image.height)&&image.height>0&&(typeof image.readRows==='function'||image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3),'Invalid EfficientLoFTR image.');
  requireValue(budget&&typeof budget.reserve==='function'&&profile&&Number.isInteger(profile.maxWorkers)&&profile.maxWorkers>0,'EfficientLoFTR requires a shared budget and worker profile.');
  this.image=image;this.budget=budget;this.profile=profile;this.poolFactory=poolFactory;this.lifetime=new AbortController();this.running=false;this.disposed=false;this.prefix='eloftr-raw-'+(++nextId)+'/';
 }
 async dispose(){this.disposed=true;this.lifetime.abort();await this.finished;this.budget.clearPrefix(this.prefix);}
 async analyze(input={},hooks={}){
  const p=efficientLoFtrParams(input),identity=hooks.models?.eloftr;
  requireValue(!this.running&&!this.disposed,'EfficientLoFTR engine busy or disposed.');
  requireValue(typeof identity?.url==='string'&&identity.url.length>0&&identity.bytes===EFFICIENT_LOFTR_ASSET.bytes&&identity.sha256===EFFICIENT_LOFTR_ASSET.sha256,'EfficientLoFTR requires its pinned full FP32 model.');
  const backend=hooks.backend??'auto';requireValue(['auto','cpu','webgpu'].includes(backend),'Invalid EfficientLoFTR backend.');
  const crops=p.regions.map(poly=>efficientLoFtrCrop(this.image,poly,p.longSide));
  requireValue(crops[0].x!==crops[1].x||crops[0].y!==crops[1].y||crops[0].width!==crops[1].width||crops[0].height!==crops[1].height,'EfficientLoFTR requires two distinct regions, not the same image twice.');
  const variants=efficientLoFtrVariants(p),sourceShape=efficientLoFtrShape(crops[0]),bounds=variants.map(v=>efficientLoFtrWorkspace(sourceShape,efficientLoFtrShape(crops[1],v.rotation)));
  // A fixed ABI ceiling is checked before reading the image. It never silently
  // lowers the requested resolution or changes the matching algorithm.
  for(const b of bounds)requireValue(Number.isSafeInteger(b.workspaceBytes),'EfficientLoFTR workspace exceeds numerical range.');
  const controller=new AbortController(),signal=AbortSignal.any([controller.signal,this.lifetime.signal,...(hooks.signal?[hooks.signal]:[])]);
  checkAbort(signal);this.running=true;let finish;this.finished=new Promise(resolve=>{finish=resolve;});
  const scratch=[],admit=bytes=>{const release=this.budget.reserve(bytes);scratch.push(release);return release;};
  let source,target,pool,kernel,outputLease,preparation;const raw=[],cacheHits={};let fraction=0,completed=0;
  const cache=sparseStageCache(this.budget,this.prefix,{signal,byteLength:valueBytes,hits:cacheHits});
  const report=(phase,next,detail={})=>{fraction=Math.max(fraction,next);hooks.onProgress?.({...detail,phase,fraction});};
  try{
   report('eloftr-preparing',0);
   const runtimes=hooks.runtimes??efficientLoFtrRuntimes(),prepare=()=>preparation??=(async()=>{
    if(backend==='cpu'||!globalThis.navigator?.gpu)for(const b of bounds){
     const maximum=Math.ceil((64*1024**2+identity.bytes*2+b.workspaceBytes)/(16*1024**2))*16*1024**2;
     if(maximum>EFFICIENT_LOFTR_ASSET.wasmMaximumBytes)throw new EngineError('MEMORY_LIMIT','EfficientLoFTR requested pair exceeds the 2 GiB runtime; lower the explicit long-side setting.',{details:{longSide:p.longSide,workspaceBytes:b.workspaceBytes,wasmMaximumBytes:EFFICIENT_LOFTR_ASSET.wasmMaximumBytes}});
    }
    source=await prepareEfficientLoFtr(this.image,crops[0],{signal,reserveMemory:bytes=>this.budget.reserve(bytes)});
    target=await prepareEfficientLoFtr(this.image,crops[1],{signal,reserveMemory:bytes=>this.budget.reserve(bytes)});
    pool=this.poolFactory(this.budget,this.profile,{assets:{eloftr:{...EFFICIENT_LOFTR_ASSET,...identity}},runtimes,resourceOwner:'sift'});
   })();
   report('eloftr-matching',.05);
   let firstFailure;
   const jobs=variants.map(async(variant,index)=>{
    let transformed,result;
    try{
     checkAbort(signal);
     const name='variant'+index+'/'+JSON.stringify([identity.sha256,crops,p.longSide,variant,p.threshold,backend,runtimes]);
     const value=await cache.memo(name,async()=>{
     await prepare();transformed=transformEfficientLoFtr(target,variant,{reserveMemory:bytes=>this.budget.reserve(bytes)});
     const threshold={data:Float32Array.of(p.threshold),dims:[],type:'float32'};
     result=await pool.run('eloftr',{image0:{data:source.data,dims:source.dims,type:'float32'},image1:{data:transformed.data,dims:transformed.dims,type:'float32'},threshold},{
      ...bounds[index],signal,backend,onProgress:event=>{
       if(event.phase?.startsWith('resource-'))hooks.onProgress?.(event);
       else report('eloftr-matching',.05+.7*completed/variants.length,{variant,...event});
      }});
     const {keypoints0:a,keypoints1:b,confidence:c}=result.result,count=c?.data?.length;
     requireValue(Number.isInteger(count)&&count<=bounds[index].maximumMatches&&a?.data instanceof Float32Array&&b?.data instanceof Float32Array&&c.data instanceof Float32Array&&a.data.length===count*2&&b.data.length===count*2&&a.dims.length===2&&a.dims[0]===count&&a.dims[1]===2&&b.dims.length===2&&b.dims[0]===count&&b.dims[1]===2&&c.dims.length===1&&c.dims[0]===count,'Invalid EfficientLoFTR output tensors.');
     for(let i=0;i<count;i++)requireValue([a.data[i*2],a.data[i*2+1],b.data[i*2],b.data[i*2+1],c.data[i]].every(Number.isFinite)&&c.data[i]>=0&&c.data[i]<=1.00001,'Nonfinite EfficientLoFTR raw match.');
     const value={variant,count,tensors:result.result,metrics:result.metrics},bytes=Object.values(result.result).reduce((n,t)=>n+t.data.byteLength,0);
     // Register aliases before the result lease is retired: ownership never
     // announces that these cached buffers have actually been freed.
     const backing=registerArrayViews(this.budget,Object.fromEntries(Object.entries(result.result).map(([key,t])=>[key,t.data])),{owner:'sift',label:'eloftr-raw-cache'});
     cache.adopt(value,backing);scratch.push(result.release);result=null;admit(Math.max(0,valueBytes(value)-bytes));return value;
     });
     const hit=cacheHits['variant'+index]===true,metrics=hit?{provider:value.metrics.provider,preflightExecutions:0,inferenceExecutions:0,cacheHit:true,milliseconds:0,workers:0,threads:0,cpuGranted:0,gpuGranted:0,sourceMetrics:value.metrics}:{...value.metrics,cacheHit:false,inferenceExecutions:1};
     raw[index]={variant,count:value.count,result:{result:value.tensors,metrics}};completed++;report(hit?'eloftr-cache':'eloftr-matching',.05+.7*completed/variants.length,{variant,matches:value.count,cacheHit:hit});
    }catch(error){firstFailure??=error;controller.abort();throw error;}
    finally{result?.release();transformed?.release();}
   });
   const settled=await Promise.allSettled(jobs);if(firstFailure)throw firstFailure;
   for(const job of settled)if(job.status==='rejected')throw job.reason;
   checkAbort(signal);
   const maximum=raw.reduce((n,r)=>n+r.count,0);admit(maximum*(2*7*8+4*8+4));
   const points=new Float64Array(maximum*14),pairs=new Float64Array(maximum*4),owners=new Int32Array(maximum);let count=0;
   for(let index=0;index<raw.length;index++){
    const r=raw[index],{keypoints0:a,keypoints1:b,confidence:c}=r.result.result;
    for(let i=0;i<r.count;i++){
     requireValue([a.data[i*2],a.data[i*2+1],b.data[i*2],b.data[i*2+1]].every(Number.isFinite),'Nonfinite EfficientLoFTR keypoint.');
     const confidence=c.data[i];requireValue(Number.isFinite(confidence)&&confidence>=0&&confidence<=1.00001,'Nonfinite EfficientLoFTR confidence.');
     const sourcePoint=mapEfficientLoFtrPoint(a.data[i*2],a.data[i*2+1],crops[0]),targetPoint=mapEfficientLoFtrPoint(b.data[i*2],b.data[i*2+1],crops[1],r.variant);
     if(!sourcePoint||!targetPoint||!efficientLoFtrInside(sourcePoint,p.regions[0])||!efficientLoFtrInside(targetPoint,p.regions[1])||p.excluded.some(poly=>efficientLoFtrInside(sourcePoint,poly)||efficientLoFtrInside(targetPoint,poly)))continue;
     const displacement=Math.hypot(sourcePoint[0]-targetPoint[0],sourcePoint[1]-targetPoint[1]);if(displacement<p.minimum)continue;
     const sourceId=count*2,targetId=sourceId+1;
     points.set([...sourcePoint,8*Math.max(crops[0].width/crops[0].contentWidth,crops[0].height/crops[0].contentHeight),-1,confidence,0,0],sourceId*7);
     points.set([...targetPoint,8*Math.max(crops[1].width/crops[1].contentWidth,crops[1].height/crops[1].contentHeight),-1,confidence,0,index+1],targetId*7);
     pairs.set([sourceId,targetId,confidence,displacement],count*4);owners[count]=index;count++;
    }
   }
   const metrics=raw.map(r=>({...r.result.metrics,variant:r.variant,rawMatches:r.count}));raw.length=0;
   // Keep narrow views on the one admitted allocation; never copy the field
   // merely to trim it. The returned lease counts its complete backing extent.
   let keptPoints=points.subarray(0,count*14),keptPairs=pairs.subarray(0,count*4),keptOwners=owners.subarray(0,count);
   const eligibleMatches=count;
   if(count>p.limit){
    admit(count*32+p.limit*(14*8+4*8+4));
    // This is the user's output limit, not an approximation to the native
    // matcher. Keep the strongest eligible confidences across all transforms;
    // equal confidences use original variant/match order deterministically.
    const selected=Array.from({length:count},(_,i)=>i).sort((a,b)=>pairs[b*4+2]-pairs[a*4+2]||a-b).slice(0,p.limit).sort((a,b)=>a-b);
    keptPoints=new Float64Array(p.limit*14);keptPairs=new Float64Array(p.limit*4);keptOwners=new Int32Array(p.limit);
    selected.forEach((row,i)=>{keptPoints.set(points.subarray(row*14,row*14+14),i*14);keptPairs.set([i*2,i*2+1,pairs[row*4+2],pairs[row*4+3]],i*4);keptOwners[i]=owners[row];});count=p.limit;
   }
   // Finished ORT contexts are no longer useful to grouping/rendering. Free
   // them before admitting OpenCV, rather than holding idle heaps indefinitely.
   pool?.dispose();pool=null;report('eloftr-grouping',.77,{matches:count});
   const groups=await pairedBiomes(keptPoints,keptPairs,p.tolerance,{signal,reserveMemory:admit,pairSearchRegions:keptOwners,onProgress:f=>report('eloftr-grouping',.77+.07*f)});
   let fitted={groups,models:[]},rejected=[];
   if(groups.length){
    if(p.model!=='None'||cropsOverlap(crops[0],crops[1]))kernel=await createGeometryKernel({signal,reserveMemory:admit});
    fitted=await verifyCopyGeometry(keptPoints,keptPairs,groups,{model:p.model,threshold:p.geometricThreshold,minimum:p.geometricMinimum,reflection:p.reflections,signal,reserveMemory:admit,kernel,onProgress:f=>report('eloftr-geometry',.84+.1*f)});
    if(cropsOverlap(crops[0],crops[1])){const accepted=await rejectSelfCopies(keptPoints,keptPairs,fitted.groups,fitted.models,p.minimum,{signal,reserveMemory:admit,kernel});fitted=accepted;rejected=accepted.rejected;}
   }
   const palette=copyPalette(fitted.groups,keptPairs,p.threshold,{reserveMemory:admit});
   const output={status:'ok',points:keptPoints,pairs:keptPairs,pair_search_regions:keptOwners,groups:fitted.groups,models:fitted.models,...palette,
    total_features:count*2,candidate_comparisons:bounds.reduce((n,b)=>n+b.candidateComparisons,0),
    params:p,regions:p.regions,compare:true,backend:metrics.some(m=>m.provider==='webgpu')?'hybrid':'cpu',rejected_biomes:rejected,
    metadata:{algorithm:'EfficientLoFTR',sourceCommit:EFFICIENT_LOFTR_ASSET.sourceCommit,checkpointSha256:EFFICIENT_LOFTR_ASSET.checkpointSha256,
     graphSha256:identity.sha256,license:EFFICIENT_LOFTR_ASSET.license,variant:'full',precision:'float32',preflightExecutions:0,inferenceExecutions:metrics.reduce((n,m)=>n+m.inferenceExecutions,0),rawCacheHits:metrics.filter(m=>m.cacheHit).length,
     coordinates:'original-pixel-centres',colorOrder:'BGR',inputColorOrder:'RGB',tensorColorSpace:'grayscale',preprocessing:'rgb-gray14/half-pixel-bilinear/down-only/right-bottom-zero-padding32',
     crops,variants,matching:metrics,rawMatches:metrics.reduce((n,m)=>n+m.rawMatches,0),
     publicationFilter:{limit:p.limit,eligibleMatches,keptMatches:count,criterion:'confidence descending; ties original variant/match order; native graph unchanged'},
     training:'MegaDepth outdoor correspondence; confidence is not a calibrated forgery probability',
     qualification:'Official full FP32 weights; native ONNX and browser numerical receipts are separate. FP32 backends can select different pixels within a fine patch when confidence maxima are nearly equal.'}};
   // valueBytes sees narrow views. Count the untrimmed backing once as well.
   const reserved=valueBytes(output)+(keptPoints.buffer===points.buffer?points.byteLength-keptPoints.byteLength:0)+
    (keptPairs.buffer===pairs.buffer?pairs.byteLength-keptPairs.byteLength:0)+(keptOwners.buffer===owners.buffer?owners.byteLength-keptOwners.byteLength:0);
   outputLease=this.budget.reserve(reserved);checkAbort(signal);report('complete',1,{matches:count,biomes:fitted.groups.length});
   const lease=outputLease;outputLease=null;let released=false;return {...output,release(){if(!released){released=true;lease();}}};
  }finally{
   controller.abort();pool?.dispose();kernel?.dispose();source?.release();target?.release();outputLease?.();
   for(const release of scratch.reverse())release();cache.finish({publish:!this.disposed});this.running=false;finish();
  }
 }
}
function cropsOverlap(a,b){return a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;}
