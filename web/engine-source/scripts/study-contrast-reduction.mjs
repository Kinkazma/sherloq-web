import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initCvWasm,cvContrast} from '../src/opencv.js';
const baseline=process.argv.find(a=>a.startsWith('--baseline-wasm='))?.slice(16),reference=JSON.parse(await readFile(new URL('../fixtures/contrast-reduction-reference.json',import.meta.url))),records=[];
for(const [label,file] of [...(baseline?[['pre-fix',baseline]]:[]),['corrected',new URL('../vendor/opencv/opencv.wasm',import.meta.url)]]){
 const binary=await readFile(file);await initCvWasm({wasmBinary:binary});
 for(const f of reference.cases){const data=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url))),expected=f.expected[0],actual=await cvContrast({width:f.width,height:f.height,data,format:'rgb8'},expected.block);let differences=0,maxAbsoluteError=0;
  for(let i=0;i<actual.values.length;i++)if(actual.values[i]!==expected.values[i]){differences++;maxAbsoluteError=Math.max(maxAbsoluteError,Math.abs(actual.values[i]-expected.values[i]));}
  const sha256=createHash('sha256').update(new Uint8Array(actual.values.buffer,actual.values.byteOffset,actual.values.byteLength)).digest('hex');if(label==='corrected'&&(differences||sha256!==expected.sha256))throw Error('Native map mismatch');
  records.push({label,wasmSha256:createHash('sha256').update(binary).digest('hex'),inputSha256:f.inputSha256,dimensions:[f.width,f.height],block:expected.block,mapSha256:sha256,nativeMapSha256:expected.sha256,differences,maxAbsoluteError});
 }
}
const report={schema:1,status:'passed',scope:'Independent native257x257 regression, block256. Corrected map is bit-exact; pre-fix binary is optional evidence only. NumPy reduction combines8192-element partial sums, each in the existing128/8-lane pairwise order. No tolerance, threshold, codec or display change.',numpy:reference.numpy,bufferElements:reference.bufferElements,nativeSources:reference.nativeSources,records,sources:{}};
for(const file of ['native/contrast.h','scripts/study-contrast-reduction.mjs','scripts/generate-contrast-reduction-reference.py','fixtures/contrast-reduction-reference.json'])report.sources[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
await writeFile(new URL('../docs/contrast-reduction-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(records));
