import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {magnifier,magnifierParams} from '../src/magnifier.js';
test('native magnifier: clipped ROI, empty regions, equalization and contrast',async()=>{
 const ref=JSON.parse(await readFile(new URL('../fixtures/magnifier-reference.json',import.meta.url)));let outputs=0;
 for(const f of ref.cases){const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};for(const e of f.expected){const actual=await magnifier(image,magnifierParams(e.params));assert.deepEqual(actual.data.bounds,e.bounds);assert.equal(actual.pixels?createHash('sha256').update(actual.pixels.data).digest('hex'):null,e.sha256,`${f.name} ${JSON.stringify(e.params)}`);outputs++;}}console.log({outputs});
});
