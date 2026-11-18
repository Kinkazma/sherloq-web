import {EngineError, checkAbort, requireValue} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';

export const CODEC_CPU_PHASE_SCHEMA = 'sherloq.codec-cpu-phase/1';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const ack = async action => {
  const result = await action();
  if (result === false || result === 0) throw result;
  return result;
};

/** CPU admission around one existing captured codec peer. No Worker, budget,
 * scheduler or native-close certificate is manufactured by this facade. */
export function createCapturedCodecCpuPhase({execution, signal, resourceOwner, label = 'source-codec'} = {}) {
  requireValue(execution?.acquire && execution?.transition
    && Number.isSafeInteger(execution.capacity?.cpu) && execution.capacity.cpu > 0
    && typeof resourceOwner === 'string' && resourceOwner.length > 0,
  'A captured Core execution scheduler and codec owner are required.');
  const epoch = crypto.randomUUID(), work = new AbortController(), codecAbort = new AbortController();
  const fatal = deferred(), closingPermit = deferred();
  // A fault can precede start; its owner must remain reachable without an
  // unhandled rejected promise. start still observes this same rejection.
  fatal.promise.catch(() => {});
  let peer, captured, lease, tail = Promise.resolve(), sequence = 0, phase = 'new',
    started = false, startCalled = false, retiring = false, quiescent = false,
    suspended = false, closed = false, terminated = false, certificate,
    closeFlight, terminationFlight, permitFlight, abortFlight, fatalReported = false;

  const queue = action => {
    const task = tail.then(action);
    tail = task.then(() => {}, () => {});
    return task;
  };
  function fail(primary) {
    if (!fatalReported) {
      fatalReported = true;
      fatal.reject(primary);
    }
  }
  function markRetiring() {
    retiring = true;
    work.abort();
  }
  async function changeUnsafe(cpu, minCpu, name, admissionSignal) {
    const previous = lease;
    // transition releases previous synchronously even if its new acquisition
    // rejects. Never keep or release that previous lease a second time.
    lease = undefined;
    const request = {cpu, minCpu, gpu: 0, bytes: 0, signal: admissionSignal,
      resourceOwner, label: `${label}:${name}`};
    lease = await (previous ? execution.transition(previous, request) : execution.acquire(request));
    phase = name;
    return lease.cpu;
  }
  function ensureClosingPermit() {
    if (permitFlight) return permitFlight;
    const task = queue(async () => {
      if (!started || quiescent || terminated) { closingPermit.resolve(); return; }
      if (!lease?.cpu) await changeUnsafe(1, 1, 'retire', undefined);
      closingPermit.resolve();
    });
    permitFlight = task;
    task.then(() => { if (permitFlight === task) permitFlight = undefined; },
      () => { if (permitFlight === task) permitFlight = undefined; });
    return task;
  }
  function abortWork() {
    markRetiring();
    if (abortFlight) return;
    // Abort of a parent callback must not jump a child from idle into its
    // native finally without a CPU permit. This continuation never waits for
    // the callback itself, which may currently hold the only parent CPU.
    abortFlight = ensureClosingPermit().then(() => { codecAbort.abort(); });
    abortFlight.catch(primary => fail(withRetirementOwner(primary, captured, primary)));
  }
  signal?.addEventListener('abort', abortWork, {once: true});
  if (signal?.aborted) abortWork();

  async function failResponse(primary) {
    markRetiring();
    try { await ensureClosingPermit(); codecAbort.abort(); }
    catch (cleanup) {
      // Do not let a rejected admission turn into an error RPC that resumes
      // unadmitted native cleanup. Expose the owner to start/B; a subsequent
      // explicit dispose can retry the same permit and settle this barrier.
      fail(withRetirementOwner(primary, captured, cleanup));
      await closingPermit.promise;
    }
    throw primary;
  }
  async function active(cpu, minCpu, name) {
    try {
      return await queue(async () => {
        checkAbort(work.signal);
        requireValue(!retiring && !closed && !terminated, 'The captured codec CPU owner is retiring.');
        return changeUnsafe(cpu, minCpu, name, work.signal);
      });
    } catch (primary) { return failResponse(primary); }
  }

  const api = {
    get codecSignal() { return codecAbort.signal; },
    get state() { return {phase, cpu: lease?.cpu ?? 0, sequence, started, retiring,
      suspended, quiescent, closed, terminated, waiting: !!permitFlight}; },
    resumeReceipt() {
      requireValue(started && !suspended && !retiring && !quiescent && !closed
        && lease?.cpu === 1, 'The codec response has no admitted one-lane continuation.');
      return {schema: CODEC_CPU_PHASE_SCHEMA, epoch, cpu: 1};
    },
    request(value) {
      // The existing peer also checks its own request id. This epoch/sequence
      // cannot be replayed against a later peer or after the final idle point.
      requireValue(started && !quiescent && !closed && !terminated && value?.schema === CODEC_CPU_PHASE_SCHEMA
        && value.epoch === epoch && value.sequence === sequence + 1
        && typeof value.phase === 'string' && value.phase.length > 0
        && value.phase.length <= 64 && ['active', 'native-closed'].includes(value.kind),
      'The captured codec CPU phase differs.');
      sequence++;
      const response = cpu => ({schema: CODEC_CPU_PHASE_SCHEMA, epoch, sequence: value.sequence,
        phase: value.phase, cpu});
      if (value.kind === 'native-closed') {
        requireValue(value.cpu === 0 && value.minCpu === 0 && !suspended,
          'The final codec CPU phase must be quiescent.');
        return queue(async () => {
          await changeUnsafe(0, 0, value.phase, undefined);
          quiescent = true; closingPermit.resolve(); return response(0);
        });
      }
      requireValue(Number.isSafeInteger(value.cpu) && value.cpu > 0 && value.cpu <= execution.capacity.cpu
        && Number.isSafeInteger(value.minCpu) && value.minCpu > 0 && value.minCpu <= value.cpu
        && !suspended, 'Invalid captured codec CPU admission.');
      return active(value.cpu, value.minCpu, value.phase).then(response);
    },
    async suspend(callback, {resumeCpu = 1} = {}) {
      requireValue(started && !suspended && !quiescent && typeof callback === 'function'
        && Number.isSafeInteger(resumeCpu) && resumeCpu > 0 && resumeCpu <= execution.capacity.cpu,
      'A codec request must suspend one active captured producer.');
      suspended = true;
      let result, primary, failed = false;
      try {
        await active(0, 0, 'parent-wait');
        checkAbort(work.signal);
        result = await callback();
      } catch (error) { failed = true; primary = error; }
      try {
        // callback is outside queue: its I/O cannot prevent a concurrent close
        // from acquiring the retirement lane after the parent releases it.
        if (retiring || work.signal.aborted) {
          await ensureClosingPermit(); codecAbort.abort();
          if (!failed) { failed = true; primary = new EngineError('CANCELLED', 'Codec work was cancelled.'); }
        } else await active(resumeCpu, resumeCpu, 'conversion');
      } catch (cleanup) {
        return failResponse(failed ? withRetirementOwner(primary, captured, cleanup) : cleanup);
      } finally { suspended = false; }
      if (failed) throw primary;
      return result;
    },
    capture(value) {
      requireValue(!peer && !startCalled && value && typeof value.start === 'function'
        && typeof value.dispose === 'function' && typeof value.terminate === 'function',
      'The codec CPU owner captures exactly one existing peer.');
      peer = value;
      captured = {
        async start(payload) {
          requireValue(!startCalled && !retiring && !terminated, 'The captured codec starts once.');
          startCalled = true;
          try {
            await active(1, 1, 'bootstrap');
            checkAbort(work.signal);
            requireValue(!retiring, 'The codec retired before Worker creation.');
            started = true;
            const producer = peer.start({...payload, cpuPhases: {schema: CODEC_CPU_PHASE_SCHEMA,
              epoch, maximumCpu: execution.capacity.cpu}});
            return await Promise.race([producer, fatal.promise]);
          } catch (primary) {
            // The B phase adopted this captured peer before start. A numerical
            // failure is not itself a refused retirement; its owner remains
            // held there until the service acquits close/termination.
            throw primary;
          }
        },
        dispose() {
          if (closed) return Promise.resolve();
          if (closeFlight) return closeFlight;
          markRetiring();
          const task = (async () => {
            await ensureClosingPermit(); codecAbort.abort();
            await ack(() => peer.dispose()); closed = true;
          })().catch(primary => { throw withRetirementOwner(primary, captured, primary); });
          closeFlight = task;
          task.then(() => { if (closeFlight === task) closeFlight = undefined; },
            () => { if (closeFlight === task) closeFlight = undefined; });
          return task;
        },
        terminate() {
          requireValue(closed, 'Captured CPU funding awaits codec close.');
          if (terminated) return Promise.resolve(certificate);
          if (terminationFlight) return terminationFlight;
          const task = (async () => {
            if (!certificate) {
              const received = await ack(() => peer.terminate());
              requireValue(received?.terminated === true && typeof received.kind === 'string'
                && typeof received.identity === 'string', 'The captured codec termination certificate is missing.');
              certificate = received;
            }
            await queue(async () => {
              if (lease) { const current = lease; await ack(() => current.release()); lease = undefined; }
            });
            terminated = true; signal?.removeEventListener('abort', abortWork);
            return certificate;
          })().catch(primary => { throw withRetirementOwner(primary, captured, primary); });
          terminationFlight = task;
          task.then(() => { if (terminationFlight === task) terminationFlight = undefined; },
            () => { if (terminationFlight === task) terminationFlight = undefined; });
          return task;
        },
      };
      return captured;
    },
  };
  return api;
}
