import {compositeSourceDomain} from './unified-engine/src/composite-regional-source.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {EngineError,checkAbort} from './unified-engine/src/errors.js';
import {localFeaturePolicy} from './feature-policy.js?v=0.31.0';
import {createM2WorkerClient} from './unified-engine/src/m2-worker-client.js';
import {createRemoteSurface} from './remote-surface.js?v=0.31.0';
export const COMPOSITE_POLICY='covariance-floor-v1';
export const COMPOSITE_SOURCE_SHA='d3f5386ec00efb11cb27d1a7be1b78b6a35b1399341f95f76f9bd5bcd7250899';
const MiB=1024**2;
async function json(url){const response=await fetch(url);if(!response.ok)throw Error('Composite: '+response.status+' '+url.pathname);return response.json();}
export async function compositeConfiguration(){
 const url=new URL('./composite-config.json?v=0.31.0',import.meta.url),deployment=await json(url);
 if(deployment.schema!==1||deployment.statisticsPolicy!==COMPOSITE_POLICY)throw Error('Composite deployment policy mismatch');
 const base=new URL(deployment.assetsBase,url),runtime=new URL(deployment.runtimeBase,url);
 const descriptorUrl=new URL('statistics-runtime.json',base),statisticsRuntime=await json(descriptorUrl);
 if(statisticsRuntime.statisticsPolicy!==COMPOSITE_POLICY||statisticsRuntime.sourceSha256!==COMPOSITE_SOURCE_SHA||statisticsRuntime.downloadBytes!==131507535)throw Error('Composite statistics package mismatch');
 statisticsRuntime.url=new URL(statisticsRuntime.url,descriptorUrl).href;
 const models=await json(new URL('noiseprint/manifest.json',base)),neural=await json(new URL('neural/manifest.json',base));
 const assets=Object.fromEntries(Object.entries(models.assets).map(([k,v])=>[k,{...v,url:new URL('noiseprint/'+v.file,base).href}]));
 const runtimes=Object.fromEntries(Object.entries(neural.providers).map(([provider,m])=>[provider,{factoryUrl:new URL('neural/'+m.factory,base).href,ortUrl:new URL('vendor/m3-ort/ort.'+(provider==='wasm'?'wasm':'webgpu')+'.min.mjs',runtime).href,wasmUrl:new URL((provider==='wasm'?'vendor/d2prl/':'vendor/m3-ort/')+m.wasm,runtime).href}]));
 return {deployment,methods:{composite:{assets,runtimes,statisticsRuntime}}};
}
export async function createCompositeClient(options){
 const {deployment,methods}=await compositeConfiguration(),client=await createM2WorkerClient({...options,methods});
 let disposed=false,closing=false,disposal,gracefulRegional=false;const regionalResults=new Map();
 async function readWindow(id,view,rect){
  if(disposed)throw Object.assign(Error('Composite disposed'),{code:'CANCELLED'});
  const frame=await client.renderWindow(id,view,rect);
  try{const data=new Uint8Array(frame.bytes);for(let at=0;at<data.length;at+=client.ready.windowBytes)data.set(await client.readExport(frame.id,at,Math.min(client.ready.windowBytes,data.length-at)),at);return {width:frame.width,height:frame.height,data};}
  finally{await client.releaseExport(frame.id);}
 }
 return {...client,deployment,
  reserveExport:async bytes=>{const lease=await client.reserveExternalMemory({bytes});return()=>client.releaseExternalMemory(lease.id);},
  async analyze(blob,params,hooks={}){
   if(disposed||closing)throw new EngineError('DISPOSED','Composite client is closing.');checkAbort(hooks.signal);
   const selection=await compositeSourceDomain(hooks.sourceRegionDomain,{sourceSha256:hooks.expectedSourceSha256,signal:hooks.signal});
   if(selection?.regional)gracefulRegional=true;
   localFeaturePolicy.assertTaskAvailable({operation:'composite',params});
   const result=await client.analyzeBlob('composite',blob,params,{...hooks,...(selection?{sourceRegionDomain:selection.domain.descriptor}:{})});
   if(selection?.regional)regionalResults.set(result.id,result);
   try{const metadata=await client.metadata(result);if(result.fields.map&&metadata.provenance?.statisticsPolicy!==COMPOSITE_POLICY)throw Error('Composite result policy mismatch');
    if(selection?.regional&&(result.sourceRegionDomain?.fingerprint!==selection.domain.fingerprint||metadata.provenance?.sourceRegionDomain?.fingerprint!==selection.domain.fingerprint||result.width!==selection.domain.width||result.height!==selection.domain.height))throw new EngineError('SOURCE_CHANGED','Composite native result does not retain its admitted rectangle.');
    return {result,metadata,...(selection?.regional?{sourceRegionDomain:selection.domain.descriptor,sourceRegionOrigin:[...selection.domain.origin]}:{})};
   }catch(error){await retireCompositeOwners([()=>this.release(result.id)],{primary:error});throw error;}
  },
  async release(id){await client.release(id);regionalResults.delete(id);},
  surface(result,view,cache,changed,onError){
   return createRemoteSurface({id:result.id,view,width:result.width,height:result.height},cache,async(action,{tile,rect})=>{
    if(action==='read-window')return {pixels:await readWindow(result.id,view,rect)};
    return client.readDisplay(result.id,view,tile);
   },changed,onError);
  },
  dispose(){if(disposed)return Promise.resolve();if(disposal)return disposal;closing=true;const task=(async()=>{await(gracefulRegional?client.disposeGracefully():client.dispose());regionalResults.clear();disposed=true;})();disposal=task.finally(()=>{disposal=null;});return disposal;}

 };
}
