import "../../runtime-context.js?v=0.14.5";
import {EngineError, checkAbort, requireValue} from './errors.js';
import {BACKING_KINDS} from './resource-registry.js';

// One scheduler per shared engine budget, never one independent quota per pool.
// Admission performs no allocation probe, benchmark, warm-up or persistent lookup.
const schedulers = new WeakMap();

export class ExecutionScheduler {
  constructor(budget, {maxWorkers = globalThis.navigator?.hardwareConcurrency ?? 1, maxGpuJobs = 1} = {}) {
    requireValue(budget && typeof budget.reserve === 'function', 'Execution needs a shared budget.');
    requireValue(Number.isInteger(maxWorkers) && maxWorkers > 0 && Number.isInteger(maxGpuJobs) && maxGpuJobs > 0, 'Invalid execution capacity.');
    this.budget = budget;
    this.capacity = {cpu: maxWorkers, gpu: maxGpuJobs};
    this.used = {cpu: 0, gpu: 0};
    this.queue = [];
    this.running = 0;
    this.labels = new Map();
    this.leases = new Set();
    this.closed = false;
    this.pumping = false;
    this.metrics = {admitted: 0, completed: 0, peakCpu: 0, peakGpu: 0, peakQueued: 0, waitMs: 0, cpuLeaseMs: 0, gpuLeaseMs: 0, elasticAdmissions: 0, memoryReclaims: 0, preflightExecutions: 0};
    this.unsubscribe = budget.subscribe?.(() => this.pump());
    this.resourceListener = () => this.pump();
    budget.resourceAdmissionListeners?.add(this.resourceListener);
  }

