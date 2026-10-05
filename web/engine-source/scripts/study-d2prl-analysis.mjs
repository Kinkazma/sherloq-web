import {chromium, firefox, webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), name = process.argv[2] ?? 'chrome', launcher = {chrome: chromium, firefox, webkit}[name]; if (!launcher) throw Error('Browser');
const hash = b => createHash('sha256').update(b).digest('hex');
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname; if (name === '/') return res.end('<!doctype html><title>D2PRL session controller study</title>'); if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  const file = path.resolve(root, '.' + name); if (!file.startsWith(root)) throw Error('Path'); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
try {
  browser = await launcher.launch({headless: true, ...(name === 'chrome' ? {channel: 'chrome'} : {})}); const page = await browser.newPage(); await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async () => {
    const {Budget} = await import('/src/cache.js'), {createD2prlAnalysis} = await import('/experiments/d2prl/analysis.js'), {createD2prlZones} = await import('/experiments/d2prl/zones.js'), {createPostprocess} = await import('/experiments/d2prl/postprocess.js'), {createSpatial} = await import('/experiments/d2prl/spatial.js');
    const base = '/.build/d2prl-analysis/', reference = await (await fetch(base + 'reference.json')).json(), hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), v => v.toString(16).padStart(2, '0')).join('');
    const read = async (spec, Type) => {const r = await fetch(base + spec.file); if (!r.ok) throw Error('Missing tensor'); const bytes = await r.arrayBuffer(); if (await hash(bytes) !== spec.sha256) throw Error('Identity'); return new Type(bytes);};
    const budget = new Budget(1024 ** 3), postprocess = createPostprocess({budget, moduleUrl: new URL('/.build/d2prl-postprocess/postprocess.js', location.href).href}), spatial = createSpatial({budget, moduleUrl: new URL('/.build/d2prl-spatial/spatial.js', location.href).href}), project = createD2prlZones({budget, postprocess, spatial});
    let calls = 0, hold = false, unblock, announce; const crops = [], events = [];
    // Deliberately substitute known native-grid fixtures only in this controller
    // test. This is never imported by the actual model or released engine.
    const inferFixture = async ({rgb, width, height}) => {
      calls++; const identity = await hash(rgb), row = reference.zones.find(z => z.crop.sha256 === identity);
      if (!row || row.crop.shape[0] !== height || row.crop.shape[1] !== width) throw Error('Crop differs from independently generated native RGB'); crops.push(row.id);
      const free = budget.reserve(row.raw.bytes);
      try {const raw = await read(row.raw, Float32Array); if (hold) {hold = false; announce(); await new Promise(r => {unblock = r;});} return {raw, decision: {fixture: true}, release: free};} catch (error) {free(); throw error;}
    };
    const session = createD2prlAnalysis({budget, infer: inferFixture, project, modelId: 'synthetic-controller-fixture'}), data = await read(reference.source, Uint8Array), pixels = {data, width: reference.width, height: reference.height};
    const args = envelope => ({pixels, backend: 'gpu', zones: reference.zones.slice(0, envelope ? 3 : 2).map(({id, kind, bounds}) => ({id, kind, bounds})), exclusions: reference.exclusions, minimum: 500});
    const compare = async (result, envelope, minimum) => {const row = reference.records.find(r => r.envelope === envelope && r.minimum === minimum), output = {}; for (const [key, spec] of Object.entries(row.outputs)) output[key] = await hash(result[key]) === spec.sha256; return Object.values(output).every(Boolean) && result.metadata.vote_policy === 'one-model-union';};
    const records = []; let result;
    try {
      result = await session.run(args(true), {onProgress: e => events.push(e)}); records.push({name: 'three-active-contexts', exact: await compare(result, true, 500), inferences: result.metadata.inferences === 3, provenance: result.metadata.zones.map(z => z.kind).join(',') === 'region,region,envelope'});
      for (const minimum of [0, 17, 5000]) {const previous = result; result = await session.refilter({resultId: previous.metadata.resultId, minimum}); previous.release(); records.push({name: 'refilter-' + minimum, exact: await compare(result, true, minimum), noInference: calls === 3 && result.metadata.inferences === 0});}
      const oldId = result.metadata.resultId; const first = session.refilter({resultId: oldId, minimum: 0}), second = session.refilter({resultId: oldId, minimum: 17}); let superseded = false; try {await first;} catch (e) {superseded = e.code === 'CANCELLED';}
      result.release(); result = await second; records.push({name: 'rapid-slider', superseded, exact: await compare(result, true, 17), noInference: calls === 3});
      let oldIdRejected = false; try {await session.refilter({resultId: oldId, minimum: 0});} catch (e) {oldIdRejected = e.code === 'INVALID_INPUT';}
      result.release(); result = await session.run(args(false)); records.push({name: 'envelope-disabled', exact: await compare(result, false, 500), noInference: calls === 3 && result.metadata.cache_hits === 2, localContextsKept: result.metadata.zones.length === 2});
      result.release(); result = null;
      // A superseded calculation intentionally ignores its abort while returning
      // its fixture; the controller must still release and reject that result.
      hold = true; const entered = new Promise(r => {announce = r;}); const stale = session.run({...args(true), backend: 'cpu'}); await entered;
      const latest = session.run(args(true)); unblock(); let staleRejected = false; try {await stale;} catch (e) {staleRejected = e.code === 'CANCELLED';}
      result = await latest; const latestExact = await compare(result, true, 500); result.release(); result = null;
      const sourcePreserved = await hash(data) === reference.source.sha256; await session.dispose(); const disposedReleased = budget.total() === 0;
      const refusedSession = createD2prlAnalysis({budget, infer: inferFixture, project, modelId: 'refusal-controller-fixture'}); const before = calls, limit = budget.limit; budget.limit = 1; let refused = false;
      try {await refusedSession.run(args(true));} catch (e) {refused = e.code === 'MEMORY_LIMIT';} finally {budget.limit = limit;}
      const refusalBeforeInference = calls === before; await refusedSession.dispose();
      postprocess.dispose(); spatial.dispose(); const lifecycle = {oldIdRejected, staleRejected, latestExact, sourcePreserved, disposedReleased, refused, refusalBeforeInference, released: budget.total() === 0, progressIdentified: events.length > 0 && events.every(e => Number.isInteger(e.revision)), independentCrops: crops.slice(0, 3).join(',') === 'roi-a,roi-b,envelope'};
      return {schema: 1, status: records.every(r => Object.entries(r).every(([k, v]) => k === 'name' || v === true)) && Object.values(lifecycle).every(Boolean) ? 'passed' : 'rejected', scope: reference.scope, records, lifecycle, fixtureInferenceCalls: calls, peakAccountedBytes: budget.peak};
    } finally {result?.release(); await session.dispose(); postprocess.dispose(); spatial.dispose();}
  });
  report.browser = browser.version(); report.sourceSha256 = hash(await readFile(path.join(root, 'experiments/d2prl/analysis.js'))); report.referenceSha256 = hash(await readFile(path.join(root, '.build/d2prl-analysis/reference.json')));
  await writeFile(path.join(root, 'docs/d2prl-analysis-controller-' + name + '-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(r => server.close(r));}
