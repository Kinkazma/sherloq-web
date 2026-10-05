import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream,writeFileSync,renameSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {freezeBrowserRuntime} from './freeze-browser-runtime.mjs';
import {createChromiumMemoryObserver} from './chromium-memory-observer.mjs';

if(!process.argv[2])throw Error('Usage: node scripts/complete96-runner.mjs RUN_DIRECTORY');
const useMemoryExtension=process.env.SHERLOQ_MEMORY_EXTENSION==='1';
const directory=path.resolve(process.argv[2]),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const shared=path.resolve(root,'../web-engine-m2/.build'),m1=path.resolve(root,'../web-engine/.build'),ort=path.join(m1,'ort130/package/dist');
function memoryObservation(){
 const at=new Date().toISOString(),values={at,scope:'Read-only host counters; not a browser allocation limit, RAM probe or capacity estimate.'};
 for(const [name,command,args] of [['vmStat','/usr/bin/vm_stat',[]],['swap','/usr/sbin/sysctl',['vm.swapusage']]]){try{values[name]=execFileSync(command,args,{encoding:'utf8',timeout:2000}).trim();}catch(error){values[name]={unavailable:error.code??error.message};}}
 return values;
}
const started=Date.now(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let state={state:'starting',pid:process.pid,startedAt:new Date(started).toISOString(),directory,budgetPolicy:useMemoryExtension?'maximum profile with live system-memory observations':'maximum profile from browser RAM hint',computeProfile:'maximum',dimensions:[12000,8000],timeoutHours:24};
function status(patch){state={...state,...patch,updatedAt:new Date().toISOString(),wallMs:Date.now()-started};const temp=path.join(directory,'status.json.tmp');writeFileSync(temp,JSON.stringify(state,null,2)+'\n');renameSync(temp,path.join(directory,'status.json'));}
status({phase:'freeze-runtime'});
let memoryObserver,memoryExtensionId,lastMemorySample=0,firstAllocationSample=false,unansweredDiagnostics=0,profileRequested=false;const allocationSampleKeys=new Set();
function observeBrowserMemory(reason){
 if(!memoryObserver)return;lastMemorySample=Date.now();void memoryObserver.sample(reason).then(value=>{if(value)appendFileSync(path.join(directory,'browser-memory.jsonl'),JSON.stringify(value)+'\n');}).catch(error=>{appendFileSync(path.join(directory,'browser-memory.jsonl'),JSON.stringify({at:new Date().toISOString(),reason,error:error.message})+'\n');});
}
let browser,profile,fileHandle,partialHandle,server,delivered=0,partialDelivered=0,partialVerified=false,partialFromComplete=false,interrupted=false,binding,lastAutomaticState,firstRecoveryMemory,lastWorkEventAt;
const interrupt=()=>{interrupted=true;status({state:'stopping',phase:'interrupted'});void browser?.close();};
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
try{
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();if(dirty)throw Error('Tracked source changed before snapshot: '+dirty);
 const frozen=await freezeBrowserRuntime(root,directory),extra=[];
 for(const name of ['extensions/memory-bridge/manifest.json','extensions/memory-bridge/service-worker.js','tests/m5-complete-96mp-browser.js','tests/verify-stored-npz.mjs','tests/source-api-browser.js','.build/forgeryscope/prepare.mjs','.build/forgeryscope/prepare.wasm','.build/forgeryscope/sift.mjs','.build/forgeryscope/sift.wasm']){
  const source=name==='tests/m5-complete-96mp-browser.js'?path.join(directory,'recipe.js'):path.join(root,name),target=path.join(directory,'runtime',name);
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target);frozen.files.set('/'+name,target);const bytes=await fs.readFile(target);extra.push({file:name,bytes:bytes.length,sha256:sha(bytes)});
 }
 binding={engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtimeManifestSha256:sha(await fs.readFile(path.join(root,'runtime-manifest.json'))),runtime:frozen.proof,extra,scope:'One cold complete automatic 96MP analysis; full image, five detector groups, 11 dense hypotheses, patch8/iterations8, views and verified export. No warmup, canary, repeat analysis or refilter.'};
 await fs.writeFile(path.join(directory,'binding.json'),JSON.stringify(binding,null,2)+'\n');
 const part=path.join(directory,'complete.npz.part');fileHandle=await fs.open(part,'wx');
 server=createServer(async(req,res)=>{try{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);
  if(name==='/archive-part'&&req.method==='POST'){
   const partial=url.searchParams.get('kind')==='partial';
   if(Number(url.searchParams.get('offset'))!==(partial?partialDelivered:delivered))throw Error('Archive offset mismatch');let length=0;const chunks=[];
   for await(const chunk of req){length+=chunk.length;if(length>4*1024**2)throw Error('Archive chunk too large');chunks.push(chunk);}
   if(partial){partialHandle??=await fs.open(path.join(directory,'partial.npz.part'),'wx');await partialHandle.writeFile(Buffer.concat(chunks));partialDelivered+=length;}
   else{await fileHandle.writeFile(Buffer.concat(chunks));delivered+=length;}res.statusCode=204;return res.end();
  }
  if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>SHERLOQ runtime 96MP cold qualification</title>');}
  const isM1=name.startsWith('/shared-build/'),isShared=name.startsWith('/m2-build/'),isOrt=name.startsWith('/ort/'),base=isM1?m1:isShared?shared:isOrt?ort:root;
  let file;
  if(name==='/english-ocr')file='/opt/homebrew/share/tessdata/eng.traineddata';
  else{
   file=frozen.files.get(name)??path.resolve(base,isM1?name.slice(14):isShared?name.slice(10):isOrt?name.slice(5):'.'+name);
   if(!frozen.files.has(name)&&!file.startsWith(base+path.sep))throw Error('Invalid path');
   if(!isM1&&!isShared&&!isOrt&&!frozen.files.has(name))throw Error('Unfrozen runtime request: '+name);
  }
  res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');
  const total=(await fs.stat(file)).size,range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range??'');
  let stream;
  if(range){const start=Number(range[1]),end=Number(range[2]);if(start<0||end<start||end>=total||end-start+1>4*1024**2)throw Error('Invalid range');res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${total}`);res.setHeader('Content-Length',end-start+1);stream=createReadStream(file,{start,end});}
  else{res.setHeader('Content-Length',total);stream=createReadStream(file);}
  stream.on('error',error=>res.destroy(error));stream.pipe(res);
 }catch(error){console.error('SERVE',req.url,error.message);if(!res.headersSent)res.writeHead(404);res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 profile=await fs.mkdtemp(path.join(directory,'chrome-'));status({phase:'launch-chromium',engineCommit:binding.engineCommit,port:server.address().port});
 browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,...(useMemoryExtension?{ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']}:{})});
 if(useMemoryExtension){const extensionSession=await browser.browser().newBrowserCDPSession();try{memoryExtensionId=(await extensionSession.send('Extensions.loadUnpacked',{path:path.join(directory,'runtime/extensions/memory-bridge')})).id;}finally{await extensionSession.detach();}}
 try{memoryObserver=await createChromiumMemoryObserver(browser.browser());}catch(error){status({memoryObserverUnavailable:error.message});}
 const page=await browser.newPage();page.on('pageerror',e=>{const failure={at:new Date().toISOString(),name:e.name,message:e.message,stack:e.stack};appendFileSync(path.join(directory,'page-errors.jsonl'),JSON.stringify(failure)+'\n');status({lastBrowserError:failure});console.error('PAGEERROR',e);});page.on('requestfailed',r=>console.error('REQUESTFAILED',r.url(),r.failure()));
 page.on('console',message=>{const line=message.text();console.log(message.type(),line);if(line.startsWith('COMPLETE96 ')){
  try{const progress=JSON.parse(line.slice(11));const heartbeat=progress.phase?.startsWith('diagnostic-heartbeat');if(progress.phase==='diagnostic-heartbeat-error'){if(++unansweredDiagnostics>=3&&!profileRequested&&memoryObserver){profileRequested=true;void memoryObserver.profileStalledCoordinator().then(value=>fs.writeFile(path.join(directory,'coordinator-cpu-profile.json'),JSON.stringify(value,null,2)+'\n')).catch(error=>fs.writeFile(path.join(directory,'coordinator-cpu-profile-error.json'),JSON.stringify({message:error.message})+'\n'));}}else if(progress.phase==='diagnostic-heartbeat')unansweredDiagnostics=0;if(['resource-recovery','resource-terminal'].includes(progress.phase)){const key=[progress.error?.code,progress.error?.details?.allocationKind,progress.error?.details?.label,progress.error?.details?.requestedBytes,progress.phase].join(':');if(!firstAllocationSample||!allocationSampleKeys.has(key)&&Date.now()-lastMemorySample>=2000){firstAllocationSample=true;allocationSampleKeys.add(key);observeBrowserMemory('allocation:'+key);}}else if(heartbeat&&Date.now()-lastMemorySample>=30000)observeBrowserMemory('diagnostic-heartbeat');if(!progress.phase?.startsWith('diagnostic-')&&!progress.phase?.startsWith('resource-'))lastWorkEventAt=new Date().toISOString();if(progress.phase==='automatic-state')lastAutomaticState=progress.state;if(progress.phase==='resource-recovery'&&!firstRecoveryMemory){firstRecoveryMemory=memoryObservation();writeFileSync(path.join(directory,'first-recovery-host-memory.json'),JSON.stringify(firstRecoveryMemory,null,2)+'\n');}if(progress.phase==='diagnostic-partial-archive'){partialFromComplete=progress.delivery==='complete';const received=partialFromComplete?delivered:partialDelivered;partialVerified=received>0&&progress.verifiedBytes===received&&progress.byteLength===received;}appendFileSync(path.join(directory,'progress.jsonl'),JSON.stringify({at:new Date().toISOString(),...progress})+'\n');status({state:'running',phase:heartbeat?state.phase:progress.phase,...(heartbeat?{runtimeDiagnostic:progress}:{lastProgress:progress}),lastWorkEventAt,secondsSinceWorkEvent:lastWorkEventAt?(Date.now()-Date.parse(lastWorkEventAt))/1000:null,deliveredBytes:delivered,partialDeliveredBytes:partialDelivered,lastAutomaticState,...(progress.budgetBytes?{budgetBytes:progress.budgetBytes,executionCapacity:progress.executionCapacity}:{})});}catch(error){console.error('PROGRESS',error.message);}
 }});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const environment=await page.evaluate(()=>({crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer==='function',hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory,webgpuExposed:!!navigator.gpu,userAgent:navigator.userAgent}));
 if(!environment.crossOriginIsolated||!environment.sharedArrayBuffer)throw Error('Shared worker isolation unavailable');
 status({state:'running',phase:'model-configuration',browser:browser.browser().version(),environment,initialHostMemory:memoryObservation()});
 console.log('STARTED',JSON.stringify(state));observeBrowserMemory('analysis-start');
 const proof=await page.evaluate(async extensionId=>{const {testComplete96mp}=await import('/tests/m5-complete-96mp-browser.js');const resourceHints=extensionId?await (await import('/src/browser-memory.js')).readExtensionMemoryHints(extensionId):undefined;if(extensionId&&!resourceHints)throw Error('Requested memory extension unavailable');return testComplete96mp({smallPositive:false,resourceHints,memoryExtensionId:extensionId});},memoryExtensionId);
 if(delivered!==proof.archive.byteLength)throw Error('Incomplete local archive');
 await fileHandle.close();fileHandle=null;await fs.rename(part,path.join(directory,'complete.npz'));
 Object.assign(proof,binding,{browser:browser.browser().version(),environment,storageContext:'Fresh isolated Chrome profile; removed at completion',wallMs:Date.now()-started});
 await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(proof,null,2)+'\n');status({state:'completed',phase:'cleanup',passed:proof.passed,analysisMs:proof.times.analysisMs,totalMs:proof.totalMs,deliveredBytes:delivered,finishedAt:new Date().toISOString()});
 console.log('COMPLETED',JSON.stringify({passed:proof.passed,totalMs:proof.totalMs,times:proof.times,memory:proof.finalMemory}));
}catch(error){
 const failure={passed:false,interrupted,error:{message:error.message,stack:error.stack},detectorErrors:lastAutomaticState?.errors??null,automaticState:lastAutomaticState,diagnostic:state.lastProgress,firstRecoveryMemory,finalHostMemory:memoryObservation(),binding,deliveredBytes:delivered,partialArchive:{verified:partialVerified,delivery:partialFromComplete?'complete':'partial',deliveredBytes:partialFromComplete?delivered:partialDelivered},wallMs:Date.now()-started};
 await fs.writeFile(path.join(directory,'incomplete.json'),JSON.stringify(failure,null,2)+'\n');status({state:interrupted?'interrupted':'failed',phase:'cleanup',error:failure.error,finishedAt:new Date().toISOString()});console.error(error);process.exitCode=1;
}finally{
 process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
 const errors=[];if(partialVerified&&partialFromComplete&&fileHandle){try{await fileHandle.close();fileHandle=null;await fs.rename(path.join(directory,'complete.npz.part'),path.join(directory,'partial.npz'));}catch(error){errors.push(error.message);}}if(partialHandle){try{await partialHandle.close();partialHandle=null;if(partialVerified)await fs.rename(path.join(directory,'partial.npz.part'),path.join(directory,'partial.npz'));}catch(error){errors.push(error.message);}}
 for(const release of [()=>memoryObserver?.close(),()=>partialHandle?.close(),()=>fileHandle?.close(),()=>browser?.close(),()=>profile&&fs.rm(profile,{recursive:true,force:true}),()=>new Promise(resolve=>{if(!server)return resolve();server.closeAllConnections();server.close(resolve);})]){try{await release();}catch(error){errors.push(error.message);}}
 status({phase:'stopped',cleanupErrors:errors,stoppedAt:new Date().toISOString()});
}
