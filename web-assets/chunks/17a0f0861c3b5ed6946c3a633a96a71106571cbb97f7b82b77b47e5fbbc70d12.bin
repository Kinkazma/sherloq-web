import "../../runtime-context.js?v=0.33.3";
// A preparation-only codec peer; public sample leases belong to service B.
import {decodeAvifNative} from './avif-hdr-runtime.js';
import {CODEC_CPU_PHASE_SCHEMA} from './captured-codec-cpu-phase.js';
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
  if (closed || pending) return Promise.reject(new EngineError('CLOSED', 'The HDR codec cannot publish a request.'));
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending = {id, resolve, reject};
    try { self.postMessage({kind: 'request', id, action, value}, transfer); }
    catch (error) { pending = null; reject(error); }
  });
}
function abort() {
  controller?.abort(); pending?.reject(new EngineError('CANCELLED', 'HDR preparation was cancelled.')); pending = null;
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
      self.postMessage({kind: 'failed', error: encode(new EngineError('INVALID_INPUT', 'The HDR codec starts once.'))}); return;
    }
    controller = new AbortController();
    flight = (async () => {
      try {
        const payload=data.payload;
        if(payload.frame!==0||!(payload.blob instanceof Blob)||!payload.representation||payload.cpuPhases?.schema!==CODEC_CPU_PHASE_SCHEMA||typeof payload.cpuPhases.epoch!=='string'||!Number.isSafeInteger(payload.cpuPhases.maximumCpu)||payload.cpuPhases.maximumCpu<1)throw new EngineError('INVALID_INPUT','Captured HDR Original/frame/recipe and CPU contract required.');
        const c=payload.cpuPhases;let cpuSequence=0;
        const cpuPhase=async value=>{const sequence=++cpuSequence,result=await request('codec-cpu-phase',{schema:c.schema,epoch:c.epoch,sequence,kind:value.phase==='native-closed'?'native-closed':'active',phase:value.phase,cpu:value.maximumCpu,minCpu:value.maximumCpu===0?0:1,...(value.topology?{topology:value.topology}:{})});
          if(result?.schema!==c.schema||result.epoch!==c.epoch||result.sequence!==sequence||result.phase!==value.phase||!Number.isSafeInteger(result.cpu)||result.cpu<0||result.cpu>value.maximumCpu||(value.maximumCpu>0&&result.cpu<1))throw new EngineError('INVALID_INPUT','HDR CPU admission response differs.');return{cpu:result.cpu};};
        const parentRequest=async(action,value,transfer=[])=>{const result=await request(action,value,transfer),resume=result?.cpuResume;if(resume?.schema!==c.schema||resume.epoch!==c.epoch||resume.cpu!==1)throw new EngineError('INVALID_INPUT','HDR response has no CPU continuation.');return result;};
        const bytes=new Uint8Array(await payload.blob.arrayBuffer()),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
        if(digest!==payload.sourceSha256)throw new EngineError('SOURCE_CHANGED','The HDR encoded bytes differ from captured Original.');
        const result=await decodeAvifNative(bytes,{signal:controller.signal,threads:c.maximumCpu,colorBackend:payload.colorBackend,linearHdr:payload.representation,onCpuPhase:cpuPhase,
          onHeader:header=>parentRequest('hdr-header',{...header,sourceSha256:digest,frame:0}),
          onBand:band=>{const bytes=new Uint8Array(band.samples.buffer,band.samples.byteOffset,band.samples.byteLength);const {samples,...description}=band;return parentRequest('hdr-band',{...description,bytes,byteOrder:'little-endian'},[bytes.buffer]);}});

        // Resolution occurs after the producer's native-close finally. A
        // rejected producer never supplies a fabricated native-close ACK.
        nativeRetired = true; await cpuPhase({phase:'native-closed',maximumCpu:0}); self.postMessage({kind: 'done', result: {metrics: result.metrics}});
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
