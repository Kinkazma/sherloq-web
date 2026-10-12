// Private, fresh headless context/random loopback port; no user browser/server.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const resources=resolve(process.argv[2]),backend=process.argv[3]??'cpu',threads=Number(process.argv[4]??10),engine=resolve(fileURLToPath(new URL('../',import.meta.url)));
const {chromium}=await import(process.env.SHERLOQ_PLAYWRIGHT_MODULE??'playwright');
const source=JSON.parse(await readFile(resolve(resources,'superpoint-window-export.json'),'utf8')),folded=JSON.parse(await readFile(resolve(resources,'superpoint-window-folded.json'),'utf8'));
let failPost=false;const server=createServer(async(req,res)=>{try{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Native SuperPoint dense windows</title>');return;}
 if(name==='/favicon.ico'){res.statusCode=204;res.end();return;}
 if(name==='/fail-post'){failPost=true;res.statusCode=204;res.end();return;}
 if(failPost&&name==='/resources/onnx/superpoint-post-folded.onnx'){failPost=false;res.statusCode=503;res.end('Intentional qualification-only late graph outage');return;}
 const base=name.startsWith('/resources/')?resources:engine,relative=name.startsWith('/resources/')?name.slice(11):name.startsWith('/engine-source/')?name.slice(15):name.slice(1),file=resolve(base,relative);
 if(!file.startsWith(base+sep))throw Error('Outside qualification roots');
 res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,report;const errors=[],consoleErrors=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',value=>{if(value.text().startsWith('SP_WINDOW '))console.log(value.text());else if(value.type()==='error')consoleErrors.push(value.text());});await page.goto('http://127.0.0.1:'+server.address().port);
 report=await page.evaluate(async({source,folded,backend,threads})=>{
  const {NeuralGraphPool}=await import('/src/neural-graph-pool.js'),{Budget}=await import('/src/cache.js'),{getExecutionScheduler}=await import('/src/execution-scheduler.js'),{selfDMProposalRuntimes}=await import('/src/selfdm-proposal-assets.js'),{runProposalPointWindows}=await import('/src/selfdm-proposal-point-window.js');
  const budget=new Budget(3*1024**3),scheduler=getExecutionScheduler(budget,{maxWorkers:threads}),assets=Object.fromEntries(folded.records.map((spec,i)=>[i===0?'superpoint':'superpoint-post',{...spec,url:new URL('/resources/onnx/'+spec.file.split('/').at(-1),location.href).href,graphOptimizationLevel:'disabled',wasmMaximumBytes:2*1024**3,gpuWasmWorkspaceBytes:128*1024**2}]));
  const pool=new NeuralGraphPool(budget,{maxWorkers:threads},{assets,runtimes:selfDMProposalRuntimes(),resourceOwner:'sp-window-qualification',workerFactory:()=>new Worker('/scripts/efficient-loftr-qualification-gpu-worker.mjs',{type:'module'})});
  const records=[],stages=[];let recovery,result,current;
  const fetchFloats=async name=>new Float32Array(await(await fetch('/resources/superpoint-window-fixtures/'+name)).arrayBuffer());
  const runGraph=async(name,inputs,workspaceBytes,outputBytes,details={})=>{
   const result=await pool.run(name,inputs,{backend,workspaceBytes,outputBytes,gpuWasmWorkspaceBytes:details.gpuWasmWorkspaceBytes??assets[name].gpuWasmWorkspaceBytes});
   stages.push({case:current,stage:name,...details,...result.metrics,heapBytes:result.heapBytes,timings:result.timings,...(result.qualificationGpu?{qualificationGpu:result.qualificationGpu}:{})});return result;
  };
  const alignment=(candidate,native)=>{
   const expected=new Map(),n=native.scores.length,m=candidate.scores.data.length;for(let i=0;i<n;i++)expected.set(native.keypoints[i*2]+','+native.keypoints[i*2+1],i);
   let common=0,scoresMaxAbs=0,descriptorsMaxAbs=0,orderedExact=n===m;
   for(let i=0;i<m;i++){const key=candidate.keypoints.data[i*2]+','+candidate.keypoints.data[i*2+1],j=expected.get(key);if(j===undefined){orderedExact=false;continue;}common++;orderedExact&&=j===i;scoresMaxAbs=Math.max(scoresMaxAbs,Math.abs(candidate.scores.data[i]-native.scores[j]));for(let c=0;c<256;c++)descriptorsMaxAbs=Math.max(descriptorsMaxAbs,Math.abs(candidate.descriptors.data[c*m+i]-native.descriptors[c*n+j]));}
   return {nativeCount:n,candidateCount:m,common,missing:n-common,added:m-common,orderedExact,scoresMaxAbs,descriptorsMaxAbs};
  };
  try{
   for(const fixture of source.windowCases){
    current=fixture.name;const {width,height}=fixture,gray=await fetchFloats(current+'-image.bin'),native={};for(const name of ['keypoints','scores','descriptors'])native[name]=await fetchFloats(current+'-'+name+'.bin');
    const cacheKey='sp/'+current,run=()=>runProposalPointWindows({gray,width,height,budget,cacheKey,runGraph,maxWorkers:threads,onProgress:value=>console.log('SP_WINDOW '+JSON.stringify({case:current,...value}))}),at=performance.now(),before=stages.length;
    if(current==='superpoint-2000x1500'){
     for(const slot of [...pool.slots])if(!slot.busy)pool.drop(slot);await fetch('/fail-post');let failure;
     try{result=await run();}catch(error){failure=error;}
     if(result){result.release();result=null;throw Error('Late HTTP refusal did not occur');}
     const chain=[];for(let error=failure;error;error=error.cause)chain.push({code:error.code,message:error.message,details:error.details});if(!chain.some(error=>error.code==='ASSET_HTTP'&&error.details.status===503))throw Error('Late HTTP cause lost');
     const checkpoint=budget.get(cacheKey);if(!checkpoint?.value.done.every(value=>value===1))throw Error('Consumed windows missing from checkpoint');const retryBefore=stages.length;
     result=await run();recovery={chain,retriedStages:stages.slice(retryBefore).map(value=>value.stage),consumedWindows:fixture.tileCount};if(JSON.stringify(recovery.retriedStages)!=='["superpoint-post"]')throw Error('Late retry replayed dense CNN');
    }else result=await run();
    const parity=alignment(result.result,native);records.push({case:current,width,height,elapsedMs:performance.now()-at,...parity,stages:stages.slice(before),budget:budget.snapshot(),pool:pool.snapshot()});result.release();result=null;
   }
  }catch(error){return {status:'failed',error:{code:error.code,message:error.message,details:error.details,stack:error.stack,cause:error.cause},records,stages,recovery};}
  finally{result?.release();pool.dispose();budget.clearPrefix('sp/');}
  const released=budget.total()===0&&scheduler.snapshot().active.cpu===0&&scheduler.snapshot().active.gpu===0&&scheduler.snapshot().queued===0;
  return {status:records.every(value=>value.missing===0&&value.added===0&&value.scoresMaxAbs<.0001&&value.descriptorsMaxAbs<.0001)&&released?'superpoint-native-windows-qualified':'parity-or-ownership-failed',backend,threads,records,recovery,released,budget:budget.snapshot(),resources:budget.resourceSnapshot(),scheduler:scheduler.snapshot()};
 },{source,folded,backend,threads});report.browser=browser.version();report.pageErrors=errors;report.consoleErrors=consoleErrors;report.models=folded.records;report.sourceSha256=createHash('sha256').update(await readFile(resolve(engine,'src/selfdm-proposal-point-window.js'))).digest('hex');
 await writeFile(resolve(resources,'superpoint-window-browser-'+backend+'-'+threads+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,released:report.released,records:report.records?.map(({stages,...value})=>({...value,stages:stages.length})),recovery:report.recovery,pageErrors:errors,consoleErrorCount:consoleErrors.length}));if(report.status!=='superpoint-native-windows-qualified')process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
