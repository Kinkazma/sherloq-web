// Offline exact comparison of the FMA candidate with independent native data.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import makeModule from '../.build/cloning-fast.mjs';
const expanded=process.argv.includes('--expanded'),base=new URL(expanded?'../.build/akaze-expanded-study/':'../.build/cloning-study/',import.meta.url);
const m=await makeModule(),wasmSha256=createHash('sha256').update(await fs.readFile(new URL('../.build/cloning-fast.wasm',import.meta.url))).digest('hex');
assert.equal(m._cloning_fma_test(260005,1000000),0,'Random bit patterns, cancellation, special values and double-rounding traps');
const load=async file=>fs.readFile(new URL(file,base));
const copy=bytes=>{const p=m._malloc(Math.max(1,bytes.length));assert.ok(p);m.HEAPU8.set(bytes,p);return p;};
const reference=JSON.parse(await load('reference.json')),records=[];
const exact=(a,b,label)=>{assert.equal(a.length,b.length,label+' length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])assert.fail(`${label} ${i}: ${a[i]} / ${b[i]}`);};
for(const image of reference.images){
  const cases=image.results.filter(x=>x.algorithm===2);
  if(!cases.length){assert.ok(!expanded&&image.name.startsWith('large-'),'Missing AKAZE reference');continue;}
  const gray=copy(await load(image.gray));
  for(const row of cases){
    const mask=row.maskFile?copy((await load(row.maskFile)).map(x=>x>0?1:0)):0;
    try{
      const count=m._cloning_detect_akaze(gray,mask,image.width,image.height);assert.equal(count,row.count,image.name+'/'+row.mask+' count');
      if(count){
        const bytes=await load(row.points),points=new Float64Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
        exact(m.HEAPF64.subarray(m._cloning_result()/8,m._cloning_result()/8+count*7),points,'point');
        exact(m.HEAPU8.subarray(m._cloning_descriptors(),m._cloning_descriptors()+count*61),await load(row.descriptors),'descriptor');
      }
      records.push({image:image.name,width:image.width,height:image.height,mask:row.mask,count,heapCapacityBytes:m.HEAPU8.byteLength});
    }finally{m._cloning_release();if(mask)m._free(mask);}
  }
  m._free(gray);console.log(image.name,'exact');
}
assert.equal(records.length,expanded?128:48,'Complete declared detector corpus');
await fs.writeFile(new URL(expanded?'../docs/akaze-fast-expanded-study.json':'../docs/akaze-fast-study.json',import.meta.url),JSON.stringify({schema:1,scope:'offline candidate, no product activation',wasmSha256,nativeSourceSha256:reference.sourceSha256,fmaChecks:2021297,records},null,2)+'\n');
