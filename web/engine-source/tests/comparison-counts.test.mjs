import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {initCvWasm,cvComparison} from '../src/opencv.js';
test('Comparison histograms retain exact integer populations beyond 2^24',async()=>{
 await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});const ref=JSON.parse(await readFile(new URL('../fixtures/comparison-count-reference.json',import.meta.url)));
 for(const f of ref.cases){
  const a=new Uint8Array(f.width*f.height*3),b=new Uint8Array(a.length);if(f.name==='disjoint')b.fill(255);else{a.set(f.firstTail.flat(),a.length-6);b.set(f.secondTail.flat(),b.length-6);}
  const images=[a,b].map(data=>({width:f.width,height:f.height,format:'rgb8',data})),r=await cvComparison(...images,2);
  for(let i=0;i<6;i++)assert.ok(Math.abs(r.values[i]-f.values[i])<=1e-12*Math.max(1,Math.abs(f.values[i])),f.name+' histogram method '+i+' '+r.values[i]+' / '+f.values[i]);assert.equal(r.values[3],f.values[3],'exact intersection');assert.equal(r.values[6],r.values[0]);assert.equal(r.values[7],256**3);
 }
});
