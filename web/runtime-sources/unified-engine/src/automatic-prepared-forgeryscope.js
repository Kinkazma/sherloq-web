import "../../runtime-context.js?v=0.25.0";
import{createForgeryscopeBoundedSource}from'./forgeryscope-bounded-source.js';
import{retireForgeryscopeOwners}from'./forgeryscope-owner-retirement.js';
import{createNeuralCloneWindowRun}from'./clone-neural-window-runner.js';
import{prepareCloneAnalysisWindows}from'./clone-analysis-windows.js';
import{forgeryscopeWindowFields,FORGERYSCOPE_WINDOW_FIELDS}from'./forgeryscope-window-fields.js';
import{sourceRegionTransportBytes}from'./source-region-transport.js';
import{EngineError,requireValue,checkAbort}from'./errors.js';
const shiftPoly=(p,o)=>p.map(v=>v.map((n,i)=>n-o[i])),shiftBox=(b,o)=>b.map((n,i)=>n-o[i%2]);
function localScope(scope,window,fragments){
 const o=window.contextDomain.origin,out=structuredClone(scope),region=r=>({...r,...Object.fromEntries(['x0','y0','x1','y1'].map((k,i)=>[k,r[k]-o[i%2]])),...(r.polygon?{polygon:shiftPoly(r.polygon,o)}:{}),...(r.bounds?{bounds:shiftBox(r.bounds,o)}:{})});
 Object.assign(out,{width:window.contextDomain.width,height:window.contextDomain.height,fingerprint:JSON.stringify(['forgeryscope-window-scope',scope.fingerprint,window.fingerprint]),regions:scope.regions.map(region),excluded:scope.excluded.map(p=>shiftPoly(p,o))});
 if(scope.searchRegions)out.searchRegions=scope.searchRegions.map(region);
 if(scope.text){out.text={...scope.text};if(scope.text.polygons)out.text.polygons=scope.text.polygons.map(p=>shiftPoly(p,o));if(scope.text.detections)out.text.detections=scope.text.detections.map(d=>({...d,...(d.polygon?{polygon:shiftPoly(d.polygon,o)}:{}),...(d.bounds?{bounds:shiftBox(d.bounds,o)}:{}),...(d.rectangle?{rectangle:shiftBox(d.rectangle,o)}:{})}));}
 // The certificate partitions candidate RGB into real rectangles; these are
 // exact candidate centres on THIS native frame, including exclusion holes.
 if(fragments.length)out.nativeSourceRegions={schema:'sherloq.native-region-membership/1',coordinates:'source-region-native',domainFingerprint:window.candidateDomain.fingerprint,sourceSha256:scope.sourceSha256,width:out.width,height:out.height,levels:[{rectangles:fragments.map(f=>[...f.bounds])}]};else delete out.nativeSourceRegions;
 out.sourceRegionLocalization={coordinates:'window-native-pixels',origin:[...o],originalScopeFingerprint:scope.fingerprint,windowFingerprint:window.fingerprint,metadataCoordinates:'regions/searchRegions/excluded/text geometry translated once; other native source metadata retains its recorded coordinates'};
 return out;
}
/** Same configured native ensemble, called separately for each canonical
 * analysis window. No feature/embedding/lane comparison crosses these calls.
 * Model weights, branches, native thresholds and backend options are unchanged.
 * The parent retains this provider until its result/carrier ACKs and cache are
 * retired; the Original source remains owned by the automatic record. */
