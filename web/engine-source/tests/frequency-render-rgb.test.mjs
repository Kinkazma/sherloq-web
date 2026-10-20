import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual bounded RGB raster loop without requiring a DFT runtime.
const source=await readFile(new URL('../src/segmented-frequency.js',import.meta.url),'utf8');
const raster=source.match(/const bytes=new Uint8Array\(w\*count\*3\);[\s\S]*?(?=await store\.write\(bytes,y\*w\*3\))/);
assert.ok(raster,'Frequency RGB raster loop is present');
const render=new Function('values','w','count','y','top',raster[0]+'return bytes;');
const previous=(values,w,count,y,top)=>{
 const bytes=new Uint8Array(w*count*3);
 for(let i=0;i<w*count;i++)bytes.fill(values[(y-top)*w+i],i*3,i*3+3);
 return bytes;
};

test('frequency RGB raster preserves all byte values in every channel',()=>{
 const values=Float32Array.from({length:256},(_,i)=>i),actual=render(values,32,8,0,0);
 assert.deepEqual(actual,previous(values,32,8,0,0));
 for(let i=0;i<values.length;i++)assert.deepEqual([...actual.subarray(i*3,i*3+3)],[i,i,i]);
});

test('frequency RGB conversion preserves fractional, out-of-range and non-finite casting',()=>{
 const values=Float32Array.of(-Infinity,-4294967296,-257.75,-256,-255.5,-1.75,-1,-0,0,0.5,1.5,127.99,254.99,255,255.99,256,257,65535,4294967296,Infinity,NaN);
 assert.deepEqual(render(values,values.length,1,0,0),previous(values,values.length,1,0,0));
});

test('frequency RGB rendering selects the same stripe rows with filter halos',()=>{
 const w=37,count=11,halo=15;let seed=71231;
 const values=Float32Array.from({length:w*(count+halo*2)},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*511-128;});
 for(const y of[0,1,15,173]){
  const top=Math.max(0,y-halo);
  assert.deepEqual(render(values,w,count,y,top),previous(values,w,count,y,top));
 }
});
