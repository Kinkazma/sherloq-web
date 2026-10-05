import "../../runtime-context.js?v=0.14.5";
import {getExecutionScheduler} from './execution-scheduler.js';
import {checkAbort} from './errors.js';

// Queued calls belong to the same cancellation generation as their pool.
// A terminated worker must never receive a previously queued message later.
const generations = new WeakMap();
export async function scheduledWorkerCall(owner, execute, {signal, cpu = 1, gpu = 0, bytes = 0, domains = {}, label = 'worker', resourceOwner, operation: suppliedOperation, parent = owner.resourceOperation} = {}) {
  let controller = generations.get(owner);
  if (!controller) { controller = new AbortController(); generations.set(owner, controller); }
  const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const scheduler = getExecutionScheduler(owner.budget, {maxWorkers: owner.profile?.maxWorkers ?? owner.maximum ?? globalThis.navigator?.hardwareConcurrency ?? 1});
  // Every admitted call has observable ownership, including legacy pools that
  // predate resourceOwner. A supplied ticket is borrowed, never duplicated or
  // released here; the registry itself attaches new children to their parent.
  resourceOwner??=suppliedOperation?.owner??parent?.owner??owner.resourceOwner??('worker:'+label);
  const operation=suppliedOperation??owner.budget.beginOperation?.({owner:resourceOwner,id:label,parent:parent??undefined});
  try{return await scheduler.run({cpu, gpu, bytes, domains, signal: joined, label, resourceOwner,operation:operation??undefined}, async () => {
    checkAbort(joined);
    return execute();
  });}finally{if(!suppliedOperation)operation?.release();}
}
export function cancelScheduledWorkerCalls(owner) {
  generations.get(owner)?.abort();
  generations.delete(owner);
}
