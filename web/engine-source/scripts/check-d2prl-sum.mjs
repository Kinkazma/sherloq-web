import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../.build/d2prl-neural-math/neural-math.js';
const root=new URL('../',import.meta.url),base=new URL('.build/d2prl-sum/',root),hash=b=>createHash('sha256').update(b).digest('hex'),reference=JSON.parse(await readFile(new URL('reference.json',base))),module=await factory(),records=[];
for(const row of reference.records){
 const data=await readFile(new URL(row.input.file,base)),expected=await readFile(new URL(row.output.file,base));if(hash(data)!==row.input.sha256||hash(expected)!==row.output.sha256)throw Error('Identity');
 const ip=module._malloc(data.length),op=module._malloc(4);if(!ip||!op)throw Error('Allocation');
 try{module.HEAPU8.set(data,ip);if(module._d2prl_sum_all(ip,data.length/4,row.referenceThreads,op)!==1)throw Error('Sum rejected');const actual=module.HEAPU8.slice(op,op+4);records.push({name:row.name,elements:data.length/4,exact:hash(actual)===row.output.sha256,actual:new Float32Array(actual.buffer)[0],expected:expected.readFloatLE(0)});}finally{module._free(ip);module._free(op);}
}
const report={schema:1,status:records.every(r=>r.exact)?'passed':'rejected',scope:reference.scope,records,node:process.version,build:JSON.parse(await readFile(new URL('.build/d2prl-neural-math/build.json',root)))};
await writeFile(new URL('docs/d2prl-sum-node-proof.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:records.length,failures:records.filter(r=>!r.exact)}));if(report.status!=='passed')process.exitCode=1;
