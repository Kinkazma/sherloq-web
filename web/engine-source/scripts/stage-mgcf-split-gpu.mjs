// Stage the qualified-layout candidate and separate pinned runtime; old routes stay intact.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const runtime=JSON.parse(await readFile(new URL('.build/segmentation-ort-gpu-bounded-cache/build.json',root)));
const code=await readFile(new URL('.build/segmentation-ort-gpu-bounded-cache/ort.all.min.mjs',root));assert.equal(hash(code),runtime.files['ort.all.min.mjs'].sha256);
await writeFile(new URL('vendor/segmentation/ort.bounded-cache.min.mjs',root),code);
await writeFile(new URL('vendor/segmentation/GPU-CACHE-PINNED.json',root),JSON.stringify({...runtime,status:'staged-candidate',file:'ort.bounded-cache.min.mjs'},null,2)+'\n');
for(const variant of ['mgcfdn','mgcfdn-st']){
 const base=new URL('.build/segmentation-models/'+variant+'/',root),split=JSON.parse(await readFile(new URL('gpu-split.json',base))),model=SEGMENTATION_MODELS[variant];
 assert.equal(split.sourceSha256,model.sha256);assert.equal(split.checkpointSha256,model.checkpointSha256);
 for(const stage of split.stages){const b=await readFile(new URL(stage.file,base));assert.equal(b.length,stage.bytes);assert.equal(hash(b),stage.sha256);}
 const spec={schema:1,id:variant+'-gpu-split-v1',variant,sourceSha256:split.sourceSha256,checkpointSha256:split.checkpointSha256,side:256,kind:split.kind,assetBytes:split.assetBytes,boundary:split.boundary,stages:split.stages.map((s,i)=>({...s,backend:i===1&&variant==='mgcfdn-st'?'wasm':'webgpu'}))};
 const b=Buffer.from(JSON.stringify(spec,null,2)+'\n');await writeFile(new URL('gpu-split-bundle.json',base),b);
 console.log(JSON.stringify({variant,id:spec.id,bytes:b.length,sha256:hash(b),assetBytes:spec.assetBytes,bridgeBytes:3*(640*40*40*4+8),stageBackends:spec.stages.map(s=>s.backend)}));
}
