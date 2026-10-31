import {EngineError,requireValue} from './unified-engine/src/errors.js';

// Reuse the same existing scientific task preparation as Calculate. This
// never creates a scope, starts a detector or loosens a native checkpoint key.
export async function prepareParameterScientificTask(task,{getController,bindTask,isSourceCurrent=()=>true}={}){
 requireValue(typeof getController==='function'&&typeof bindTask==='function'&&typeof isSourceCurrent==='function','Parameter scientific task owners are required.');
 const controller=getController(),scope=controller?.scope,fingerprint=scope?.fingerprint,active=!!controller?.active?.(),scientific=!!controller?.scientificActive?.();
 const isCurrent=()=>isSourceCurrent()&&getController()===controller&&controller?.scope===scope&&controller?.scope?.fingerprint===fingerprint&&!!controller?.active?.()===active&&!!controller?.scientificActive?.()===scientific;
 const assertCurrent=()=>{if(!isCurrent())throw new EngineError('CANCELLED','Parameter scientific scope or source changed during preparation.');};
 assertCurrent();const scoped=active&&scientific?controller.task(task):task;assertCurrent();const submitted=await bindTask(scoped);assertCurrent();
 return{task:submitted,isCurrent};
}
