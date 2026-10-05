import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createDenseMath} from '../src/dense-math.js';
import {sampleDenseLinks} from '../src/dense-links.js';
const dir=new URL('../.build/dense-post-reference/',import.meta.url),records=JSON.parse(await fs.readFile(new URL('manifest.json',dir),'utf8'));
const kernel=await createDenseMath({print:()=>{}}),results=[];
async function read(name,Type){const b=await fs.readFile(new URL(name,dir));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
for(const r of records){
 const targets=await read(r.stem+'-targets.i32',Int32Array),squared=await read(r.stem+'-squared.f32',Float32Array);
 const actual=kernel.coherence(targets,squared,r.width,r.height,r);
 assert.deepEqual(actual.selected,await read(r.stem+'-selected.u8',Uint8Array),r.stem+' selection');
 assert.deepEqual(actual.errors,await read(r.stem+'-errors.f32',Float32Array),r.stem+' residual');
 const links=sampleDenseLinks(targets,squared,actual.selected,17);
 assert.equal(links.total,r.total);assert.deepEqual(links.rows,await read(r.stem+'-rows.i32',Int32Array));
 results.push({case:r.stem,selected:actual.selected.reduce((s,v)=>s+v,0),links:links.total,exact:true});
}
await fs.writeFile(new URL('../docs/dense-post-native-proof.json',import.meta.url),JSON.stringify({results},null,2)+'\n');console.log(JSON.stringify({passed:records.length}));
