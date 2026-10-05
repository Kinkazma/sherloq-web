import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {prnuStreamMath} from '../src/prnu-stream-math.js';import {segmentedPrnuResidual} from '../src/segmented-prnu.js';import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';
await prnuStreamMath({bytes:new Uint8Array(await fs.readFile(new URL('../vendor/pocketfft/prnu-twiddles.bin',import.meta.url)))});
const read=async name=>new Uint8Array(await fs.readFile(new URL('../fixtures/'+name,import.meta.url)));
test('segmented Wiener residual and global noise mean preserve native binary64',async()=>{
 const reference=JSON.parse(new TextDecoder().decode(await read('prnu-reference.json'))),budget=new Budget(64*1024**2);
 for(const c of reference.cases.filter(c=>!c.error)){const surface=contiguousSurface({width:c.width,height:c.height,data:await read(c.file)},budget),r=await segmentedPrnuResidual({surface},{budget,blockPixels:4096});assert.equal(r.method,c.method,c.name+' method');assert.equal(r.noisePower,c.noisePower,c.name+' noise');const actual=await r.read(0,0,r.width,r.height);assert.deepEqual(new Uint8Array(actual.buffer),await read(c.residual),c.name+' residual');await r.dispose();assert.equal(budget.total(),0);}
});
test('PRNU cancellation removes every global temporary plane at each useful phase',async()=>{
 const budget=new Budget(64*1024**2),surface=contiguousSurface({width:192,height:192,data:Uint8Array.from({length:192*192*3},(_,i)=>i*71%256)},budget);let live=0;
 const session={async create(length){live++;const bytes=new Uint8Array(length);return {readInto(out,at){out.set(bytes.subarray(at,at+out.length));},write(src,at){bytes.set(src,at);},flush(){},dispose(){live--;}};}};
 for(const phase of ['prnu-gray','prnu-fft-rows','prnu-fft-columns','prnu-fft-inverse','prnu-statistics','prnu-noise','prnu-residual']){const stop=new AbortController();await assert.rejects(segmentedPrnuResidual({surface,session},{budget,blockPixels:4096,storage:'temporary',signal:stop.signal,onProgress:p=>{if(p.phase===phase)stop.abort();}}),{code:'CANCELLED'});assert.equal(live,0,phase);assert.equal(budget.total(),0,phase);}
});
