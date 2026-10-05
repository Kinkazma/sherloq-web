import {checkAbort} from '../../src/errors.js';

// Eligibility only: every real allocation still goes through the same Budget.
// No nested parallelism: only the single-thread CPU ONNX engine opts in.
export function segmentationCpuZoneCapacity({budget, model, zones, segmented, reclaimableInferenceBytes = 0, extraReservedBytes = 0, hardwareConcurrency = globalThis.navigator?.hardwareConcurrency ?? 1}) {
  const maximumCrop = segmented ? 0 : Math.max(...zones.map(z => (z.bounds[2] - z.bounds[0]) * (z.bounds[3] - z.bounds[1]) * 3));
  const perLane = 512 * 1024 ** 2 + 3 * model.bytes + 2 * maximumCrop + 32 * 1024 ** 2;
  const rawPins = zones.length * model.side ** 2 * (model.kind === 'softmax' ? 3 : 1) * 12;
  const available = budget.limit - budget.retained - budget.active + reclaimableInferenceBytes - extraReservedBytes - rawPins;
  return Math.max(1, Math.min(zones.length, Math.max(1, Math.floor(hardwareConcurrency) || 1), Math.floor(available / perLane)));
}

export function segmentationZoneConcurrency({budget, model, lanes, zones, segmented, hardwareConcurrency}) {
  if (!lanes[0].inference.independentZoneWorker) return 1;
  return segmentationCpuZoneCapacity({budget,model,zones,segmented,hardwareConcurrency,reclaimableInferenceBytes:lanes.reduce((sum,lane)=>sum+(lane.inference.residentBytes??0),0)});
}

// Results remain indexed by source zone, irrespective of completion order.
// If concurrency meets real memory pressure, drain the active jobs and retry
// unfinished jobs serially. A single-lane refusal is returned to the caller.
// No algorithm, precision or resolution changes accompany this backoff.
export async function runSegmentationZones({count, lanes, run, signal}) {
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once:true});
  if (signal?.aborted) abort();
  const values = new Array(count), finished = new Set();
  let next = 0, active = 0, observed = 0, pressure = false, failure, backoffs = 0;
  const execute = async (index, lane) => {
    checkAbort(controller.signal); active++; observed = Math.max(observed, active);
    try {values[index] = await run(index, lane, controller.signal); finished.add(index);}
    finally {active--;}
  };
  try {
    await Promise.all(lanes.map(async lane => {
      while (next < count && !pressure && !failure) {
        const index = next++;
        try {await execute(index, lane);}
        catch (error) {
          if (error.code === 'MEMORY_LIMIT' && lanes.length > 1 && !controller.signal.aborted) {pressure = true; backoffs++;}
          else if (!failure) {failure = error; controller.abort();}
        }
      }
    }));
    if (failure) throw failure;
    checkAbort(controller.signal);
    if (pressure) for (let index = 0; index < count; index++) if (!finished.has(index)) await execute(index, lanes[0]);
    return {values, concurrency: {requested: lanes.length, observed, memoryBackoffs: backoffs, internalThreadsPerWorker: 1}};
  } finally {signal?.removeEventListener('abort', abort);}
}
