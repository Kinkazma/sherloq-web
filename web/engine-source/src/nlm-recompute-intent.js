import {EngineError} from './errors.js';

// One caller-requested computation, never a persisted setting or an Auto policy.
export function humanNlmRecompute(task){
 if(task?.recompute===undefined)return false;
 const r=task.recompute;
 if(task.operation!=='noise.separation'||task.params?.mode!==4||!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='backend,kind'||r.kind!=='human-backend'||!['cpu','webgpu'].includes(task.backend)||r.backend!==task.backend)throw new EngineError('INVALID_ARGUMENT','A fresh NLM computation requires an explicit CPU or GPU human request.');
 return true;
}
