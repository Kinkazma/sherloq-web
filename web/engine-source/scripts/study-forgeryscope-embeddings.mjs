// Development study: useful model inference only; no product startup calibration.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const ortRoot = process.env.FORGERYSCOPE_ORT_DIST;
if (!ortRoot) throw Error('Set FORGERYSCOPE_ORT_DIST to the existing ORT dist (read-only).');
const provider = process.argv.includes('--gpu') ? 'webgpu' : 'wasm';
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (name === '/') {res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Forgeryscope M2 study</title>'); return;}
    const base = name.startsWith('/ort/') ? path.resolve(ortRoot) : path.resolve(root);
    const file = path.resolve(base, '.' + (name.startsWith('/ort/') ? name.slice(4) : name));
    if (!file.startsWith(base + path.sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', /\.(m?js)$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.statusCode = 404; res.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage();
  page.on('console', msg => {if (msg.type() === 'error') console.log(msg.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const report = await page.evaluate(async provider => {
    const ort = await import('/ort/' + (provider === 'wasm' ? 'ort.wasm.min.mjs' : 'ort.webgpu.min.mjs'));
    ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = '/ort/';
    const base = '/.build/forgeryscope/';
    const reference = await (await fetch(base + 'embeddings-reference.json')).json();
    const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const records = [];
    for (const model of reference.models) {
      const bytes = new Uint8Array(await (await fetch(base + model.file)).arrayBuffer());
      if (await hash(bytes) !== model.sha256) throw Error('Model identity mismatch');
      const session = await ort.InferenceSession.create(bytes, {executionProviders: [provider], graphOptimizationLevel: 'all'});
      try {
        const outputs = [];
        for (const c of model.cases) {
          const input = new ort.Tensor('float32', new Float32Array(await (await fetch(base + c.inputFile)).arrayBuffer()), c.inputShape);
          const start = performance.now();
          const result = await session.run({rgb: input}), actual = Array.from(result.embedding.data);
          const maxError = Math.max(...actual.map((x, i) => Math.abs(x - c.embedding[i])));
          records.push({model: model.id, case: c.id, maxError, ms: performance.now()-start});
          outputs.push(actual); input.dispose(); result.embedding.dispose();
        }
        // Compare all native model score decisions on these image pairs.
        const threshold = model.id.startsWith('micro') ? .58 : model.id.includes('duplicate') ? .84 : model.id.includes('lane') ? .65 : .85;
        for (let i=0;i<outputs.length;i++) for(let j=i+1;j<outputs.length;j++) {
          const dot = (a,b) => a.reduce((s,v,k) => s+v*b[k],0);
          const native = dot(model.cases[i].embedding, model.cases[j].embedding), actual = dot(outputs[i],outputs[j]);
          records.push({model:model.id, pair:[i,j], scoreError:Math.abs(native-actual), nativeScore:native, score:actual, threshold, sameDecision:(native>=threshold)===(actual>=threshold)});
        }
      } finally {await session.release();}
    }
    return {scope:'embedding networks on native-preprocessed synthetic inputs, not complete detector', provider, runtime:ort.env.versions, native:{torch:reference.torch,numpy:reference.numpy,timm:reference.timm}, models:reference.models.map(({id,sha256,checkpointSha256,bytes})=>({id,sha256,checkpointSha256,bytes})), records};
  }, provider);
  report.browser = browser.version();
  report.executionNote = provider === 'webgpu' ? 'WebGPU requested; ORT may assign unsupported nodes to CPU. Inspect provider logs; no GPU-only claim.' : 'CPU/WASM';
  report.passed = report.records.every(r => r.maxError === undefined ? r.sameDecision : r.maxError <= 1e-4);
  await writeFile(path.join(root, `docs/forgeryscope-embeddings-${provider}-proof.json`), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({provider, passed:report.passed, records:report.records.length, maxError:Math.max(...report.records.map(r=>r.maxError??0))}));
  if (!report.passed) process.exitCode=1;
} finally {await browser?.close(); await new Promise(resolve=>server.close(resolve));}