export function createAutomaticPreparedForgeryscope(analyzer,{getContext,budget,prepareWindows=prepareCloneAnalysisWindows,admitGlobal}={}){
 requireValue(typeof analyzer?.analyze==='function'&&typeof getContext==='function'&&typeof budget?.reserve==='function','Actual Forgeryscope analyzer and verified context owner required.');
 const cache=new Map(),held=new Set(),lifetime=new AbortController();let active=false,closed=false,finished=Promise.resolve(),closing;
 const retire=async entry=>{requireValue(entry.loans===0,'Forgeryscope result still owns its native window.');await entry.value?.release();entry.value=null;await entry.reader?.dispose();entry.reader=null;entry.free?.();cache.delete(entry.key);};
 return{
  async analyze(image,params,options={}){
   requireValue(!closed&&!active,'Prepared Forgeryscope windows are busy or disposed.');active=true;let finish;finished=new Promise(r=>finish=r);const signal=options.signal?AbortSignal.any([options.signal,lifetime.signal]):lifetime.signal;let carrier,free,returned=false,failed=false,primary,context;
   const owner={released:false,async release(){if(this.released)return;await carrier?.dispose();free?.();this.released=true;held.delete(this);}};held.add(owner);
   try{
    context=await getContext({...options,signal});checkAbort(signal);
    if(!context){if((options.cloneWindowMode??'independent')!=='independent')throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Forgeryscope shared-window native decisions require a verified context and separate global qualification.');held.delete(owner);return await analyzer.analyze(image,params,{...options,signal});}
    const dimensions=image.surface?.descriptor??image.pixels??image;requireValue(image.sha256===context.sourceDomain.sourceSha256&&dimensions.width===context.width&&dimensions.height===context.height&&params?.profile==='auto'&&params.scientificScope?.fingerprint===context.inputScopeFingerprint,'Prepared Forgeryscope scope/source changed.');
    const originalTask=context.originalTask,originalScope=originalTask.params?.scientificScope??originalTask.scientificScope,mode=options.cloneWindowMode??originalTask.cloneWindowMode??'independent';requireValue(originalScope?.status==='ready'&&Array.isArray(originalScope.regions)&&Array.isArray(originalScope.excluded),'Original scientific preparation required for native Forgeryscope windows.');
    const task={...originalTask,cloneWindowMode:mode};
    const runWindow=async({window,task:job,signal:jobSignal})=>{
     const key=JSON.stringify([mode,window.id,window.fingerprint]),inputKey=JSON.stringify([params,options.backend??'auto']);let entry=cache.get(key);const windowCacheHit=!!entry?.value&&entry.inputKey===inputKey;if(entry&&(!entry.value||entry.inputKey!==inputKey)){await retire(entry);entry=null;}if(!entry){entry={key,inputKey,loans:0};cache.set(key,entry);
      const prepared={...context,originalTask:job,sourceDomain:window.contextDomain,candidateDomain:window.candidateDomain,contextDomain:window.contextDomain,width:window.contextDomain.width,height:window.contextDomain.height,origin:[...window.contextDomain.origin],fingerprint:window.fingerprint};
      entry.reader=await createForgeryscopeBoundedSource(prepared,{budget,signal:jobSignal});checkAbort(jobSignal);
      entry.free=budget.reserve(65536+16*sourceRegionTransportBytes([params,originalScope,entry.reader.metadata.fragments,window.bounds],{allowUndefined:true,allowAliases:true}));
      const scientificScope=localScope(originalScope,window,entry.reader.metadata.fragments),input={...params,scientificScope,...(params.exclusions?{exclusions:params.exclusions.map(b=>b.map((n,i)=>n+context.origin[i%2]-window.contextDomain.origin[i%2]))}:{})};
      entry.input=input;entry.requestedParameters={...params,scientificScope:originalScope};
      entry.value=await analyzer.analyze(entry.reader.image,input,{...options,signal:jobSignal});checkAbort(jobSignal);requireValue(entry.value.width===prepared.width&&entry.value.height===prepared.height&&entry.value.metadata?.strict_native_contexts?.contextFingerprint===window.fingerprint&&FORGERYSCOPE_WINDOW_FIELDS.every(k=>entry.value[k]?.length===prepared.width*prepared.height),'Forgeryscope did not return its complete native window receipt.');
     }
     checkAbort(jobSignal);requireValue(entry.value,'A failed Forgeryscope native context must be retired before retry.');entry.loans++;let released=false;return{...entry.value,windowCacheHit,requestedParameters:entry.requestedParameters,nativeParameters:entry.input,cloneContextFingerprint:window.fingerprint,nativeRegionPolicy:'native-forgeryscope-certified-panel-fragments',async release(){if(!released){released=true;entry.loans--;}}};
    };
    // Every native Forge CNN crop has always been candidate-only. Preserve that
    // upstream ceiling before planning windows, so the envelope cannot revive
    // prepared acquisition gaps or text exclusions as native detector pixels.
    carrier=createNeuralCloneWindowRun({domain:context.candidateDomain,task},{budget,signal,runWindow,admitIndependent:()=>true,runGlobal:({plan,...job})=>{requireValue(plan.global?.contextPolicy==='declared-window-context-union','Global Forgeryscope requires exactly the declared window RGB union.');return runWindow({...job,window:{id:'global-analysis',kind:'region',bounds:[plan.global.contextDomain.rect.x0,plan.global.contextDomain.rect.y0,plan.global.contextDomain.rect.x1,plan.global.contextDomain.rect.y1],...plan.global}});},admitGlobal:async info=>{if(!await admitGlobal?.(info))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Forgeryscope shared-window native decisions require separate global qualification.');return true;},prepareWindows:async(...args)=>{const plan=await prepareWindows(...args);try{const keep=new Set(plan.mode==='global'&&plan.global?[JSON.stringify([plan.mode,'global-analysis',plan.global.fingerprint])]:plan.windows.filter(w=>w.status!=='empty').map(w=>JSON.stringify([plan.mode,w.id,w.fingerprint])));for(const entry of cache.values())if(!keep.has(entry.key))await retire(entry);checkAbort(signal);return plan;}catch(error){await plan.release();throw error;}}});
    const result=await carrier.execute();checkAbort(signal);
    const global=result.mode==='global'?result.globalResult:null,globalDomain=global?.metadata.strict_native_contexts;
    let metadataBytes=65536;for(const row of global?[{output:global}]:result.windowResults)metadataBytes+=16*sourceRegionTransportBytes([row.id,row.kind,row.bounds,row.origin,row.polygon,row.fingerprint,row.sourceContextIdentity,row.output?.metadata,row.output?.provenance,row.output?.metrics],{allowUndefined:true,allowAliases:true});free=budget.reserve(metadataBytes);
    const windows=global?[{id:'global-analysis',kind:'region',origin:[...globalDomain.origin],status:'complete',fingerprint:global.metadata.strict_native_contexts.contextFingerprint,sourceContextIdentity:JSON.stringify(['global',result.fingerprint]),output:global}]:result.windowResults,alive=()=>requireValue(!owner.released,'Forgeryscope result owner released.'),fields=forgeryscopeWindowFields(windows,{width:context.width,height:context.height,origin:context.origin,budget,alive});
    const nativeWindowResults=windows.map(w=>({...w,output:undefined,dataNatif:w.output?Object.fromEntries(Object.entries(w.output).filter(([k])=>k!=='release')):null}));
    const strictFragments=[],classification=[];for(const w of windows)if(w.output){const meta=w.output.metadata.strict_native_contexts,base=strictFragments.length;for(const f of meta.fragments)strictFragments.push({...f,windowId:w.id,...(w.output.metadata.nativeContextAvailability?.status==='not-evaluable'?{nativeUnavailable:true}:{}),bounds:f.bounds.map((v,i)=>v+w.origin[i%2]-context.origin[i%2])});for(const c of meta.classification??[])classification.push({...c,windowId:w.id,fragment:c.fragment+base});}
    const statuses=windows.filter(w=>w.output).map(w=>w.output.metadata.status),unavailable=windows.filter(w=>w.output?.metadata.nativeContextAvailability);
    const status=statuses.includes('ok')?'ok':statuses.length&&statuses.every(x=>x==='not_evaluable')?'not_evaluable':statuses.includes('not_evaluable')?'partial':statuses.length&&statuses.every(x=>x==='no_panels')?'no_panels':statuses.length&&statuses.every(x=>x==='insufficient_panels')?'insufficient_panels':'empty';
    const availability=unavailable.length?{nativeContextAvailability:{schema:'sherloq.native-context-availability/1',code:'NATIVE_CONTEXT_NOT_EVALUABLE',status:status==='not_evaluable'?'not-evaluable':'partial',notEvaluableContexts:unavailable.reduce((n,w)=>n+(w.output.metadata.nativeContextAvailability.notEvaluableContexts??0),0),classification:unavailable.reduce((n,w)=>n+(w.output.metadata.nativeContextAvailability.classification??0),0),lanes:unavailable.reduce((n,w)=>n+(w.output.metadata.nativeContextAvailability.lanes??0),0)},warnings:unavailable.flatMap(w=>(w.output.metadata.warnings??[]).map(row=>({...row,windowId:w.id})))}:{};
    const metadata={...availability,profile:windows.find(w=>w.output)?.output.metadata.profile??'auto',status,cloneWindowMode:result.mode,cloneAnalysisWindows:{mode:result.mode,fingerprint:result.fingerprint,matchingAcrossWindows:result.mode==='global'},scientific_scope:{fingerprint:params.scientificScope.fingerprint},strict_native_contexts:{contextFingerprint:result.fingerprint,origin:[...context.origin],fragments:strictFragments,classification,cnnContext:result.mode==='independent'?'Independent native pipeline for each declared window; only presentation fields are united.':'Explicit shared native pipeline over the certified declared-window RGB union.'}};
    checkAbort(signal);returned=true;
    return{width:context.width,height:context.height,...fields,cloneWindowMode:result.mode,windowResults:result.mode==='independent'||!global?nativeWindowResults:[],...(result.mode==='global'?{globalResult:global?nativeWindowResults[0]:null}:{}),metadata,provenance:{cloneWindowMode:result.mode,nativeWindows:windows.map(w=>({id:w.id,origin:w.origin,status:w.status,provider:w.output?.provenance??null}))},metrics:{cache:{windows:windows.map(w=>({id:w.id,status:w.status,result:w.output?.windowCacheHit??false,native:w.output?.metrics.cache??null}))},memory:budget.snapshot(),preflightExecutions:0},release:()=>owner.release()};
   }catch(error){failed=true;primary=error;throw error;}finally{try{if(!returned)await retireForgeryscopeOwners([()=>owner.release()],failed?{primary}:{});}finally{active=false;finish();}}
  },
  dispose(){closed=true;lifetime.abort();if(closing)return closing;closing=(async()=>{await finished;await retireForgeryscopeOwners([...held].map(o=>()=>o.release()));for(const entry of cache.values())await retire(entry);})();void closing.finally(()=>closing=null).catch(()=>{});return closing;},
  state(){return{closed,active,cachedWindows:cache.size,heldResults:held.size};}
 };
}
