import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareNeuralStrictSourceContext} from '../src/neural-strict-source-context.js';
import {planStrictD2Jobs,createStrictD2JobPlans} from '../experiments/d2prl/strict-job-plan.js';
const sha='a'.repeat(64),box=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
async function setup({explicitEnvelope=false,mode='independent'}={}){
 const budget=new Budget(256*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:64,height:48});
 for(const b of [[2,3,25,40],[40,8,60,46]])await state.add('acquisition',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});
 await state.add('exclusion',{x0:10,y0:10,x1:16,y1:18});
 const domain=await compileOriginalSourceRegions(state.snapshot()),task={operation:'ai.clones.d2prl',imageId:'fixture-original',cloneWindowMode:mode,params:{minimum:500},...(explicitEnvelope?{regions:[{id:'first-window',kind:'region',bounds:[2,3,25,40]},{id:'second-window',kind:'region',bounds:[40,8,60,46]},{id:'declared-envelope',kind:'envelope',bounds:[2,3,60,46]}]}:{})};
 const context=await prepareNeuralStrictSourceContext({domain,task},{budget});return{budget,context,close(){context.release();assert.equal(budget.total(),0);}};
}
test('default D2 jobs contain only the selected acquisitions; a bounding box is not a declared envelope',async()=>{const h=await setup();let ledger;try{ledger=await planStrictD2Jobs(h.context,{budget:h.budget});assert.deepEqual(ledger.jobs.map(j=>j.kind),['region','region']);assert.deepEqual(ledger.jobs.map(j=>j.bounds),[[2,3,25,40],[40,8,60,46]]);}finally{ledger?.release();h.close();}});
test('an explicit D2 envelope remains its own native job; RGB within each job is admitted before input',async()=>{const h=await setup({explicitEnvelope:true}),reads=[];let planned;try{planned=await createStrictD2JobPlans(h.context,{width:64,height:48,sha256:sha,async readWindow(r){for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)assert.ok(!(x>=10&&x<16&&y>=10&&y<18));reads.push(r);return{pixels:{format:'rgb8',width:r.width,height:r.height,data:new Uint8Array(r.width*r.height*3)},release(){}};}},{budget:h.budget});assert.deepEqual(planned.jobs.map(j=>j.job.id),['first-window','second-window','declared-envelope']);for(const {plan}of planned.jobs)for(const f of plan.fragments){assert.equal(f.modelSide,448);const input=plan.input(f.index),lease=await input.readRows(0,input.height);lease.release();}assert.ok(reads.length>3);assert.ok(planned.jobs[2].plan.fragments.some(f=>f.originalBounds[0]<=30&&f.originalBounds[2]>30));}finally{planned?.release();h.close();}});
