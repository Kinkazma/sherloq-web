import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {illuminant,illuminantParams} from '../src/illuminant.js';
test('native illuminant: all methods, cells, transfers, exclusions and views',async()=>{
 const ref=JSON.parse(await readFile(new URL('../fixtures/illuminant-reference.json',import.meta.url)));let outputs=0,max=0;
 for(const f of ref.cases){const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};
  for(const e of f.expected){const actual=await illuminant(image,illuminantParams(e.params));assert.equal(createHash('sha256').update(actual.pixels.data).digest('hex'),e.sha256,`${f.name} ${JSON.stringify(e.params)}`);for(const key of ['counts','areas','valid'])assert.deepEqual(Array.from(actual.data[key]),e[key]);for(const key of ['rgb','globalRGB','angles'])for(let i=0;i<e[key].length;i++){const delta=Math.abs(actual.data[key][i]-e[key][i]);max=Math.max(max,delta);assert.ok(delta<=1e-12,`${f.name} ${key}: ${delta}`);}outputs++;}
 }console.log({outputs,maxNumericError:max});
});
