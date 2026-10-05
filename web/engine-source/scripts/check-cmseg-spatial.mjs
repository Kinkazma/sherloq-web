import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../.build/cmseg-spatial/spatial512.js';
const base=new URL('../.build/cmseg-spatial/',import.meta.url),module=await factory(),ref=JSON.parse(await readFile(new URL('reference.json',base))),records=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const row of ref.records){
  const input=await readFile(new URL(row.input.file,base)),expected=await readFile(new URL(row.output.file,base));if(sha(input)!==row.input.sha256||sha(expected)!==row.output.sha256)throw Error('Fixture');
  const ip=module._malloc(input.length),op=module._malloc(expected.length);if(!ip||!op)throw Error('Allocation');
  try{
    module.HEAPU8.set(input,ip);if(module._d2prl_resize_plane(ip,row.input.shape[1],row.input.shape[0],row.output.shape[1],row.output.shape[0],row.nearest,op)!==1)throw Error('Resize');
    const actual=module.HEAPU8.slice(op,op+expected.length);records.push({name:row.name,bytes:actual.length,exact:sha(actual)===row.output.sha256});
  }finally{module._free(ip);module._free(op);}
}
const proof={schema:1,status:records.every(r=>r.exact)?'passed-bit-exact':'rejected',scope:'Native OpenCV4.11 source projection512 extension with unchanged default448 binary. Nearest masks and bilinear probabilities including native CMSeg positive input.',records,build:JSON.parse(await readFile(new URL('build.json',base)))};
await writeFile(new URL('../docs/cmseg-spatial512-node-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(proof.status,records.length);if(proof.status==='rejected')process.exitCode=1;
