import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {initJpegWasm,jpegCodec,inspectJpegBlob,decodeJpegRows} from '../src/jpeg.js';import {Budget} from '../src/cache.js';import {createBlobSource} from '../src/blob-source.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
const read=async name=>new Uint8Array(await readFile(new URL('../fixtures/'+name,import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
test('JPEG scanline decoding preserves baseline/progressive/gray/orientation pixels for different group sizes',async()=>{
 const metadata=JSON.parse(await readFile(new URL('../fixtures/metadata-reference.json',import.meta.url))),base=JSON.parse(await readFile(new URL('../fixtures/codec-reference.json',import.meta.url)));
 const names=[...new Set([...base.cases.map(f=>f.file),...metadata.cases.map(f=>f.file)].filter(n=>/\.jpe?g$/i.test(n)))];assert.ok(names.length>=25);
 for(const file of names){const bytes=await read(file),expected=await jpegCodec.decode(bytes),native=base.cases.find(f=>f.file===file)?.decodedSha256??metadata.cases.find(f=>f.file===file)?.sha256,budget=new Budget(128*1024**2),source=createBlobSource(new Blob([bytes]),{budget,chunkBytes:401}),header=await inspectJpegBlob(source);
  for(const rows of [1,7,32]){const store=await createSegmentedBytes(header.sourceWidth*header.sourceHeight*3,{budget,chunkBytes:137}),surface=createRgbSurface(store,{width:header.sourceWidth,height:header.sourceHeight,orientation:header.orientation,budget});try{
   await decodeJpegRows(source,header,store,{budget,chunkBytes:rows*header.sourceWidth*3});const actual=await surface.readWindow();try{assert.equal(hash(actual.pixels.data),native,file+' rows '+rows);assert.deepEqual([actual.pixels.width,actual.pixels.height],[expected.width,expected.height]);}finally{actual.release();}
  }finally{await surface.dispose();}assert.equal(budget.total(),0);}
  source.dispose();
 }
});
test('JPEG row cancellation frees decoder working buffers and allows clean reload without publishing partial data',async()=>{
 const bytes=await read('bench-512.jpg'),budget=new Budget(96*1024**2),source=createBlobSource(new Blob([bytes]),{budget}),header=await inspectJpegBlob(source),store=await createSegmentedBytes(header.width*header.height*3,{budget}),controller=new AbortController();
 await assert.rejects(decodeJpegRows(source,header,store,{budget,chunkBytes:header.width*3*8,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.active,0);
 await decodeJpegRows(source,header,store,{budget});const result=new Uint8Array(store.byteLength);await store.readInto(result);assert.equal(hash(result),hash((await jpegCodec.decode(bytes)).data));await store.dispose();source.dispose();assert.equal(budget.total(),0);
});
