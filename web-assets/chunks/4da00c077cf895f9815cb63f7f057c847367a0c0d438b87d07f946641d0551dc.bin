import {createForgeryscopeSourceAnalyzer} from './forgeryscope-source-analyzer.js';
import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {ForgeryscopePreparation} from './forgeryscope-preparation.js';
import {ForgeryscopeNetworks} from './forgeryscope-networks.js';
import {analyzeForgeryscope} from './forgeryscope-pipeline.js';
import {createForgeryscopeSift} from './forgeryscope-sift.js';
import {forgeryscopeNpz} from './npz.js';
import {EngineError,checkAbort} from './errors.js';
const sizeOf=value=>ArrayBuffer.isView(value)?value.byteLength:Array.isArray(value)?value.reduce((n,v)=>n+sizeOf(v),0):value&&typeof value==='object'?Object.entries(value).reduce((n,[k,v])=>n+k.length*2+sizeOf(v),0):typeof value==='string'?value.length*2:8;

/** Explicit component API. Numerical qualification stays separate from model
 * availability; the common public operation registry is not changed here.
 */
export function createForgeryscopeAnalyzer({assets,alikedSegments,runtimes,preparationFactory,sift,siftFactory,siftIdentity,budget,computeProfile='aggressive',resourceHints}={}){
  runtimes=structuredClone(runtimes);assets=structuredClone({...assets,...alikedSegments?.assets});const configuration=JSON.stringify([assets,runtimes]);
  const profile=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
  const pool=new NeuralGraphPool(budget,profile,{assets,runtimes}),preparation=new ForgeryscopePreparation(budget,preparationFactory);
  const ownSift=!sift&&!!siftFactory;if(ownSift)sift=createForgeryscopeSift({budget,pool,factory:siftFactory,identity:siftIdentity,profile});
  const networks=new ForgeryscopeNetworks({pool,preparation,budget,assets,sift,alikedSegments:!!alikedSegments});
  const identities=Object.entries(assets).map(([k,v])=>[k,v.sha256]).sort((a,b)=>a[0].localeCompare(b[0]));let busy=false,disposed=false,activeAbort;const keys=new Set();
  const sourceAnalyzer=createForgeryscopeSourceAnalyzer({networks,budget,pool,identities});
  return {
    async analyze(image,params={},options={}){
      if(disposed)throw new EngineError('DISPOSED','Forgeryscope analyzer disposed.');
      if(busy)throw new EngineError('BUSY','Forgeryscope analysis is already running.');busy=true;
      let internal,release,cacheLease;const controller=new AbortController(),abort=()=>controller.abort();activeAbort=controller;
      const userSignal=options.signal;userSignal?.addEventListener('abort',abort,{once:true});if(userSignal?.aborted)controller.abort();options={...options,signal:controller.signal};
      try{
        checkAbort(options.signal);
        if(image.surface)return await sourceAnalyzer.analyze(image,params,options);
        const hashLease=budget.reserve(image.data.byteLength);let digest;
        try{digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',image.data))].map(x=>x.toString(16).padStart(2,'0')).join('');}finally{hashLease();}
        const key='m2/forgeryscope/'+JSON.stringify([image.width,image.height,digest,params,options.backend??params.backend??'auto',identities,sift?.identity??null,configuration]);
        checkAbort(options.signal);let stored=budget.get(key)?.value,cached=!!stored;if(cached)cacheLease=budget.reserve(sizeOf(stored));
        if(!stored){
          internal=await analyzeForgeryscope(image,{...params,...options,networks,budget,pool});
          const {release:_,...value}=internal;stored=value;
        }
        const bytes=sizeOf(stored);release=budget.reserve(bytes);
        const result=structuredClone(stored);checkAbort(options.signal);
        if(!cached){internal.release();internal=null;budget.put(key,{value:stored,byteLength:bytes});keys.add(key);}
        return {...result,width:image.width,height:image.height,provenance:{sourceRGBSha256:digest,models:identities,publicPipeline:true,competitionEnsemble:false},metrics:{cache:{result:cached},memory:budget.snapshot(),preflightExecutions:0},release};
      }catch(e){release?.();throw e;}finally{cacheLease?.();internal?.release();busy=false;activeAbort=null;userSignal?.removeEventListener('abort',abort);}
    },
    exportNpz(result){const bound=Object.values(result).reduce((n,v)=>n+(ArrayBuffer.isView(v)?v.byteLength:0),65536)+16*(sizeOf(result.metadata)+sizeOf(result.provenance)),release=budget.reserve(bound);try{return {...forgeryscopeNpz(result,bound),release};}catch(e){release();throw e;}},
    clearCache(){sourceAnalyzer.clearCache();for(const key of keys)budget.remove(key);keys.clear();pool.clear();preparation.clear();if(ownSift)sift.clearCache?.();},
    dispose(){if(disposed)return;disposed=true;activeAbort?.abort();this.clearCache();pool.dispose();preparation.dispose();if(ownSift)sift.dispose();},
    memory(){return budget.snapshot();}
  };
}
