import "../../runtime-context.js?v=0.14.5";
import {analyzeForgeryscope} from './forgeryscope-pipeline.js';
import {forgeryscopeMaskField} from './forgeryscope-segmented-result.js';
import {checkAbort} from './errors.js';
const bytesOf=value=>JSON.stringify(value).length*3+4096;
/** Source adapter with shared result ownership, avoiding full mask clones and
 * the redundant global float32 cast. Source RGB is admitted once for the native
 * fixed-size preparations and panel extraction, then released after analysis. */
export function createForgeryscopeSourceAnalyzer({networks,budget,pool,identities}){
 let cached;
 function unpin(item){if(--item.refs===0){item.value.release();item.lease();}}
 function clearCache(){const old=cached;cached=null;if(old)unpin(old);}
 return {clearCache,async analyze(image,params,options){
  const {width,height,id,revision}=image.surface.descriptor,key=JSON.stringify([image.sha256,id,revision,params,options.backend??'auto']);let item,window,value,lease;
  try{
   checkAbort(options.signal);const hit=cached?.key===key;
   if(hit){item=cached;item.refs++;}
   else{clearCache();window=await image.surface.readWindow({x:0,y:0,width,height},{signal:options.signal});value=await analyzeForgeryscope(window.pixels,{...params,...options,networks,budget,pool,segmentedResult:true,inputAlreadyBudgeted:true});window.release();window=null;lease=budget.reserve(bytesOf(value.metadata));item={key,refs:2,value,lease};cached=item;value=null;lease=null;}
   const out={width,height,metadata:structuredClone(item.value.metadata),provenance:{originalSourceSha256:image.sha256,sourceSurfaceIdentity:id+'/'+revision,models:identities,publicPipeline:true,competitionEnsemble:false},metrics:{cache:{result:hit},memory:budget.snapshot(),preflightExecutions:0,segmented:true}};
   const resultLease=budget.reserve(bytesOf(out));for(const [key,value]of Object.entries(item.value))if(ArrayBuffer.isView(value))out[key]=forgeryscopeMaskField(value);else if(typeof value?.readInto==='function')out[key]=value;
   let released=false;item.refs++;return {...out,release(){if(released)return;released=true;resultLease();unpin(item);}};
  }finally{if(item)unpin(item);window?.release();value?.release();lease?.();}
 }};
}
