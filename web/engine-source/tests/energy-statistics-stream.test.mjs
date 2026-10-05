import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {Budget} from '../src/cache.js';import {summarizeEnergyValues} from '../src/energy-statistics-stream.js';import {gray} from '../src/pixel-utils.js';
const root=new URL('../fixtures/ela-energy/',import.meta.url),ref=JSON.parse(await readFile(new URL('preparation.json',root))),payload=gunzipSync(await readFile(new URL(ref.payload.file,root)));const bytes=part=>payload.subarray(part.offset,part.offset+part.length);
const store=values=>({byteLength:values.byteLength,readInto(out,at){out.set(new Uint8Array(values.buffer,values.byteOffset+at,out.length));}});
test('bounded order statistics and ordered reductions match native panel summaries for 84 energy preparations',async()=>{
 let probes=0;for(const row of ref.cases){const rgb=bytes(row.image),p=bytes(row.planes),planes=new Float32Array(p.buffer,p.byteOffset,p.byteLength/4),n=row.width*row.height;
  for(const panel of row.summary){const[x0,y0,x1,y1]=panel.bbox,indices=[];for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*row.width+x,g=gray(rgb[i*3],rgb[i*3+1],rgb[i*3+2]);if(g>3&&g<252)indices.push(i);}for(let q=0;q<3;q++){const values=Float32Array.from(indices,i=>planes[q*n+i]),budget=new Budget(2*1024**2);assert.deepEqual(await summarizeEnergyValues(store(values),values.length,row.quantiles,{budget}),panel.probes[q],row.name+' panel '+panel.id+' q'+q);assert.equal(budget.total(),0);probes++;}}
 }assert.equal(probes,216);
});
test('quantile endpoints, empty central selection, reduction boundaries and failures are exact',async()=>{
 for(const values of [Float32Array.of(0),Float32Array.of(0,255)]){const budget=new Budget(2*1024**2),r=await summarizeEnergyValues(store(values),values.length,[.1,.9],{budget});if(values.length===1)assert.equal(r.central_mean,0);else{assert.equal(r.central_mean,127.5);assert.equal(r.central_variance,0);}assert.equal(budget.total(),0);}
 const budget=new Budget(2*1024**2),values=Float32Array.of(1,2,NaN);await assert.rejects(summarizeEnergyValues(store(values),3,[0,1],{budget}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);values[2]=3;await assert.rejects(summarizeEnergyValues(store(values),3,[0,1],{budget:new Budget(1)}),{code:'MEMORY_LIMIT'});const controller=new AbortController();await assert.rejects(summarizeEnergyValues(store(values),3,[0,1],{budget,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),0);
});
test('multi-read external-order quantiles preserve NumPy statistics at a million values',async()=>{
 const reference=JSON.parse(await readFile(new URL('./data/energy-statistics-native.json',import.meta.url))),values=new Float32Array(reference.count);for(let i=0;i<values.length;i++)values[i]=((Math.imul(i,2654435761)+Math.imul(i>>>3,3266489917))&65535)/257;
 for(const item of reference.cases){const budget=new Budget(2*1024**2);assert.deepEqual(await summarizeEnergyValues(store(values),values.length,item.quantiles,{budget}),item.expected);assert.equal(budget.total(),0);}
});
