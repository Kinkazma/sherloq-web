import "../../runtime-context.js?v=0.14.5";
import {COMPOSITE_STATISTICS_POLICY,COMPOSITE_STATISTICS_REVISION,compositePolicyMetadata} from './composite-policy.js';
import {createCompositeSegmentedAnalyzer} from './composite-segmented-analyzer.js';
import {renderCompositeSegmented} from './composite-segmented-display.js';
import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {NativeStatistics} from './native-statistics.js';
import {compositeNpz} from './npz.js';
import {compositeStream} from './composite-stream.js';
import {noiseprintResidual} from './noiseprint-network.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
const bytesOf=value=>ArrayBuffer.isView(value)?value.byteLength:value&&typeof value==='object'?Object.values(value).reduce((n,v)=>n+bytesOf(v),0):64;
/** Original Noiseprint models and Composite Splicing statistics; residual and
 * finished stages are cached separately so a failed map keeps useful work. */
export function createCompositeAnalyzer({assets,runtimes,statisticsRuntime,segmentedStorage,budget,computeProfile='aggressive',resourceHints}={}){
  statisticsRuntime=structuredClone(statisticsRuntime);runtimes=structuredClone(runtimes);assets=structuredClone(assets);const configuration=JSON.stringify([assets,runtimes]);
 const profile=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
 const pool=new NeuralGraphPool(budget,profile,{assets,runtimes}),statistics=new NativeStatistics(budget,statisticsRuntime),keys=new Set();let active,disposed=false;const segmented=createCompositeSegmentedAnalyzer({assets,pool,statistics,profile,budget,storage:segmentedStorage??'auto'});
 return {
  async analyze(image,{quality=0,stage='map',memoryBounded}={},options={}){
   if(disposed)throw new EngineError('DISPOSED','Composite analyzer disposed.');if(active)throw new EngineError('BUSY','Composite analysis already running.');
   if(image.surface){active={abort(){}};try{return await segmented.analyze(image,{quality,stage,memoryBounded},options);}finally{active=null;}}
   const {width,height}=image,n=width*height;
   requireValue(Number.isSafeInteger(n)&&Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&image.data instanceof Uint8Array&&image.data.length===n*3,'RGB8 image required.');
   requireValue(Number.isInteger(quality)&&(quality===0||quality>=51&&quality<=101),'Noiseprint quality must be automatic (0) or 51–101.');requireValue(['noise','map'].includes(stage),'Unknown Composite stage.');requireValue(memoryBounded===undefined||typeof memoryBounded==='boolean','Invalid Composite memory option.');const bounded=memoryBounded??n>1050000;
   const controller=new AbortController(),abort=()=>controller.abort();active=controller;options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
   const hooks={...options,signal:controller.signal};let inputLease,prepared,residual,display,mapped,release,cacheLease;
   try{
    checkAbort(hooks.signal);inputLease=budget.reserve(n*6);
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',image.data))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const modelIdentities=quality?assets[String(quality)].sha256:Object.entries(assets).map(([k,v])=>[k,v.sha256]);
    const base='m2/composite/'+JSON.stringify([width,height,digest,quality,bounded,options.backend??'auto',modelIdentities,configuration,'gray-quality-v1']),noiseKey=base+'/noise',mapKey=base+'/map/'+COMPOSITE_STATISTICS_REVISION+'/'+statisticsRuntime.sourceSha256;
    let stored=budget.get(stage==='map'?mapKey:noiseKey)?.value,cached=!!stored;if(stored)cacheLease=budget.reserve(bytesOf(stored));
    if(!stored){
     const noiseCached=budget.get(noiseKey)?.value;
     let data;
     if(noiseCached){cacheLease=budget.reserve(bytesOf(noiseCached));data=noiseCached.data;}
     else{
      const inputs={rgb:{data:image.data,dims:[height,width,3]}};if(quality===0)inputs.automatic={data:new Uint8Array([1]),dims:[1]};
      prepared=await statistics.run('prepare',inputs,{...hooks,workspaceBytes:32*n,outputBytes:4*n+8192});
      const model=quality||Number(prepared.result.model.data[0]);
      if(model<51||model>101)throw new EngineError('MODEL_UNAVAILABLE',`Estimated quality ${model} has no installed Noiseprint model. Choose 51–100 or 101.`);
      const gray=prepared.result.gray.data;
      residual=await noiseprintResidual(gray,width,height,model,{...hooks,budget,pool});
      display=await statistics.run('display',{noise:{data:residual.data,dims:[height,width]}},{...hooks,workspaceBytes:16*n,outputBytes:3*n});
      data={width,height,gray,noise:residual.data,noise_rgb:display.result.noise_rgb.data,model,curve:prepared.result.curve?.data,metadata:{method:'noiseprint',quality:model,automatic:quality===0,coordinateSpace:'source-pixels',nativeOverlap:34,memorySubdivisions:residual.subdivisions}};
      // Cached arrays take over the live leases; room() cannot evict active arrays.
      const noiseValue={data,provenance:{sourceRGBSha256:digest,modelSha256:assets[String(model)].sha256,checkpointSha256:assets[String(model)].checkpointSha256,statisticsSourceSha256:statisticsRuntime.sourceSha256,qualification:'component'}};
      budget.put(noiseKey,{value:noiseValue,byteLength:bytesOf(noiseValue)});keys.add(noiseKey);
     }
     stored={data,provenance:noiseCached?.provenance??budget.get(noiseKey)?.value.provenance??{sourceRGBSha256:digest,modelSha256:assets[String(data.model)].sha256,qualification:'component'}};
     if(stage==='map'){
      try{
       mapped=bounded?await compositeStream(data.gray,data.noise,width,height,{...hooks,budget,statistics,runtime:statisticsRuntime,profile}):await statistics.run('composite',{noise:{data:data.noise,dims:[height,width]},gray:{data:data.gray,dims:[height,width]}},{...hooks,workspaceBytes:160*n+64*1024**2,outputBytes:40*n+1024**2});
       const fields={};for(const [key,t]of Object.entries(mapped.result))if(key!=='spam')fields[key]=t.data;
       const condition=fields.model_conditioning,modelConditioning=condition?{minimumEigenvalue:condition[0],maximumEigenvalue:condition[1],conditionNumber:Number.isFinite(condition[2])?condition[2]:null,numericalRank:condition[3],dimensions:condition[4],rankTolerance:condition[5],status:condition[3]<condition[4]?'ill-conditioned':'full-numerical-rank',regularization:COMPOSITE_STATISTICS_POLICY,units:'covariance of the 32 whitened SPAM features'}:null;
       stored={...stored,provenance:{...stored.provenance,statisticsSourceSha256:statisticsRuntime.sourceSha256,statisticsPolicy:COMPOSITE_STATISTICS_POLICY},data:{...data,...fields,mapShape:mapped.result.map.dims,statisticsShapes:Object.fromEntries(Object.entries(mapped.result).filter(([k])=>k!=='spam').map(([k,v])=>[k,v.dims])),metadata:{...data.metadata,method:'composite_splicing',...compositePolicyMetadata(fields),model_conditioning:modelConditioning,memory_bounded:bounded,bounded_execution:mapped.execution??null,seed:0,features:32,replicates:10,maxIterations:100,outliersNlogl:42}}};
      }catch(e){checkAbort(hooks.signal);if(!['STATISTICS_EXECUTION','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code))throw e;stored={...stored,mapError:{code:e.code,message:e.message}};}
     }
    }
    checkAbort(hooks.signal);const bytes=bytesOf(stored);release=budget.reserve(bytes);const result=structuredClone(stored);
    if(!cached&&stage==='map'&&!stored.mapError){budget.put(mapKey,{value:stored,byteLength:bytes});keys.add(mapKey);}
    return {...result,metrics:{cache:{result:cached},memory:budget.snapshot(),preflightExecutions:0},release};
   }catch(e){release?.();throw e;}finally{cacheLease?.();prepared?.release();residual?.release();display?.release();mapped?.release();inputLease?.();active=null;options.signal?.removeEventListener('abort',abort);}
  },
  renderWindow(image,result,view,rect,options={}){requireValue(result.data.segmented,'Segmented Composite result required.');return renderCompositeSegmented(result,view,rect,{...options,budget});},
  render(result,view='noise'){
   if(result.data.segmented)return renderCompositeSegmented(result,view,null,{budget});
   requireValue(['noise','map'].includes(view),'Unknown Composite display.');const values=result.data[view+'_rgb'];requireValue(values instanceof Uint8Array,'Requested Composite map is unavailable.');
   const release=budget.reserve(values.byteLength);try{return {width:result.data.width,height:result.data.height,format:'rgb8',data:values.slice(),release};}catch(e){release();throw e;}
  },
  exportNpz(result){const bound=bytesOf(result)+65536,release=budget.reserve(bound);try{return {...compositeNpz(result,bound),release};}catch(e){release();throw e;}},
  async clearCache(){for(const k of keys)budget.remove(k);keys.clear();pool.clear();statistics.clear();await segmented.clearCache();},
  async dispose(){if(disposed)return;disposed=true;active?.abort();await segmented.dispose();await this.clearCache();pool.dispose();statistics.dispose();},
  memory(){return budget.snapshot();}
 };
}
