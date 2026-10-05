import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createDenseMath,denseGray,normalizeDense,canonicalDenseSift} from '../src/dense-math.js';
const dir=new URL('../.build/dense-reference/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',dir),'utf8'));
async function read(name,Type){const b=await fs.readFile(new URL(name,dir));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
const kernel=await createDenseMath({print:()=>{}}), results=[];
function difference(actual,expected){assert.equal(actual.length,expected.length);let max=0,changed=0;for(let i=0;i<actual.length;i++){if(actual[i]===expected[i])continue;changed++;max=Math.max(max,Math.abs(actual[i]-expected[i]));}return {max,changed};}
for(const r of manifest.cases){
 const {stem,width,height,method,patch,dimensions,dw,dh}=r;
 const rgb=await read(stem+'-rgb.u8',Uint8Array),gray=await read(stem+'-gray.f32',Float32Array);
 assert.deepEqual(denseGray(rgb),gray);
 const actual=kernel.features(gray,width,height,{method,patch,reflection:true}), row={stem,descriptors:[],fields:[]};
 for(const [name,values] of [['a',actual.first],['b',actual.second]]){
  const raw=await read(stem+'-'+name+'-raw.f32',Float32Array),expected=await read(stem+'-'+name+'.f32',Float32Array);
  assert.deepEqual(normalizeDense(raw,dimensions),expected,'NumPy normalization');
  const diff=difference(values,expected);row.descriptors.push({name,...diff});assert.ok(diff.max<1e-4,JSON.stringify(diff));
 }
 const a=await read(stem+'-a.f32',Float32Array),b=await read(stem+'-b.f32',Float32Array);
 if(method){const values=a.slice(),diversity=canonicalDenseSift(values);assert.deepEqual(values,await read(stem+'-canonical.f32',Float32Array));assert.deepEqual(diversity,await read(stem+'-diversity.u8',Uint8Array));}
 for(const c of r.fields){
  const prefix=stem+'-'+c.case,mask=await read(prefix+'-mask.u8',Uint8Array);
  const options={dimensions,minimum:3,radius:19,iterations:3,compare:c.compare,gap:c.gap,axes:c.axes?[await read(prefix+'-x.f32',Float32Array),await read(prefix+'-y.f32',Float32Array)]:null};
  const expected=await read(prefix+'-targets.i32',Int32Array),squared=await read(prefix+'-squared.f32',Float32Array);
  const field=kernel.field(a,b,mask,dw,dh,options),direct=kernel.field(a,b,mask,dw,dh,{...options,bounded:false});
  assert.deepEqual(field.targets,expected,'native target field');assert.equal(field.comparisons,BigInt(c.comparisons));assert.deepEqual(field,direct,'bounded rank/select preserves traversal');
  const diff=difference(field.distancesSquared,squared);assert.ok(diff.max<1e-6,JSON.stringify(diff));
  // Also inspect the entire WASM descriptor -> field chain, separately from
  // the exact candidate traversal on common descriptor inputs.
  const composed=kernel.field(actual.first,actual.second,mask,dw,dh,options);
  assert.deepEqual(composed.targets,expected,'composed native targets');
  row.fields.push({case:c.case,distances:diff,composedTargets:difference(composed.targets,expected),comparisons:c.comparisons});
 }
 results.push(row);
}
await fs.mkdir(new URL('../docs/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../docs/dense-native-proof.json',import.meta.url),JSON.stringify({librarySha256:manifest.librarySha256,results},null,2)+'\n');
console.log(JSON.stringify(results));
