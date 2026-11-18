import test from 'node:test';
import assert from 'node:assert/strict';
import {on, once} from 'node:events';
import {createServer} from 'node:http';
import {Worker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {nativeMagickResource} from '../src/native-magick-resources.js';
import {buildSourcePrefixIntegrity} from '../src/source-prefix-integrity.js';

test('native Magick worker aborts a pending verified Wasm read and acknowledges close', async () => {
  const resource = nativeMagickResource(16);
  let resolveNetworkClose;
  const networkClosed = new Promise(resolve => { resolveNetworkClose = resolve; });
  const server = createServer((_request, response) => {
    response.once('close', resolveNetworkClose);
    response.writeHead(200, {'Content-Length': String(resource.wasmBytes)});
    response.write(Buffer.from([0, 97, 115, 109]));
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const budget = new Budget(2 * 1024 ** 2);
  const blob = new Blob([Uint8Array.of(1, 2, 3)]);
  let source, worker, messages;
  try {
    source = await buildSourcePrefixIntegrity(blob, {reserveMemory: bytes => budget.reserve(bytes)});
    const entry = new URL('../src/native-magick-codec-worker.js', import.meta.url).href;
    worker = new Worker(`
      const {parentPort, workerData} = require('node:worker_threads');
      const nativeFetch = globalThis.fetch;
      globalThis.self = {postMessage: (data, transfer) => parentPort.postMessage(data, transfer)};
      globalThis.fetch = async (url, options) => {
        if (url.href !== workerData.wasmURL) throw Error('Unexpected resource request');
        const realSignal = options.signal instanceof AbortSignal;
        const response = await nativeFetch(workerData.endpoint, options);
        return {
          ok: response.ok,
          headers: response.headers,
          body: {
            getReader() {
              const reader = response.body.getReader();
              let reads = 0;
              return {
                read() {
                  const read = reader.read();
                  if (++reads === 2) parentPort.postMessage({kind: 'waiting-for-body', realSignal});
                  return read;
                },
                cancel: () => reader.cancel(),
                releaseLock: () => reader.releaseLock(),
              };
            },
          },
        };
      };
      const imported = import(workerData.entry);
      parentPort.on('message', async data => {
        await imported;
        self.onmessage({data});
      });
    `, {
      eval: true,
      workerData: {entry, wasmURL: resource.wasmURL, endpoint: `http://127.0.0.1:${server.address().port}/resource`},
    });
    messages = on(worker, 'message');
    worker.postMessage({
      kind: 'start',
      payload: {
        resource, blob, sourceIntegrity: source.manifest, sourceSha256: source.manifest.sha256,
        preflight: {sourceSha256: source.manifest.sha256},
        admission: {encodedInputMode: 'owned-array'},
      },
    });
    const {value: [waiting]} = await messages.next();
    assert.deepEqual(waiting, {kind: 'waiting-for-body', realSignal: true});
    worker.postMessage({kind: 'abort'});
    const {value: [failed]} = await messages.next();
    assert.equal(failed.kind, 'failed');
    assert.equal(failed.error.engine.code, 'CANCELLED');
    await networkClosed;
    worker.postMessage({kind: 'close', id: 1});
    const {value: [closed]} = await messages.next();
    assert.deepEqual(closed, {kind: 'closed', id: 1, closed: true, nativeRetired: true});
  } finally {
    await messages?.return();
    await worker?.terminate();
    source?.release();
    const serverClosed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await serverClosed;
  }
  assert.equal(budget.total(), 0);
});
