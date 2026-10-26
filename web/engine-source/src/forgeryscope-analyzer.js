import {createForgeryscopeSourceAnalyzer,retireForgeryscopeOwners} from './forgeryscope-source-analyzer.js';
import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {ForgeryscopePreparation} from './forgeryscope-preparation.js';
import {ForgeryscopeNetworks} from './forgeryscope-networks.js';
import {analyzeForgeryscope} from './forgeryscope-pipeline.js';
import {createForgeryscopeSift} from './forgeryscope-sift.js';
import {forgeryscopeNpz} from './npz.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
const sizeOf=value=>ArrayBuffer.isView(value)?value.byteLength:Array.isArray(value)?value.reduce((n,v)=>n+sizeOf(v),0):value&&typeof value==='object'?Object.entries(value).reduce((n,[k,v])=>n+k.length*2+sizeOf(v),0):typeof value==='string'?value.length*2:8;

/** Explicit component API. Numerical qualification stays separate from model
 * availability; the common public operation registry is not changed here.
 */
export function createForgeryscopeAnalyzer({assets,alikedSegments,runtimes,preparationFactory,sift,siftFactory,siftIdentity,budget,computeProfile='aggressive',resourceHints}={}){
  runtimes=structuredClone(runtimes);assets=structuredClone({...assets,...alikedSegments?.assets});const configuration=JSON.stringify([assets,runtimes]);
  const profile=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
  const pool=new NeuralGraphPool(budget,profile,{assets,runtimes,resourceOwner:'forgeryscope'}),preparation=new ForgeryscopePreparation(budget,preparationFactory);
  const ownSift=!sift&&!!siftFactory;if(ownSift)sift=createForgeryscopeSift({budget,pool,factory:siftFactory,identity:siftIdentity,profile});
  const networks=new ForgeryscopeNetworks({pool,preparation,budget,assets,sift,alikedSegments:!!alikedSegments});
  const identities=Object.entries(assets).map(([k,v])=>[k,v.sha256]).sort((a,b)=>a[0].localeCompare(b[0]));let busy=false,disposed=false,activeAbort,analysisDone,disposal;const keys=new Set();
  const sourceAnalyzer=createForgeryscopeSourceAnalyzer({networks,budget,pool,identities});
  async function preparePanels(image,options){
    let window,hashLease,resultLease,failure,digest=image.sha256;const segmented=!!image.surface;
    try{
      const dimensions=segmented?image.surface.descriptor:image,{width,height}=dimensions;
      requireValue([width,height].every(x=>Number.isSafeInteger(x)&&x>0),'Invalid panel preparation dimensions.');
      if(segmented)window=await image.surface.readWindow({x:0,y:0,width,height},{signal:options.signal});
      const pixels=segmented?window.pixels:image;
      requireValue(pixels.data instanceof Uint8Array&&pixels.data.length===width*height*3,'Panel preparation requires original RGB8.');
      if(!segmented){hashLease=budget.reserve(pixels.data.byteLength);try{digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels.data))].map(x=>x.toString(16).padStart(2,'0')).join('');}finally{hashLease();hashLease=null;}}
      checkAbort(options.signal);options.onProgress?.({phase:'classifying-panels',completed:0,total:1,fraction:0});
      const detected=await networks.classifyPanels({...pixels,sha256:digest},options),asset=assets.yolo_panel_extractor;
      const preparation={schema:'sherloq.scientific-preparation/panels/1',stage:'forgeryscope-yolo-panels',coordinates:'original-pixels',rectangleFormat:'x-y-right-bottom',width,height,status:detected.panels.length?'detected-panels':'needs-review',uncertain:!detected.panels.length||detected.panels.some(panel=>panel.policyHint==='needs-review'),panels:detected.panels,classes:structuredClone(asset.classes),unknown:{exhaustive:false,remainderPolicy:'needs-review',reason:'The panel detector is limited to its trained classes; undetected areas are not classified.'},detector:{model:'yolo_panel_extractor',sha256:asset.sha256,checkpointSha256:asset.checkpointSha256??null,confidenceThreshold:.7,iouThreshold:.4,side:640,stride:32,provider:'wasm',cpuRequired:true,requestedBackend:options.backend??'auto'},cache:{detection:detected.cacheHit},fullAnalysisExecuted:false};
      const metadata={prepareOnly:true,preparation},provenance={...(segmented?{originalSourceSha256:digest}:{sourceRGBSha256:digest}),models:[['yolo_panel_extractor',asset.sha256]],coordinates:'original-pixels',detectorOnly:true};
      options.onProgress?.({phase:'classifying-panels',completed:1,total:1,fraction:1});checkAbort(options.signal);
      const ownedWindow=window;window=null;await ownedWindow?.release();checkAbort(options.signal);
      resultLease=budget.reserve(sizeOf(metadata)+sizeOf(provenance));
      let released=false;return {width,height,metadata,provenance,metrics:{cache:{panelDetection:detected.cacheHit},memory:budget.snapshot(),preflightExecutions:0,detectorOnly:true},release(){if(released)return;released=true;resultLease();}};
    }catch(error){failure=error;await retireForgeryscopeOwners([()=>resultLease?.()],{primary:error});throw error;}finally{await retireForgeryscopeOwners([()=>window?.release(),()=>hashLease?.()],failure?{primary:failure}:{});}
  }
  const api={
    async analyze(image,params={},options={}){
      if(disposed)throw new EngineError('DISPOSED','Forgeryscope analyzer disposed.');
      if(busy)throw new EngineError('BUSY','Forgeryscope analysis is already running.');busy=true;let finish;analysisDone=new Promise(resolve=>finish=resolve);
      let internal,release,cacheLease,failure;const controller=new AbortController(),abort=()=>controller.abort();activeAbort=controller;
      const userSignal=options.signal;userSignal?.addEventListener('abort',abort,{once:true});if(userSignal?.aborted)controller.abort();options={...options,signal:controller.signal};
      try{
        checkAbort(options.signal);
        if(params.prepareOnly===true)return await preparePanels(image,options);
        if(image.surface)return await sourceAnalyzer.analyze(image,params,options);
        const hashLease=budget.reserve(image.data.byteLength);let digest;
        try{digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',image.data))].map(x=>x.toString(16).padStart(2,'0')).join('');}finally{hashLease();}
        const key='m2/forgeryscope/'+JSON.stringify([image.width,image.height,digest,params,options.backend??params.backend??'auto',identities,sift?.identity??null,configuration]);
        checkAbort(options.signal);let stored=budget.get(key)?.value,cached=!!stored;if(cached)cacheLease=budget.reserve(sizeOf(stored));
        if(!stored){
          internal=await analyzeForgeryscope({...image,sha256:digest},{...params,...options,networks,budget,pool});
          const {release:_,...value}=internal;stored=value;
        }
        const bytes=sizeOf(stored);release=budget.reserve(bytes);
        const result=structuredClone(stored);checkAbort(options.signal);
        if(!cached){internal.release();internal=null;budget.put(key,{value:stored,byteLength:bytes});keys.add(key);}
        return {...result,width:image.width,height:image.height,provenance:{sourceRGBSha256:digest,models:identities,publicPipeline:true,competitionEnsemble:false},metrics:{cache:{result:cached},memory:budget.snapshot(),preflightExecutions:0},release};
      }catch(e){failure=e;await retireForgeryscopeOwners([()=>release?.()],{primary:e});throw e;}finally{try{await retireForgeryscopeOwners([()=>cacheLease?.(),()=>internal?.release()],failure?{primary:failure}:{});}finally{busy=false;activeAbort=null;analysisDone=null;userSignal?.removeEventListener('abort',abort);finish();}}
    },
    exportNpz(result){const bound=Object.values(result).reduce((n,v)=>n+(ArrayBuffer.isView(v)?v.byteLength:0),65536)+16*(sizeOf(result.metadata)+sizeOf(result.provenance)),release=budget.reserve(bound);try{return {...forgeryscopeNpz(result,bound),release};}catch(e){release();throw e;}},
    async clearCache(){await retireForgeryscopeOwners([()=>sourceAnalyzer.clearCache(),()=>networks.clearDetectionCache(),...Array.from(keys,key=>()=>budget.remove(key)),()=>keys.clear(),()=>pool.clearGracefully(),()=>preparation.clear(),()=>ownSift?sift.clearCache?.():undefined]);},
    dispose(){if(disposal)return disposal;disposed=true;activeAbort?.abort();const done=analysisDone;const task=(async()=>{await done;await networks.dispose();await retireForgeryscopeOwners([()=>api.clearCache(),()=>pool.disposeGracefully(),()=>preparation.dispose(),()=>ownSift?sift.dispose():undefined]);})();disposal=task;void task.catch(()=>{if(disposal===task)disposal=null;});return task;},
    memory(){return budget.snapshot();}
  };return api;
}
