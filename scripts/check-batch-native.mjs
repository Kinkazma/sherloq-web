// Opt-in native checks: real workers and local model files, potentially expensive.
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.SHERLOQ_PLAYWRIGHT?pathToFileURL(process.env.SHERLOQ_PLAYWRIGHT).href:'playwright');
const root=process.env.SHERLOQ_BATCH_TEST_ROOT,mode=process.argv[2]??'decode';
if(!root)throw Error('Set SHERLOQ_BATCH_TEST_ROOT to a generated fixture directory.');
const base=process.env.SHERLOQ_BATCH_BASE??'http://127.0.0.1:8097/wp-content/plugins/sherloq-browser/assets/';
const browser=await chromium.launch({headless:true,...(process.env.SHERLOQ_CHROME?{executablePath:process.env.SHERLOQ_CHROME}:{})}),page=await browser.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.text().startsWith('BATCH:'))console.log(message.text());});
try{
 await page.goto(base+'app.html#lang=fr');await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true',null,{timeout:60000});
 const output=await page.evaluate(async({mode,backend})=>{
  const {createBatchImporter}=await import('./batch-import.js'),{createBatchRunner}=await import('./batch-runner.js'),{catalogRecipe,batchCatalog}=await import('./batch-catalog.js');
  const model=await createBatchImporter(),add=async(url,name)=>{const response=await fetch(url);if(!response.ok)throw Error('Fixture unavailable: '+url);await model.import([new File([await response.blob()],name)]);};
  if(mode==='decode'){
   await add('/__batch_fixtures__/acquisition.tiff','acquisition.tiff');
   await model.import([new File(['invalid PDF'],'invalid.pdf')]);
   return {images:model.images.map(i=>({width:i.width,height:i.height,hash:i.hash,encoding:i.encoding})),errors:model.errors};
  }
  if(mode==='compare'){
   await add('/__batch_examples__/spiral/original.png','original.png');await add('/__batch_examples__/spiral/edited.png','edited.png');
  }else if(mode==='ai.clones.d2prl')await add('/__batch_examples__/microscopy/input.png','input.png');
  else await add('/__batch_fixtures__/acquisition.jpg','acquisition.jpg');
  if(model.errors.length)throw Error(JSON.stringify(model.errors));
  for(const i of model.images){i.family=mode==='ai.clones.d2prl'?'microscopy':'photography';}for(const s of model.studies)s.manualMarked=true;
  const recipe=['compare','dense'].includes(mode)?catalogRecipe(batchCatalog.find(r=>r.params.algorithm===(mode==='dense'?'PatchMatch Zernike':'SIFT + G2NN + RANSAC')).id):catalogRecipe(mode==='cancel'?'tampering.copyMove.brisk':mode);
  if(mode==='compare')recipe.params.limit=2000;if(mode==='ai.clones.d2prl')recipe.params.minimum=10;recipe.backend=backend;
  let runner,timer;runner=createBatchRunner({onProgress:event=>{if(event.phase!=='kernel')console.log('BATCH: '+event.phase);if(mode==='cancel'&&event.phase==='tool')timer=setTimeout(()=>runner.cancel(),200);}});
  try{
   await runner.run(model,[recipe],{threshold:1,basis:'total',panels:false,compare:mode==='compare'});
   return {cancelled:model.cancelled,results:model.results.map(s=>({status:s.status,score:s.score})),images:model.images.map(i=>({state:i.state,score:i.score,runs:i.runs.map(r=>({status:r.status,entries:r.entries?.length,error:r.error,recovery:r.recovery,files:r.files}))})),comparisons:(model.comparisons??[]).map(p=>({kind:p.kind,status:p.status,entries:p.entries?.length,error:p.message})),artifactBytes:[...model.artifacts.values()].reduce((n,b)=>n+b.size,0)};
  }finally{clearTimeout(timer);await runner.clear();}
 },{mode,backend:process.env.SHERLOQ_TEST_BACKEND??'auto'});
 await fs.writeFile(root+'/native-'+mode.replaceAll('.','-')+'.json',JSON.stringify({mode,output,errors},null,2));
 console.log(JSON.stringify({mode,output,errors},null,2));assert.equal(errors.length,0);
 if(mode==='decode'){assert.equal(output.images.length,1);assert.equal(output.images[0].width,480);assert.equal(output.errors.length,1);}
 else if(mode==='cancel'){assert.equal(output.cancelled,true);assert.equal(output.results[0].status,'incomplete');}
 else {assert.ok(output.images.every(i=>i.runs.every(r=>r.status==='done')));if(mode==='compare')assert.ok(output.comparisons.some(p=>p.entries>0));}
}finally{await browser.close();}
