import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fetchVerifiedAsset} from '../src/fetch-verified-asset.js';
import {neuralRuntimeError} from '../src/neural-runtime-error.js';
import {serializeEngineError} from '../src/errors.js';

const data = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const identity = {id:'declared-model', url:'https://example.test/model.onnx', bytes:data.length, sha256:createHash('sha256').update(data).digest('hex')};
function response(chunks, {readError, cancelError, status = 200} = {}) {
  let at = 0; const counts = {cancel:0, released:0};
  return {counts, ok:status === 200, status, url:'https://cdn.example.test/exact-model.onnx', body:{getReader:()=>({
    async read() {if (at < chunks.length) return {value:chunks[at++], done:false}; if (readError) throw readError; return {done:true};},
    async cancel() {counts.cancel++; if (cancelError) throw cancelError;},
    releaseLock() {counts.released++;}
  })}};
}

test('verified download fills one pinned destination and releases the completed reader without cancel', async () => {
  const received = response([data.subarray(0, 3), data.subarray(3)]);
  assert.deepEqual(await fetchVerifiedAsset(identity, {fetcher:async()=>received}), data);
  assert.deepEqual(received.counts, {cancel:0, released:1});
});
test('HTTP refusal retains both URLs, status and exact asset identity through the neural error boundary', async () => {
  await assert.rejects(fetchVerifiedAsset(identity, {fetcher:async()=>response([], {status:404})}), error => {
    const saved = serializeEngineError(neuralRuntimeError(error, {provider:'wasm', phase:'initialization'}));
    assert.equal(saved.code, 'ASSET_HTTP'); assert.equal(saved.details.status, 404);
    assert.equal(saved.details.requestedUrl, identity.url); assert.equal(saved.details.receivedUrl, 'https://cdn.example.test/exact-model.onnx');
    assert.equal(saved.details.expectedSha256, identity.sha256); return true;
  });
});
test('an interrupted stream preserves its original cause even if reader cancellation also fails', async () => {
  const initial = new TypeError('network connection lost'), cleanup = new Error('reader cancellation refused');
  const received = response([data.subarray(0, 3)], {readError:initial, cancelError:cleanup});
  await assert.rejects(fetchVerifiedAsset(identity, {fetcher:async()=>received}), error => {
    assert.equal(error.code, 'NETWORK_TRANSIENT'); assert.equal(error.cause, initial);
    assert.equal(error.details.receivedBytes, 3); assert.equal(error.details.readerCleanup.message, cleanup.message);
    assert.equal(serializeEngineError(error).cause.message, initial.message); return true;
  });
  assert.deepEqual(received.counts, {cancel:1, released:1});
});
test('fetch and cancellation failures are classified by the download owner, without guessing OOM', async () => {
  const initial = new TypeError('Failed to fetch');
  await assert.rejects(fetchVerifiedAsset(identity, {fetcher:async()=>{throw initial;}}), error => error.code === 'NETWORK_TRANSIENT' && error.cause === initial && error.details.requestedUrl === identity.url);
  const controller = new AbortController();
  await assert.rejects(fetchVerifiedAsset(identity, {signal:controller.signal, fetcher:async()=>{controller.abort(); throw initial;}}), error => error.code === 'CANCELLED' && error.cause === initial);
});
test('short, oversized and wrong-hash bodies are identity failures and never retryable network errors', async () => {
  for (const chunks of [[data.subarray(0, 3)], [new Uint8Array(9)], [new Uint8Array(8)]]) {
    const received = response(chunks);
    await assert.rejects(fetchVerifiedAsset(identity, {fetcher:async()=>received}), error => error.code === 'MODEL_IDENTITY' && error.details.expectedSha256 === identity.sha256);
    assert.equal(received.counts.released, 1);
  }
});
