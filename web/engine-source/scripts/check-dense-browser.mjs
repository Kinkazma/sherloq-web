import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>M4 dense validation</title>');return;}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const proof=await page.evaluate(async()=>{
  const {Budget}=await import('/src/cache.js'),{DenseFieldPool}=await import('/src/dense-pool.js');
  const {densePassPlan,DENSE_PROFILES}=await import('/src/dense-profiles.js');
  const {createDenseMath}=await import('/src/dense-math.js');
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const width=59,height=49,gray=new Float32Array(width*height);for(let i=0;i<gray.length;i++)gray[i]=(i*37+i%17*23)%256;
  const plan=densePassPlan(DENSE_PROFILES[5],{width,height});
  const jobs=plan.passes.map(pass=>{const support=pass.method?3*Math.max(pass.patch,pass.targetPatch):0;return {gray,width,height,pass,mask:new Uint8Array((width-support)*(height-support)).fill(1),context:{id:'roi:0',pairSearchRegion:0},options:{radius:30,minimum:4,iterations:2},coherence:{radius:3,minimum:6}};});
  const budget=new Budget(512*1024**2),pool=new DenseFieldPool(budget,{maxWorkers:2}),progress=[];
  const start=performance.now(),answer=await pool.run(jobs,{onProgress:p=>progress.push(p)});
  assert(answer.results.length===11,'all useful hypotheses');assert(answer.metrics.workers===2,'two admitted workers');assert(answer.metrics.preflightExecutions===0,'no preflight');
  assert(answer.results.every((r,i)=>r.pass.id===i&&r.context.id==='roi:0'),'ordered provenance');assert(jobs.every(j=>j.mask.every(v=>v===1)),'borrowed mask remains intact');
  assert(budget.active===answer.metrics.outputBytes,'only retained outputs remain reserved');
  const kernel=await createDenseMath({print:()=>{}}),a=kernel.features(gray,width,height,{method:0,patch:8}),direct=kernel.field(a.first,a.second,jobs[0].mask,width,height,jobs[0].options);
  assert(direct.targets.every((t,i)=>t===answer.results[0].targets[i]),'worker vs direct field');
  const sizes=answer.results.map(r=>[r.width,r.height]);answer.release();assert(budget.total()===0,'output release');
  const controller=new AbortController();let cancellation=null;
  const pending=pool.run(jobs,{signal:controller.signal,onProgress:()=>controller.abort()});
  try{await pending;}catch(error){cancellation=error.code;}
  assert(cancellation==='CANCELLED','mid-job cancellation');assert(budget.total()===0,'cancel releases all reservations');
  let refused=null;try{await new DenseFieldPool(new Budget(1),{maxWorkers:2}).run(jobs);}catch(error){refused=error.code;}
  assert(refused==='MEMORY_LIMIT','budget refusal before launch');
  const smallBudget=new Budget(1024*1024),smallPool=new DenseFieldPool(smallBudget,{maxWorkers:2});
  try{await smallPool.run(jobs);throw Error('expected workspace refusal');}catch(error){assert(error.code==='MEMORY_LIMIT','workspace refusal');}
  assert(smallBudget.total()===0,'workspace refusal releases output reservation');smallPool.dispose();
  const badGray=gray.slice();badGray[0]=NaN;
  try{await pool.run([{...jobs[0],gray:badGray},jobs[1]]);throw Error('expected worker error');}catch(error){assert(error.code==='INVALID_INPUT','worker source error');}
  assert(budget.total()===0,'worker error settles siblings and releases budget');pool.dispose();
  const {DenseImageEngine}=await import('/src/dense-image.js');
  const rgb=new Uint8Array(width*height*3);for(let i=0;i<rgb.length;i++)rgb[i]=(i*19+i%13*3)%256;
  const imageBudget=new Budget(512*1024**2),engine=new DenseImageEngine({width,height,data:rgb},imageBudget,{maxWorkers:2});
  const polygon=[[0,0],[58,0],[58,48],[0,48]],settings={profile:DENSE_PROFILES[5],regions:[polygon,polygon],iterations:2};
  const first=await engine.analyze(settings);assert(first.fields.length===22,'all hypotheses in both independent searches');
  const events=[],second=await engine.analyze({...settings,threshold:.25,errorThreshold:2},{onProgress:p=>events.push(p)});
  assert(second.metrics.cache.field&&events.every(p=>!p.phase.includes('descriptors')),'refilter never recomputes descriptors');
  assert(first.fields.every((f,i)=>f.context.id===second.fields[i].context.id&&f.targets.every((v,j)=>v===second.fields[i].targets[j])),'refilter preserves raw field and context');
  assert(first.fields[0].context.id!==first.fields[1].context.id,'coincident searches stay separate');
  engine.dispose();assert(imageBudget.total()>0,'returned fields outlive controller');first.release();second.release();assert(imageBudget.total()===0,'all output leases released');
  return {browser:navigator.userAgent,passes:11,imageControllerFields:22,refilterWithoutDescriptors:true,sizes,metrics:answer.metrics,progressEvents:progress.length,completed:progress.filter(p=>p.phase==='complete').length,cancellation,budgetAfterRelease:budget.snapshot(),milliseconds:performance.now()-start};
 });
 assert.equal(proof.completed,11);await fs.writeFile(new URL('../docs/dense-browser-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
