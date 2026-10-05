import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), trace = process.argv.includes('--trace'), tailBlock = process.argv.includes('--tail-block'), pointOrder = process.argv.includes('--point-order'), pointLayout = process.argv.includes('--point-layout') || pointOrder, tailProbe = process.argv.includes('--tail-probe') || tailBlock;
const hash = b => createHash('sha256').update(b).digest('hex'), sources = {};
for (const file of ['experiments/d2prl/unet-graph.js', 'experiments/d2prl/neural-math.js', 'experiments/d2prl/convolution-general-gpu.js', 'fixtures/d2prl/gemm-layout-unet.json', ...(pointLayout ? ['fixtures/d2prl/point-reduction-layout.json'] : [])]) sources[file] = hash(await readFile(path.join(root, file)));
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname;
    if (name === '/') return res.end('<!doctype html><title>D2PRL private UNet composition study</title>');
    if (name === '/favicon.ico') { res.statusCode = 204; return res.end(); }
    if (req.method === 'POST' && name === '/save-unet') {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 448 * 448 * 4) throw Error('Output size'); chunks.push(chunk); }
      if (bytes !== 448 * 448 * 4) throw Error('Output size');
      await writeFile(path.join(root, '.build/d2prl-unet-graph/composed-output.bin'), Buffer.concat(chunks)); return res.end('ok');
    }
    if (req.method !== 'GET') throw Error('Method');
    const file = path.resolve(root, '.' + name); if (!file.startsWith(root)) throw Error('Path');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true}); const page = await browser.newPage(); page.on('console', m => console.log(m.text()));
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async ({trace, pointLayout, tailProbe, tailBlock}) => {
    const {Budget} = await import('/src/cache.js'), {createConvolutionGeneralGpu} = await import('/experiments/d2prl/convolution-general-gpu.js'), {createNeuralMath} = await import('/experiments/d2prl/neural-math.js'), {createUnetGraph} = await import('/experiments/d2prl/unet-graph.js'), {default: factory} = await import('/.build/d2prl-neural-math/neural-math.js');
    const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
    const json = async url => { const r = await fetch(url); if (!r.ok) throw Error('Missing JSON'); return r.json(); };
    const read = async (base, e, {signal} = {}) => {
      const r = await fetch(base + e.file, {signal}); if (!r.ok) throw Error('Missing tensor'); const b = await r.arrayBuffer();
      if (b.byteLength !== e.bytes || await hash(b) !== e.sha256) throw Error('Tensor identity');
      return e.dtype === 'int64' ? new BigInt64Array(b) : new Float32Array(b);
    };
    const graph = await json('/.build/d2prl-unet-graph/graph.json'), layouts = await json('/fixtures/d2prl/gemm-layout-unet.json'), model = await json('/.build/d2prl-model/reference.json'), reference = await json('/.build/d2prl-union/reference.json'), convReference = await json('/.build/d2prl-unet-convolution/reference.json');
    // Explicit experiment limit, not inferred from device brand or a probe.
    const budget = new Budget(4 * 1024 ** 3), convolution = await createConvolutionGeneralGpu({budget}), math = await createNeuralMath(factory, {budget}), records = [];
    const pointLayouts = pointLayout ? await json('/fixtures/d2prl/point-reduction-layout.json') : undefined;
    const engine = createUnetGraph({graph, layouts, pointLayouts, tailProbe, tailMode: tailBlock ? 'block1024' : 'lane16', convolution, math, budget, loadParameter: (_name, spec, options) => read('/.build/d2prl-unet-graph/', spec, options)});
    const compare = (name, actual, expected) => {
      if (actual.length !== expected.length) throw Error('Shape');
      const ab = new Uint32Array(actual.buffer, actual.byteOffset, actual.length), eb = new Uint32Array(expected.buffer, expected.byteOffset, expected.length);
      let different = 0, maxAbs = 0, sumAbs = 0, thresholdChanges = 0, nonfinite = 0;
      for (let i = 0; i < actual.length; i++) { different += ab[i] !== eb[i]; const d = Math.abs(actual[i] - expected[i]); maxAbs = Math.max(maxAbs, d); sumAbs += d; thresholdChanges += (actual[i] > 0.5) !== (expected[i] > 0.5); nonfinite += !Number.isFinite(actual[i]); }
      const row = {name, elements: actual.length, different, maxAbs, meanAbs: sumAbs / actual.length, thresholdChanges, nonfinite}; records.push(row); console.log(JSON.stringify(row)); return row;
    };
    let result;
    try {
      const rgb = await read('/.build/d2prl-model/', model.input), start = performance.now();
      result = await engine.run(rgb, {onNode: async ({index, total, node, result}) => {
        if (index % 25 === 0) console.log(JSON.stringify({phase: 'unet-composition', index, total, op: node.op, accountedBytes: budget.total()}));
        if (trace && node.op === 'Conv') {
          const name = node.inputs[1].replace(/^unet\./, '').replace(/\.weight$/, ''), ref = convReference.records.find(r => r.name === name);
          if (!ref) throw Error('Missing native convolution boundary');
          compare(name, result.data, await read('/.build/d2prl-unet-convolution/', ref.output));
        }
      }});
      const functionalMs = performance.now() - start, final = compare('unet-final-sigmoid', result.data, await read('/.build/d2prl-union/', reference.unet));
      const saved = await fetch('/save-unet', {method: 'POST', body: result.data}); if (!saved.ok) throw Error('Save failed');
      const studyRoutes = result.studyRoutes; result.release(); result = null; math.dispose(); convolution.dispose();
      if (budget.total() !== 0) throw Error('Retained reservations');
      return {schema: 1, status: final.nonfinite || final.maxAbs > 1e-4 ? 'rejected' : final.different ? 'within-tolerance-experimental' : 'passed-corpus-exact-experimental', scope: 'Actual checkpoint parameters, generated prepared RGB448, complete UNet graph; exploratory unresolved reductions retained explicitly; no final D2PRL detection or universal parity claim', final, studyRoutes, records, functionalMs, budgetBytes: budget.limit, peakAccountedBytes: budget.peak, memoryScope: 'Engine reservations including conservative retained WASM heap and streamed parameters; native comparator and browser RSS excluded', allReservationsReleased: true};
    } finally { result?.release(); math.dispose(); convolution.dispose(); }
  }, {trace, pointLayout, tailProbe, tailBlock});
  report.browser = browser.version(); report.sources = sources; report.mathBuild = JSON.parse(await readFile(path.join(root, '.build/d2prl-neural-math/build.json'))); report.graphSha256 = hash(await readFile(path.join(root, '.build/d2prl-unet-graph/graph.json')));
  await writeFile(path.join(root, 'docs/d2prl-unet-composed-'+(pointOrder?(tailBlock?'point-ordered-tail-block':tailProbe?'point-ordered-tail':'point-ordered'):tailProbe?'point-and-tail':pointLayout?'point-layout':'probe')+'-chrome-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({status: report.status, final: report.final})); if (report.status === 'rejected') process.exitCode = 1;
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
