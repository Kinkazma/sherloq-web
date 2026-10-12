// Qualification harness only: Browser Worker envelope over Node worker_threads.
// Reads one pinned local model into an ordinary Response; production fetch and
// all graph/session/allocator/execution code remain the actual common endpoint.
import {parentPort, workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
globalThis.self = globalThis;
globalThis.crossOriginIsolated = true;
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) === workerData.modelUrl) return new Response(await readFile(workerData.modelFile), {status: 200, headers: {'content-type': 'application/octet-stream'}});
  // ORT creates its pthread bootstrap from the factory module text. Node's
  // fetch does not read file: URLs, unlike its Emscripten binary loader.
  if (String(url).startsWith('file:')) return new Response(await readFile(new URL(String(url))), {status: 200});
  return originalFetch(url, options);
};
parentPort.on('message', data => globalThis.onmessage?.({data}));
parentPort.on('messageerror', error => globalThis.onmessageerror?.({type: 'messageerror', error}));
await import(workerData.endpoint);
