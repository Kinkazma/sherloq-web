import "../../runtime-context.js?v=0.30.0";
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {payloadBytes} from './pixel-operations.js';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

/** One native research owner/cache per exact admitted rectangle. A fragment
 * is a complete native image to the unchanged research preprocessing/model;
 * no excluded RGB is supplied as artificial padding or neighbouring context. */
export function createStrictResearchEngine(image,budget,profile,{method,engineFactory}={}){
 requireValue(['focal','adaifl'].includes(method)&&typeof engineFactory==='function','A strict research method and native owner factory are required.');
 const entries=new Map(),views=new Set(),lifetime=new AbortController();let closed=false,running=false,active,controller,identity,closing;
 const retireView=async view=>{if(!view)return;await view.dispose();views.delete(view);};
 const retireEntry=async(key,entry)=>{if(typeof entry.engine?.dispose==='function')await entry.engine.dispose();entry.metadata();if(entries.get(key)===entry)entries.delete(key);};
 const api={image,
  analyze(parameters={},hooks={}){
   requireValue(!closed&&!running,'Strict research owner is closed or active.');running=true;controller=new AbortController();const signal=AbortSignal.any([lifetime.signal,controller.signal,...(hooks.signal?[hooks.signal]:[])]);
   const task=run(parameters,{...hooks,signal});active=task;return task.finally(()=>{if(active===task){active=null;controller=null;running=false;}});
  },
  dispose(){
   if(closing)return closing;closed=true;lifetime.abort();controller?.abort();
   const task=(async()=>{await active?.catch(()=>{});const failures=[];
    for(const view of views)try{await retireView(view);}catch(error){failures.push(serializeEngineError(error));}
    for(const [key,entry]of entries)try{await retireEntry(key,entry);}catch(error){failures.push(serializeEngineError(error));}
    if(failures.length)throw new EngineError('RESEARCH_CLEANUP_FAILED','Native research fragment cleanup failed.',{details:{failures}});
   })();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
  },
  snapshot(){return{closed,running,method,fragmentOwners:entries.size,sourceRegionFingerprint:identity??null};}
 };
 async function run(parameters,hooks){
  requireValue(parameters&&typeof parameters==='object'&&!Array.isArray(parameters)&&Object.keys(parameters).length===0,'FOCAL/AdaIFL do not expose scientific parameters.');const nativeParameters=Object.freeze({});
  const {signal,onProgress}=hooks,record=api.image,d=record?.surface?.descriptor,source=record?.originalSource,sha256=record?.sha256;
  requireValue(record?.sourceRegionDomain&&source?.surface&&source.sha256===sha256&&d,'Strict research requires its original native source owner.');
  const metadata=budget.reserve(sourceRegionTransportBytes(record.sourceRegionDomain,{allowAliases:true})*4+65536),releases=[];let view,returned=false,primary;
  try{
   const descriptor=structuredClone(record.sourceRegionDomain),origin=Array.isArray(record.sourceRegionOrigin)?[...record.sourceRegionOrigin]:null,width=d.width,height=d.height;
   await retireCompositeOwners([...views].map(old=>()=>retireView(old)));checkAbort(signal);
   await retireCompositeOwners([...entries].filter(([,entry])=>!entry.ready).map(([key,entry])=>()=>retireEntry(key,entry)));checkAbort(signal);
   view=await createSourceRegionView({...source.surface,sha256},descriptor,{budget,signal});views.add(view);checkAbort(signal);
   requireValue(width===view.domain.width&&height===view.domain.height&&origin?.length===2&&origin.every((v,i)=>v===view.domain.origin[i]),'Strict research native grid or origin differs.');
   requireValue(!identity||identity===view.domain.fingerprint,'A research fragment cache cannot change its native source domain.');identity=view.domain.fingerprint;
   const fragments=[];let included=0,index=0;
   for(const rect of view.admittedRectangles()){
    checkAbort(signal);const key=[rect.x,rect.y,rect.width,rect.height].join('/'),fragment=index++,input={format:'rgb8',width:rect.width,height:rect.height,
     async readRows(y,count,{signal:extra}={}){requireValue(Number.isSafeInteger(y)&&Number.isSafeInteger(count)&&y>=0&&count>0&&y+count<=rect.height,'Research row lies outside its admitted native fragment.');return view.readWindow({x:rect.x,y:rect.y+y,width:rect.width,height:count},{signal:extra});}};
    let entry=entries.get(key);
    if(!entry){entry={engine:null,metadata:budget.reserve(2048),ready:false};entries.set(key,entry);
     try{entry.engine=await engineFactory(input,budget,profile);checkAbort(signal);requireValue(entry.engine&&typeof entry.engine.analyze==='function'&&typeof entry.engine.dispose==='function','Native research fragment owner is invalid.');entry.ready=true;}catch(error){await retireCompositeOwners([()=>retireEntry(key,entry)],{primary:error});throw error;}
    }
    entry.engine.image=input;let raw,nativeFailure;
    try{
     onProgress?.({phase:'research-source-fragment',completed:included,total:view.domain.countIncluded,fragment});
     raw=await entry.engine.analyze(nativeParameters,{...hooks,onProgress:event=>onProgress?.({...event,sourceFragment:fragment,sourceFragmentBounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height]})});checkAbort(signal);
     const {release,...fields}=raw;releases.push(budget.reserve(payloadBytes(fields)*2+4096));const data=structuredClone(fields),shape=data.metadata?.native_shape,n=shape?.[0]*shape?.[1];
     requireValue(Array.isArray(shape)&&shape.length===2&&shape.every(v=>Number.isSafeInteger(v)&&v>0)&&data.map instanceof Float32Array&&data.map.length===n&&data.map.every(Number.isFinite),'Native research returned invalid fragment probability geometry.');
     if(method==='adaifl')requireValue(data.mask instanceof Uint8Array&&data.mask.length===n&&data.mask.every(v=>v===0||v===1),'Native AdaIFL returned invalid fragment mask geometry.');
     if(method==='focal')requireValue(data.features instanceof Float32Array&&data.features.length===n*288&&data.features.every(Number.isFinite),'Native FOCAL returned invalid fragment features.');
     data.metadata={...data.metadata,method};fragments.push({id:'native-fragment-'+fragment,bounds:[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],...data});included+=rect.width*rect.height;
    }catch(error){nativeFailure=error;throw error;}finally{try{await retireCompositeOwners([()=>raw?.release?.()],nativeFailure?{primary:nativeFailure}:{});}finally{entry.engine.image=null;}}
   }
   checkAbort(signal);requireValue(included===view.domain.countIncluded,'Strict research did not cover every admitted native observation.');
   await retireView(view);view=null;checkAbort(signal);
   onProgress?.({phase:'complete',fraction:1});checkAbort(signal);let released=false;returned=true;
   const providers=[...new Set(fragments.map(f=>f.metadata.provider))];
   return{width,height,fragments,metadata:{method,image_shape:[height,width],native_shape:null,native_grids:'independent native maps per fragment; no synthetic envelope-wide grid',nativeFragments:fragments.map(f=>({id:f.id,bounds:f.bounds,metadata:f.metadata})),provider:providers.length===1?providers[0]:'mixed',result_reused:fragments.every(f=>f.metadata.result_reused===true),strictSourceRegions:{schema:'sherloq.strict-research/1',sourceRegionFingerprint:identity,origin:[...origin],includedPixels:included,fragmentCount:fragments.length,sourceSamples:'exact admitted native rectangles; excluded original samples are absent before preprocessing',preprocessing:'Each fragment uses the unchanged native 1024 research preprocessing and model.',excludedSamplesRead:false,resolutionReduced:false,context:'Independent native fragment context and clustering; no cross-fragment label equivalence is asserted.'}},release(){if(released)return;released=true;for(const f of releases.splice(0))f();}};
  }catch(error){primary=error;throw error;}finally{await retireCompositeOwners([()=>retireView(view),()=>metadata(),...(!returned?releases.splice(0).map(f=>()=>f()):[])],primary?{primary}:{});}
 }
 return api;
}
