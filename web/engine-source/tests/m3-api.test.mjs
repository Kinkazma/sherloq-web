import test from 'node:test';import assert from 'node:assert/strict';import {createEngine,SPARSE_COPY_ALGORITHMS} from '../src/index.js';
test('automatic Panels+Text empty-panel result completes without requiring OCR weights',async()=>{
 const engine=createEngine({memoryBudgetBytes:512*1024**2}),pixels={format:'rgb8',width:64,height:64,data:new Uint8Array(64*64*3).fill(255)},events=[];
 try{assert.equal(SPARSE_COPY_ALGORITHMS.length,14);await engine.load({id:'empty',pixels,bytes:pixels.data});await engine.loadM3Models({models:{}});const r=await engine.run({id:'panels',imageId:'empty',operation:'tampering.copyMove.sparse',params:{algorithm:'SIFT + G2NN + RANSAC + Panels + Text'}},{onProgress:e=>events.push(e)});assert.equal(r.status,'no-regions');assert.deepEqual(r.data.regions,[]);assert.equal(events.at(-1).fraction,1);assert.equal(r.provenance.operation,r.operation);assert.equal(engine.capabilities().memory.activeReservationBytes,0);engine.unload('empty');await engine.unloadM3Models();assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.cacheBytes,0);}finally{engine.dispose();}
});
test('sparse NPZ checks the metadata bound before building a large nested mirror',async()=>{
 const {m3Npz}=await import('../src/npz.js'),data={points:new Float64Array(7000),pairs:new Float64Array(4000),colors:new Uint8Array(3000),pair_search_regions:new Int32Array(1000),metadata:{method:'sparse'}};
 assert.throws(()=>m3Npz({operation:'tampering.copyMove.sparse',data,provenance:{}},1024),{code:'MEMORY_LIMIT'});
});
