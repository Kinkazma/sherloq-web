import {createTruforSegmentedAnalyzer} from './trufor-segmented-analyzer.js';
import {renderTruforSegmented} from './trufor-segmented-render.js';
import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {renderTrufor} from './trufor-render.js';
import {noiseprintPlusResidual} from './noiseprint-plus-network.js';
import {truforNpz} from './npz.js';
const MiB=1024**2;
/** Full native TruFor graph; availability is distinct from numerical qualification. */
export function createTruforAnalyzer({asset,runtimes,noiseprint,segments,budget,computeProfile='aggressive',resourceHints}={}){
  runtimes=structuredClone(runtimes);asset=structuredClone(asset);noiseprint=structuredClone(noiseprint);segments=structuredClone(segments);const configuration=JSON.stringify([asset,runtimes,noiseprint]);
  const profile=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
  requireValue(!asset?.externalNoiseprint||(noiseprint?.asset?.program&&noiseprint.runtime?.executor==='noiseprint-plus'),'Native-order Noiseprint++ runtime required by this TruFor graph.');
  const nppPool=noiseprint?new NeuralGraphPool(budget,profile,{assets:{'noiseprint-plus':noiseprint.asset},runtimes:{wasm:noiseprint.runtime,webgpu:noiseprint.runtime}}):null;
  const segmented=segments?createTruforSegmentedAnalyzer({manifest:segments,runtimes,nppPool,budget,profile}):null;
  const pool=new NeuralGraphPool(budget,profile,{assets:{trufor:asset},runtimes}),keys=new Set();let disposed=false,active;
  return {
    async analyze(image,params={},options={}){
      if(disposed)throw new EngineError('DISPOSED','TruFor analyzer disposed.');
      if(active)throw new EngineError('BUSY','TruFor analysis already running.');
      if(image.surface){requireValue(segmented,'Segmented TruFor model manifest required.');active={abort(){}};try{return await segmented.analyze(image,params,options);}finally{active=null;}}
      requireValue(asset,'Dense TruFor graph required for contiguous input.');
      requireValue(Object.keys(params).length===0,'TruFor has no scientific tuning parameters.');
      const {width,height}=image,n=width*height;
      requireValue(Number.isSafeInteger(n)&&Number.isInteger(width)&&Number.isInteger(height)&&width>=29&&height>=29&&image.data instanceof Uint8Array&&image.data.length===3*n,'TruFor requires an RGB8 image at least 29 × 29.');
      const controller=new AbortController(),abort=()=>controller.abort();active=controller;
      options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const signal=controller.signal;
      let inputLease,output,release,cacheLease,npp;const backend=options.backend??'auto',onProgress=options.onProgress;
      try{
        checkAbort(signal);inputLease=budget.reserve(n*15);
        const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',image.data))].map(x=>x.toString(16).padStart(2,'0')).join('');
        const key='m2/trufor/'+JSON.stringify([width,height,digest,backend,asset.sha256,configuration]);checkAbort(signal);
        let cached=budget.get(key)?.value;const hit=!!cached;if(cached)cacheLease=budget.reserve(n*12+8192);
        if(!cached){
          const input=new Float32Array(n*3);
          for(let i=0;i<n;i++)for(let c=0;c<3;c++)input[c*n+i]=image.data[i*3+c]/256;
          // No resizing or restricted attention: budget only partitions independent rows.
          const rowBudget=Math.max(8192,Math.min(32*MiB,Math.floor(budget.limit/64)));
          const feeds={rgb:{data:input,dims:[1,3,height,width]}};
          if(asset.externalNoiseprint){npp=await noiseprintPlusResidual(input,width,height,{budget,pool:nppPool,signal,onProgress,backend});feeds.native_noiseprint={data:npp.data,dims:npp.dims};}
          if(asset.attentionLoops)feeds.attention_budget={data:new BigInt64Array([BigInt(rowBudget)]),dims:[],type:'int64'};
          if(asset.fusionLoops)feeds.fusion_budget={data:new BigInt64Array([BigInt(rowBudget)]),dims:[],type:'int64'};
          output=await pool.run('trufor',feeds,{backend,signal,onProgress,workspaceBytes:64*MiB+(asset.streamedHeads?512:4096)*n+rowBudget*8,outputBytes:(3*n+1)*4});
          for(const [name,t] of Object.entries(output.result)){
            requireValue(t.data instanceof Float32Array&&t.data.length===(name==='score'?1:n),'Invalid TruFor output geometry.');
            for(const v of t.data)requireValue(Number.isFinite(v),'Nonfinite TruFor output.');
          }
          cached={data:{width,height,map:output.result.map.data,confidence:output.result.confidence.data,noiseprint_pp:output.result.noiseprint_pp.data,score:output.result.score.data[0],metadata:{method:'trufor',rgbDivisor:256,imgsize:[height,width],coordinateSpace:'source-pixels',attention:'global',threshold:null}},provenance:{sourceRGBSha256:digest,modelSha256:asset.sha256,checkpointSha256:asset.checkpointSha256,provider:output.provider,qualification:asset.qualification??'not-qualified'},execution:{...output.metrics,noiseprint:npp?.executions??null}};
        }
        checkAbort(signal);release=budget.reserve(n*12+8192);const result=structuredClone(cached);
        if(output){output.release();output=null;budget.put(key,{value:cached,byteLength:n*12+8192});keys.add(key);}
        return {...result,metrics:{...result.execution,cache:{result:hit},preflightExecutions:0,memory:budget.snapshot()},release};
      }catch(e){release?.();throw e;}finally{cacheLease?.();inputLease?.();output?.release();npp?.release();active=null;options.signal?.removeEventListener('abort',abort);}
    },
    render(result,view,options={}){return result.data.segmented?renderTruforSegmented(result,view,undefined,{...options,budget}):renderTrufor(result.data,view,{...options,budget});},
    renderWindow(_image,result,view,rect,options={}){requireValue(result.data.segmented,'Segmented TruFor result required.');return renderTruforSegmented(result,view,rect,{...options,budget});},
    exportNpz(result){const bound=result.data.width*result.data.height*12+65536,release=budget.reserve(bound);try{return {...truforNpz(result,bound),release};}catch(e){release();throw e;}},
    clearCache(){for(const k of keys)budget.remove(k);keys.clear();pool.clear();nppPool?.clear();return segmented?.clearCache();},
    dispose(){if(disposed)return;disposed=true;active?.abort();const cleaned=this.clearCache();pool.dispose();nppPool?.dispose();return Promise.resolve(cleaned).then(()=>segmented?.dispose());},
    memory(){return budget.snapshot();}
  };
}
