import "../../runtime-context.js?v=0.33.2";
import {EngineError, requireValue, serializeEngineError, deserializeEngineError} from './errors.js';

const decode = value => value?.primitive
  ? value.type === 'undefined' ? undefined : value.value
  : deserializeEngineError(value.engine);
const encode = value => value === null || ['undefined', 'boolean', 'number', 'string'].includes(typeof value)
  ? {primitive: true, type: typeof value, ...(value === undefined ? {} : {value})}
  : {engine: serializeEngineError(value)};
const acknowledged = async action => {
  const value = await action(); if (value === false || value === 0) throw value; return value;
};

/** A preparation-only codec peer, adopted and funded by the existing B phase.
 * Source/window publication and its ACKs remain the B service's responsibility.
 * The sequential producer admits one request and one close control at a time.
 * No timer, history or independently funded worker owner is introduced here. */
export function createSourceSamplesCodecPeer({workerURL, workerFactory, signal, handleRequest} = {}) {
  requireValue(workerURL instanceof URL && typeof workerFactory === 'function'
    && typeof handleRequest === 'function', 'A captured source codec transport is required.');
  const identity = crypto.randomUUID();
  let worker, started = false, completed = false, closed = false, nativeCloseAcknowledged = false,
    failed = false, resolveResult, rejectResult, requestFlight, lastRequest = 0,
    closeControl, closeSerial = 0, closeFlight, terminationFlight, certificate;
  let abortFlag = typeof SharedArrayBuffer === 'function' ? new Int32Array(new SharedArrayBuffer(4)) : null;
  const transportFailure = error => {
    failed = true; rejectResult?.(error); closeControl?.reject(error); closeControl = null;
  };
  const post = (message, transfer = []) => {
    requireValue(worker && !certificate, 'The captured source codec is retired.');
    try { worker.postMessage(message, transfer); } catch (error) { transportFailure(error); throw error; }
  };
  const abort = () => {
    if (abortFlag) Atomics.store(abortFlag, 0, 1);
    if (worker && !certificate) try { post({kind: 'abort'}); } catch {}
  };
  const onError = event => transportFailure(event.error
    ?? new EngineError('WORKER_FAILED', event.message ?? 'The source codec worker failed.'));
  const onMessage = ({data}) => {
    if (!data || typeof data !== 'object' || certificate) return;
    if (data.kind === 'request') {
      if (completed || closed || requestFlight || !Number.isSafeInteger(data.id)
        || data.id !== lastRequest + 1 || typeof data.action !== 'string') {
        transportFailure(new EngineError('INVALID_INPUT', 'The codec request sequence differs.')); return;
      }
      lastRequest = data.id;
      const task = (async () => {
        try {
          const value = await handleRequest(data.action, data.value);
          // The handler has finished before its ACK can reach the producer.
          // Do not wait for this task's promise reaction to allow the next
          // request or the final completion message.
          requestFlight = null;
          if (worker && !certificate) post({kind: 'response', id: data.id, ok: true, value});
        } catch (error) {
          requestFlight = null;
          if (worker && !certificate) try { post({kind: 'response', id: data.id, ok: false, error: encode(error)}); } catch {}
        }
      })();
      requestFlight = task;
      task.then(() => { if (requestFlight === task) requestFlight = null; },
        () => { if (requestFlight === task) requestFlight = null; });
      return;
    }
    if (data.kind === 'done') {
      if (completed || closed || requestFlight) {
        transportFailure(new EngineError('INVALID_INPUT', 'The codec completed before its request ACK.')); return;
      }
      completed = true; resolveResult?.(data.result); resolveResult = null; rejectResult = null; return;
    }
    if (data.kind === 'failed') { completed = true; transportFailure(decode(data.error)); return; }
    if (data.kind === 'closed' && closeControl && data.id === closeControl.id) {
      const control = closeControl; closeControl = null; control.resolve(data);
    }
  };
  async function terminateCaptured() {
    if (certificate) return certificate;
    if (terminationFlight) return terminationFlight;
    const task = (async () => {
      let exit;
      if (worker) {
        const captured = worker, exitPromise = captured.done;
        await acknowledged(() => captured.terminate());
        // Native Worker.terminate() returns void in browsers. A physical exit
        // is claimed only when the captured transport supplies and awaits it.
        if (exitPromise && typeof exitPromise.then === 'function') exit = await exitPromise;
        captured.removeEventListener('message', onMessage);
        captured.removeEventListener('error', onError);
        captured.removeEventListener('messageerror', onError);
        if (worker === captured) worker = null;
        certificate = Object.freeze({terminated: true,
          kind: exitPromise && typeof exitPromise.then === 'function' ? 'captured-worker-exit' : 'browser-terminate-requested',
          identity, nativeCloseAcknowledged,
          ...(Number.isInteger(exit?.code) ? {exitCode: exit.code} : {})});
      } else certificate = Object.freeze({terminated: true, kind: 'never-created', identity, nativeCloseAcknowledged});
      signal?.removeEventListener('abort', abort); abortFlag = null; handleRequest = null;
      resolveResult = null; rejectResult = null;
      return certificate;
    })();
    terminationFlight = task;
    task.catch(() => { if (terminationFlight === task) terminationFlight = null; });
    return task;
  }
  return {
    async start(payload) {
      requireValue(!started && !closed && !certificate, 'The captured codec starts once.'); started = true;
      const promise = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
      try {
        worker = workerFactory(workerURL);
        worker.addEventListener('message', onMessage); worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onError);
        if (worker.done && typeof worker.done.then === 'function') worker.done.then(exit => {
          if (!terminationFlight && !certificate) transportFailure(new EngineError('WORKER_FAILED',
            'The captured codec exited before retirement.', {details: {exitCode: exit?.code}}));
        }, transportFailure);
        signal?.addEventListener('abort', abort, {once: true});
        post({kind: 'start', payload, abortFlag}); if (signal?.aborted) abort();
      } catch (error) { transportFailure(error); }
      return promise;
    },
    dispose() {
      if (closed) return Promise.resolve(); if (closeFlight) return closeFlight;
      const task = (async () => {
        if (!worker) { closed = true; return; }
        if (failed) { await terminateCaptured(); await requestFlight; closed = true; return; }
        abort();
        const id = ++closeSerial;
        const reply = await new Promise((resolve, reject) => {
          closeControl = {id, resolve, reject};
          try { post({kind: 'close', id}); } catch (error) { closeControl = null; reject(error); }
        });
        requireValue(reply.closed === true, 'The codec did not acknowledge its native close.');
        nativeCloseAcknowledged = reply.nativeRetired === true;
        if (!nativeCloseAcknowledged) await terminateCaptured();
        await requestFlight; closed = true;
      })();
      closeFlight = task;
      task.then(() => { if (closeFlight === task) closeFlight = null; },
        () => { if (closeFlight === task) closeFlight = null; }); return task;
    },
    terminate() { requireValue(closed, 'Codec funding awaits the native close boundary.'); return terminateCaptured(); },
  };
}
