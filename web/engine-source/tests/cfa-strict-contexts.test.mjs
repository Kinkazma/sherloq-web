import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cfaFixture} from './helpers/cfa-strict-fixture.mjs';
import {cfaPostprocess} from '../src/cfa-postprocess.js';
import {postprocessCfaStrictContexts,cfaStrictParameters} from '../src/cfa-strict-contexts.js';
import {renderResearch} from '../src/research-render.js';
import {cfaStrictNpzEntries} from '../src/cfa-strict-npz.js';
import {nativeContextEvaluationNotice} from '../../wordpress/sherloq-browser/assets/native-context-evaluation-ui.js';

test('a single even-origin native context preserves all native arrays and unchanged parameters',async()=>{
 const f=await cfaFixture();let r,native;try{r=await f.run({variant:'JPEG 95',block:8,tile:32});const d=r.data,context=d.metadata.fragments[0],crop={...f.image,surface:{descriptor:{...f.image.surface.descriptor,width:96,height:80},readWindow:(...args)=>f.image.surface.readWindow(...args)}};native=await f.native.analyze(crop,{variant:'JPEG 95',block:8,tile:32},{signal:new AbortController().signal});
  assert.deepEqual(d.probabilities,native.data.probabilities);assert.deepEqual(d.native_local_grid,native.data.local_grid);assert.deepEqual(d.native_suspicion,native.data.suspicion);const expected=cfaPostprocess(d.probabilities,d.cellCount);
  assert.deepEqual(d.grids,expected.grids);assert.deepEqual(d.native_grids,expected.grids);assert.deepEqual(d.local_grid,expected.local);assert.deepEqual(d.suspicion,expected.suspicion);assert.equal(context.phase,0);assert.deepEqual(f.calls[0].params,{variant:'JPEG 95',block:8,tile:32});assert.equal(r.provenance.modelPhaseQualification,'pending-real-model');assert.equal(f.windows.size,0);
 }finally{native?.release();r?.release();await f.close();assert.equal(f.budget.snapshot().activeReservationBytes,0);}
});
test('Original offset parity, not domain-local zero, aligns native grid votes',async()=>{
 const f=await cfaFixture({rectangles:[[3,5,99,85]]});let r;try{r=await f.run();const d=r.data,n=d.cellCount,post=cfaPostprocess(d.probabilities,n),aligned=new Float32Array(d.probabilities.length);assert.equal(d.metadata.fragments[0].phase,3);assert.equal(d.metadata.best_grid,post.best^3);for(let k=0;k<4;k++)assert.deepEqual(d.grids.subarray(k*n,(k+1)*n),post.grids.subarray((k^3)*n,((k^3)+1)*n));for(let row=0;row<4;row++)for(let c=0;c<4;c++)aligned.set(d.probabilities.subarray(((row^3)*4+c)*n,((row^3)*4+c+1)*n),(row*4+c)*n);const oracle=cfaPostprocess(aligned,n);assert.deepEqual(d.suspicion,oracle.suspicion);assert.deepEqual(d.local_grid,oracle.local);assert.deepEqual(d.native_suspicion,post.suspicion);
  // Equal maxima retain the native global class-order rule. Rephasing a
  // separately decided local argmax would change that tie policy.
  assert.notDeepEqual(d.suspicion,d.native_suspicion);
 }finally{r?.release();await f.close();}
});
test('the global native vote is population-weighted and is not independent per-context suspicion',()=>{
 const fragments=[{offset:0,count:3,phase:0},{offset:3,count:1,phase:1}],n=4,p=new Float32Array(16*n);
 for(let i=0;i<3;i++)for(let c=0;c<4;c++)p[(c*4+c)*n+i]=.9;
 // Fragment 1 predicts local grid3 -> Original grid2; it must not decide its own authenticity.
 for(let c=0;c<4;c++)p[((3^c)*4+c)*n+3]=.8;
 const post=postprocessCfaStrictContexts(p,fragments,n);assert.equal(post.best,0);assert.equal(post.local[3],2);assert(Math.abs(post.suspicion[3]-.8)<1e-6);assert(Math.abs(post.means[0]-.675)<1e-6);assert(Math.abs(post.means[2]-.2)<1e-6);assert.equal(post.means[1],0);assert.equal(post.means[3],0);
});
test('a hole is excluded before all native RGB reads; changing excluded RGB cannot affect any field',async()=>{
 const options={rectangles:[[3,5,99,85]],exclusions:[[35,29,43,53]]},a=await cfaFixture({...options,poison:0}),b=await cfaFixture({...options,poison:255});let ar,br;try{ar=await a.run();br=await b.run();for(const key of['probabilities','native_grids','native_local_grid','native_suspicion','grids','local_grid','suspicion'])assert.deepEqual(ar.data[key],br.data[key],key);assert(ar.data.metadata.fragments.length>1);for(const f of ar.data.metadata.fragments)for(let y=f.rect.y;y<f.rect.y+f.rect.height;y++)for(let x=f.rect.x;x<f.rect.x+f.rect.width;x++)assert(a.domain.contains(x,y));assert.equal(a.windows.size,0);assert.equal(a.held.size,0);}finally{ar?.release();br?.release();await a.close();await b.close();}
});
test('small fragments remain explicit, never lower the requested CFA block, and do not suppress larger fragments',async()=>{
 const f=await cfaFixture({rectangles:[[0,0,48,48],[70,0,75,48]]});let r;try{r=await f.run({variant:'Original',block:32,tile:512});assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.block,32);assert.equal(r.data.metadata.fragments.length,2);assert.equal(r.data.metadata.fragments.find(f=>!f.count).status,'not-evaluable');assert.equal(r.data.metadata.fragments.find(f=>!f.count).minimumSide,40);assert(r.data.metadata.nonEvaluatedSelectedPixels>0);}finally{r?.release();await f.close();}
});
test('all-small contexts have no fabricated CFA scores and all views retain Original',async()=>{
 const f=await cfaFixture({rectangles:[[3,5,8,45]]});let r;try{r=await f.run();assert.equal(f.calls.length,0);assert.equal(r.data.cellCount,0);assert.equal(r.data.metadata.best_grid,null);for(const mode of[0,1,2]){const frame=await f.api.render(f.image,r,mode),source=await f.image.surface.readWindow({x:3,y:5,width:5,height:40});try{assert.deepEqual(frame.data,source.pixels.data);}finally{frame.release();source.release();}}assert.equal(f.windows.size,0);}finally{r?.release();await f.close();}
});
test('three rendered modes match the existing native renderer for a complete even-origin context',async()=>{
 const f=await cfaFixture({rectangles:[[0,0,48,48]]});let r;try{r=await f.run();for(const mode of[0,1,2]){const source=await f.image.surface.readWindow({x:0,y:0,width:48,height:48}),actual=await f.api.render(f.image,r,mode);let expected;try{expected=await renderResearch(source.pixels,{suspicion:r.data.suspicion,local_grid:r.data.local_grid,metadata:{method:'adaptive_cfa',block:8,origin:[4,4],valid_shape:[40,40]}},mode,{budget:f.budget});assert.deepEqual(actual.data,expected.data);}finally{source.release();actual.release();expected?.release();}}}finally{r?.release();await f.close();}
});
test('view changes retain excluded RGB as Original and never rerun a native graph',async()=>{
 const f=await cfaFixture({rectangles:[[3,5,99,85]],exclusions:[[35,29,43,53]],poison:177});let r;try{r=await f.run();const calls=f.calls.length;for(const mode of[0,1,2]){const frame=await f.api.render(f.image,r,mode);try{for(let y=24;y<48;y++)for(let x=32;x<40;x++)for(let c=0;c<3;c++)assert.equal(frame.data[(y*96+x)*3+c],177);}finally{frame.release();}}assert.equal(f.calls.length,calls);}finally{r?.release();await f.close();}
});
test('cancellation retires every temporary and a later request owns a fresh signal',async()=>{
 const abort=new AbortController(),f=await cfaFixture({onAnalyze:()=>abort.abort()});try{await assert.rejects(f.run(undefined,{signal:abort.signal}),{code:'CANCELLED'});assert.equal(f.held.size,0);assert.equal(f.windows.size,0);assert.equal(f.budget.snapshot().activeReservationBytes,0);}finally{await f.close();}
 const healthy=await cfaFixture();let a,b;try{const old=new AbortController();a=await healthy.run(undefined,{signal:old.signal});old.abort();b=await healthy.run(undefined,{signal:new AbortController().signal});assert.deepEqual(a.data.probabilities,b.data.probabilities);assert.notEqual(a.data.probabilities.buffer,b.data.probabilities.buffer);}finally{a?.release();b?.release();await healthy.close();}
});
test('an earlier published result survives a replacement failure with independent leases',async()=>{
 let fail=false;const f=await cfaFixture({onAnalyze:()=>{if(fail)throw Object.assign(Error('native failure'),{code:'NATIVE_FAILURE'});}});let old;try{old=await f.run();const saved=old.data.probabilities.slice(),before=f.budget.snapshot().activeReservationBytes;fail=true;await assert.rejects(f.run(),{code:'NATIVE_FAILURE'});assert.deepEqual(old.data.probabilities,saved);assert.equal(f.budget.snapshot().activeReservationBytes,before);assert.equal(f.windows.size,0);}finally{old?.release();old?.release();await f.close();assert.equal(f.budget.snapshot().activeReservationBytes,0);}
});
test('invalid parameters and insufficient metadata budgets fail before native inference with no leak',async()=>{
 for(const params of[{block:7},{block:9},{tile:-1},{variant:'invented'}]){const f=await cfaFixture();try{await assert.rejects(f.run(params),{code:'INVALID_INPUT'});assert.equal(f.calls.length,0);assert.equal(f.budget.snapshot().activeReservationBytes,0);}finally{await f.close();}}
 const f=await cfaFixture({budgetBytes:1024});try{await assert.rejects(f.run(),{code:'MEMORY_LIMIT'});assert.equal(f.calls.length,0);assert.equal(f.budget.snapshot().activeReservationBytes,0);}finally{await f.close();}
});
test('caller parameter mutation during the first native context cannot alter following contexts',async()=>{
 const params={variant:'Original',block:8,tile:32},f=await cfaFixture({rectangles:[[0,0,48,48],[60,0,108,48]],onAnalyze:()=>{params.block=32;params.tile=0;params.variant='Sans JPEG';}});let r;try{r=await f.run(params);assert.equal(f.calls.length,2);for(const call of f.calls)assert.deepEqual(call.params,{variant:'Original',block:8,tile:32});assert.deepEqual(cfaStrictParameters(),{variant:'Original',block:32,tile:512});}finally{r?.release();await f.close();}
});
test('scientific entry headers preserve all local and global raw fields without inventing a spatial grid',async()=>{
 const f=await cfaFixture({rectangles:[[3,5,51,53],[65,5,113,53]]});let r;try{r=await f.run();const entries=cfaStrictNpzEntries(r);assert.deepEqual(entries.map(e=>e.key),['probabilities','native_grids','native_local_grid','native_suspicion','grids','means','local_grid','suspicion']);for(const entry of entries){assert.equal(entry.value,r.data[entry.key]);assert.equal(entry.bytes,entry.value.byteLength);}assert.match(new TextDecoder().decode(entries[0].header),new RegExp('shape.*4, 4, '+r.data.cellCount));assert.equal(r.data.metadata.fragments.length,2);assert.equal('gridShape' in r.data,false);assert.throws(()=>cfaStrictNpzEntries({...r,data:{...r.data,probabilities:new Float32Array(1)}}),{code:'INVALID_INPUT'});}finally{r?.release();await f.close();}
});
test('the current product notice distinguishes all-small and partially evaluable CFA contexts',async()=>{
 for(const[rectangles,status]of[[[[0,0,48,48],[70,0,75,48]],'partially-evaluated'],[[[3,5,8,45]],'not-evaluated']]){const f=await cfaFixture({rectangles});let r;try{r=await f.run();const notice=nativeContextEvaluationNotice(r,'fr');assert.equal(notice.status,status);assert.equal(notice.count,1);assert.match(notice.text,status==='not-evaluated'?/Aucune zone.*Aucun score/:/Une zone.*autres zones/);assert.equal(r.metrics.selectedPixels,r.metrics.analysedPixels+r.metrics.unanalysablePixels);}finally{r?.release();await f.close();}}
});
test('render cancellation and callback failure preserve the previous scientific owner and release every frame',async()=>{
 const f=await cfaFixture({exclusions:[[32,24,40,48]]});let r;try{r=await f.run();const before=f.budget.snapshot().activeReservationBytes,abort=new AbortController();await assert.rejects(f.api.render(f.image,r,0,{signal:abort.signal,onProgress:()=>abort.abort()}),{code:'CANCELLED'});assert.equal(f.budget.snapshot().activeReservationBytes,before);assert.equal(f.windows.size,0);const cause=Error('display callback');await assert.rejects(f.api.render(f.image,r,1,{onProgress:()=>{throw cause;}}),e=>e===cause);assert.equal(f.budget.snapshot().activeReservationBytes,before);assert.equal(f.windows.size,0);const frame=await f.api.render(f.image,r,2);frame.release();}finally{r?.release();await f.close();assert.equal(f.budget.snapshot().activeReservationBytes,0);}
});
