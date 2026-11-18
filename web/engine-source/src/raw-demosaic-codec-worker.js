// A preparation-only codec peer; public sample leases belong to service B.
import {decodeRawNativeImport} from './native-color-import.js';
import {EngineError, serializeEngineError, deserializeEngineError} from './errors.js';
const encode = value => value === null || ['undefined', 'boolean', 'number', 'string'].includes(typeof value)
  ? {primitive: true, type: typeof value, ...(value === undefined ? {} : {value})}
  : {engine: serializeEngineError(value)};
const decode = value => value?.primitive ? value.type === 'undefined' ? undefined : value.value
  : deserializeEngineError(value.engine);
let serial = 0, flight, controller, closed = false, nativeRetired = false, pending;
// An async message handler's rejected promise does not reliably become a
// Worker.error event in browsers. If even the failure/close response cannot be
// posted, raise a real worker error so the captured parent can retire its owner.
const transportFailure = error => queueMicrotask(() => { throw error; });
function request(action, value, transfer = []) {
  if (closed || pending) return Promise.reject(new EngineError('CLOSED', 'The sensor codec cannot publish a request.'));
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending = {id, resolve, reject};
    try { self.postMessage({kind: 'request', id, action, value}, transfer); }
    catch (error) { pending = null; reject(error); }
  });
}
function abort() {
  controller?.abort(); pending?.reject(new EngineError('CANCELLED', 'Sensor preparation was cancelled.')); pending = null;
}
self.onmessage = ({data}) => {
  if (data.kind === 'response') {
    if (pending && data.id === pending.id) {
      const response = pending; pending = null; data.ok ? response.resolve(data.value) : response.reject(decode(data.error));
    }
    return;
  }
  if (data.kind === 'abort') { abort(); return; }
  if (data.kind === 'start') {
    if (flight || closed) {
      self.postMessage({kind: 'failed', error: encode(new EngineError('INVALID_INPUT', 'The sensor codec starts once.'))}); return;
    }
    controller = new AbortController();
    flight = (async () => {
      try {
        const result=await decodeRawNativeImport({...data.payload,rawDemosaicRepresentation:true,publishWorkingProfile:!data.payload.inspectOnly},{signal:controller.signal,abortFlag:data.abortFlag,
          request:(action,value)=>request(action,value,['decoded-native-band','decoded-band'].includes(action)?[value.bytes.buffer]:[])});
        // Resolution occurs after the producer's native-close finally. A
        // rejected producer never supplies a fabricated native-close ACK.
        nativeRetired = true; self.postMessage({kind:'done',result:data.payload.inspectOnly?{header:result.header}:{provenance:result.provenance,metrics:result.metrics}});
      } catch (error) { self.postMessage({kind: 'failed', error: encode(error)}); }
    })(); flight.catch(transportFailure);
    return;
  }
  if (data.kind === 'close') {
    abort(); const id = data.id;
    (async () => { await flight; closed = true;
      self.postMessage({kind: 'closed', id, closed: true, nativeRetired: nativeRetired || !flight});
    })().catch(transportFailure);
  }
};
