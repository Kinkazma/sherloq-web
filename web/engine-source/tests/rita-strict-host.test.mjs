import test from 'node:test';
import assert from 'node:assert/strict';
import {ritaStrictHostFixture} from './helpers/rita-strict-host-fixture.mjs';

function localEntries(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),entries=new Map();let at=0;while(view.getUint32(at,true)===0x04034b50){assert.equal(view.getUint16(at+8,true),0);const size=view.getUint32(at+18,true),length=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),name=new TextDecoder().decode(bytes.subarray(at+30,at+30+length)),start=at+30+length+extra;entries.set(name,bytes.slice(start,start+size));at=start+size;}assert.equal(view.getUint32(at,true),0x02014b50);return entries;}

test('actual Core/M2 transport keeps four fields, views, archive and result/source ownership',async()=>{
 const h=await ritaStrictHostFixture();let a,b;
 try{
  a=await h.analyze();const metadata=await h.metadata(a);assert(metadata.metadata.fragmented);assert.equal(metadata.metadata.modeledPixels,h.domain.countIncluded);assert.equal(a.fields.logits.length,4*h.domain.countIncluded);assert.equal(metadata.provenance.analysisContext,'native-rita-contexts-only');const before=h.natives[0].calls.length,arrays={};
  for(const key of ['map','official_mask','labels','logits'])arrays[key]=await h.read(a,key,0,a.fields[key].length);
  for(const mode of ['overlay','probability','mask']){const display=await h.rpc('readDisplay',{resultId:a.id,view:mode,tile:{x:0,y:0,w:a.width,h:a.height,step:1}});assert.equal(display.pixels.data.length,a.width*a.height*3);assert.equal(display.metrics.neuralExecutions,0);}
  const archive=await h.rpc('beginExport',{resultId:a.id}),bytes=await h.rpc('readExport',{exportId:archive.id,offset:0,count:archive.bytes});await h.rpc('releaseExport',{exportId:archive.id});const entries=localEntries(bytes);assert.equal(entries.size,6);
  for(const key of Object.keys(arrays)){const npy=entries.get(key+'.npy'),offset=10+new DataView(npy.buffer,npy.byteOffset,npy.byteLength).getUint16(8,true);assert.deepEqual(npy.subarray(offset),new Uint8Array(arrays[key].buffer));}
  assert.equal(h.natives[0].calls.length,before);await h.client.release(a.id);a=null;
  b=await h.analyze();const warm=await h.metadata(b);assert(warm.metrics.cache.result);assert.equal(h.natives[0].calls.length,before);const display=await h.rpc('readDisplay',{resultId:b.id,view:'overlay',tile:{x:0,y:0,w:b.width,h:b.height,step:2}});assert.equal(display.pixels.width,Math.ceil(b.width/2));await h.client.release(b.id);b=null;const memory=await h.rpc('clearCache');for(const key of ['activeReservationBytes','retainedBytes','cacheBytes'])assert.equal(memory[key],0);
 }finally{if(a)await h.client.release(a.id);if(b)await h.client.release(b.id);const memory=await h.close();for(const key of ['activeReservationBytes','retainedBytes','cacheBytes'])assert.equal(memory[key],0);}
});
