import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {prnuStreamMath} from '../src/prnu-stream-math.js';import {segmentedPrnuCorrelation} from '../src/segmented-prnu-correlation.js';import {Budget} from '../src/cache.js';
const math=await prnuStreamMath({bytes:new Uint8Array(await fs.readFile(new URL('../vendor/pocketfft/prnu-twiddles.bin',import.meta.url)))});
test('complete PRNU axes retain every bit of the qualified global FFT convolution',async()=>{
 for(const [width,height]of [[3,3],[7,9],[31,37],[64,71],[101,99],[256,259]]){const values=Float64Array.from({length:width*height},(_,i)=>((i*71+Math.floor(i/9))%256)/255),input={width,height,async read(x,y,w,h){assert.equal(x,0);assert.equal(w,width);return values.slice(y*width,(y+h)*width);}},budget=new Budget(64*1024**2),expected=math.full(values,width,height),result=await segmentedPrnuCorrelation(input,{budget,blockPixels:4096});const actual=await result.read(0,0,width,height);assert.deepEqual(new Uint8Array(actual.buffer),new Uint8Array(expected.buffer),width+'x'+height);await result.dispose();assert.equal(budget.total(),0);}
});
