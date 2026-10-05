import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {catnetCropOrient} from '../src/catnet-analyzer.js';
test('CAT-Net crops stored padding before all eight native EXIF orientations',async()=>{
 const expected=JSON.parse(await readFile(new URL('./data/catnet-orientation.json',import.meta.url),'utf8')),padded=new Float32Array(64).fill(-1000);
 for(let y=0;y<5;y++)for(let x=0;x<7;x++)padded[y*8+x]=y*7+x;
 for(const c of expected){const result=catnetCropOrient(padded,{source_shape:[5,7],padded_shape:[8,8],orientation:c.orientation});assert.deepEqual([result.height,result.width],c.shape);assert.deepEqual([...result.data],c.values);}
});
