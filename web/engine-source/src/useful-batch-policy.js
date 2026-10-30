// Every observed page is disjoint requested work. The policy never invokes a
// backend, retains input data, or requests a calibration/repeated result.
export function usefulBatchPlan(total, maximumConcurrency = 1, maximumBatch = 32) {
 if (![total, maximumConcurrency, maximumBatch].every(Number.isSafeInteger) || total < 1 || maximumConcurrency < 1 || maximumBatch < 1) throw new Error('Invalid useful batch plan');
 const concurrency = Math.min(total, maximumConcurrency, maximumBatch);
 const page = Math.min(maximumBatch, Math.max(concurrency, Math.floor(total / 4)));
 return {page, concurrency, comparablePages: Math.floor(total / page), canObserveBoth: total >= page * 4};
}
export function createUsefulBatchPolicy({totalWork, pageWork, minimumGain = .1} = {}) {
 if (![totalWork, pageWork].every(Number.isFinite) || totalWork < 1 || pageWork < 1 || minimumGain < 0 || minimumGain >= 1) throw new Error('Invalid useful batch policy');
 const samples = {cpu: [], webgpu: []}; let completedWork = 0, refused = null, decision = null;
 const summarize = () => {
  const cpu = samples.cpu, gpu = samples.webgpu;
  if (refused) return {winner:'cpu', reason:'GPU-resource-refusal', refusal:refused};
  if (cpu.length < 2 || gpu.length < 2) return {winner:'cpu', reason:'insufficient-comparable-useful-pages'};
  const cpuRate=cpu[1].ms/cpu[1].work, gpuRate=gpu[1].ms/gpu[1].work;
  const cpuObservedMs=cpu.reduce((n,v)=>n+v.ms,0), gpuObservedMs=gpu.reduce((n,v)=>n+v.ms,0);
  const cpuObservedWork=cpu.reduce((n,v)=>n+v.work,0), gpuObservedWork=gpu.reduce((n,v)=>n+v.work,0);
  const cpuSetupMs=Math.max(0,cpu[0].ms-cpuRate*cpu[0].work);
  const cpuEstimate=cpuSetupMs+cpuRate*totalWork;
  const hybridEstimate=cpuObservedMs+gpuObservedMs+gpuRate*Math.max(0,totalWork-cpuObservedWork-gpuObservedWork);
  return {winner:hybridEstimate<cpuEstimate*(1-minimumGain)?'webgpu':'cpu',reason:'completed-disjoint-useful-pages-full-cost',cpuRate,gpuRate,cpuSetupMs,cpuEstimate,hybridEstimate,cpuObservedMs,gpuObservedMs};
 };
 return {
  choose(work) {
   if (!(work > 0) || !Number.isFinite(work)) throw new Error('Useful page extent required');
   // A partial page is not an instruction to explore another backend.
   // The shared service selects a single admitted backend before the job.
   return 'cpu';
  },
  observe(backend,{work,milliseconds}={}) {
   if (!Object.hasOwn(samples,backend) || !(work>0) || !(milliseconds>0) || !Number.isFinite(work+milliseconds) || completedWork+work>totalWork) throw new Error('A completed disjoint useful page is required');
   completedWork+=work;
   if (work===pageWork && samples[backend].length<2) samples[backend].push({work,ms:milliseconds});
   if (samples.cpu.length===2&&samples.webgpu.length===2&&!decision) decision=summarize();
  },
  refuse(code) {refused=String(code??'GPU_UNAVAILABLE'); decision=null;},
  snapshot() {return {...(decision??summarize()),totalWork,pageWork,completedWork,cpuPages:samples.cpu.length,gpuPages:samples.webgpu.length,observedWorkDuplicated:0,calibrationExecutions:0};}
 };
}
