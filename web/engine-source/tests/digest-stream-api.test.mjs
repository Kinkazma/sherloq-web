import test from 'node:test';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';import {checkSegmentedDigest} from './digest-stream-fixture.js';
const reference=JSON.parse(await readFile(new URL('./data/digest-stream-native.json',import.meta.url))).cases.at(-1),blob=new Blob([await readFile(new URL('./data/'+reference.file,import.meta.url))]);
test('public segmented digest returns six exact image hashes, immutable cache and JSON',async()=>{
 const engine=createEngine({memoryBudgetBytes:116*1024**2,cpuKernel:'single'});try{await checkSegmentedDigest(engine,blob,reference);}finally{await engine.dispose();}
});
test('public cancellation during image hashing retains source and leaves no partial result cache',async()=>{
 const engine=createEngine({memoryBudgetBytes:116*1024**2,cpuKernel:'single'}),controller=new AbortController();try{await engine.loadBlob({id:'i',blob});await assert.rejects(engine.run({id:'cancel',imageId:'i',operation:'file.digest'},{signal:controller.signal,onProgress:e=>{if(e.phase==='perceptual-hashes'&&e.fraction>.85)controller.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);const result=await engine.run({id:'retry',imageId:'i',operation:'file.digest'});assert.equal(result.metrics.cache.result,false);assert.deepEqual([...result.data.imageHashes['Radial variance']],reference.hashes['Radial variance']);}finally{await engine.dispose();}
});
