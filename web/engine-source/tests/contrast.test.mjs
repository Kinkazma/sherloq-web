import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initCvWasm} from '../src/opencv.js';import {createEngine} from '../src/index.js';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
test('Contrast maps and three views preserve all native block sizes, padding and indicator arithmetic',async()=>{
 await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});const ref=JSON.parse(await readFile(new URL('../fixtures/contrast-reference.json',import.meta.url))),engine=createEngine();
 ref.cases.push(...JSON.parse(await readFile(new URL('../fixtures/contrast-reduction-reference.json',import.meta.url))).cases);
 try{for(const f of ref.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)));await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});
  for(const e of f.expected){for(let mode=0;mode<3;mode++){const r=await engine.run({id:'c',imageId:'i',operation:'tampering.contrast',params:{block:e.block,mode}});assert.equal(hash(r.data.values),e.sha256,f.name+' map '+e.block);assert.equal(hash(r.pixels.data),e.views[mode],f.name+' '+mode);assert.equal(r.metrics.cache.analysis,mode>0);assert.deepEqual([r.data.rows,r.data.cols,3],e.shape);assert.deepEqual(r.data.paddedSize,[f.width+e.block-f.width%e.block,f.height+e.block-f.height%e.block]);r.data.values.fill(-1);}}
  engine.unload('i');assert.equal(engine.capabilities().memory.cacheBytes,0);
 }}finally{engine.dispose();}
});
