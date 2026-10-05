// Stage only the separate, reproducibly built postprocessor; existing native
// FMA CPU kernels and their identities remain unchanged.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),built=new URL('.build/cmseg-correlation-gpu-post-32m/',root),output=new URL('vendor/segmentation/cmseg-correlation-gpu/',root);
const hash=b=>createHash('sha256').update(b).digest('hex'),build=JSON.parse(await readFile(new URL('build.json',built)));
for(const [file,sha]of Object.entries(build.sources))assert.equal(hash(await readFile(new URL(file,root))),sha);
await mkdir(output,{recursive:true});
for(const [file,spec]of Object.entries(build.files)){assert(['post.js','post.wasm'].includes(file));const bytes=await readFile(new URL(file,built));assert.equal(bytes.length,spec.bytes);assert.equal(hash(bytes),spec.sha256);await writeFile(new URL(file,output),bytes);}
await writeFile(new URL('vendor/segmentation/CORRELATION-GPU-POST-PINNED.json',root),JSON.stringify({...build,scope:'Ordered GPU dots are supplied as complete global rows; native CPU float32 Gaussian suppression, two softmax axis arithmetic and sorted top-k are preserved. Normalization is the existing qualified FMA order. No model weights or activations are included.',license:'../d2prl/PYTORCH-LICENSE.txt'},null,2)+'\n');
console.log('Staged identical CMSeg GPU-dot CPU postprocessor bytes');
