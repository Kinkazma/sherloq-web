import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../web/engine-source/src/cache.js';
import {saveBatchRunEvidence,restoreBatchRunEvidence,resumableBatchRun,batchRunRecipeSignature} from '../web/wordpress/sherloq-browser/assets/batch-run-resume.js';
import {readBatchZip} from '../web/wordpress/sherloq-browser/assets/batch-zip.js';
const sha='a'.repeat(64),hash='b'.repeat(64),fingerprint='c'.repeat(64);
const image={hash,width:8,height:8,sourceSha256:sha,preparation:{fingerprint}};
const recipe={operation:'ai.clones.d2prl',kind:'clones',params:{minimum:500},signal:{},backend:'auto'},newRun=()=>({...structuredClone(recipe),status:'done',files:[],provenance:{originalSha256:sha}});
function memorySink(writes=[]){return async()=>{const parts=[];return {async write(bytes){writes.push(bytes.length);parts.push(bytes.slice());},async finish(){return {blob:new Blob(parts),cleanup:async()=>{}};},async abort(){parts.length=0;}};};}
function entry(){return {id:'original-component',source:'D2PRL',methodKey:'D2PRL',origin:[2,2],polygons:[[[2,2],[4,2],[4,4],[2,4]]],pixel_mask:{width:3,height:3,data:Uint8Array.from([1,1,1,1,0,1,1,1,1])},count:8};}
test('durable evidence replays exact mask holes and immutable geometry under an explicit budget',async()=>{
 const run=newRun(),artifacts=new Map(),original=entry(),before=original.pixel_mask.data.slice(),writes=[];
 await saveBatchRunEvidence(image,run,[original],artifacts,'resultats/image/d2-reprise',{sinkFactory:memorySink(writes)});
 assert.deepEqual(original.pixel_mask.data,before);assert.equal(resumableBatchRun(run,recipe,artifacts),true);assert.equal(writes.every(n=>n<=1024**2),true);
 const budget=new Budget(4*1024**2),baseline=budget.total(),replay=await restoreBatchRunEvidence(image,run,artifacts,{budget});
 assert.deepEqual(replay.entries[0].pixel_mask.data,before);assert.equal(replay.entries[0].pixel_mask.data[4],0);assert.deepEqual(replay.entries[0].origin,[2,2]);assert.ok(budget.total()>baseline);replay.release();replay.release();assert.equal(budget.total(),baseline);
 const zip=await readBatchZip(artifacts.get(run.resumeEvidence.files.scientific));assert.equal(zip.file('mask_0.npy')._data.compressionMethod,0);
});
test('source, scope, recipe, CRC and malformed coordinates cannot attach stored masks to another analysis',async()=>{
 const run=newRun(),artifacts=new Map();await saveBatchRunEvidence(image,run,[entry()],artifacts,'resultats/image/d2-reprise',{sinkFactory:memorySink()});
 const budget=new Budget(4*1024**2);
 for(const other of [{...image,sourceSha256:'d'.repeat(64)},{...image,width:9},{...image,preparation:{fingerprint:'e'.repeat(64)}}])await assert.rejects(restoreBatchRunEvidence(other,run,artifacts,{budget}),{code:'BATCH_RESUME_INVALID'});
 await assert.rejects(restoreBatchRunEvidence(image,{...run,params:{minimum:501}},artifacts,{budget}),{code:'BATCH_RESUME_INVALID'});
 const npz=artifacts.get(run.resumeEvidence.files.scientific),bytes=new Uint8Array(await npz.arrayBuffer()),zip=await readBatchZip(npz),mask=new Uint8Array(await (await zip.file('mask_0.npy').async('blob')).arrayBuffer()),needle=mask.slice(-9);
 let at=bytes.findIndex((_,i)=>i+9<=bytes.length&&needle.every((n,j)=>bytes[i+j]===n));assert.ok(at>0);bytes[at+4]=1;artifacts.set(run.resumeEvidence.files.scientific,new Blob([bytes]));
 await assert.rejects(restoreBatchRunEvidence(image,run,artifacts,{budget}),/CRC/);assert.equal(budget.total(),0);
});
test('checkpoint failures and aborted reads release storage and memory; contour-only legacy masks are refused',async()=>{
 const run=newRun(),artifacts=new Map(),controller=new AbortController();controller.abort(Error('stopped'));
 await assert.rejects(saveBatchRunEvidence(image,run,[entry()],artifacts,'resultats/image/reprise',{sinkFactory:memorySink(),signal:controller.signal}),/stopped/);assert.equal(artifacts.size,0);assert.equal(run.resumeEvidence,undefined);
 const legacy={...newRun(),entries:[{polygons:entry().polygons}]};assert.equal(resumableBatchRun(legacy,recipe,artifacts),false);
 assert.equal(resumableBatchRun({...legacy,operation:'tampering.copyMove.sparse',params:{algorithm:'SIFT'}},{...recipe,operation:'tampering.copyMove.sparse',params:{algorithm:'SIFT'}},artifacts),true);
});
test('recipe identity includes thresholds and native parameters but ignores labels and object key ordering',()=>{
 assert.equal(batchRunRecipeSignature(recipe),batchRunRecipeSignature({...recipe,title:'Translated',params:{minimum:500}}));
 assert.notEqual(batchRunRecipeSignature(recipe),batchRunRecipeSignature({...recipe,signal:{threshold:.5}}));
 assert.notEqual(batchRunRecipeSignature(recipe),batchRunRecipeSignature({...recipe,backend:'wasm'}));
});

test('thousands of small component masks use their actual bytes rather than one megabyte of retained scratch each',async()=>{
 const count=2200,other={...image,width:count,height:1},run=newRun(),artifacts=new Map(),entries=Array.from({length:count},(_,i)=>({id:'component-'+i,source:'D2PRL',methodKey:'D2PRL',origin:[i,0],polygons:[[[i,0]]],pixel_mask:{width:1,height:1,data:new Uint8Array([1])}}));
 await saveBatchRunEvidence(other,run,entries,artifacts,'resultats/image/many-reprise',{sinkFactory:memorySink()});const budget=new Budget(8*1024**2),replay=await restoreBatchRunEvidence(other,run,artifacts,{budget});assert.equal(replay.entries.length,count);assert.equal(replay.entries.at(-1).pixel_mask.data[0],1);assert.ok(budget.total()<8*1024**2);replay.release();assert.equal(budget.total(),0);
});
test('a failed checkpoint transaction removes its unpublished NPZ and preserves the primary storage error over cleanup',async()=>{
 const run=newRun(),values=new Map(),error=Object.assign(Error('metadata quota'),{code:'STORAGE_QUOTA'}),artifacts={async set(path,blob){if(path.endsWith('.json'))throw error;values.set(path,blob);},async delete(path){values.delete(path);}},factory=async()=>{const parts=[];return {async write(bytes){parts.push(bytes.slice());},async finish(){return {blob:new Blob(parts),async cleanup(){throw Error('cleanup refused');}};},async abort(){}};};
 await assert.rejects(saveBatchRunEvidence(image,run,[entry()],artifacts,'resultats/image/failed-reprise',{sinkFactory:factory}),actual=>actual===error&&actual.cleanupError.message==='cleanup refused');assert.equal(values.size,0);assert.equal(run.resumeEvidence,undefined);assert.equal(run.files.length,0);
});
