// Automated numerical API qualification in a dedicated headless context.
// No mouse/keyboard/user tabs, no new server, no runtime calibration in product.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root = resolve(process.argv[2]), base = process.argv[3] ?? 'http://127.0.0.1:60415';
const teams = process.argv[4] ? process.argv[4].split(',').map(Number) : [1, 4];
const {chromium} = await import(process.env.SHERLOQ_PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({headless: true});
try {
  for (const threads of teams) {
    const context = await browser.newContext(), page = await context.newPage(), messages = [], failures = [], pageErrors = [];
    try {
      page.on('console', message => {if (['error', 'warning'].includes(message.type())) messages.push({type: message.type(), text: message.text()});});
      page.on('pageerror', error => pageErrors.push({name: error.name, message: error.message}));
      page.on('requestfailed', request => failures.push({url: request.url(), error: request.failure()?.errorText}));
      await page.goto(base + '/integration-resources/selfdm-ssg/browser-selfdm-512/qualification.html');
      await page.waitForFunction(() => typeof window.runSelfDMQualification === 'function');
      const report = await page.evaluate(threads => window.runSelfDMQualification({threads}), threads);
      report.browser = browser.version(); report.provider = 'wasm'; report.hardwareConcurrency = await page.evaluate(() => navigator.hardwareConcurrency); report.console = messages; report.requestFailures = failures; report.pageErrors = pageErrors;
      report.dom = {status: await page.locator('#status').getAttribute('data-status'), completed: await page.locator('#completed').textContent()};
      if (pageErrors.length || failures.length || messages.some(message => /multi-threading.*not supported|falling back to single-threading/i.test(message.text)) || report.dom.completed !== '2' || report.dom.status !== report.status) report.status = 'failed-browser-qualification';
      report.sources = {};
      for (const name of ['../src/selfdm-inference.js', '../src/selfdm-runtime-factory.mjs', '../src/selfdm-prepare.js', '../src/neural-graph-pool.js', '../src/neural-graph-worker.js', '../src/execution-scheduler.js', '../vendor/m3-ort/factory.mjs', '../vendor/m3-ort/ort-wasm-simd-threaded.mjs', '../vendor/d2prl/ort-wasm-simd-threaded.wasm']) report.sources[name] = createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex');
      report.harnessSha256 = createHash('sha256').update(await readFile(resolve(root, 'qualification.html'))).digest('hex');
      report.scriptSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
      await writeFile(resolve(root, 'common-pool-chromium-' + threads + '.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify({threads, status: report.status, browser: report.browser, elapsedMs: report.elapsedMs, records: report.records.map(record => ({name: record.name, inferenceMs: record.timings.inferenceMs, maxAbs: record.maxAbs, maskChanged: record.maskChanged, heapBytes: record.heapBytes, threads: record.metrics.threads, workerReused: record.metrics.workerReused})), error: report.error, console: messages, failures, pageErrors}));
      if (report.status !== 'native-and-chromium-common-wasm-thread-team-qualified') process.exitCode = 1;
    } finally {await context.close();}
  }
} finally {await browser.close();}
