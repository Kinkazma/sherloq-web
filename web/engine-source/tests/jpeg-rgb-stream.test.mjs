import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createRgbRecompression} from '../src/jpeg-rgb-stream.js';import {createRgbSurface} from '../src/rgb-surface.js';import {Budget} from '../src/cache.js';import {jpegCodec} from '../src/jpeg.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
function image(data,width,height,budget){return {surface:createRgbSurface({byteLength:data.length,readInto:(out,offset)=>out.set(data.subarray(offset,offset+out.length))},{width,height,budget,ownsStore:false})};}
test('one global RGB JPEG streamed through external bytes matches every native recompression fixture',async()=>{
 const ref=JSON.parse(await readFile(new URL('../fixtures/codec-reference.json',import.meta.url)));let count=0;
 for(const item of ref.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+item.file,import.meta.url))),pixels=await jpegCodec.decode(bytes),budget=new Budget(96*1024**2),source=image(pixels.data,pixels.width,pixels.height,budget),codec=createRgbRecompression(source,budget);
 try{for(const expected of item.recompressed){const h=createHash('sha256');await codec.visit(expected.quality,{onBand:(_,rgb)=>h.update(rgb)});assert.equal(h.digest('hex'),expected.sha256,item.file+'/'+expected.quality);count++;}}finally{await codec.dispose();await source.surface.dispose();}assert.equal(budget.total(),0);
 }assert.ok(count>=40);
});
test('encoded cache keeps two qualities, hits skip encoding, cancellation leaves no partial cache',async()=>{
 const budget=new Budget(64*1024**2),source=image(new Uint8Array(83*79*3),83,79,budget),codec=createRgbRecompression(source,budget),controller=new AbortController();
 try{await assert.rejects(codec.visit(75,{signal:controller.signal,onProgress:e=>{if(e.phase==='jpeg-encode')controller.abort();},onBand(){}}),{code:'CANCELLED'});assert.equal(budget.total(),0);const a=await codec.visit(75,{onBand(){}}),b=await codec.visit(75,{onBand(){}});assert.equal(a.recompressions,1);assert.equal(b.recompressions,0);await codec.visit(50,{onBand(){}});await codec.visit(99,{onBand(){}});assert.equal((await codec.visit(75,{onBand(){}})).recompressions,1);assert.equal(budget.active,0);}finally{await codec.dispose();await source.surface.dispose();}assert.equal(budget.total(),0);
});
test('RGB JPEG workspace refusal and a failed source read never leak cache storage',async()=>{
 for(const mode of ['memory','read']){const budget=new Budget((mode==='memory'?1:48)*1024**2),codec=createRgbRecompression({surface:{descriptor:{width:97,height:71,format:'rgb8'},async readWindow(){throw Error('source read failed');}}},budget);try{await assert.rejects(codec.visit(75,{onBand(){}}),e=>mode==='memory'?e.code==='MEMORY_LIMIT':e.message==='source read failed');assert.equal(budget.total(),0);}finally{await codec.dispose();}}
});
test('shared budget reclaims idle encoded RAM, but never the JPEG currently being decoded',async()=>{
 const budget=new Budget(64*1024**2),source=image(new Uint8Array(83*79*3),83,79,budget),codec=createRgbRecompression(source,budget);let checked=false;
 try{await codec.visit(75,{onBand(){assert.throws(()=>budget.reserve(budget.limit-budget.total()+1),{code:'MEMORY_LIMIT'});assert.equal(codec.hasEncoded(75),true);checked=true;}});assert.ok(checked);const free=budget.reserve(budget.limit-budget.total()+1);try{assert.equal(codec.hasEncoded(75),false);}finally{free();}assert.equal(budget.total(),0);await codec.visit(75,{onBand(){}});assert.equal(codec.hasEncoded(75),true);}finally{await codec.dispose();await source.surface.dispose();}assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});
