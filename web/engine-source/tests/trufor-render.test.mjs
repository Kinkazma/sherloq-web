import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderTrufor} from '../src/trufor-render.js';
import {Budget} from '../src/cache.js';
const cases=JSON.parse(await readFile(new URL('./data/trufor/render.json',import.meta.url),'utf8'));
for(const c of cases)test('Native TruFor renderer: '+c.kind,async()=>{
  const budget=new Budget(1024**2),data={width:c.width,height:c.height,map:Float32Array.from(c.data.map),confidence:Float32Array.from(c.data.conf),noiseprint_pp:Float32Array.from(c.data['np++'])};
  for(const [i,view] of ['map','confidence','noiseprint_pp'].entries()){
    const output=await renderTrufor(data,view,{budget});assert.deepEqual([...output.data],c.expected[i]);output.release();
  }
  assert.equal(budget.active,0);
});
