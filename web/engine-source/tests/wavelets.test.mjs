import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initWaveletWasm} from '../src/wavelets.js';import {createEngine} from '../src/index.js';
test('59 wavelets and five thresholds preserve native reconstruction; threshold views reuse immutable coefficients',async()=>{
 await initWaveletWasm({wasmBinary:await readFile(new URL('../vendor/pywt/pywt.wasm',import.meta.url))});const ref=JSON.parse(await readFile(new URL('../fixtures/wavelet-reference.json',import.meta.url))),engine=createEngine();let total=0;
 try{for(const f of ref.cases){const data=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)));await engine.load({id:'i',bytes:data,pixels:{width:f.width,height:f.height,format:'rgb8',data}});let last;
  for(const e of f.expected){const r=await engine.run({id:'w',imageId:'i',operation:'detail.wavelets',params:e.params});assert.equal(r.metrics.cache.result,last===e.params.wavelet);last=e.params.wavelet;assert.equal(createHash('sha256').update(r.pixels.data).digest('hex'),e.sha256,`${f.name} ${JSON.stringify(e.params)}`);assert.equal(r.data.maximumLevel,e.maximum);assert.equal(Object.hasOwn(r,'coefficients'),false);r.pixels.data.fill(255);total++;}
  engine.unload('i');assert.equal(engine.capabilities().memory.cacheBytes,0);
 }assert.equal(total,3380);
 const data=Uint8Array.of(33,77,129);await engine.load({id:'i',bytes:data,pixels:{width:1,height:1,format:'rgb8',data}});
 for(const params of [{wavelet:'db21'},{wavelet:'rbio1.1'},{level:-1},{threshold:101},{mode:'unknown'}])await assert.rejects(engine.run({id:'w',imageId:'i',operation:'detail.wavelets',params}),{code:'INVALID_INPUT'});
 const r=await engine.run({id:'w',imageId:'i',operation:'detail.wavelets',params:{threshold:37}});assert.deepEqual(r.pixels.data,Uint8Array.of(129,129,129));assert.equal(r.data.effectiveLevel,0);
 }finally{engine.dispose();}
});
