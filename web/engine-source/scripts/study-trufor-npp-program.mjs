import fs from 'node:fs/promises';
import createModule from '../.build/cfa-m2/operators.mjs';
import {runNoiseprintPlusProgram} from '../src/noiseprint-plus-program.js';
const root=new URL('../',import.meta.url),read=p=>fs.readFile(new URL(p,root)),json=async p=>JSON.parse(await read(p)),f32=async p=>{const b=await read(p);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const program=await json('.build/trufor-npp/native.program.json'),weights=await f32('.build/trufor-npp/native.weights.f32'),module=await createModule({wasmBinary:await read('.build/cfa-m2/operators.wasm'),wasmMemory:new WebAssembly.Memory({initial:256,maximum:32768})}),ref=await json('.build/trufor-unfused/reference.json'),records=[];
for(const c of ref.cases){
 const input={dims:c.files.rgb.shape,data:await f32('.build/trufor-unfused/'+c.files.rgb.file)},start=performance.now(),output=runNoiseprintPlusProgram(module,program,weights,input),expected=await f32('.build/trufor-unfused/'+c.files.noiseprint_pp.file);let maxError=0,differences=0;
 for(let i=0;i<expected.length;i++){maxError=Math.max(maxError,Math.abs(expected[i]-output.data[i]));differences+=expected[i]!==output.data[i];}
 records.push({case:c.id,width:c.width,height:c.height,maxError,differences,milliseconds:performance.now()-start});console.log(records.at(-1));
 await fs.writeFile(new URL('.build/trufor-npp/native-'+c.id+'.f32',root),Buffer.from(output.data.buffer));
}
const proof={checkpointSha256:ref.checkpointSha256,records,passed:records.every(r=>r.maxError<=1e-4)};await fs.writeFile(new URL('docs/trufor-npp-program-proof.json',root),JSON.stringify(proof,null,2)+'\n');if(!proof.passed)process.exitCode=1;
