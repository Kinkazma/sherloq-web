import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const assets=process.env.SHERLOQ_TEST_ASSET_ROOT?new URL('file://'+process.env.SHERLOQ_TEST_ASSET_ROOT.replace(/\/$/,'')+'/'):new URL('sherloq-browser/assets/',root);
test('D2PRL delivery includes every content-addressed manifest asset, including the late role model',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('unified-assets/d2prl/model.json',assets)));
 const lock=JSON.parse(await fs.readFile(new URL('runtime-lock.json',root)));
 const files=lock.runtimes.find(r=>r.destination==='sherloq-browser/assets/unified-assets').files;
 for(const [name,record]of Object.entries(manifest.assets)){
  assert.equal(files['d2prl/'+name],record.sha256,'Missing or mismatched asset '+name);
  assert.equal((await fs.stat(new URL('unified-assets/d2prl/'+name,assets))).size,record.bytes);
 }
 assert.equal(files['d2prl/'+manifest.roles.modelFile],manifest.roles.modelSha256);
});
