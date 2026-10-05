import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createDenseMath} from '../src/dense-math.js';
import {runPagedDenseField} from '../src/dense-paged.js';
import {Budget} from '../src/cache.js';
const math=await createDenseMath();
const plane=a=>({byteLength:a.byteLength,readInto(out,offset){out.set(new Uint8Array(a.buffer,a.byteOffset+offset,out.length));}});
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const proof={cases:[],status:'passed'};
for(const initialBatchPixels of [0,257])for(const residentPool of [false,true])for(const dimensions of [12,128])for(const compare of [false,true])for(const mapped of [false,true])for(const all of compare||mapped?[false]:[false,true]){
 const width=43,height=31,n=width*height;
 const first=Float32Array.from({length:n*dimensions},(_,i)=>Math.sin(i*1.7654)*.1);
 const second=Float32Array.from(first,(v,i)=>first[(i+dimensions*257)%first.length]);
 const mask=Uint8Array.from({length:n},(_,i)=>!all&&i%7===0?0:compare?1+(i%3):1);
 const axes=mapped?[Float32Array.from({length:width},(_,i)=>i*.625),Float32Array.from({length:height},(_,i)=>i*.75)]:null;
 const options={minimum:3,radius:31,iterations:3,compare,gap:mapped?[7,-5]:[0,0],axes};
 const expected=math.field(first,second,mask,width,height,{dimensions,...options});
 const budget=new Budget(32*1024**2),begin=performance.now();
 const result=await runPagedDenseField({first:plane(first),second:plane(second),mask:plane(mask),width,height,dimensions,axes:axes?.map(plane)}, {...options,axes:undefined,budget,residentPool,initialBatchPixels,pageBytes:512,cachePages:1});
 for(const key of ['targets','distancesSquared']){const actual=new Uint8Array(expected[key].byteLength);await result[key].readInto(actual);assert.deepEqual(actual,bytes(expected[key]),key);}
 assert.equal(result.comparisons,expected.comparisons);await result.dispose();assert.equal(budget.total(),0);
 proof.cases.push({dimensions,compare,mapped,all,comparisons:String(result.comparisons),milliseconds:performance.now()-begin,...result.metrics});
}
// Finite descriptors whose differences overflow still use the same attempt budget.
for(const dimensions of [12,128]){
 const width=37,height=19,n=width*height,first=Float32Array.from({length:n*dimensions},(_,i)=>(i%5===0?1:-1)*1e30),mask=new Uint8Array(n).fill(1);
 const expected=math.field(first,first,mask,width,height,{dimensions,minimum:3,radius:31,iterations:2});
 const budget=new Budget(32*1024**2),result=await runPagedDenseField({first:plane(first),mask:plane(mask),width,height,dimensions},{budget,initialBatchPixels:257,minimum:3,radius:31,iterations:2,pageBytes:512,cachePages:1});
 for(const key of ['targets','distancesSquared']){const actual=new Uint8Array(expected[key].byteLength);await result[key].readInto(actual);assert.deepEqual(actual,bytes(expected[key]),key);}
 assert.equal(result.comparisons,expected.comparisons);await result.dispose();assert.equal(budget.total(),0);proof.cases.push({overflow:true,dimensions,comparisons:String(result.comparisons),...result.metrics});
}
// Real cancellation after useful work, without discarding borrowed inputs.
const budget=new Budget(32*1024**2),stop=new AbortController(),n=10000;
await assert.rejects(runPagedDenseField({width:100,height:100,first:plane(new Float32Array(n*12)),mask:plane(new Uint8Array(n).fill(1))},{budget,signal:stop.signal,onProgress:()=>stop.abort(),pageBytes:512,cachePages:1}),e=>e.code==='CANCELLED');
assert.equal(budget.total(),0);proof.cancelled=true;
// I/O failures retain their storage identity, and partial outputs are released.
let reads=0;
await assert.rejects(runPagedDenseField({width:100,height:100,first:{byteLength:n*48,readInto(out){if(++reads===3)throw Object.assign(Error('injected storage failure'),{code:'STORAGE_IO'});out.fill(0);}},mask:plane(new Uint8Array(n).fill(1))},{budget,pageBytes:512,cachePages:1}),e=>e.code==='STORAGE_IO');
assert.equal(budget.total(),0);proof.ioFailureCleanup=true;
await writeFile(new URL('../docs/dense-paged-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
