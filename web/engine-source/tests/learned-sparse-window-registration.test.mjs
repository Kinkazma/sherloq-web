import test from 'node:test';import assert from 'node:assert/strict';
import {createLearnedSparseWindowRegistration} from '../src/learned-sparse-window-registration.js';import {Budget} from '../src/cache.js';
const methods=['XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue','EfficientLoFTR'],operation='tampering.copyMove.sparse';
test('real product registration selects existing native callbacks by method/mode and preserves Original native two-ROI jobs (0NN)',async()=>{
 const reg=createLearnedSparseWindowRegistration(),image={sha256:'a'.repeat(64),surface:{descriptor:{format:'rgb8',width:96,height:96}}},budget=new Budget(64*1024**2),profile={id:'maximum',maxWorkers:10};
 for(const algorithm of methods){const task={operation,params:{algorithm,regions:[[[0,0],[32,0],[32,32]],[[48,0],[80,0],[80,32]]]},regions:[]};assert.equal(reg.key(task,image),null,algorithm+' split native scientific comparison into orchestration');let previous;
  for(const cloneWindowMode of ['independent','global']){const scoped={...task,cloneWindowMode,regions:[{id:'arbitrary-acquisition-id',bounds:[0,0,96,96]}]},key=reg.key(scoped,image);assert(key&&key!==previous);previous=key;const engine=reg.create(image,budget,profile,scoped);await engine.dispose();assert.equal(budget.total(),0);}
 }
 for(const algorithm of ['SSG','SIFT + G2NN + RANSAC + Panels + Text'])assert.equal(reg.key({operation,params:{algorithm},regions:[{id:'a',bounds:[0,0,96,96]}]},image),null);
});
test('ordinary learned completion records only an actually returned native method/mode, without changing native fields (0NN)',()=>{
 const reg=createLearnedSparseWindowRegistration();for(const algorithm of methods){const params={algorithm},points=new Float64Array([1,2,3,4,5,6,7]),raw={params,points,metadata:{algorithm}};reg.completeOriginal({operation,params,cloneWindowMode:'independent'},raw,{});assert.strictEqual(raw.points,points);assert.strictEqual(raw.params,params);assert.equal(raw.cloneWindowMode,'independent');assert.equal(raw.metadata.cloneAnalysisWindows.route,'ordinary-original-single-native-job');}
});
