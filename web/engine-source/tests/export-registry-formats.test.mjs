import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createRasterExports} from '../src/raster-export.js';
import {streamResultJson} from '../src/json-export-stream.js';
import {originalPrnuArchive} from '../src/prnu-archive.js';

test('one export registry preserves JSON metadata and original HDF5 bytes with independent lifetimes',async()=>{
 const budget=new Budget(16*1024**2),registry=createRasterExports(budget),bytes=new Uint8Array(await readFile(new URL('../fixtures/prnu-snapshot.h5',import.meta.url))),sha256=createHash('sha256').update(bytes).digest('hex');
 const result={status:'ok',provenance:{originalSha256:'a'.repeat(64)},operation:'tampering.copyMove.brisk',data:{pairs:new Float64Array([1,2,3,4])}},expected=JSON.stringify(result,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v);
 try{
  const json=registry.adopt(await streamResultJson(result,{storage:'memory'},{budget}),{imageId:'points',operation:result.operation});
  const hdf=registry.adopt(await originalPrnuArchive({blob:new Blob([bytes]),sha256},{budget}),{imageId:'database',operation:'noise.prnu',mime:'application/x-hdf5',format:'hdf5'});
  assert.equal(json.format,'json');assert.equal(json.mime,'application/json');assert.equal(hdf.format,'hdf5');assert.equal(hdf.mime,'application/x-hdf5');
  const page=await registry.read({exportId:json.id,revision:1});assert.equal(page.mime,'application/json');assert.equal(new TextDecoder().decode(page.bytes),expected);await registry.release(json.id);
  const actual=new Uint8Array(hdf.byteLength);for(let at=0;at<actual.length;){const p=await registry.read({exportId:hdf.id,revision:1,offset:at,length:Math.min(65536,actual.length-at)});assert.equal(p.mime,'application/x-hdf5');actual.set(p.bytes,at);at=p.nextOffset;}
  assert.deepEqual(actual,bytes);assert.equal(createHash('sha256').update(actual).digest('hex'),hdf.sha256);await registry.release(hdf.id);assert.equal(registry.size,0);assert.equal(budget.total(),0);
 }finally{await registry.clear();}
});
