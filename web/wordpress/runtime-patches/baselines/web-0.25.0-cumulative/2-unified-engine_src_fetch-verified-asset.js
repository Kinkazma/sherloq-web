import "../../runtime-context.js?v=0.16.0";
import {allocateTypedArray} from './allocation.js';
import {EngineError, checkAbort, requireValue, serializeEngineError} from './errors.js';

// The caller admits the pinned destination and its transport overhead. This
// reader neither grows an unbounded buffer nor turns an HTTP failure into OOM.
export async function fetchVerifiedAsset(spec, {signal, fetcher = fetch} = {}) {
  requireValue(typeof spec?.url === 'string' && Number.isSafeInteger(spec.bytes) && spec.bytes >= 0 && /^[a-f0-9]{64}$/.test(spec.sha256), 'Pinned asset identity required');
  checkAbort(signal);
  const details = {requestedUrl: spec.url, expectedBytes: spec.bytes, expectedSha256: spec.sha256, ...(spec.id ? {assetId: spec.id} : {})};
  let response;
  try {response = await fetcher(spec.url, {signal});}
  catch (cause) {throw new EngineError(signal?.aborted ? 'CANCELLED' : 'NETWORK_TRANSIENT', 'Asset request failed.', {cause, details});}
  Object.assign(details, {receivedUrl: response.url || spec.url, status: response.status});
  if (!response.ok) throw new EngineError('ASSET_HTTP', 'Asset request returned HTTP ' + response.status + '.', {details});
  if (!response.body?.getReader) throw new EngineError('ASSET_BODY', 'Asset response has no readable body.', {details});
  const bytes = allocateTypedArray(Uint8Array, spec.bytes, {label: 'verified-asset-bytes'});
  const reader = response.body.getReader(); let offset = 0, completed = false, failure;
  try {
    for (;;) {
      checkAbort(signal); let chunk;
      try {chunk = await reader.read();}
      catch (cause) {throw new EngineError(signal?.aborted ? 'CANCELLED' : 'NETWORK_TRANSIENT', 'Asset download interrupted.', {cause, details: {...details, receivedBytes: offset}});}
      if (chunk.done) {completed = true; break;}
      if (!(chunk.value instanceof Uint8Array) || offset + chunk.value.length > bytes.length) throw new EngineError('MODEL_IDENTITY', 'Asset exceeds its pinned length.', {details: {...details, receivedBytes: offset + (chunk.value?.length ?? 0)}});
      bytes.set(chunk.value, offset); offset += chunk.value.length;
    }
    if (offset !== bytes.length) throw new EngineError('MODEL_IDENTITY', 'Asset is incomplete.', {details: {...details, receivedBytes: offset}});
    checkAbort(signal);
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    checkAbort(signal);
    if (digest !== spec.sha256) throw new EngineError('MODEL_IDENTITY', 'Asset differs from its pinned SHA-256.', {details: {...details, receivedBytes: offset, receivedSha256: digest}});
    return bytes;
  } catch (error) {failure = error; throw error;}
  finally {
    const cleanup = async () => {try {if (!completed) await reader.cancel();} finally {reader.releaseLock();}};
    try {await cleanup();}
    catch (error) {
      if (failure) failure.details = {...failure.details, readerCleanup: serializeEngineError(error)};
      else throw new EngineError('ASSET_STREAM', 'Asset reader could not be released.', {cause: error, details});
    }
  }
}
