// Private numerical qualification; starts its own headless context and random
// loopback port. It never touches a user browser, existing preview or service.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const resources=resolve(process.argv[2]),engine=resolve(fileURLToPath(new URL('../',import.meta.url))),threads=Number(process.argv[3]??10);
if(!Number.isSafeInteger(threads)||threads<1||threads>32)throw Error('Explicit useful CPU team required');
const {chromium}=await import(process.env.SHERLOQ_PLAYWRIGHT_MODULE??'playwright');
const native=await readFile(resolve(resources,'positive-reference/full-pipeline-probability.npy'));
const start=(native[6]===1?10:12)+(native[6]===1?native.readUInt16LE(8):native.readUInt32LE(8));
const reference=native.subarray(start),consoleEvents=[],errors=[],failedRequests=[];let failNextCrf=false;
const server=createServer(async(req,res)=>{try{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 res.setHeader('Cache-Control','no-store');
 const url=new URL(req.url,'http://localhost'),name=url.pathname;
 if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>SelfDM full chain source-pixel qualification</title>');return;}
 if(name==='/favicon.ico'){res.statusCode=204;res.end();return;}
 if(name==='/fail-next-crf'){failNextCrf=true;res.statusCode=204;res.end();return;}
 if(failNextCrf&&name==='/resources/integration-bundle/convcrf-512.onnx'){failNextCrf=false;res.statusCode=503;res.end('Intentional qualification-only component outage');return;}
 if(name==='/native-probability.bin'){res.end(reference);return;}
 const base=name.startsWith('/resources/')?resources:engine;
 const relative=name.startsWith('/resources/')?name.slice('/resources/'.length):name.slice(1),file=resolve(base,relative);
 if(!file.startsWith(base+sep))throw Error('Outside explicit qualification roots');
 res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.png':'image/png'})[extname(file)]??'application/octet-stream');
 res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,report;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 page.on('console',value=>{if(value.text().startsWith('PROPOSAL_PROGRESS '))console.log(value.text());else if(value.type()==='error'||value.type()==='warning')consoleEvents.push({type:value.type(),text:value.text()});});
 page.on('pageerror',error=>errors.push({name:error.name,message:error.message}));
 page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const diagnostic=setInterval(()=>{page.evaluate(()=>globalThis.proposalDiagnostic?.()).then(value=>{if(value)console.log('PROPOSAL_DIAGNOSTIC '+JSON.stringify(value));}).catch(()=>{});},15000);
 try{report=await page.evaluate(async threads=>{
  const {SelfDMProposalEngine}=await import('/src/selfdm-proposal.js'),{loadSelfDMProposalBundle}=await import('/src/selfdm-proposal-assets.js'),{Budget}=await import('/src/cache.js'),{getExecutionScheduler}=await import('/src/execution-scheduler.js');
  const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(value=>value.toString(16).padStart(2,'0')).join('');
  const manifestBytes=new Uint8Array(await(await fetch('/resources/integration-bundle/selfdm-proposal-bundle.json')).arrayBuffer());
  const budget=new Budget(3*1024**3),scheduler=getExecutionScheduler(budget,{maxWorkers:threads});
  let notifications=0;const notify=budget.resourceChanged;
  budget.resourceChanged=function(){notifications++;if([64,256,1024,8192].includes(notifications))console.log('PROPOSAL_PROGRESS '+JSON.stringify({phase:'development-admission-trace',notifications,budget:budget.snapshot(),scheduler:scheduler.snapshot(),resources:budget.resourceSnapshot(),stack:new Error().stack}));return notify.call(this);};
  const bundle=await loadSelfDMProposalBundle({id:'selfdm-proposal-bundle',url:new URL('/resources/integration-bundle/selfdm-proposal-bundle.json',location.href).href,bytes:manifestBytes.length,sha256:await hash(manifestBytes)},{budget});
  const bitmap=await createImageBitmap(await(await fetch('/resources/real-photo-copy512.png')).blob());
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const rgba=context.getImageData(0,0,512,512).data,rgb=new Uint8Array(512**2*3);
  for(let i=0;i<512**2;i++){rgb[i*3]=rgba[i*4];rgb[i*3+1]=rgba[i*4+1];rgb[i*3+2]=rgba[i*4+2];}bitmap.close();
  const expectedPixels=new Uint8Array(await(await fetch('/resources/full-source-rgb.bin')).arrayBuffer());
  if(await hash(rgb)!==await hash(expectedPixels))throw Error('Decoded browser source RGB differs from native source pixels');
  const expected=new Float32Array(await(await fetch('/native-probability.bin')).arrayBuffer()),owner=new SelfDMProposalEngine({format:'rgb8',width:512,height:512,data:rgb},budget,{maxWorkers:threads});
  const records=[],progress=[],started=performance.now();let result,downloadRecovery;
  globalThis.proposalDiagnostic=()=>({elapsedMs:performance.now()-started,last:progress.at(-1),budget:budget.snapshot(),scheduler:scheduler.snapshot(),pool:owner.pool?.snapshot(),operations:budget.resourceSnapshot().operations});
  try{
   for(let run=0;run<2;run++){
    const at=performance.now();result=await owner.analyze({}, {...bundle,onProgress:event=>{progress.push(event);if(!event.phase.startsWith('selfdm-proposal-cache'))console.log('PROPOSAL_PROGRESS '+JSON.stringify(event));}});
    let maxAbs=0,maskChanged=0,nonfinite=0,foreground=0;
    for(let i=0;i<expected.length;i++){maxAbs=Math.max(maxAbs,Math.abs(result.raw[i]-expected[i]));maskChanged+=Number((result.raw[i]>.5)!==(expected[i]>.5));foreground+=Number(result.raw[i]>.5);nonfinite+=Number(!Number.isFinite(result.raw[i]));}
    records.push({run,elapsedMs:performance.now()-at,maxAbs,maskChanged,nonfinite,foreground,sha256:await hash(result.raw),metadata:result.metadata,metrics:result.metrics,budget:budget.snapshot(),resources:budget.resourceSnapshot()});
    result.release();result=null;
   }
   // Retire only idle execution contexts, then inject one actual late HTTP
   // refusal. The same owner's scientific checkpoints must remain available.
   owner.releaseIdle();await fetch('/fail-next-crf');let failure;
   try{result=await owner.analyze({},bundle);}catch(error){failure=error;}
   if(result){result.release();result=null;throw Error('Expected the injected component request refusal');}
   const chain=[];for(let error=failure;error;error=error.cause)chain.push({code:error.code,message:error.message,details:error.details});
   if(!chain.some(error=>error.code==='ASSET_HTTP'&&error.details.status===503))throw Error('Injected HTTP cause was lost');
   result=await owner.analyze({},bundle);
   downloadRecovery={errorChain:chain,inferenceExecutions:result.metrics.inferenceExecutions,cacheHits:result.metrics.cacheHits,stages:result.metrics.stages,sha256:await hash(result.raw),sourceSha256:await hash(rgb),budget:budget.snapshot()};
   if(downloadRecovery.inferenceExecutions!==1||downloadRecovery.cacheHits!==12||downloadRecovery.sha256!==records[0].sha256)throw Error('The late download retry lost completed scientific work');
   result.release();result=null;
  }catch(error){return {status:'failed',error:{name:error.name,code:error.code,message:error.message,stack:error.stack,details:error.details,cause:error.cause},records,progress};}
  finally{result?.release();await owner.dispose();}
  const released=budget.total()===0&&scheduler.snapshot().active.cpu===0&&scheduler.snapshot().queued===0;
  return {status:records.every(record=>record.maskChanged===0&&record.nonfinite===0&&record.maxAbs<=.001)&&released?'common-pool-complete-chain-qualified-from-source-pixels':'failed-parity-or-ownership',threads,hardwareConcurrency:navigator.hardwareConcurrency,crossOriginIsolated,records,downloadRecovery,progress,elapsedMs:performance.now()-started,sourceSha256:await hash(rgb),released,budget:budget.snapshot(),resources:budget.resourceSnapshot(),scheduler:scheduler.snapshot()};
 },threads);}finally{clearInterval(diagnostic);}
 report.browser=browser.version();report.console=consoleEvents;report.pageErrors=errors;report.failedRequests=failedRequests;
 // Chromium can report ERR_ABORTED when an already-consumed worker response
 // is retired before its resource-finished notification. Keep those raw events,
 // but do not confuse deliberate endpoint retirement with a failed inference.
 report.retirementRequestCancellations=failedRequests.filter(event=>event.error==='net::ERR_ABORTED');
 report.unexpectedRequestFailures=failedRequests.filter(event=>event.error!=='net::ERR_ABORTED');
 report.expectedHttpQualificationFailure=consoleEvents.filter(event=>/503/.test(event.text));
 report.unexpectedConsoleErrors=consoleEvents.filter(event=>event.type==='error'&&!/503/.test(event.text));
 if(errors.length||report.unexpectedRequestFailures.length||report.unexpectedConsoleErrors.length)report.status='failed-browser-events';
 report.sources={};for(const name of ['src/selfdm-proposal.js','src/selfdm-proposal-worker.js','src/selfdm-proposal-process.js','src/selfdm-proposal-pyramid.js','src/selfdm-proposal-assets.js','vendor/selfdm-proposal/seeds.wasm'])report.sources[name]=createHash('sha256').update(await readFile(resolve(engine,name))).digest('hex');
 report.scriptSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
 await writeFile(resolve(resources,'common-pool-proposal-chromium-'+threads+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,error:report.error,elapsedMs:report.elapsedMs,released:report.released,records:report.records?.map(record=>({run:record.run,elapsedMs:record.elapsedMs,maxAbs:record.maxAbs,maskChanged:record.maskChanged,foreground:record.foreground,inferenceExecutions:record.metrics.inferenceExecutions,cacheHits:record.metrics.cacheHits,heapBytes:record.metrics.heapBytes,memoryMaximumBytes:record.metrics.memoryMaximumBytes,pool:record.metrics.pool,stages:record.metrics.stages.map(stage=>({stage:stage.stage,threads:stage.threads,cacheHit:stage.cacheHit}))})),console:consoleEvents,pageErrors:errors,failedRequests}));
 if(report.status!=='common-pool-complete-chain-qualified-from-source-pixels')process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
