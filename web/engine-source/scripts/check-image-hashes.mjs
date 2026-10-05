import {readFile,writeFile} from 'node:fs/promises';import {initCvWasm,cvHash} from '../src/opencv.js';
const ref=JSON.parse(await readFile(new URL('../fixtures/image-hash-reference.json',import.meta.url)));await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});const report=[];
for(const f of ref.cases){const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};
 for(let kind=0;kind<f.hashes.length;kind++){const expected=f.hashes[kind],actual=await cvHash(image,kind);let different=0,max=0;for(let i=0;i<actual.length;i++){const delta=Math.abs(actual[i]-expected.values[i]);different+=delta!==0;max=Math.max(max,delta);}report.push({file:f.file,kind:expected.name,different,max,exactLength:actual.length===expected.values.length});}
}
await writeFile(new URL('../docs/image-hash-experiment.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:report.length,mismatches:report.filter(x=>x.different||!x.exactLength)},null,2));
