import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {allocateOwnedTypedArray} from '../src/allocation.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createStrictFragmentPlan,requireStrictFragmentPlan} from '../experiments/d2prl/strict-fragment-plan.js';
import {segmentedNeuralProjection} from '../src/segmented-neural-projection.js';
import {segmentedNeuralStrictProjection} from '../src/segmented-neural-strict-projection.js';
const N=448*448,SHA='a'.repeat(64),MiB=1024**2;
// These tests control only native postprocessing/interpolation components.
// Actual Wasm postprocessing and bilinear arithmetic are qualified separately.
async function fixture({width=12,height=10,acquisitions=[],holes=[],budget=new Budget(1024*MiB)}={}){
 const state=await createOriginalSourceRegionsState({sourceSha256:SHA,width,height});
 for(const b of acquisitions)await state.add('acquisition',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});
 for(const b of holes)await state.add('exclusion',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});
 const domain=await compileOriginalSourceRegions(state.snapshot()),view=await createSourceRegionView({width,height,sha256:SHA,readWindow(){throw Error('Projection must not read RGB');}},domain.descriptor,{budget});
 const plans=[],banks=[];const h={state,domain,view,budget,width,height,reads:0,releases:0,bankDisposals:0,values:f=>[.3+f.index/100,1,0],onRead:null,onPost:null,onSpatial:null};
 h.job=async(id='job',bounds=[...domain.origin,domain.origin[0]+domain.width,domain.origin[1]+domain.height],kind='region')=>{
  const plan=await createStrictFragmentPlan(view,{bounds:bounds.map((v,i)=>v-domain.origin[i%2]),jobId:id,kind,budget}),bank={planFingerprint:plan.fingerprint,async read(index,name){h.reads++;await h.onRead?.(index,name);const f=plan.fragments[index],owner=allocateOwnedTypedArray(Float32Array,N,{budget}),value=h.values(f,plan)[['union','target','source'].indexOf(name)];owner.data.fill(value);let done=false;return{data:owner.data,dtype:'float32',shape:[1,1,448,448],fragmentId:f.id,release(){if(done)return;done=true;h.releases++;owner.release();}};},dispose(){h.bankDisposals++;}};plans.push(plan);banks.push(bank);return{job:{id,kind,bounds},plan,bank};
 };
 h.postprocess={async run({raw}){await h.onPost?.();const owner=allocateOwnedTypedArray(Float32Array,N*3,{budget});owner.data.fill(1,0,N*2);return{masks:owner.data,release:owner.release};}};
 h.spatial={async run({input,width:iw,height:ih,outWidth,outHeight,nearest},{onRows,startRow=0,rowsPerBlock=outHeight}){await h.onSpatial?.();for(let y=startRow;y<outHeight;y+=rowsPerBlock){const rows=Math.min(rowsPerBlock,outHeight-y),a=new Float32Array(rows*outWidth);for(let r=0;r<rows;r++)for(let x=0;x<outWidth;x++)a[r*outWidth+x]=input[Math.min(ih-1,Math.floor((y+r+.5)*ih/outHeight))*iw+Math.min(iw-1,Math.floor((x+.5)*iw/outWidth))];await onRows(a,{y,rows});}}};
 h.project=(jobs,extra={},frame={})=>segmentedNeuralStrictProjection({width,height,jobs,candidateDomain:domain,minimum:0,...frame},{budget,postprocess:h.postprocess,spatial:h.spatial,storage:'memory',...extra});
 h.finish=async result=>{await result?.dispose();for(const p of plans)p.release();view.dispose();assert.equal(budget.total(),0);assert.equal(budget.active,0);assert.equal(h.reads,h.releases);assert.equal(h.bankDisposals,0);};return h;
}
async function field(result,key){const float=['map','target','source'].includes(key),bytes=new Uint8Array(result.width*result.height*(float?4:1));await result.stores[key].readInto(bytes,0);return float?new Float32Array(bytes.buffer):bytes;}
test('one native fragment preserves every ordinary projection field exactly and owns its geometry field',async()=>{
 const h=await fixture(),job=await h.job(),raw=Float32Array.from({length:N*3},(_,i)=>[.3,1,0][Math.floor(i/N)]);let a,b;
 try{a=await h.project([job]);b=await segmentedNeuralProjection({family:'d2prl',width:h.width,height:h.height,zones:[{id:'oracle',bounds:[0,0,h.width,h.height],raw}],side:448,mode:'whole-image',minimum:0},{budget:h.budget,spatial:h.spatial,postprocess:h.postprocess,storage:'memory'});for(const k of ['map','mask','target','source','analyzed'])assert.deepEqual(await field(a,k),await field(b,k),k);assert.ok((await field(a,'candidates')).every(v=>v===1));assert.equal(a.metadata.inference_performed,false);assert.equal(a.metrics.candidatePixels,120);assert.equal(a.metadata.zones.length,1);}finally{await b?.dispose();await h.finish(a);}
});
test('every exact native fragment is reprojected to its original coordinates and no true hole becomes a candidate or context',async()=>{
 const h=await fixture({holes:[[4,3,8,7]]}),job=await h.job('holes');let a;
 try{assert.equal(job.plan.fragments.length,4);a=await h.project([job]);const c=await field(a,'candidates'),m=await field(a,'map'),observed=await field(a,'analyzed');for(let y=0;y<h.height;y++)for(let x=0;x<h.width;x++){const at=y*h.width+x,allowed=h.domain.containsOriginal(x,y);assert.equal(c[at],+allowed);assert.equal(observed[at],+allowed);assert.equal(m[at]>0,allowed);}assert.equal(a.metrics.fragments,4);assert.equal(a.metrics.candidatePixels,104);}finally{await h.finish(a);}
});
test('acquisitions and encompassing job stay separate; declared context gaps are analyzed but not candidate observations',async()=>{
 const h=await fixture(),candidateState=await createOriginalSourceRegionsState({sourceSha256:SHA,width:h.width,height:h.height});await candidateState.add('acquisition',{x0:1,y0:1,x1:4,y1:9});await candidateState.add('acquisition',{x0:8,y0:1,x1:11,y1:9});const candidateDomain=await compileOriginalSourceRegions(candidateState.snapshot()),jobs=[await h.job('left',[1,1,4,9]),await h.job('right',[8,1,11,9]),await h.job('comparison',[1,1,11,9],'envelope')];h.values=(f,p)=>[p.kind==='envelope'?.8:.3,1,0];let a;
 try{a=await h.project(jobs,{}, {candidateDomain});assert.equal(a.metadata.zones.length,3);assert.equal(a.metrics.jobs,3);assert.equal(a.metrics.analyzedPixels,80);assert.equal(a.metrics.candidatePixels,48);const map=await field(a,'map'),c=await field(a,'candidates'),v=await field(a,'analyzed');assert.equal(map[5*h.width+5],0);assert.equal(c[5*h.width+5],0);assert.equal(v[5*h.width+5],1);assert.equal(map[5*h.width+2],Math.fround(.8));}finally{await h.finish(a);}
});
test('nonzero output origin is translated exactly once, including a one-pixel fragment and long caller IDs',async()=>{
 const h=await fixture({width:20,height:16,acquisitions:[[7,5,8,6]]}),job=await h.job('a'.repeat(128));let a;
 try{a=await h.project([job],{}, {width:1,height:1,origin:[7,5]});assert.deepEqual([...await field(a,'map')],[Math.fround(.3)]);assert.deepEqual(a.metadata.zones[0].bounds,[0,0,1,1]);assert.deepEqual(a.metadata.zones[0].originalBounds,[7,5,8,6]);assert.equal(a.metadata.zones[0].fragments[0].id.length>128,true);requireStrictFragmentPlan(job.plan);}finally{await h.finish(a);}
});
for(const broken of ['source','plan','job','frame','duplicate'])test('rejects forged '+broken+' without consuming caller owners',async()=>{
 const h=await fixture(),job=await h.job();const baseline=h.budget.total();let list=[job],frame={};if(broken==='source')frame.candidateDomain={...h.domain,fingerprint:'b'.repeat(64)};if(broken==='plan')list=[{...job,plan:{...job.plan}}];if(broken==='job')list=[{...job,job:{...job.job,bounds:[1,0,12,10]}}];if(broken==='frame')frame={width:11};if(broken==='duplicate')list=[job,job];try{await assert.rejects(h.project(list,{},frame),{code:'INVALID_INPUT'});assert.equal(h.budget.total(),baseline);assert.equal(h.reads,0);requireStrictFragmentPlan(job.plan);}finally{await h.finish();}
});
test('refuses missing candidate coverage instead of silently returning an incomplete image',async()=>{
 const h=await fixture(),job=await h.job('incomplete',[0,0,3,3]),baseline=h.budget.total();try{await assert.rejects(h.project([job]),/no projected native context/);assert.equal(h.budget.total(),baseline);requireStrictFragmentPlan(job.plan);}finally{await h.finish();}
});
test('rejects nonfinite bank data and releases the read lease, raw concat and all partial stores',async()=>{
 const h=await fixture(),job=await h.job(),baseline=h.budget.total();h.values=()=>[NaN,1,0];try{await assert.rejects(h.project([job]),{code:'INVALID_INPUT'});assert.equal(h.budget.total(),baseline);assert.equal(h.reads,1);assert.equal(h.releases,1);}finally{await h.finish();}
});
for(const phase of ['read','postprocess','spatial','progress'])test('cancellation during '+phase+' retires only the attempted projection and preserves its plan/bank',async()=>{
 const h=await fixture(),job=await h.job(),controller=new AbortController(),baseline=h.budget.total();let options={signal:controller.signal};if(phase==='read')h.onRead=()=>controller.abort();if(phase==='postprocess')h.onPost=()=>controller.abort();if(phase==='spatial')h.onSpatial=()=>controller.abort();if(phase==='progress')options.onProgress=()=>controller.abort();try{await assert.rejects(h.project([job],options),{code:'CANCELLED'});assert.equal(h.budget.total(),baseline);requireStrictFragmentPlan(job.plan);}finally{await h.finish();}
});
test('native postprocess failure is preserved while already owned fields and concat are released',async()=>{
 const h=await fixture(),job=await h.job(),baseline=h.budget.total();h.onPost=()=>{throw Object.assign(new Error('native rejected'),{code:'NATIVE_FAILURE'});};try{await assert.rejects(h.project([job]),{code:'NATIVE_FAILURE'});assert.equal(h.budget.total(),baseline);assert.equal(h.reads,3);}finally{await h.finish();}
});
test('admission refusal publishes no result and keeps existing plans intact',async()=>{
 const h=await fixture({budget:new Budget(128*MiB)}),job=await h.job(),baseline=h.budget.total();try{await assert.rejects(h.project([job]),{code:'MEMORY_LIMIT'});assert.equal(h.budget.total(),baseline);assert.equal(h.reads,0);}finally{await h.finish();}
});
test('more than 256 real signed tiny jobs survive without truncation or native-grid reduction',async()=>{
 const h=await fixture({width:1,height:1}),jobs=[];for(let i=0;i<257;i++)jobs.push(await h.job('job-'+i));let a;
 try{a=await h.project(jobs);assert.equal(a.metadata.zones.length,257);assert.equal(a.metrics.fragments,257);assert.equal(a.metrics.jobs,257);assert.ok(a.metadata.zones.every(z=>z.fragments.length===1&&z.fragments[0].modelGrid[0]===448));assert.equal(h.reads,257*3);assert.deepEqual([...await field(a,'candidates')],[1]);}finally{await h.finish(a);}
});
test('composition max preserves earlier job fields when a later independent job is empty',async()=>{
 const h=await fixture(),jobs=[await h.job('first'),await h.job('second')];h.values=(f,p)=>[p.jobId==='first'?.7:.1,1,0];let a;
 try{a=await h.project(jobs);assert.ok((await field(a,'map')).every(v=>v===Math.fround(.7)));assert.equal(a.metrics.jobs,2);}finally{await h.finish(a);}
});
test('caller job mutations after verification begins do not alter signed projection geometry or labels',async()=>{
 const h=await fixture(),job=await h.job(),pending=h.project([job]);job.job.bounds[0]=3;job.job.id='changed';let a;
 try{a=await pending;assert.deepEqual(a.metadata.zones[0].originalBounds,[0,0,12,10]);assert.equal(a.metadata.zones[0].id,'job');}finally{await h.finish(a);}
});