  acquire({cpu = 1, minCpu = cpu, gpu = 0, bytes = 0, bytesForCpu, domains = {}, signal, label = 'useful-work', operation, resourceOwner = operation?.owner} = {}) {
    try {
      checkAbort(signal);
      if (this.closed) throw new EngineError('DISPOSED', 'Execution scheduler disposed.');
      requireValue([cpu, minCpu, gpu, bytes].every(n => Number.isSafeInteger(n) && n >= 0), 'Invalid execution reservation.');
      requireValue(minCpu <= cpu && (cpu === 0 || minCpu > 0), 'Invalid elastic CPU minimum.');
      requireValue(bytesForCpu === undefined || typeof bytesForCpu === 'function', 'Invalid elastic memory bound.');
      requireValue(domains && typeof domains === 'object' && !Array.isArray(domains) && Object.entries(domains).every(([kind,size])=>BACKING_KINDS.includes(kind)&&Number.isSafeInteger(size)&&size>=0), 'Invalid phase allocation domains.');
      requireValue(operation === undefined || (operation?.budget === this.budget && !operation.closed), 'Invalid execution operation.');
      requireValue(resourceOwner === undefined || (typeof resourceOwner === 'string' && resourceOwner.length > 0), 'Invalid execution resource owner.');
      requireValue(cpu <= this.capacity.cpu && gpu <= this.capacity.gpu, 'Task exceeds execution capacity.');
      if (bytes > this.budget.limit) throw new EngineError('MEMORY_LIMIT', 'Task exceeds the shared memory budget.');
    } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const request = {cpu, minCpu, gpu, bytes, bytesForCpu, domains:{...domains}, signal, label, resourceOwner, operation, resolve, reject, started: performance.now(), waitingFor: null};
      request.abort = () => {
        const index = this.queue.indexOf(request);
        if (index < 0) return;
        this.queue.splice(index, 1);
        signal.removeEventListener('abort', request.abort);
        operation?.setState('ready');reject(new EngineError('CANCELLED', 'Queued execution cancelled.'));
        this.pump();
      };
      signal?.addEventListener('abort', request.abort, {once: true});
      this.queue.push(request);operation?.setState('queued',{resource:'admission'});
      this.metrics.peakQueued = Math.max(this.metrics.peakQueued, this.queue.length);
      this.pump();
    });
  }

  markQueued(request, resource) {
    request.waitingFor=resource;request.waitingResource=resource;
    const relevant=lease=>resource==='memory'?lease.bytes>0:resource==='gpu'?lease.gpu>0:lease.cpu>0;
    const dependencies=[...this.leases].filter(relevant).map(lease=>lease.operation??(lease.resourceOwner?'owner:'+lease.resourceOwner:null)).filter(Boolean);
    request.waitingDependencies=dependencies.map(value=>value.key??value);
  }

  publishQueuedOperations() {
    // One operation may have several concurrent CPU/GPU/allocation requests.
    // Publishing each independently toggled its resource/dependencies forever:
    // every notification pumped the queue and generated the same next pair.
    // Publish their stable union once, without delaying actual admissions.
    const waiting=new Map();
    for(const request of this.queue){if(!request.operation||!request.waitingFor)continue;let value=waiting.get(request.operation);if(!value){value={resources:new Set(),dependencies:new Set()};waiting.set(request.operation,value);}value.resources.add(request.waitingResource??request.waitingFor);for(const dependency of request.waitingDependencies??[])value.dependencies.add(dependency);}
    for(const [operation,value] of waiting)operation.setState('queued',{resource:[...value.resources].sort().join('+'),dependencies:[...value.dependencies].sort((a,b)=>String(a).localeCompare(String(b)))});
  }

  canWaitForMemory(request) {
    if(!this.running)return false;
    // Legacy leases without ownership remain conservatively live. Once every
    // holder is known, the dependency graph can reject self/cyclic waits.
    if([...this.leases].some(lease=>!lease.operation&&!lease.resourceOwner))return true;
    return (this.budget.resourceProgressSnapshot?.(request.resourceOwner,'array-buffer',request.operation)?.independentProducers??this.running)>0;
  }

  blockingPressure(request) {
    // Work already admitted may finish and release its owners. New growth,
    // including raw recovery retries, shares the registry's ordered arbiter.
    if(request.operation&&[...this.leases].some(lease=>lease.operation===request.operation))return null;
    for(const [kind,bytes] of Object.entries(request.domains)){
      if(!bytes)continue;const pressure=this.budget.resources?.blockingPressure(kind,request.operation);if(pressure)return pressure;
    }
    return null;
  }

  pump() {
    if (this.pumping || this.closed) return;
    this.pumping = true;
    try {
      // Reserve only the minimum needed by the oldest blocked request. CPUs
      // released by the current GPU owner can fund its successor, so CPU-only
      // work can use the remaining slots without starving that successor.
      let reservedCpu = 0, reservedGpu = 0;
      for (let index = 0; index < this.queue.length;) {
        const request = this.queue[index];
        if (request.reclaiming) { index++; continue; }
        const pressure=this.blockingPressure(request);
        if(pressure){request.waitingFor='memory';request.waitingResource=pressure.kind;request.waitingDependencies=[pressure.operation];index++;continue;}
        const freeCpu=Math.max(0,this.capacity.cpu-this.used.cpu-reservedCpu),freeGpu=Math.max(0,this.capacity.gpu-this.used.gpu-reservedGpu);
        const needsGpu=request.gpu>freeGpu,needsCpu=request.minCpu>freeCpu;
        if(needsGpu||needsCpu){
          this.markQueued(request,needsGpu?'gpu':'cpu');
          const returningCpu=needsGpu?[...this.leases].filter(lease=>lease.gpu).reduce((sum,lease)=>sum+lease.cpu,0):0;
          reservedCpu=Math.max(reservedCpu,Math.max(0,request.minCpu-returningCpu));
          reservedGpu=Math.max(reservedGpu,request.gpu);
          index++;
          continue;
        }
        let releaseMemory, cpu = Math.min(request.cpu, freeCpu), bytes;
        try {
          // Malleable kernels declare memory as a function of the granted
          // width. Only arithmetic/accounting is performed before real work.
          for (;;) {
            const additional = request.bytesForCpu?.(cpu) ?? 0;
            requireValue(Number.isSafeInteger(additional) && additional >= 0 && Number.isSafeInteger(request.bytes + additional), 'Invalid elastic memory bound.');
            bytes = request.bytes + additional;
            request.evaluatedBytes=bytes;
            try { releaseMemory = bytes ? this.budget.reserve(bytes) : () => {}; break; }
            catch (error) { if (error.code !== 'MEMORY_LIMIT' || cpu <= request.minCpu) throw error; cpu--; }
          }
        }
        catch (error) {
          if(error.code==='MEMORY_LIMIT')request.memoryRefusal={requestedBytes:bytes,budgetBytes:this.budget.limit,availableBytes:Math.max(0,this.budget.limit-this.budget.total())};
          if (error.code === 'MEMORY_LIMIT' && request.reclaimRevision !== (this.budget.reclaimableRevision??0) && this.budget.asyncReclaimers?.size) {
            request.reclaimRevision = this.budget.reclaimableRevision??0; request.reclaiming = true; this.markQueued(request,'memory'); this.metrics.memoryReclaims++;
            this.budget.reclaim(bytes, {signal: request.signal,owner:request.resourceOwner,operation:request.operation}).then(() => {request.reclaiming = false; this.pump();}, failure => {
              const at = this.queue.indexOf(request); if (at < 0) return;
              this.queue.splice(at, 1); request.signal?.removeEventListener('abort', request.abort); request.operation?.setState('ready');request.reject(failure); this.pump();
            });
            index++; continue;
          }
          // Wait only for admitted work whose completion can release resources.
          // With no running lease there is no progress to wait for: replan now.
          if(error.code==='MEMORY_LIMIT')this.markQueued(request,'memory');
          if (error.code === 'MEMORY_LIMIT' && this.canWaitForMemory(request)) { index++; continue; }
          this.queue.splice(index, 1);
          request.signal?.removeEventListener('abort', request.abort);
          request.operation?.setState('ready');request.reject(error);
          continue;
        }
        this.queue.splice(index, 1);
        request.signal?.removeEventListener('abort', request.abort);
        this.used.cpu += cpu;
        this.used.gpu += request.gpu;
        this.running++;
        this.metrics.admitted++;
        if (request.cpu !== request.minCpu) this.metrics.elasticAdmissions++;
        this.metrics.peakCpu = Math.max(this.metrics.peakCpu, this.used.cpu);
        this.metrics.peakGpu = Math.max(this.metrics.peakGpu, this.used.gpu);
        const waitMs = performance.now() - request.started;
        this.metrics.waitMs += waitMs;
        const admittedAt = performance.now();
        let record = this.labels.get(request.label);
        if (!record) {
          if (this.labels.size >= 128) for (const [key, value] of this.labels) { if (!value.activeJobs) { this.labels.delete(key); break; } }
          record = {admitted: 0, completed: 0, activeJobs: 0, activeCpu: 0, activeGpu: 0, peakCpu: 0, cpuLeaseMs: 0, gpuLeaseMs: 0};
          this.labels.set(request.label, record);
        }
        record.admitted++; record.activeJobs++; record.activeCpu += cpu; record.activeGpu += request.gpu; record.peakCpu = Math.max(record.peakCpu, record.activeCpu);
        const active = {label: request.label, cpu, gpu: request.gpu, admittedAt,bytes,domains:request.domains,operation:request.operation,resourceOwner:request.resourceOwner}; this.leases.add(active);
        const producer=request.resourceOwner&&!request.operation?this.budget.beginResourceProducer?.(request.resourceOwner,{active:cpu+request.gpu>0,commitOnRelease:false}):null;let resourceBlocked=false;
        let released = false;
        const updateOperation=()=>{const operation=request.operation;if(!operation||operation.closed)return;if(resourceBlocked)operation.setState('recovery');else if([...this.leases].some(value=>value.operation===operation&&value.cpu+value.gpu>0))operation.setState('compute');else if(['compute','queued','recovery'].includes(operation.state))operation.setState('ready');};updateOperation();
        request.resolve({get cpu(){return cpu;}, gpu: request.gpu, bytes, label: request.label, waitMs,
          setResourceBlocked: value => {resourceBlocked=!!value;producer?.setActive(!resourceBlocked&&cpu+request.gpu>0);updateOperation();},
          releaseCpu: count => {
            requireValue(!released && Number.isSafeInteger(count) && count > 0 && count <= cpu, 'Invalid partial CPU release.');
            const milliseconds = performance.now() - admittedAt;
            this.metrics.cpuLeaseMs += milliseconds * count; record.cpuLeaseMs += milliseconds * count;
            cpu -= count; active.cpu -= count; this.used.cpu -= count; record.activeCpu -= count;producer?.setActive(!resourceBlocked&&cpu+request.gpu>0);updateOperation();
            this.pump();
          },
          retainMemory: size => {
            requireValue(!released && typeof releaseMemory.split === 'function', 'Execution has no transferable memory reservation.');
            return releaseMemory.split(size);
          }, release: () => {
          if (released) return;
          released = true;
          producer?.();releaseMemory();
          this.used.cpu -= cpu;
          this.used.gpu -= request.gpu;
          this.running--;
          this.metrics.completed++;
          const milliseconds = performance.now() - admittedAt;
          this.metrics.cpuLeaseMs += milliseconds * cpu; this.metrics.gpuLeaseMs += milliseconds * request.gpu;
          record.completed++; record.activeJobs--; record.activeCpu -= cpu; record.activeGpu -= request.gpu;
          record.cpuLeaseMs += milliseconds * cpu; record.gpuLeaseMs += milliseconds * request.gpu;
          this.leases.delete(active);updateOperation();
          this.pump();
        }});
      }
      // Pressure, CPU/GPU and memory waits use the same graph. A closed
      // component with no producer must settle, rather than silently retain
      // promises forever. A cycle is not an allocation failure or a retry.
      this.publishQueuedOperations();
      const graph=this.queue.length?this.budget.resources?.productive():null;
      for(const request of [...this.queue]){
        if(request.reclaiming)continue;const error=this.budget.resources?.dependencyCycleError(request.operation,request.waitingFor,graph);
        if(!error)continue;this.queue.splice(this.queue.indexOf(request),1);request.signal?.removeEventListener('abort',request.abort);request.operation?.setState('ready');request.reject(error);
      }
    } finally { this.pumping = false; }
  }

  async run(resources, execute) {
    const lease = await this.acquire(resources);
    try { checkAbort(resources?.signal); return await execute(lease); }
    finally { lease.release(); }
  }

  snapshot() {
    const now = performance.now(), labels = Object.fromEntries([...this.labels].map(([label, value]) => [label, {...value}]));
    let cpuLeaseMs = this.metrics.cpuLeaseMs, gpuLeaseMs = this.metrics.gpuLeaseMs;
    for (const lease of this.leases) { const duration = now - lease.admittedAt; cpuLeaseMs += duration * lease.cpu; gpuLeaseMs += duration * lease.gpu; labels[lease.label].cpuLeaseMs += duration * lease.cpu; labels[lease.label].gpuLeaseMs += duration * lease.gpu; }
    const waiting = {cpu: 0, gpu: 0, memory: 0}; for (const request of this.queue) if (request.waitingFor) waiting[request.waitingFor]++;
    const phaseDomains=Object.fromEntries(BACKING_KINDS.map(kind=>[kind,[...this.leases].reduce((sum,lease)=>sum+(lease.domains[kind]??0),0)]));
    // Bounded metadata from real admission attempts. Never re-run an elastic
    // sizing callback or an allocation just to explain a queued request.
    const queuedRequests=this.queue.slice(0,32).map(request=>({label:request.label,owner:request.resourceOwner??null,operation:request.operation?.key??null,waitingFor:request.waitingFor,cpu:request.cpu,minCpu:request.minCpu,gpu:request.gpu,baseBytes:request.bytes,evaluatedBytes:request.evaluatedBytes??null,domains:{...request.domains},waitMs:now-request.started,memoryRefusal:request.memoryRefusal??null}));
    return {...this.metrics, cpuLeaseMs, gpuLeaseMs, capacity: {...this.capacity}, active: {...this.used}, running: this.running, queued: this.queue.length, waiting, queuedRequests,queuedRequestsOmitted:Math.max(0,this.queue.length-queuedRequests.length), labels, phaseDomains, timingMeaning: 'Admitted execution time; not an OS CPU-utilization measurement',domainMeaning:'New allocation requirements of active phases; separate from policy reservations and materialized backing ownership'};
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.budget.resourceAdmissionListeners?.delete(this.resourceListener);
    for (const request of this.queue.splice(0)) {
      request.signal?.removeEventListener('abort', request.abort);
      request.operation?.setState('ready');request.reject(new EngineError('DISPOSED', 'Execution scheduler disposed.'));
    }
  }
}

export function getExecutionScheduler(budget, options) {
  let scheduler = schedulers.get(budget);
  if (!scheduler) {
    scheduler = new ExecutionScheduler(budget, options);
    schedulers.set(budget, scheduler);
  }
  return scheduler;
}
