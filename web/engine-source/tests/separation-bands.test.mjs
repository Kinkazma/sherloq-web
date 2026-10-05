import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {initSeparationWasm,separationRows,separationHalo,separationHeapBytes,SEPARATION_HEAP_BYTES} from '../src/separation-math.js';
await initSeparationWasm({wasmBinary:await readFile(new URL('../vendor/separation/separation.wasm',import.meta.url))});const hash=b=>createHash('sha256').update(b).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/opencv-reference.json',import.meta.url)));
test('All five native denoisers keep exact full-width halos and native row tails',async()=>{
 let outputs=0;for(const f of reference.cases){const input=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)));for(const e of f.expected.filter(e=>e.operation==='noise.separation'&&e.params.denoised)){
  const halo=separationHalo(e.params),out=new Uint8Array(input.length),group=f.height>35?31:3;for(let y=0;y<f.height;y+=group){const rows=Math.min(group,f.height-y),top=Math.max(0,y-halo),bottom=Math.min(f.height,y+rows+halo),data=input.slice(top*f.width*3,bottom*f.width*3),actual=await separationRows({width:f.width,height:bottom-top,data},e.params,y-top,rows);out.set(actual,y*f.width*3);}assert.equal(hash(out),e.sha256,f.name+' '+JSON.stringify(e.params));outputs++;
 }}assert.equal(outputs,420);assert.equal(separationHeapBytes(),SEPARATION_HEAP_BYTES);
});
