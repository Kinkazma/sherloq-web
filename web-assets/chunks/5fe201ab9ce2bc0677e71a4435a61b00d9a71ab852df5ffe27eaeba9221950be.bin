import "../../runtime-context.js?v=0.30.0";
import {createScopedForgeryscopeSource} from './forgeryscope-scoped-source.js';
import {analyzeForgeryscope} from './forgeryscope-pipeline.js';
import {forgeryscopeMaskField} from './forgeryscope-segmented-result.js';
import {checkAbort} from './errors.js';
import {retireForgeryscopeOwners} from './forgeryscope-owner-retirement.js';
export {retireForgeryscopeOwners} from './forgeryscope-owner-retirement.js';
import {certifiedForgeryscopeSource} from './forgeryscope-bounded-source.js';
const bytesOf=value=>JSON.stringify(value).length*3+4096;
/** Source adapter with shared result ownership, avoiding full mask clones and
 * the redundant global float32 cast. Source RGB is admitted once for the native
 * fixed-size preparations and panel extraction, then released after analysis. */
export function createForgeryscopeSourceAnalyzer({networks,budget,pool,identities}){
 let cached;
 async function unpin(item){if(--item.refs===0)await retireForgeryscopeOwners([()=>item.value.release(),()=>item.lease()]);}
 async function clearCache(){const old=cached;cached=null;if(old)await unpin(old);}
 return {clearCache,async analyze(image,params,options){
  const {width,height,id,revision,format}=image.surface.descriptor,immutable=options.immutableSource===true&&image.segmented&&/^[a-f0-9]{64}$/.test(image.sha256),identity=immutable?['original-blob',image.sha256,width,height,format??null,image.provenance?.orientation??null,image.provenance?.sourceRegionDomain?.fingerprint??null,image.provenance?.origin??null]:[image.sha256,id,revision,width,height],key=JSON.stringify([identity,params,options.backend??'auto']);let scopedSource,item,window,value,lease,resultLease,failure;
  try{
   checkAbort(options.signal);const hit=cached?.key===key;
   if(hit){item=cached;item.refs++;}
   else{await clearCache();if(params.scientificScope&&!certifiedForgeryscopeSource(image))scopedSource=await createScopedForgeryscopeSource(image,params,{budget,signal:options.signal});const source=scopedSource?.image??image,bounded=certifiedForgeryscopeSource(source);if(!bounded)window=await image.surface.readWindow({x:0,y:0,width,height},{signal:options.signal});value=await analyzeForgeryscope(bounded?source:{...window.pixels,sha256:image.sha256},{...params,...options,networks,budget,pool,segmentedResult:true,inputAlreadyBudgeted:true});const oldWindow=window;window=null;await oldWindow?.release();checkAbort(options.signal);lease=budget.reserve(bytesOf(value.metadata));item={key,refs:2,value,lease};cached=item;value=null;lease=null;}
   const out={width,height,metadata:structuredClone(item.value.metadata),provenance:{originalSourceSha256:image.sha256,sourceSurfaceIdentity:id+'/'+revision,models:identities,publicPipeline:true,competitionEnsemble:false},metrics:{cache:{result:hit},memory:budget.snapshot(),preflightExecutions:0,segmented:true}};
   resultLease=budget.reserve(bytesOf(out));for(const [key,value]of Object.entries(item.value))if(ArrayBuffer.isView(value))out[key]=forgeryscopeMaskField(value);else if(typeof value?.readInto==='function')out[key]=value;
   let released=false;item.refs++;const ownedLease=resultLease;resultLease=null;return {...out,async release(){if(released)return;released=true;await retireForgeryscopeOwners([()=>ownedLease(),()=>unpin(item)]);}};
  }catch(error){failure=error;throw error;}finally{await retireForgeryscopeOwners([()=>item?unpin(item):undefined,()=>window?.release(),()=>value?.release(),()=>scopedSource?.dispose(),()=>lease?.(),()=>resultLease?.()],failure?{primary:failure}:{});}
 }};
}
