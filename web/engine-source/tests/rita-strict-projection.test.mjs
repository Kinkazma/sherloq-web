import test from 'node:test';
import assert from 'node:assert/strict';
import {readRitaStrictProjection} from '../src/rita-strict-projection.js';
import {ritaStrictNpzEntries} from '../src/rita-strict-npz.js';
import {sampleRitaStrictWindow} from '../src/rita-strict-render.js';
import {ritaStrictFixture} from './helpers/rita-strict-fixture.mjs';

test('all four fields reproject to the exact native selected pixels, with NaN outside',async()=>{
 const h=await ritaStrictFixture();let result;
 try{result=await h.run();const d=result.data,tile={x:0,y:0,w:d.width,h:d.height,step:1};let calls=0;
  for(const key of ['map','official_mask','labels','logits'])for(let channel=0;channel<(key==='logits'?4:1);channel++){
   const packed=await d[key].readInto(new Float32Array(d[key].length)),grid=await readRitaStrictProjection({width:d.width,height:d.height,pixels:d.pixelCount,fragments:d.metadata.fragments,field:key,channel,windowBytes:12,async readArray(k,offset,count){calls++;assert(count<=3);return d[k].readInto(new Float32Array(count),offset);}},tile);
   for(let y=0;y<d.height;y++)for(let x=0;x<d.width;x++){const f=d.metadata.fragments.find(f=>x>=f.rect.x&&x<f.rect.x+f.rect.width&&y>=f.rect.y&&y<f.rect.y+f.rect.height);if(f)assert.equal(grid[y*d.width+x],packed[channel*d.pixelCount+f.offset+(y-f.rect.y)*f.rect.width+x-f.rect.x]);else assert(Number.isNaN(grid[y*d.width+x]));}
  }assert(calls>7);
 }finally{await result?.release();await h.close();}assert.equal(h.budget.total(),0);
});
test('sparse display samples split requests and retain exact sample phase',async()=>{
 const h=await ritaStrictFixture();let result;try{result=await h.run();const d=result.data,p={width:d.width,height:d.height,pixels:d.pixelCount,fragments:d.metadata.fragments,windowBytes:8,readArray:async(k,o,n)=>{assert(n<=2);return d[k].readInto(new Float32Array(n),o);}},full=await readRitaStrictProjection(p,{x:0,y:0,w:d.width,h:d.height,step:1}),sparse=await readRitaStrictProjection(p,{x:1,y:1,w:d.width-1,h:d.height-1,step:3});const width=Math.ceil((d.width-1)/3);for(let y=0;y<Math.ceil((d.height-1)/3);y++)for(let x=0;x<width;x++)assert(Object.is(sparse[y*width+x],full[(1+y*3)*d.width+1+x*3]));}
 finally{await result?.release();await h.close();}assert.equal(h.budget.total(),0);
});
test('packed NPZ declares native context population and CHW, never the enclosing grid',async()=>{
 const h=await ritaStrictFixture();let result;try{result=await h.run();const entries=ritaStrictNpzEntries(result);assert.deepEqual(entries.map(e=>e.key),['map','official_mask','labels','logits']);for(const e of entries){const header=new TextDecoder().decode(e.header.subarray(10));assert(header.includes(e.key==='logits'?`(4, ${result.data.pixelCount})`:`(${result.data.pixelCount},)`));assert.equal(e.bytes,result.data[e.key].byteLength);const raw=new Uint8Array(e.bytes);await e.value.readBytes(raw,0);assert.deepEqual(raw,new Uint8Array((await result.data[e.key].readInto(new Float32Array(e.bytes/4))).buffer));}}
 finally{await result?.release();await h.close();}assert.equal(h.budget.total(),0);
});
test('retained map/mask renders change only presentation and issue no native graph calls',async()=>{
 const h=await ritaStrictFixture();let result;try{result=await h.run();const before=h.native.calls.length,d=result.data,tile={x:0,y:0,w:d.width,h:d.height,step:2};for(const view of ['probability','mask']){const frame=await sampleRitaStrictWindow(h.image,result,view,tile,{budget:h.budget,threshold:.7});assert.equal(frame.pixels.width,Math.ceil(d.width/2));assert.equal(frame.metrics.neuralExecutions,0);frame.release();}assert.equal(h.native.calls.length,before);}
 finally{await result?.release();await h.close();}assert.equal(h.budget.total(),0);
});
test('projection rejects a changed packed offset and a nonfinite modeled value',async()=>{
 const p={width:3,height:2,pixels:2,fragments:[{index:0,rect:{x:1,y:0,width:1,height:2},count:2,offset:1,evaluable:true}],readArray:async()=>Float32Array.of(1)},tile={x:0,y:0,w:3,h:2,step:1};await assert.rejects(readRitaStrictProjection(p,tile),/coordinates or offsets/);p.fragments[0].offset=0;p.readArray=async()=>Float32Array.of(NaN);await assert.rejects(readRitaStrictProjection(p,tile),/finite modeled/);
});
