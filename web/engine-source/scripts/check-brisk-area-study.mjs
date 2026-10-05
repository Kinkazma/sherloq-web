// Isolated offline arithmetic comparison. A pass does not qualify BRISK itself.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import create from '../.build/brisk-area-probe.mjs';
const root=new URL('../',import.meta.url),base=new URL('.build/brisk-area-study/',root);
const ref=JSON.parse(await fs.readFile(new URL('reference.json',base),'utf8')),m=await create(),records=[];
for(const image of ref.images)for(let i=1;i<image.layers.length;i++){
 const input=image.layers[i===1?0:i-2],expected=image.layers[i];
 const bytes=await fs.readFile(new URL(input.file,base)),out=await fs.readFile(new URL(expected.file,base));
 for(const [data,item] of [[bytes,input],[out,expected]])assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);
 const p=m._malloc(bytes.length);m.HEAPU8.set(bytes,p);
 try{for(const adapted of [0,1]){
  assert.equal(m._probe_resize(p,input.width,input.height,expected.width,expected.height,adapted),1);
  const actual=m.HEAPU8.subarray(m._probe_result(),m._probe_result()+out.length);let max=0,differences=0;
  for(let j=0;j<out.length;j++){max=Math.max(max,Math.abs(actual[j]-out[j]));differences+=actual[j]!==out[j];}
  records.push({image:image.name,layer:i,adapted:!!adapted,input:[input.width,input.height],output:[expected.width,expected.height],max,differences});m._probe_release();
 }}finally{m._probe_release();m._free(p);}
}
const summary=[false,true].map(adapted=>{const r=records.filter(x=>x.adapted===adapted);return {adapted,cases:r.length,differingCases:r.filter(x=>x.differences).length,differingBytes:r.reduce((n,x)=>n+x.differences,0),max:Math.max(...r.map(x=>x.max))};});
const hashes={};for(const file of ['experiments/cloning/brisk-area.cpp','experiments/cloning/brisk-area-probe.cpp','.build/brisk-area-probe.wasm'])hashes[file]=createHash('sha256').update(await fs.readFile(new URL(file,root))).digest('hex');
await fs.writeFile(new URL('docs/brisk-area-study.json',root),JSON.stringify({schema:1,scope:'offline grayscale INTER_AREA; not BRISK qualification',reference:{numpy:ref.numpy,opencv:ref.opencv,seed:ref.seed},summary,hashes,records},null,2)+'\n');
console.log(summary);assert.equal(summary[1].differingCases,0);
