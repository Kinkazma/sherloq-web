import fs from 'node:fs/promises';
import createModule from '../.build/cfa-m2/operators.mjs';
import {runNoiseprintPlusProgram} from '../src/noiseprint-plus-program.js';
const root=new URL('../',import.meta.url),read=p=>fs.readFile(new URL(p,root)),json=async p=>JSON.parse(await read(p)),f32=async p=>{const b=await read(p);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const program=await json('.build/trufor-npp/native.program.json'),weights=await f32('.build/trufor-npp/native.weights.f32'),module=await createModule({wasmBinary:await read('.build/cfa-m2/operators.wasm'),wasmMemory:new WebAssembly.Memory({initial:256,maximum:32768})}),ref=await json('.build/trufor-unfused/reference.json'),records=[];
for(const c of [ref.cases[0],ref.cases[1]]){
 const rgb=await f32('.build/trufor-unfused/'+c.files.rgb.file),expected=await f32('.build/trufor-npp/native-'+c.id+'.f32'),data=new Float32Array(expected.length),w=c.width,h=c.height,n=w*h;let tiles=0;
 for(let y=0;y<h;y+=9){const end=Math.min(h,y+9),lo=Math.max(0,y-17),hi=Math.min(h,end+17),nn=w*(hi-lo),input=new Float32Array(3*nn);for(let ch=0;ch<3;ch++)input.set(rgb.subarray(ch*n+lo*w,ch*n+hi*w),ch*nn);const result=runNoiseprintPlusProgram(module,program,weights,{data:input,dims:[1,3,hi-lo,w]},{globalHeight:h,offsetY:lo});data.set(result.data.subarray((y-lo)*w,(end-lo)*w),y*w);tiles++;}
 let maxError=0,differences=0;for(let i=0;i<n;i++){maxError=Math.max(maxError,Math.abs(expected[i]-data[i]));differences+=expected[i]!==data[i];}records.push({case:c.id,tiles,maxError,differences});console.log(records.at(-1));
}
const proof={records,passed:records.every(r=>r.maxError===0)};await fs.writeFile(new URL('docs/trufor-npp-tiles-proof.json',root),JSON.stringify(proof,null,2)+'\n');if(!proof.passed)process.exitCode=1;
