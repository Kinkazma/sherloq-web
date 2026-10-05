import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {initCvWasm} from '../src/opencv.js';import {createEngine} from '../src/index.js';import {imageCodec} from '../src/codecs.js';import {imageHeader} from '../src/image-headers.js';
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const root=new URL('./data/tiff-formats/',import.meta.url),reference=JSON.parse(await readFile(new URL('reference.json',root))),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('Classic TIFF extended native RGB corpus with precise retained refusals',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*1024**2});let exact=0,refused=0;
 try{for(const row of reference.cases){const bytes=new Uint8Array(await readFile(new URL(row.file,root))),header=imageHeader(bytes);
  if(row.file.startsWith('bilevel-'))assert.equal(header.depth,1,'TIFF default BitsPerSample is one');
  if(row.nativeError){await assert.rejects(engine.load({id:'i',bytes}),{code:'UNSUPPORTED_FORMAT'});refused++;continue;}
  const loaded=await engine.load({id:'i',bytes});assert.equal(loaded.width,row.width);assert.equal(loaded.height,row.height);assert.equal(sha(engine.imagePixels('i').data),row.rgbSha256,row.file);assert.equal(sha(engine.original('i')),sha(bytes),'original retained');assert.equal(loaded.provenance.sourceDepth,header.depth);if(row.file.startsWith('tiled-'))assert.equal(sha((await imageCodec.decodeGray(bytes)).data),row.graySha256,row.file+' grayscale');engine.unload('i');exact++;
 }assert.equal(exact,reference.cases.length-1);assert.equal(refused,1);assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{await engine.dispose();}
});
test('Mapped TIFF grayscale used by analysis reserves its decoder before starting',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('tiled-rgb-u1.tiff',root))),limited=createEngine({memoryBudgetBytes:128*1024**2});
 try{await limited.load({id:'i',bytes});await assert.rejects(limited.run({id:'b',imageId:'i',operation:'noise.blocking'}),{code:'MEMORY_LIMIT'});assert.equal(limited.capabilities().memory.activeReservationBytes,0);assert.deepEqual(limited.original('i'),bytes);}finally{await limited.dispose();}
 const engine=createEngine({memoryBudgetBytes:256*1024**2});try{await engine.load({id:'i',bytes});const result=await engine.run({id:'b',imageId:'i',operation:'noise.blocking'});assert.equal(result.data.sourceMode,'file grayscale');assert.deepEqual(result.data.sourceDimensions,[53,37]);assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{await engine.dispose();}
});
