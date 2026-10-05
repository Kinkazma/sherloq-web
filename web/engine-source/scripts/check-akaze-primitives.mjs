// Stage equality only. This does not expose a product operation.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import create from '../.build/akaze-primitives.mjs';
const root=new URL('../',import.meta.url),base=new URL('.build/akaze-primitives-study/',root);
const ref=JSON.parse(await fs.readFile(new URL('reference.json',base),'utf8')),m=await create(),records=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const image of ref.images){
 const input=await fs.readFile(new URL(image.file,base));assert.equal(hash(input),image.sha256);const p=m._malloc(input.length);m.HEAPU8.set(input,p);
 try{for(const expected of image.results){
  const b=await fs.readFile(new URL(expected.file,base));assert.equal(hash(b),expected.sha256);
  const native=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
  for(const adapted of [false,true]){
   assert.equal(m._akaze_probe(p,image.width,image.height,expected.operation,+adapted),native.length);
   const output=m._akaze_probe_result()/4;let differences=0,max=0;const examples=[];
   for(let i=0;i<native.length;i++){
    const actual=m.HEAPF32[output+i];max=Math.max(max,Math.abs(native[i]-actual));
    if(native[i]!==actual){differences++;if(examples.length<3)examples.push({x:i%expected.width,y:Math.floor(i/expected.width),native:native[i],actual});}
   }
   records.push({image:image.name,operation:expected.operation,adapted,differences,max,examples});m._akaze_probe_release();
  }
 }}finally{m._akaze_probe_release();m._free(p);}
}
const summary=Array.from({length:26},(_,i)=>{const operation=Math.floor(i/2),adapted=!!(i%2),r=records.filter(x=>x.operation===operation&&x.adapted===adapted);return {operation,adapted,cases:r.length,differingCases:r.filter(x=>x.differences).length,differingValues:r.reduce((n,x)=>n+x.differences,0),max:Math.max(...r.map(x=>x.max))};});
const hashes={};for(const file of ['experiments/cloning/akaze-primitives.cpp','experiments/cloning/akaze-filters.cpp','experiments/cloning/akaze-separable.cpp','experiments/cloning/akaze-area.cpp','.build/akaze-primitives.wasm'])hashes[file]=hash(await fs.readFile(new URL(file,root)));
await fs.writeFile(new URL('docs/akaze-primitives-study.json',root),JSON.stringify({schema:1,scope:'offline float32 primitives, no product or detector availability claim',reference:{numpy:ref.numpy,opencv:ref.opencv,seed:ref.seed},hashes,summary,records},null,2)+'\n');
console.log(summary);assert.equal(summary.filter(x=>x.adapted).reduce((n,x)=>n+x.differingCases,0),0,'Candidate primitives must be exact');
