// Compare the actual WASM preprocessing output to native Albumentations inputs.
import {readFile, writeFile} from 'node:fs/promises';
import create from '../.build/forgeryscope/prepare.mjs';
const base = new URL('../.build/forgeryscope/', import.meta.url);
const reference = JSON.parse(await readFile(new URL('embeddings-reference.json', base)));
const m = await create(), records = [];
for (const model of reference.models) for (const c of model.cases) {
  const rgb = await readFile(new URL(c.rgbFile, base)), expectedBytes = await readFile(new URL(c.inputFile, base));
  const expected = new Float32Array(expectedBytes.buffer, expectedBytes.byteOffset, expectedBytes.byteLength/4);
  const input = m._malloc(rgb.length), output = m._malloc(expected.byteLength), params = m._malloc(24);
  try {
    m.HEAPU8.set(rgb,input); m.HEAPF32.set([...model.mean,...model.std],params/4);
    if (!m._fg_prepare(input,c.width,c.height,model.width,model.height,Number(model.transform==='longest_max_size'),params,params+12,output)) throw Error('Preparation failed');
    const actual=m.HEAPF32.subarray(output/4,output/4+expected.length);
    let count=0,maxError=0;
    for(let i=0;i<actual.length;i++){count+=actual[i]!==expected[i];maxError=Math.max(maxError,Math.abs(actual[i]-expected[i]));}
    records.push({model:model.id,case:c.id,values:actual.length,differences:count,maxError});
  } finally {m._free(params);m._free(output);m._free(input);}
}
const report={scope:'uint8 resize/padding/float32 normalization on native synthetic crops',passed:records.every(r=>r.differences===0),build:JSON.parse(await readFile(new URL('prepare-build.json',base))),records};
await writeFile(new URL('../docs/forgeryscope-prepare-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
