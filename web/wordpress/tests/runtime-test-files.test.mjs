import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRuntimeTestFiles} from './runtime-test-files.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sherloq-test-contract-')),assets=path.join(root,'assets'),chunks=path.join(root,'chunks');await fs.mkdir(assets);await fs.mkdir(chunks);
 const data=Buffer.from('{"schema":"verified-configuration"}'),weight=Buffer.from('small weight byte fixture'),jsonHash=sha(data),weightHash=sha(weight),manifest={schema:'sherloq.dependencies/1',slots:['runtime'],chunks:{[jsonHash]:data.length,[weightHash]:weight.length},files:{'runtime/config.json':{sha256:jsonHash,size:data.length,chunks:[jsonHash],type:'application/json'},'runtime/model.bin':{sha256:weightHash,size:weight.length,chunks:[weightHash],type:'application/octet-stream'}}};
 const manifestBytes=Buffer.from(JSON.stringify(manifest)),manifestPath=path.join(root,sha(manifestBytes)+'.json');await fs.writeFile(manifestPath,manifestBytes);await fs.writeFile(path.join(chunks,jsonHash+'.bin'),data);await fs.writeFile(path.join(chunks,weightHash+'.bin'),weight);
 return {root,assets,chunks,data,weight,jsonHash,weightHash,manifestPath,access:createRuntimeTestFiles(assets,{manifestPath,chunkRoots:[chunks]}),cleanup:()=>fs.rm(root,{recursive:true,force:true})};
}
test('contract transport verifies actual small JSON and declares exactly what weight checks establish',async()=>{
 const f=await fixture();try{
  const config=path.join(f.assets,'runtime/config.json'),model=path.join(f.assets,'runtime/model.bin');assert.deepEqual(await f.access.readJSONBytes(config,{expectedSHA:f.jsonHash}),f.data);
  const description=await f.access.describe(model,{expectedSHA:f.weightHash});assert.equal(description.size,f.weight.length);assert.equal(description.sha256,f.weightHash);assert.equal(description.source,'content-addressed-descriptor');assert.equal(description.bodyVerified,false);
  await assert.rejects(f.access.readJSONBytes(model),/Only small execution JSON/);await assert.rejects(f.access.describe(model,{expectedSHA:'a'.repeat(64)}),/Runtime lock differs/);await assert.rejects(f.access.describe(path.join(f.root,'outside.bin')));
 }finally{await f.cleanup();}
});
test('same-size corrupt JSON pieces, truncated weight pieces and physical JSON corruption fail strictly',async()=>{
 const f=await fixture();try{
  const config=path.join(f.assets,'runtime/config.json');await fs.writeFile(path.join(f.chunks,f.jsonHash+'.bin'),Buffer.alloc(f.data.length,120));await assert.rejects(f.access.readJSONBytes(config),/piece SHA-256 differs/);
  await fs.writeFile(path.join(f.chunks,f.weightHash+'.bin'),Buffer.alloc(1));await assert.rejects(f.access.describe(path.join(f.assets,'runtime/model.bin')),/Missing or truncated/);
  await fs.mkdir(path.dirname(config));await fs.writeFile(config,Buffer.alloc(f.data.length,121));await assert.rejects(f.access.readJSONBytes(config),/Physical runtime JSON identity differs/);
 }finally{await f.cleanup();}
});
test('the fallback cannot trust a manifest whose named immutable identity differs',async()=>{
 const f=await fixture();try{
  const wrong=path.join(f.root,'b'.repeat(64)+'.json');await fs.copyFile(f.manifestPath,wrong);const access=createRuntimeTestFiles(f.assets,{manifestPath:wrong,chunkRoots:[f.chunks]});await assert.rejects(access.readJSONBytes(path.join(f.assets,'runtime/config.json')),/SHA-verified immutable dependency manifest/);
 }finally{await f.cleanup();}
});
