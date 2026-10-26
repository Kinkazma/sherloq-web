import {diagnostic} from './runtime-context.js?v=0.25.0';

// One pair per startup phase; no polling, image data or per-resource events.
export async function startupPhase(stage,action,{emit=diagnostic,now=()=>performance.now(),failureLevel='error'}={}){
 const started=now();emit({level:'info',kind:'startup.phase',stage,state:'started'});
 try{const value=await action();emit({level:'info',kind:'startup.phase',stage,state:'completed',durationMs:now()-started});return value;}
 catch(error){emit({level:failureLevel,kind:'startup.phase',stage,state:'failed',durationMs:now()-started,error});throw error;}
}
