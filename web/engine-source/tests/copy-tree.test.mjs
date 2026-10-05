import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {copyTreeRanks} from '../src/copy-tree.js';
const ref=JSON.parse(readFileSync(new URL('./m3-data/copy-tree-reference.json',import.meta.url)));
for(const c of ref.cases)test('native cKDTree leaf order '+c.name,async()=>{const ranks=await copyTreeRanks(Float64Array.from(c.points.flat()),{reserveMemory(){}});assert.deepEqual(c.order.map(i=>ranks[i]),Array.from({length:c.order.length},(_,i)=>i));});
