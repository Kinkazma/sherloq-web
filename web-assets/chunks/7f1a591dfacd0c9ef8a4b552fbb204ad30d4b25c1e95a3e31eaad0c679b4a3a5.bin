import "../../runtime-context.js?v=0.33.2";
// Canonical LCMS only: no colour formula or profile policy lives in this worker.
import {createColorTransformCache, colorTransformOptions,COLOR_TRANSFORM_LAYOUTS} from './color-managed-runtime.js';
import {EngineError, requireValue, checkAbort, serializeEngineError, deserializeEngineError}
  from './errors.js';

const encode = value => value === null || ['undefined', 'boolean', 'number', 'string'].includes(typeof value)
  ? {primitive: true, type: typeof value, ...(value === undefined ? {} : {value})}
  : {engine: serializeEngineError(value)};
const decode = value => value?.primitive
  ? value.type === 'undefined' ? undefined : value.value : deserializeEngineError(value.engine);
const fatal = error => queueMicrotask(() => { throw error instanceof Error ? error
  : new Error('The canonical CMM transport failed.', {cause: error}); });
const ack = async action => { const value = await action(); if (value === false || value === 0) throw value; return value; };
let pending, serial = 0, flight, controller, abortFlag, cache, transform,
  closed = false, constructorStarted = false, nativeRetired = false;
const signal = () => ({get aborted() { return controller.signal.aborted
  || !!(abortFlag && Atomics.load(abortFlag, 0)); }});
const post = (value, transfer = []) => self.postMessage(value, transfer);
function request(action, value, transfer = []) {
  requireValue(!pending, 'The canonical colour lane admits one request at a time.');
  return new Promise((resolve, reject) => {
    const id = ++serial; pending = {id, resolve, reject};
    try { post({kind: 'request', id, action, value}, transfer); }
    catch (error) { pending = null; reject(error); }
  });
}
async function convert(payload) {
  const options = colorTransformOptions(payload.options), a = payload.admission;
  const input=COLOR_TRANSFORM_LAYOUTS.inputs[options.inputFormat],output=COLOR_TRANSFORM_LAYOUTS.outputs[options.outputFormat],Input=input?.sampleType==='float32'?Float32Array:Uint16Array;
  requireValue(input&&output&&a?.maximumBandBytes>0,
  'The worker requires the admitted canonical colour contract.');
  constructorStarted = true;
  cache = createColorTransformCache({maximumMemoryBytes: a.maximumMemoryBytes,
    maximumBandBytes: a.maximumBandBytes, maxEntries: 1}, {signal: controller.signal});
  transform = await cache.acquire(options, {signal: controller.signal});
  checkAbort(signal());
  await request('ready', {...transform.metadata, heapBytes: cache.snapshot().heapCapacityBytes});
  let blocks = 0, pixels = 0;
  for (;;) {
    let job = await request('next');
    if (job?.done === true) break;
    checkAbort(signal());
    requireValue(Number.isSafeInteger(job?.id) && job.id > 0
      && Number.isSafeInteger(job.pixels) && job.pixels > 0
      && job.pixels <= a.maximumChunkPixels && job.samples instanceof Input
      && job.samples.byteLength <= a.maximumBandBytes&&job.samples.length===job.pixels*input.channels,
    'The colour block differs from its admission.');
    const start = performance.now();
    let converted = transform.convert(job.samples, {signal: signal()}), convertMs = performance.now() - start;
    const id = job.id; pixels += job.pixels; blocks++;
    job = null;
    const reply = await request('converted', {id, pixels: converted,
      heapBytes: cache.snapshot().heapCapacityBytes, convertMs}, [converted.buffer]);
    converted = null;
    requireValue(reply?.accepted === true, 'The colour block was not consumed.');
  }
  return {blocks, pixels, canonical: true};
}
self.onmessage = ({data}) => {
  if (data.kind === 'response') {
    if (pending?.id === data.id) {
      const captured = pending; pending = null;
      data.ok ? captured.resolve(data.value) : captured.reject(decode(data.error));
    } return;
  }
  if (data.kind === 'abort') { controller?.abort(); return; }
  if (data.kind === 'start') {
    if (flight || closed) { post({kind: 'failed', error: encode(new EngineError('BUSY', 'A colour lane starts once.'))}); return; }
    controller = new AbortController(); abortFlag = data.abortFlag;
    flight = (async () => {
      try { const result = await convert(data.payload); post({kind: 'done', result}); }
      catch (error) { try { post({kind: 'failed', error: encode(error)}); } catch (transport) { fatal(transport); } }
    })(); return;
  }
  if (data.kind === 'close') {
    controller?.abort(); const id = data.id;
    (async () => {
      try {
        await flight;
        if (transform) { await ack(() => transform.dispose()); transform = null; }
        if (cache) { await ack(() => cache.dispose()); cache = null; nativeRetired = true; }
        else if (!constructorStarted) nativeRetired = true;
        closed = true; post({kind: 'closed', id, closed: true, nativeRetired});
      } catch (error) {
        try { post({kind: 'closed', id, closed: false, nativeRetired, error: encode(error)}); }
        catch (transport) { fatal(transport); }
      }
    })().catch(fatal);
  }
};
