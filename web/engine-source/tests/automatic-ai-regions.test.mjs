import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {automaticAiBoxes,automaticAiSelection,automaticD2prlRequest,readAutomaticForgeryscopeCrop} from '../src/automatic-ai-regions.js';import {automaticAnalysisPlan} from '../src/automatic-analysis-plan.js';import {analyzeAutomaticForgeryscope} from '../src/automatic-forgeryscope.js';
const reference=JSON.parse(await readFile(new URL('./data/automatic-ai-native.json',import.meta.url))),sha=a=>createHash('sha256').update(a).digest('hex');
const rgb=(width,height)=>({width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>((Math.floor(i/3)%width)*17+Math.floor(i/(width*3))*31+i%3*43)%256)});
test('native half-open boxes and blackened crops preserve original RGB',async()=>{
 for(const c of reference.cases){const budget=new Budget(1024**2),image=rgb(c.width,c.height),original=sha(image.data),params={regions:c.regions,excluded:c.excluded,compare:false};
  if(c.invalid){assert.throws(()=>automaticAiSelection(c.width,c.height,params),{code:'INVALID_INPUT'});continue;}
  const selection=automaticAiSelection(c.width,c.height,params);assert.deepEqual(selection,{boxes:c.boxes,excluded:c.excludedBoxes},c.name);
  for(let i=0;i<c.boxes.length;i++){const crop=await readAutomaticForgeryscopeCrop(image,c.boxes[i],c.excludedBoxes,{budget});assert.equal(sha(crop.pixels.data),c.crops[i].sha256,c.name);assert.deepEqual(crop.exclusions,c.crops[i].local);crop.release();}
  assert.equal(sha(image.data),original);assert.equal(budget.total(),0);
 }
});
test('D2PRL receives only native rectangles and output exclusions; disabled jobs have no request',()=>{
 const c=reference.cases[1],regions=[...c.regions,...c.excluded],plan=automaticAnalysisPlan({...c,regions,envelope:c.regions[0],disabled:[1],cpu:true,d2Minimum:113});
 const task=automaticD2prlRequest(plan,{id:'task',imageId:'source'});assert.deepEqual(task.params,{minimum:113,exclusions:c.excludedBoxes,selectionPresent:true});assert.deepEqual(task.regions[0].bounds,c.boxes[0]);assert.equal(task.backend,'cpu');
 assert.equal(automaticD2prlRequest(automaticAnalysisPlan({...c,regions,disabled:[0,1]}),{id:'task',imageId:'source'}),null);
 assert.throws(()=>automaticAiSelection(10,10,{regions:[],excluded:[],compare:false,selection_present:true}),{code:'INVALID_INPUT'});assert.deepEqual(automaticAiBoxes(1,2,[]),[[0,0,1,2]]);
});
test('real analyzer boundary releases crops and partial outputs on failure, cancellation and invalid result',async()=>{
 const c=reference.cases[1],plan=automaticAnalysisPlan({...c,envelope:c.regions[0]}),image=rgb(c.width,c.height);
 for(const failure of ['throw','cancel','shape']){const budget=new Budget(1024**2),controller=new AbortController();let calls=0,dropped=0;
  const analyzer={async analyze(crop,params,options){calls++;assert.equal(params.profile,'auto');assert.equal(crop.width,c.boxes[0][2]-c.boxes[0][0]);if(failure==='throw')throw Error('inference failed');if(failure==='cancel')controller.abort();return {release(){dropped++;}};}};
  await assert.rejects(analyzeAutomaticForgeryscope(image,plan,{analyzer,budget,signal:controller.signal}),failure==='throw'?/inference failed/:{code:failure==='cancel'?'CANCELLED':'INVALID_INPUT'});assert.equal(calls,1);assert.equal(dropped,failure==='throw'?0:1);assert.equal(budget.total(),0);
 }
 const budget=new Budget(1024**2),disabled=automaticAnalysisPlan({...c,envelope:c.regions[0],disabled:[0]});const result=await analyzeAutomaticForgeryscope(image,disabled,{budget,analyzer:{analyze(){throw Error('must not execute');}}});assert.equal(result.status,'disabled');result.release();assert.equal(budget.total(),0);
});
