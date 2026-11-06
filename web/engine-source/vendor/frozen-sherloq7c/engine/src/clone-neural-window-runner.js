import {EngineError,requireValue,checkAbort} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

const prepareCanonical=async(...args)=>(await import('./clone-analysis-windows.js')).prepareCloneAnalysisWindows(...args);
/** Thin orchestration only. The canonical planner owns geometry. The existing
 * native tool callback owns all preparation/feature/matching arithmetic inside
 * ONE window, including its internal fragments. No banks are combined here.
 * The synchronous carrier remains available if a result/owner ACK refuses. */
export function createNeuralCloneWindowRun({domain,task},{budget,signal,prepareWindows=prepareCanonical,runWindow,runGlobal,admitIndependent,admitGlobal}={}){
 requireValue(task&&typeof runWindow==='function'&&typeof prepareWindows==='function','Canonical clone task and native window callback required.');
 const requestedMode=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(requestedMode),'Invalid clone window mode.');
 const controller=new AbortController(),combined=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
 const outputs=new Set(),owners=new Set(),windowResults=[];let plan,active,closing,closed=false,complete=false,answer;
 const captureOwner=owner=>{requireValue(owner&&typeof owner.dispose==='function','A derived native owner must expose an acknowledged dispose.');owners.add(owner);return owner;};
 async function retire(){
  await retireCompositeOwners([...outputs].map(output=>async()=>{await output.release();outputs.delete(output);}));
  await retireCompositeOwners([...owners].map(owner=>async()=>{await owner.dispose();owners.delete(owner);}));
  if(plan){await plan.release();plan=null;}
 }
 const carrier={
  get state(){return{closed,complete,mode:requestedMode,windowResults:windowResults.length,pendingOutputs:outputs.size,pendingOwners:owners.size,planOwned:!!plan};},
  execute(){
   requireValue(!closed,'Clone window run is closed.');if(active)return active;requireValue(!complete,'Clone window run is already complete.');
   active=(async()=>{
    try{
     checkAbort(combined);plan=await prepareWindows({domain,task},{budget,signal:combined});checkAbort(combined);
     requireValue(plan&&plan.mode===requestedMode&&Array.isArray(plan.windows)&&typeof plan.release==='function','Canonical clone plan differs from the requested mode.');
     if(plan.mode==='global'&&plan.windows.length>0&&plan.windows.every(window=>window.status==='empty')){
      for(const window of plan.windows)windowResults.push({id:window.id,kind:window.kind,bounds:[...window.bounds],origin:[...window.contextDomain.origin],polygon:window.polygon.map(p=>[...p]),fingerprint:window.fingerprint,sourceContextIdentity:JSON.stringify(['global',plan.fingerprint]),status:'empty',output:null});
      answer={mode:'global',status:'empty',globalResult:null,windowResults:[...windowResults],fingerprint:plan.fingerprint,qualificationScope:'empty-no-native-execution'};
     }else if(plan.mode==='global'){
      if(typeof runGlobal!=='function'||typeof admitGlobal!=='function'||await admitGlobal({task:plan.originalTask??task,plan})!==true)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Joint clone-zone analysis needs its own qualified method/backend; it does not qualify independent windows.');
      checkAbort(combined);const output=await runGlobal({task:plan.originalTask??task,plan,signal:combined,onOwner:captureOwner,sourceContextIdentity:JSON.stringify(['global',plan.fingerprint])});
      requireValue(output&&typeof output.release==='function','Global native output must retain its actual owner.');outputs.add(output);checkAbort(combined);answer={mode:'global',globalResult:output,windowResults:[],fingerprint:plan.fingerprint,qualificationScope:'global-only'};
     }else{
      const ids=new Set();for(const window of plan.windows){
       checkAbort(combined);requireValue(window&&typeof window.id==='string'&&!ids.has(window.id)&&['region','envelope'].includes(window.kind)&&Array.isArray(window.bounds)&&window.bounds.length===4&&window.bounds.every(Number.isFinite)&&window.bounds[2]>window.bounds[0]&&window.bounds[3]>window.bounds[1]&&window.candidateDomain&&window.contextDomain&&typeof window.fingerprint==='string','Invalid canonical independent clone window.');ids.add(window.id);
       const identity=JSON.stringify(['independent',window.id,window.fingerprint]);
       const record={id:window.id,kind:window.kind,analyzedPixelCount:window.contextDomain.countIncluded,bounds:[...window.bounds],origin:[...window.contextDomain.origin],polygon:window.polygon.map(p=>[...p]),fingerprint:window.fingerprint,sourceContextIdentity:identity};
       if(window.status==='empty'){windowResults.push({...record,status:'empty',output:null});continue;}
       if(typeof admitIndependent!=='function'||await admitIndependent({task:plan.originalTask??task,plan,window})!==true)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','This independent native window needs its own qualified method/backend; a global result does not qualify it.');
       checkAbort(combined);
       const output=await runWindow({window,task:plan.originalTask??task,signal:combined,onOwner:captureOwner,sourceContextIdentity:identity});
       requireValue(output&&typeof output.release==='function','Independent native output must retain its actual owner.');outputs.add(output);checkAbort(combined);
       windowResults.push({...record,status:'complete',output});
      }
      answer={mode:'independent',windowResults:[...windowResults],fingerprint:plan.fingerprint,qualificationScope:'independent-windows-only'};
     }
     checkAbort(combined);complete=true;return answer;
    }catch(primary){await retireCompositeOwners([retire],{primary});throw primary;}
   })();return active;
  },
  dispose(){if(closing)return closing;closed=true;controller.abort();closing=(async()=>{await active?.catch(()=>{});await retire();})();void closing.finally(()=>{closing=null;}).catch(()=>{});return closing;}
 };
 return carrier;
}
