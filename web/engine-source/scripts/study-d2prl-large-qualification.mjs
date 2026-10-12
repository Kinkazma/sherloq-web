// Development-only real API recipe. Existing source/model/corpus payloads are
// routed read-only, never copied. No inference without --idle-confirmed.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile, writeFile, mkdir, stat, open, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHA = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, function (_key, v) {return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v;});
const require = (condition, message) => {if (!condition) throw Error(message);};
const safe = name => {require(typeof name === 'string' && !path.isAbsolute(name) && !name.includes('\\') && !name.split('/').some(part => !part || part === '..'), 'Safe relative path required'); return name;};
const HELP = `node scripts/study-d2prl-large-qualification.mjs --size=30|96
 --source=/existing/source.jpg --reference=/existing/reference.json
 --asset-manifest=/existing/web-assets/manifest-template.json --asset-chunks=/existing/web-assets/chunks
 --runtime-root=/current/engine-source --output-dir=/ignored/proof-directory
 --playwright-module=/existing/playwright/index.mjs --idle-confirmed
 [--variant=both|baseline|candidate] [--raw-root=/existing/large-d2-auto]
 [--backend=webgpu|cpu] [--profile=aggressive|maximum] [--budget-mib=3072]
 [--python=/existing/venv/bin/python] [--npz-checker=/existing/check-d2prl-large-npz.py] [--export-npz] [--validate-only]

30MP defaults to both: current engine versus a virtual default-only override
to qualified pixel-major/roles512, one full-envelope inference on identical JPEG.
96MP defaults to candidate: existing rich source, three original zones, exact
six-plane hashes in both views, existing native raw diagnostics, paged NPZ and
independent NumPy/ZIP readback. --raw-root is required for96MP. NPZ is automatic
for96MP and optional for30MP. Each variant has a fresh browser context/origin
with no-store. A single A/B pair reports functional times, not speed qualification.
--validate-only reads identities/configuration and checks files; no browser,
server, image decode, model inference or payload duplication. Cold context is
not cold OS/file cache; recorded backing/policy peaks are not physical RSS.
`;
export function settings(argv) {
  const args = new Map();
  for (const arg of argv) {require(arg.startsWith('--'), 'Named arguments required'); const at = arg.indexOf('='), key = at < 0 ? arg.slice(2) : arg.slice(2, at); require(!args.has(key), 'Duplicate argument'); args.set(key, at < 0 ? true : arg.slice(at + 1));}
  const allowed = ['help', 'size', 'source', 'reference', 'asset-manifest', 'asset-chunks', 'runtime-root', 'output-dir', 'playwright-module', 'variant', 'raw-root', 'backend', 'profile', 'budget-mib', 'python', 'npz-checker', 'export-npz', 'validate-only', 'idle-confirmed'];
  require([...args.keys()].every(key => allowed.includes(key)), 'Unknown large-qualification option');
  for (const key of ['help', 'export-npz', 'validate-only', 'idle-confirmed']) require(!args.has(key) || args.get(key) === true, 'Bare flag required: --' + key);
  if (args.has('help')) return {help: true};
  require(args.has('validate-only') || args.has('idle-confirmed'), 'Real work requires --idle-confirmed; use --validate-only for read-only preflight');
  const size = Number(args.get('size')); require([30, 96].includes(size), 'Explicit --size=30 or96 required');
  for (const key of ['source', 'reference', 'asset-manifest', 'asset-chunks', 'output-dir']) require(typeof args.get(key) === 'string' && path.isAbsolute(args.get(key)), 'Absolute existing/output --' + key + ' required');
  const variant = String(args.get('variant') ?? (size === 30 ? 'both' : 'candidate')); require(['baseline', 'candidate', 'both'].includes(variant), 'Explicit supported variant required');
  const backend = String(args.get('backend') ?? 'webgpu'), computeProfile = String(args.get('profile') ?? 'maximum'), budgetMiB = Number(args.get('budget-mib') ?? 3072);
  require(['cpu', 'webgpu'].includes(backend) && ['aggressive', 'maximum'].includes(computeProfile), 'Supported backend/profile required');
  require(Number.isSafeInteger(budgetMiB) && budgetMiB >= 512 && budgetMiB <= 32768, 'Explicit memory budget outside supported proof range');
  if (size === 96) require(typeof args.get('raw-root') === 'string' && path.isAbsolute(args.get('raw-root')), 'Existing native --raw-root required for96MP');
  const runtimeRoot = path.resolve(String(args.get('runtime-root') ?? ROOT)), output = path.resolve(args.get('output-dir'));
  require(!output.startsWith(path.resolve(args.get('asset-chunks')) + path.sep), 'Output must not modify the chunk depot');
  return {size, source: args.get('source'), reference: args.get('reference'), assetManifest: args.get('asset-manifest'), assetChunks: args.get('asset-chunks'), runtimeRoot, output, playwrightModule: args.get('playwright-module'), rawRoot: args.get('raw-root'), variants: variant === 'both' ? ['baseline', 'candidate'] : [variant], backend, computeProfile, budgetBytes: budgetMiB * 1024 ** 2, python: String(args.get('python') ?? 'python3'), npzChecker: path.resolve(String(args.get('npz-checker') ?? path.join(ROOT, 'scripts/check-d2prl-large-npz.py'))), exportNpz: size === 96 || args.has('export-npz'), validateOnly: args.has('validate-only'), idleConfirmed: args.has('idle-confirmed')};
}
async function identity(file) {const found = await stat(file), hash = createHash('sha256'); require(found.isFile(), 'Regular file required: ' + file); for await (const chunk of createReadStream(file, {highWaterMark: 1024 ** 2})) hash.update(chunk); return {bytes: found.size, sha256: hash.digest('hex')};}
async function preflight(config) {
  const referenceBytes = await readFile(config.reference), reference = JSON.parse(referenceBytes), referencePin = {bytes: referenceBytes.length, sha256: SHA(referenceBytes)};
  require(reference.schema === 1 && reference.width * reference.height === config.size * 1000000 && /^[0-9a-f]{64}$/.test(reference.original?.sha256) && /^[0-9a-f]{64}$/.test(reference.pixelSha256), 'Explicit source/oriented-pixel identities and dimensions required');
  require(Array.isArray(reference.zones) && reference.zones.length === (config.size === 30 ? 1 : 3) && Array.isArray(reference.exclusions), 'Original complete zone/exclusion geometry required');
  if (config.size === 30) require(canonical(reference.zones[0].bounds) === canonical([0, 0, reference.width, reference.height]), '30MP must use the full source envelope');
  if (config.size === 96) {
    require(referencePin.sha256 === 'bc311beb64509716f917dabfe3fb0f0ff603c8efef747ff97fadde7732dcb6a1' && reference.original.sha256 === '03c0b3127e021f2b8f88cbe044545e0de2127fcdae8a62cd36182821180f2ccb', 'Immutable rich96MP native source/reference differs');
    require(reference.records?.length === 2 && reference.raw?.length === 3, 'Rich96MP complete detect/refilter/raw oracle metadata required');
  }
  require((await stat(config.source)).size === reference.original.bytes, 'Original source file size differs');
  const pins = JSON.parse(await readFile(path.join(config.runtimeRoot, 'vendor/d2prl/PINNED.json'))), binding = {}, frozenJs = new Map();
  const guarded = ['src/index.js', 'src/worker.js', 'src/worker-client.js', 'src/d2prl-runtime.js', 'src/d2prl-adapter.js', 'src/neural-input.js', 'src/neural-projector.js', 'src/neural-exports.js', 'experiments/d2prl/model.js', 'experiments/d2prl/analysis.js', 'experiments/d2prl/evaluator-pool.js', 'experiments/d2prl/evaluator-worker.js', 'experiments/d2prl/role-runtime.js', 'vendor/d2prl/PINNED.json', 'vendor/d2prl/table-simd4-exact-subnormal.js', 'vendor/d2prl/table-simd4-exact-subnormal.wasm', 'vendor/d2prl/pixel-major-combined.js', 'vendor/d2prl/pixel-major-combined.wasm', 'vendor/d2prl/factory-roles256.mjs', 'vendor/d2prl/ort-wasm-simd-threaded-roles256.mjs', 'vendor/d2prl/factory.mjs'];
  for (const name of guarded) {const bytes = await readFile(path.join(config.runtimeRoot, name)); binding[name] = {bytes: bytes.length, sha256: SHA(bytes)}; if (/\.m?js$/.test(name)) frozenJs.set(name, bytes);}
  for (const name of ['table-simd4-exact-subnormal.js', 'table-simd4-exact-subnormal.wasm', 'pixel-major-combined.js', 'pixel-major-combined.wasm', 'factory-roles256.mjs', 'ort-wasm-simd-threaded-roles256.mjs']) require(canonical(binding['vendor/d2prl/' + name]) === canonical(pins.files[name]), 'Current qualified runtime artifact pin differs: ' + name);
  require(binding['vendor/d2prl/table-simd4-exact-subnormal.wasm'].sha256 === '54944c22b79e25068908af4c0885a4b0cf2131cf943b77f176683cbef50f8fb5' && pins.builds['evaluator-table-simd4-exact-subnormal']?.status === 'qualified-exact-direct-model', 'Final qualified subnormal module required');
  const current = frozenJs.get('src/d2prl-runtime.js').toString(), needle = "evaluator = 'exact-simd', rolesMemoryMiB = 256";
  require(current.split(needle).length === 2, 'Current runtime must default to final exact-SIMD/roles256, with one guarded virtual override');
  const baseline = Buffer.from(current.replace(needle, "evaluator = 'pixel-major', rolesMemoryMiB = 512"));
  const rawRoutes = new Map();
  if (config.size === 96) for (let index = 0; index < 3; index++) {const file = path.join(config.rawRoot, safe(reference.raw[index].file)); require(canonical(await identity(file)) === canonical({bytes: reference.raw[index].bytes, sha256: reference.raw[index].sha256}), 'Existing native raw file identity differs'); rawRoutes.set(String(index), file);}
  const catalogBytes = await readFile(config.assetManifest), catalog = JSON.parse(catalogBytes), modelRoutes = new Map();
  require(catalog.schema === 'sherloq.dependencies/1' && catalog.files && catalog.chunks, 'Existing dependency file/chunk table required');
  const meta = catalog.files['unified-assets/d2prl/model.json']; require(meta?.size === 1173784 && meta.sha256 === '8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b', 'Pinned model manifest differs');
  const parts = []; for (const sha of meta.chunks) {require(/^[0-9a-f]{64}$/.test(sha), 'Safe model configuration chunk required'); const bytes = await readFile(path.join(config.assetChunks, sha + '.bin')); require(bytes.length === catalog.chunks[sha], 'Model configuration chunk extent differs'); parts.push(bytes);}
  const modelBytes = Buffer.concat(parts); require(modelBytes.length === meta.size && SHA(modelBytes) === meta.sha256, 'Reused model JSON identity differs'); const model = JSON.parse(modelBytes);
  require(model.side === 448 && model.iterations === 40 && model.seed === 22 && model.referenceThreads === 8, 'Native model contract differs');
  const chunkFiles = new Map();
  for (const [name, spec] of [['model.json', {bytes: meta.size, sha256: meta.sha256}], ...Object.entries(model.assets)]) {
    require(name === 'model.json' || /^assets\/[0-9a-f]{64}\.bin$/.test(name), 'Pinned model asset path differs'); const item = catalog.files['unified-assets/d2prl/' + name];
    require(item && item.size === spec.bytes && item.sha256 === spec.sha256 && Array.isArray(item.chunks), 'Logical model asset pin differs'); const files = []; let bytes = 0;
    for (const sha of item.chunks) {require(/^[0-9a-f]{64}$/.test(sha), 'Safe model chunk identity required'); const file = path.join(config.assetChunks, sha + '.bin'); if (!chunkFiles.has(file)) {const found = await stat(file); require(found.isFile() && found.size === catalog.chunks[sha], 'Model chunk missing/wrong extent'); chunkFiles.set(file, found.size);} bytes += chunkFiles.get(file); files.push(file);}
    require(bytes === spec.bytes, 'Logical model chunk length differs'); modelRoutes.set(name, files);
  }
  return {reference, referencePin, binding, frozenJs, baseline, rawRoutes, modelRoutes, catalogSha256: SHA(catalogBytes), chunks: chunkFiles.size, modelIdentity: {bytes: meta.size, sha256: meta.sha256, modelId: model.modelId}, recipePin: await identity(path.join(ROOT, 'tests/d2prl-large-qualification-browser.js'))};
}
async function independentCheck(config, file, reportFile) {
  const output = file.replace(/\.npz$/, '-npz-proof.json');
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, [config.npzChecker, '--browser-proof=' + reportFile, '--npz=' + file, '--output=' + output, '--reference=' + config.reference], {stdio: ['ignore', 'pipe', 'pipe']}), out = [], err = [];
    child.stdout.on('data', value => out.push(value)); child.stderr.on('data', value => err.push(value)); child.once('error', reject);
    child.once('close', async code => {if (code !== 0) reject(Error('Independent NPZ check failed: ' + Buffer.concat(err).toString())); else {try {const proof = JSON.parse(await readFile(output)); require(proof.status === 'passed', 'Independent NPZ proof rejected'); resolve(proof);} catch (error) {reject(error);}}});
  });
}
function compareReports(rows) {
  if (rows.length !== 2) return {status: 'not-requested-single-variant'};
  const [baseline, candidate] = ['baseline', 'candidate'].map(name => rows.find(row => row.variant === name)); require(baseline && candidate, 'Both A/B variants required');
  require(baseline.sourceSha256 === candidate.sourceSha256 && baseline.pixelSha256 === candidate.pixelSha256 && canonical(baseline.dimensions) === canonical(candidate.dimensions), 'A/B source identity differs');
  for (const [index, row] of baseline.records.entries()) require(canonical(Object.fromEntries(Object.entries(row.outputs).map(([key, value]) => [key, value.sha256]))) === canonical(Object.fromEntries(Object.entries(candidate.records[index].outputs).map(([key, value]) => [key, value.sha256]))), 'A/B complete source-plane bits differ: ' + row.name);
  require(canonical(baseline.raw) === canonical(candidate.raw), 'A/B native three-plane raw bits/decisions differ');
  return {status: 'passed-exact-current-engine-parity', nativeRawPlanesExact: true, sixPlanesExactInBothViews: true, analysisGainPercent: 100 * (baseline.times.analysisMs - candidate.times.analysisMs) / baseline.times.analysisMs, speedQualified: false, reason: 'One paired functional observation; not a repeated isolated speed qualification.'};
}
async function main(argv) {
  const config = settings(argv); if (config.help) {console.log(HELP); return;}
  const input = await preflight(config);
  if (config.validateOnly) {console.log(JSON.stringify({status: 'validated-only', dimensions: [input.reference.width, input.reference.height], variants: config.variants, runtimeRoot: config.runtimeRoot, binding: input.binding, reference: input.referencePin, model: input.modelIdentity, modelFiles: input.modelRoutes.size, chunks: input.chunks, noServerBrowserInference: true})); return;}
  await mkdir(config.output, {recursive: true});
  const report = {schema: 1, status: 'running', source: {original: input.reference.original, pixelSha256: input.reference.pixelSha256, dimensions: [input.reference.width, input.reference.height]}, configuration: config, reference: input.referencePin, runtimeSource: {files: input.binding, sha256: SHA(canonical(input.binding))}, baselineOverride: {scope: 'Only d2prlRuntime evaluator/roles default arguments differ; all other runtime/source/model/image bytes shared.', runtimeSha256: SHA(input.baseline)}, recipe: input.recipePin, model: input.modelIdentity, assetCatalogSha256: input.catalogSha256, servedRuntime: {}, rows: [], missingRoutes: [], speedQualification: 'Functional new-image/resource qualification; not an isolated repeated speed benchmark.'};
  const save = () => writeFile(path.join(config.output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await save();
  const archives = new Map(), moduleCache = new Map(input.frozenJs);
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      const url = new URL(req.url, 'http://localhost'), name = decodeURIComponent(url.pathname);
      if (name === '/') {res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>Current D2PRL large-source qualification</title>');}
      if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
      const archived = /^\/archive\/(baseline|candidate)$/.exec(name);
      if (archived && req.method === 'POST') {const variant = archived[1], previous = archives.get(variant) ?? {bytes: 0, file: path.join(config.output, variant + '.npz.part')}; require(Number(url.searchParams.get('offset')) === previous.bytes, 'Sequential owned archive offset required'); let count = 0; const parts = []; for await (const bytes of req) {count += bytes.length; require(count <= 1024 ** 2, 'Bounded archive page required'); parts.push(bytes);} const file = await open(previous.file, previous.bytes ? 'a' : 'wx'); try {await file.writeFile(Buffer.concat(parts));} finally {await file.close();} previous.bytes += count; archives.set(variant, previous); res.statusCode = 204; return res.end();}
      if (name === '/recipe.js') {res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(path.join(ROOT, 'tests/d2prl-large-qualification-browser.js')));}
      if (name.startsWith('/model/')) {const files = input.modelRoutes.get(safe(name.slice(7))); require(files, 'Listed pinned model asset required'); res.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'application/octet-stream'); return await pipeline(Readable.from((async function* () {for (const file of files) for await (const bytes of createReadStream(file, {highWaterMark: 1024 ** 2})) yield bytes;})()), res);}
      let file;
      if (name === '/source.jpg') file = config.source;
      else if (name.startsWith('/native-raw/')) file = input.rawRoutes.get(name.slice(12));
      else {
        const runtime = /^\/runtime\/(baseline|candidate)\/(.+)$/.exec(name); require(runtime, 'Known development route required'); const [variant, relative] = [runtime[1], safe(runtime[2])]; require(/^(src|experiments|vendor)\//.test(relative) && /\.(m?js|wasm|json)$/.test(relative), 'Runtime route scope differs'); file = path.join(config.runtimeRoot, relative);
        if (/\.m?js$/.test(relative)) {let bytes = moduleCache.get(relative); if (!bytes) {bytes = await readFile(file); moduleCache.set(relative, bytes);} if (relative === 'src/d2prl-runtime.js' && variant === 'baseline') bytes = input.baseline; report.servedRuntime[variant + '/' + relative] = {bytes: bytes.length, sha256: SHA(bytes)}; res.setHeader('Content-Type', 'text/javascript'); return res.end(bytes);}
        const digest = createHash('sha256'), info = await stat(file), recorded = variant + '/' + relative;
        res.setHeader('Content-Type', relative.endsWith('.wasm') ? 'application/wasm' : 'application/json'); res.setHeader('Content-Length', info.size);
        await pipeline(createReadStream(file, {highWaterMark: 1024 ** 2}), new Transform({transform(bytes, _encoding, done) {digest.update(bytes); done(null, bytes);}}), res);
        report.servedRuntime[recorded] = {bytes: info.size, sha256: digest.digest('hex')}; return;
      }
      require(file, 'Known source/raw file required'); const info = await stat(file); res.setHeader('Content-Type', name === '/source.jpg' ? 'image/jpeg' : 'application/octet-stream'); res.setHeader('Content-Length', info.size); await pipeline(createReadStream(file, {highWaterMark: 1024 ** 2}), res);
    } catch (error) {report.missingRoutes.push({url: req.url, message: error.message}); if (!res.headersSent) res.writeHead(404); res.end(error.message); console.error('ROUTE', req.url, error.message);}
  });
  let browser, context, interrupted = false;
  const interrupt = () => {interrupted = true; void browser?.close();}; process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const {chromium} = await import(config.playwrightModule ? pathToFileURL(config.playwrightModule).href : 'playwright');
    browser = await chromium.launch({channel: 'chrome', headless: true}); report.browser = browser.version();
    for (const variant of config.variants) {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + server.address().port;
      context = await browser.newContext(); const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message)); page.on('console', message => {const value = message.text(); if (value.startsWith('D2LARGE ')) {console.log(value); void writeFile(path.join(config.output, 'status.json'), JSON.stringify({at: new Date().toISOString(), ...JSON.parse(value.slice(8))}, null, 2) + '\n');}});
      await page.goto(origin);
      const row = await page.evaluate(async options => (await import('/recipe.js')).d2prlLargeQualification(options), {variant, size: config.size, reference: input.reference, backend: config.backend, budgetBytes: config.budgetBytes, computeProfile: config.computeProfile, apiBase: origin + '/runtime/' + variant + '/', modelUrl: origin + '/model/model.json', exportNpz: config.exportNpz});
      require(errors.length === 0 && report.missingRoutes.length === 0, 'Browser or runtime routing failure: ' + [...errors, ...report.missingRoutes.map(value => value.message)].join('; '));
      const roleNames = variant === 'candidate' ? ['factory-roles256.mjs', 'ort-wasm-simd-threaded-roles256.mjs'] : ['factory.mjs'];
      for (const name of [row.selection.evaluator, row.selection.evaluator.replace('.js', '.wasm'), ...roleNames]) require(canonical(report.servedRuntime[variant + '/vendor/d2prl/' + name]) === canonical(input.binding['vendor/d2prl/' + name]), 'Actually loaded runtime artifact differs: ' + name);
      report.rows.push(row); const rowFile = path.join(config.output, variant + '-result.json'); await writeFile(rowFile, JSON.stringify(row, null, 2) + '\n'); await save();
      await context.close(); context = null; server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      if (row.exported) {const archived = archives.get(variant); require(archived?.bytes === row.exported.byteLength, 'Complete paged archive persistence required'); const file = path.join(config.output, variant + '.npz'); await rename(archived.file, file); console.log('D2LARGE ' + JSON.stringify({variant, phase: 'independent-npz-check'})); row.independentNpz = await independentCheck(config, file, rowFile); await writeFile(rowFile, JSON.stringify(row, null, 2) + '\n'); await save();}
    }
    report.comparison = compareReports(report.rows);
    for (const [name, expected] of Object.entries(input.binding)) require(canonical(await identity(path.join(config.runtimeRoot, name))) === canonical(expected), 'Runtime source/artifact changed during qualification: ' + name);
    report.status = 'passed'; report.resourceCleanup = 'Every reported engine ownership/backing/activity/lease is zero; fresh contexts closed. Browser/host process RSS is not the shared policy budget.';
    const fields = ['variant', 'size', 'backend', 'budgetBytes', 'inferences', 'loadMs', 'analysisMs', 'cacheViewMs', 'exportPreparationMs', 'exportReadbackMs', 'peakAccountedBytes'], quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const rows = report.rows.map(row => ({variant: row.variant, size: row.size, backend: row.backend, budgetBytes: row.memory.budgetBytes, inferences: row.records[0].inferences, ...row.times, peakAccountedBytes: row.memory.peakAccountedBytes}));
    await writeFile(path.join(config.output, 'timings.csv'), [fields.join(','), ...rows.map(row => fields.map(field => quote(row[field])).join(','))].join('\n') + '\n');
  } catch (error) {report.status = interrupted ? 'interrupted' : 'failed'; report.error = {message: error.message, stack: error.stack}; throw error;}
  finally {process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); const failures = []; for (const close of [() => context?.close(), () => browser?.close(), () => new Promise(resolve => {if (!server.listening) return resolve(); server.closeAllConnections(); server.close(resolve);})]) try {await close();} catch (error) {failures.push(error.message);} report.hostCleanup = {status: failures.length ? 'failed' : 'closed', failures}; await save();}
  console.log(JSON.stringify({status: report.status, output: config.output, dimensions: report.source.dimensions, comparison: report.comparison, rows: report.rows.map(row => ({variant: row.variant, times: row.times, memory: row.memory}))}));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {console.error(error.stack); process.exitCode = 1;});
