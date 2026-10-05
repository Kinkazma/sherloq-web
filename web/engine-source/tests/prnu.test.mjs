import {prnuStreamMath} from '../src/prnu-stream-math.js';
import {residentBudget} from './resident-budget.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initCvWasm,initPrnuTwiddles,cvPrnuResidual} from '../src/opencv.js';
import {initJpegWasm,jpegCodec} from '../src/jpeg.js';
import {prnuCorpus} from './prnu-corpus.js';
import {readPrnuDatabase,writePrnuDatabase} from '../src/prnu-hdf5.js';
import {createEngine} from '../src/index.js';
import {prnuLifecycle} from './prnu-lifecycle.js';
import {formatPrnuScore} from '../src/prnu.js';
import {prnuLargeInput} from './prnu-large-input.js';
import {createHash} from 'node:crypto';
import {prnuCameraLabel} from '../src/prnu-builder.js';
const root=new URL('../',import.meta.url),read=async path=>new Uint8Array(await readFile(new URL(path,root)));
const wasm=await initCvWasm({wasmBinary:await read('vendor/opencv/opencv.wasm')});
await initJpegWasm({wasmBinary:await read('vendor/libjpeg/jpeg.wasm')});
test('PRNU display uses native decimal ties-to-even without changing raw thresholds',()=>{
 for(const [value,text] of [[1/64,'0.01562'],[3/64,'0.04688'],[-1/64,'-0.01562'],[-3/64,'-0.04688'],[0,'0.00000'],[-0,'-0.00000'],[.005,'0.00500'],[.999999,'1.00000']])assert.equal(formatPrnuScore(value),text);
});
test('PRNU filename grouping follows the native basename/stem rule, including dots and literal backslashes',()=>{
 for(const [name,label] of [['camera_alpha_1.JPG','camera_alpha'],['IMG_0001.jpg','IMG_0001'],['camera_a_1.extra.jpeg','camera_a'],['.jpeg','.jpeg'],['.hidden_name_1.jpg','.hidden_name'],['cam\\era_a_1.jpg','cam\\era_a'],['é_🧪_2.jpeg','é_🧪']])assert.equal(prnuCameraLabel(name),label);
});
test('PRNU seed file hash is checked before installing; a failed load can retry',async()=>{
 const bytes=await read('vendor/pocketfft/prnu-twiddles.bin');bytes[bytes.length-1]^=1;
 await assert.rejects(initPrnuTwiddles({bytes}),{code:'INVALID_INPUT'});
 await initPrnuTwiddles({bytes:await read('vendor/pocketfft/prnu-twiddles.bin')});
 await prnuStreamMath({bytes:await read('vendor/pocketfft/prnu-twiddles.bin')});
});
test('PRNU native residuals, buffered/cropped NCC, thresholds, training means and HDF5 retain exact float64',async()=>{
 const proof=await prnuCorpus(name=>read('fixtures/'+name),bytes=>jpegCodec.decode(bytes));assert.equal(proof.status,'core-parity-passed');
});
test('PRNU two-multiplier SIMD FMA equals the IEEE reference, including cancellation and midpoint ties',()=>{
 for(const seed of [1,9744,0xabcdef01]){assert.equal(wasm._cv_prnu_scalar_test(seed,2000000),0,'Scalar guard');assert.equal(wasm._cv_prnu_vector_test(seed,2000000),0,'Vector guard');}
});
test('PRNU selectable original and SIMD residuals retain every native float64 bit',async()=>{
 const ref=JSON.parse(new TextDecoder().decode(await read('fixtures/prnu-reference.json')));
 for(const fast of [false,true])for(const f of ref.cases.filter(f=>!f.error)){const actual=await cvPrnuResidual({width:f.width,height:f.height,format:'rgb8',data:await read('fixtures/'+f.file)},{fast}),bytes=await read('fixtures/'+f.residual);assert.deepEqual(new Uint8Array(actual.values.buffer),bytes,f.name);assert.equal(actual.noisePower,f.noisePower,f.name+' noise');}
});
test('PRNU 8 MP residual bits match the independent native recipe checksum',async()=>{
 const f=JSON.parse(new TextDecoder().decode(await read('fixtures/prnu-large-reference.json'))),pixels=prnuLargeInput(f),hash=x=>createHash('sha256').update(x).digest('hex');assert.equal(hash(pixels.data),f.inputSha256);const result=await cvPrnuResidual(pixels);assert.equal(hash(new Uint8Array(result.values.buffer)),f.residualSha256);
});
test('PRNU HDF5 memory admission and cancellation release reservations and leave no partial snapshot',async()=>{
 const bytes=await read('fixtures/prnu-snapshot.h5');let active=0;
 const options={maxWorkingBytes:512*1024**2,admit:n=>{active+=n;return ()=>{active-=n;};}};
 await assert.rejects(readPrnuDatabase(bytes,{...options,maxWorkingBytes:1000}),{code:'MEMORY_LIMIT'});assert.equal(active,0);
 const signal=AbortSignal.abort();await assert.rejects(readPrnuDatabase(bytes,{...options,signal}),{code:'CANCELLED'});assert.equal(active,0);
 await assert.rejects(readPrnuDatabase(await read('fixtures/prnu-database-vector.h5'),options),{code:'INVALID_INPUT'});assert.equal(active,0);
 const native=await readPrnuDatabase(bytes,options);assert.equal(active,0);
 await assert.rejects(writePrnuDatabase(native,{...options,signal}),{code:'CANCELLED'});assert.equal(active,0);
 const retry=await writePrnuDatabase(native,options);assert.ok(retry.length>0);assert.equal(active,0);
});
test('PRNU engine references, caches, original bytes, explicit streaming snapshots and exports',async()=>{
 const proof=await prnuLifecycle(()=>createEngine(),name=>read('fixtures/'+name));assert.equal(proof.status,'passed');
});
test('PRNU engine cancels a snapshot between files and rejects a small budget before allocation',async()=>{
 const ref=JSON.parse(new TextDecoder().decode(await read('fixtures/prnu-reference.json'))),files=[];for(const item of ref.training)files.push({name:item.name,blob:new Blob([await read('fixtures/'+item.file)])});
 const engine=createEngine();try{
  await engine.load({id:'q',bytes:await read('fixtures/'+ref.query.file)});const beforeCancel=engine.capabilities().memory;const controller=new AbortController();
  await assert.rejects(engine.buildPrnuDatabase({id:'new',queryImageId:'q',files},{signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,beforeCancel.activeReservationBytes);assert.equal(engine.capabilities().memory.retainedBytes,beforeCancel.retainedBytes);assert.throws(()=>engine.original('new'),{code:'NOT_FOUND'});
  await engine.buildPrnuDatabase({id:'new',queryImageId:'q',files});await engine.unload('new');await engine.unload('q');assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.cacheBytes,0);
 }finally{await engine.dispose();}
 const limited=createEngine({memoryBudgetBytes:residentBudget(128*1024**2)});try{await limited.load({id:'q',bytes:await read('fixtures/'+ref.query.file)});await limited.loadPrnuDatabase({id:'db',bytes:await read('fixtures/prnu-snapshot.h5')});const beforeFailure=limited.capabilities().memory;assert.ok(beforeFailure.activeReservationBytes>0);await assert.rejects(limited.run({id:'match',imageId:'q',operation:'noise.prnu',params:{databaseId:'db'}}),{code:'MEMORY_LIMIT'});assert.equal(limited.capabilities().memory.activeReservationBytes,beforeFailure.activeReservationBytes);assert.equal(limited.capabilities().memory.retainedBytes,beforeFailure.retainedBytes);await limited.unload('db');await limited.unload('q');assert.equal(limited.capabilities().memory.activeReservationBytes,0);assert.equal(limited.capabilities().memory.retainedBytes,0);assert.equal(limited.capabilities().memory.cacheBytes,0);}finally{await limited.dispose();}
});
