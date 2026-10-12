// Isolated numerical API qualification. No user tabs or mouse/keyboard journey.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]),base=process.argv[3]??'http://127.0.0.1:60415',teams=(process.argv[4]??'1,4').split(',').map(Number),backend=process.argv[5]??'cpu',cases=(process.argv[6]??'smaller-shapes,no-matches').split(','),kind=process.argv[7]??'browser-reference';
const {chromium}=await import(process.env.SHERLOQ_PLAYWRIGHT_MODULE??'playwright'),browser=await chromium.launch({headless:true,...(process.env.SHERLOQ_CHROMIUM_EXECUTABLE?{executablePath:process.env.SHERLOQ_CHROMIUM_EXECUTABLE}:{})});
try{for(const threads of teams){
 const context=await browser.newContext(),page=await context.newPage(),messages=[],failures=[],pageErrors=[];try{
  page.on('console',m=>{if(['error','warning'].includes(m.type()))messages.push({type:m.type(),text:m.text()});});
  page.on('pageerror',e=>pageErrors.push({name:e.name,message:e.message}));page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
  await page.goto(base+'/integration-resources/aliked-eloftr/export/'+kind+'/qualification.html');
  await page.waitForFunction(()=>typeof window.runEfficientLoFtrQualification==='function');
  const report=await page.evaluate(options=>window.runEfficientLoFtrQualification(options),{threads,backend,cases});
  report.browser=browser.version();report.hardwareConcurrency=await page.evaluate(()=>navigator.hardwareConcurrency);report.console=messages;report.requestFailures=failures;report.pageErrors=pageErrors;
  report.dom={status:await page.locator('#status').getAttribute('data-status'),completed:await page.locator('#completed').textContent()};
  // A terminated model worker can surface ERR_ABORTED after the response body
  // has been read in full and SHA-256 verified, and all parity jobs completed.
  // Preserve those events separately; they are not a failed model download.
  const completedParity=report.status==='native-and-chromium-common-'+backend+'-qualified'&&report.records.length===cases.length;
  report.transportCleanupAborts=completedParity?failures.filter(f=>f.error==='net::ERR_ABORTED'&&f.url.endsWith('/efficient-loftr-full-fp32.onnx')):[];
  const actualFailures=failures.filter(f=>!report.transportCleanupAborts.includes(f));
  if(pageErrors.length||actualFailures.length||messages.some(m=>/multi-threading.*not supported|falling back to single-threading/i.test(m.text))||report.dom.completed!==String(cases.length)||report.dom.status!==report.status)report.status='failed-browser-qualification';
  report.sources={};for(const file of ['../src/efficient-loftr.js','../src/efficient-loftr-input.js','../src/efficient-loftr-assets.js','../src/efficient-loftr-runtime-factory.mjs','../src/efficient-loftr-runtime-gpu-factory.mjs','../src/neural-graph-pool.js','../src/neural-graph-worker.js','../src/fetch-verified-asset.js','../vendor/m3-ort/ort-wasm-simd-threaded.mjs','../vendor/m3-ort/ort-wasm-simd-threaded.asyncify.mjs'])report.sources[file]=createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex');
  report.harnessSha256=createHash('sha256').update(await readFile(resolve(root,'qualification.html'))).digest('hex');
  await writeFile(resolve(root,'common-pool-chromium-'+backend+'-'+threads+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({threads,backend,status:report.status,elapsedMs:report.elapsedMs,records:report.records.map(r=>({name:r.name,counts:r.counts,errors:r.errors,metrics:r.metrics,heapBytes:r.heapBytes,selectedMatches:r.selectedMatches,maxSource:r.maxSource,maxTarget:r.maxTarget,maxConfidence:r.maxConfidence,sourcePreserved:r.sourcePreserved})),error:report.error,console:messages,failures,pageErrors}));
  if(report.status!=='native-and-chromium-common-'+backend+'-qualified')process.exitCode=1;
 }finally{await context.close();}
}}finally{await browser.close();}
