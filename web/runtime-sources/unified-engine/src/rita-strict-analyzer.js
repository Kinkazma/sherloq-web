import "../../runtime-context.js?v=0.25.0";
import {createRitaAnalyzer} from './rita-analyzer.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {ritaStrictParameters,planRitaStrictContexts,ritaStrictField} from './rita-strict-contexts.js';
import {bindRitaStrictResult} from './rita-strict-result.js';

// Cleanup must attempt every independent owner while preserving any original
// failure, including a frozen Error or a non-object rejection reason.
async function retireActions(actions,primary){let failed=arguments.length>1,error=primary;for(const action of actions)try{await action();}catch(next){if(!failed){failed=true;error=next;}else if(error&&typeof error==='object'&&Object.isExtensible(error))try{error.details={...error.details,cleanupErrors:[...(error.details?.cleanupErrors??[]),serializeEngineError(next)]};}catch{}}if(failed&&arguments.length===1)throw error;}

/** One unchanged native RITA analyzer/pool. Each context keeps all four fields,
 * its own EOS/previous-step selection and excluded-label maximum. No union
 * maximum, categorical reassignment or new neural pass is introduced here. */
export function createRitaStrictAnalyzer({budget,analyzer,analyzerFactory=createRitaAnalyzer,...configuration}={}){
 requireValue(budget,'An explicit RITA budget is required.');const native=analyzer??analyzerFactory({...configuration,budget}),owners=new Set(),pendingViews=new Set();let cached,active,disposed=false;
 async function retire(entry){
  if(entry.refs||entry.closed)return;if(entry.retiring)return entry.retiring;
  entry.retiring=(async()=>{await retireActions(entry.parts.filter(p=>!p.closed).map(p=>async()=>{await p.value.release();p.closed=true;}));for(const release of entry.leases)release();entry.leases.length=0;entry.parts.length=0;entry.closed=true;owners.delete(entry);})();
  try{await entry.retiring;}finally{entry.retiring=null;}
 }
 async function unpin(entry){requireValue(entry.refs>0,'Native RITA loan is already retired.');entry.refs--;await retire(entry);}
 async function retireView(view){if(!view)return;pendingViews.add(view);await view.dispose();pendingViews.delete(view);}
 function acquire(entry,hit,image=entry.image){
  requireValue(!entry.closed,'Native RITA context owner is closed.');const lease=budget.reserve(16384+sourceRegionTransportBytes([entry.metadata,entry.provenance],{allowUndefined:true,allowAliases:true})*3),reads=new Set();let closing=false,released=false,completion,unpinned=false;
  const alive=()=>requireValue(!released&&!entry.closed,'Native RITA result is retired.'),withRead=fn=>{requireValue(!closing,'Native RITA result is retiring.');alive();const pending=Promise.resolve().then(fn);reads.add(pending);pending.finally(()=>reads.delete(pending)).catch(()=>{});return pending;};
  try{
   const result={data:{width:entry.domain.width,height:entry.domain.height,segmented:true,pixelCount:entry.plan.pixels,metadata:structuredClone(entry.metadata)},provenance:structuredClone(entry.provenance),metrics:{nativeContexts:entry.plan.fragments.length,evaluatedContexts:entry.parts.length,selectedPixels:entry.plan.pixels,analysedPixels:entry.plan.pixels,unanalysablePixels:0,sourceRegionEvaluation:'complete',preflightExecutions:0,cache:{result:hit},memory:budget.snapshot()},release(){
    if(completion)return completion;closing=true;completion=(async()=>{await Promise.allSettled([...reads]);released=true;if(!unpinned){unpinned=true;entry.refs--;lease();}await retire(entry);})().finally(()=>{completion=null;});return completion;
   }};
   for(const key of ['map','official_mask','labels','logits'])result.data[key]=ritaStrictField(entry.parts,key,entry.plan.pixels,{alive,withRead});
   bindRitaStrictResult(result,{domain:entry.domain,parts:entry.parts,image,withRead,closed:()=>closing||entry.closed,async readArray(key,offset,count,hooks){const field=ritaStrictField(entry.parts,key,entry.plan.pixels,{alive:()=>requireValue(!entry.closed,'Native RITA context owner is retired.')});return field.readInto(new Float32Array(count),offset,hooks);}});entry.refs++;return result;
  }catch(error){lease();throw error;}
 }
 return{
  async analyze(image,params={},options={}){
   if(disposed)throw new EngineError('DISPOSED','Strict RITA analyzer is closed.');if(active)throw new EngineError('BUSY','Strict RITA analysis is active.');params=ritaStrictParameters(params);options={...options};
   image={...image,surface:{...image?.surface,descriptor:Object.freeze({...image?.surface?.descriptor})}};
   const controller=new AbortController(),abort=()=>controller.abort();let finish;active={controller,done:new Promise(resolve=>finish=resolve)};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
   let view,entry,current,answer,primary,failed=false;const leases=[];
   try{
    checkAbort(controller.signal);const input=options.sourceRegionDomain??image.sourceRegionDomain??image.provenance?.sourceRegionDomain;leases.push(budget.reserve(sourceRegionTransportBytes(input,{allowUndefined:true,allowAliases:true})*8+65536));const domain=await compileOriginalSourceRegions(input);checkAbort(controller.signal);const d=image.surface.descriptor;
    requireValue(image.sha256===domain.sourceSha256&&d.width===domain.sourceWidth&&d.height===domain.sourceHeight,'Strict RITA requires the actual Original RGB surface, identity and native grid.');if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','RITA selection has no admitted pixels.');
    const key=JSON.stringify([image.sha256,domain.fingerprint,d.id,d.revision,options.backend??'auto']);if(cached?.key===key)return answer=acquire(cached,true,image);
    view=await createSourceRegionView({...image.surface,sha256:image.sha256},domain.descriptor,{budget,signal:controller.signal,maxReadPixels:2**30});const plan=await planRitaStrictContexts(view,{budget,signal:controller.signal});leases.push(plan.release);entry={key,domain,plan,parts:[],leases:[],refs:0,closed:false,image};owners.add(entry);
    const executions=[];
    for(const fragment of plan.fragments){
     checkAbort(controller.signal);const r=fragment.rect,descriptor=Object.freeze({id:'rita-strict/'+domain.fingerprint+'/'+[r.x,r.y,r.width,r.height].join(','),revision:1,width:r.width,height:r.height,format:'rgb8'}),surface={descriptor,readWindow:(rect,hooks)=>view.readWindow({...rect,x:rect.x+r.x,y:rect.y+r.y},hooks)};
     current=await native.analyze({width:r.width,height:r.height,sha256:image.sha256,segmented:true,surface},params,{...options,immutableSource:false,signal:controller.signal});checkAbort(controller.signal);const data=current.data;
     requireValue(data?.segmented===true&&data.width===r.width&&data.height===r.height,'Native RITA returned another context geometry.');
     for(const name of ['map','official_mask','labels','logits']){const channels=name==='logits'?4:1,field=data[name];requireValue(field?.channels===channels&&field.width===r.width&&field.height===r.height&&field.length===fragment.count*channels&&field.byteLength===fragment.count*channels*4&&typeof field.readBytes==='function'&&typeof field.readInto==='function','Native RITA field differs from its context.');}
     const receipt={fragment:fragment.index,metadata:data.metadata,provenance:current.provenance??{},metrics:current.metrics??{}};leases.push(budget.reserve(sourceRegionTransportBytes(receipt,{allowUndefined:true,allowAliases:true})*3+4096));executions.push(structuredClone(receipt));entry.parts.push({fragment,value:current,closed:false});current=null;options.onProgress?.({phase:'rita-native-contexts',completed:fragment.index+1,total:plan.fragments.length});
    }
    checkAbort(controller.signal);entry.metadata={method:'rita',fragmented:true,sourceRegionOrigin:[...domain.origin],originalShape:[domain.sourceHeight,domain.sourceWidth],fragments:plan.fragments,sourceRegionEvaluation:'complete',selectedPixels:plan.pixels,modeledPixels:plan.pixels,nonEvaluatedSelectedPixels:0,arrayLayout:'packed native context pixels; logits CHW with each channel spanning all contexts',attention:'unchanged global RGB/mask attention within each independent native context',selection:'native per-context EOS/preceding-step selection and excluded-label maximum; no pooled categorical maximum',threshold:.5};
    entry.provenance={adapter:'rita-strict-native-contexts-experimental',qualification:'native model and user path qualification pending',originalSourceSha256:domain.sourceSha256,sourceRegionDomain:domain.descriptor,nativeParameters:{},executions};entry.leases=leases.splice(0);entry.refs=1;try{answer=acquire(entry,false);}catch(error){entry.refs=0;throw error;}
    const old=cached;cached=entry;entry=null;if(old)await unpin(old);return answer;
   }catch(error){failed=true;primary=error;throw error;}finally{
    const actions=[()=>current?.release(),()=>entry&&retire(entry),()=>retireView(view),...leases];let cleanup,cleanupFailed=false;try{await retireActions(actions);}catch(error){cleanup=error;cleanupFailed=true;}
    options.signal?.removeEventListener('abort',abort);const lateAbort=!failed&&controller.signal.aborted?new EngineError('CANCELLED','RITA request cancelled before completion.'):null;
    if((failed||lateAbort||cleanupFailed)&&answer)try{await answer.release();}catch(error){cleanup??=error;cleanupFailed=true;}active=null;finish();
    if(failed){if(cleanupFailed)await retireActions([()=>Promise.reject(cleanup)],primary);}else if(lateAbort){if(cleanupFailed)await retireActions([()=>Promise.reject(cleanup)],lateAbort);throw lateAbort;}else if(cleanupFailed)throw cleanup;
   }
  },
  async clearCache(){const old=cached;cached=null;await retireActions([()=>old&&unpin(old),()=>native.clearCache(),...Array.from(owners,e=>()=>!e.refs&&retire(e)),...Array.from(pendingViews,v=>()=>retireView(v))]);},
  async dispose(){disposed=true;const pending=active;pending?.controller.abort();await pending?.done;await retireActions([()=>this.clearCache(),()=>native.dispose()]);},
  memory(){return budget.snapshot();}
 };
}
