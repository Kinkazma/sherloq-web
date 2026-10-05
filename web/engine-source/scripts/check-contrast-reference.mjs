import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initCvWasm,cvContrast,cvContrastView} from '../src/opencv.js';
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});const ref=JSON.parse(await readFile(new URL('../fixtures/contrast-reference.json',import.meta.url))),report=[];
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
for(const f of ref.cases){const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};for(const e of f.expected){const r=await cvContrast(image,e.block),differences=r.values.map((v,i)=>v-e.values[i]),errors=[0,1,2].map(c=>Math.max(...Array.from(differences).filter((_,i)=>i%3===c).map(Math.abs))),views=[];for(let mode=0;mode<3;mode++)views.push(hash((await cvContrastView(r,f.width,f.height,e.block,mode)).data)===e.views[mode]);const row={name:f.name,block:e.block,exact:hash(r.values)===e.sha256,errors,views};report.push(row);console.log(row);}}
await writeFile(new URL('../docs/contrast-parity-experiment.json',import.meta.url),JSON.stringify({schema:1,rows:report},null,2)+'\n');

if(report.some(r=>!r.exact||r.errors.some(e=>e!==0)||r.views.some(v=>!v)))throw new Error('Contrast native parity failed');
