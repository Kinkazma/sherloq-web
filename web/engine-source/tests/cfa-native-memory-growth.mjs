// Qualification against the existing native CFA operators; no rebuilt Wasm.
// Usage: node tests/cfa-native-memory-growth.mjs path/to/operators.mjs
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {runCfaProgram,runCfaProgramHybrid} from '../src/cfa-program.js';
const factoryURL=process.argv[2]?pathToFileURL(resolve(process.argv[2])):new URL('../.build/cfa-m2/operators.mjs',import.meta.url),{default:create}=await import(factoryURL.href),wasm=await readFile(new URL('./operators.wasm',factoryURL));
async function native(growAt){
 const memory=new WebAssembly.Memory({initial:256,maximum:512}),module=await create({wasmMemory:memory,wasmBinary:wasm}),retired=[],live=new Set();let calls=0;
 const wrapper={get HEAPU8(){return new Uint8Array(memory.buffer);},get HEAPF32(){return new Float32Array(memory.buffer);},get HEAP32(){return new Int32Array(memory.buffer);},_malloc(bytes){if(++calls===growAt){const before=memory.buffer;memory.grow(1);retired.push(before);}const pointer=module._malloc(bytes);if(pointer)live.add(pointer);return pointer;},_free(pointer){assert.equal(live.delete(pointer),true);module._free(pointer);},_cfa_activate:(...args)=>module._cfa_activate(...args)};
 return {module:wrapper,retired,live};
}
const values=Float32Array.of(-3,-2,-1,0,.5,1,2,3,10),input={data:values,dims:[1,1,1,values.length]},node=(op,name,input,output)=>({op,name,inputs:[input],outputs:[output],attrs:{}}),softplus={input:'x',output:'out',initializers:{},nodes:[node('Softplus','activation','x','out')]},identity={...softplus,nodes:[node('Identity','copy','x','copied'),node('Softplus','activation','copied','out')]};
const reference=await native(),expected=runCfaProgram(reference.module,softplus,new Float32Array(),input);assert.equal(reference.live.size,0);
const cpu=await native(2),copied=runCfaProgram(cpu.module,identity,new Float32Array(),input);assert.deepEqual(copied.data,expected.data);assert.equal(cpu.retired.length,1);assert.equal(cpu.retired[0].byteLength,0);assert.equal(cpu.live.size,0);
const resident=await native(2);let graphs=0;const gpu={supportsResident:true,metrics:{qualification:'CPU boundary with unchanged native activation'},beginModel(){},beginGraph(){graphs++;},async endGraph(){graphs--;}};
const hybrid=await runCfaProgramHybrid(resident.module,softplus,new Float32Array(),input,gpu);assert.deepEqual(hybrid.data,expected.data);assert.equal(resident.retired.length,1);assert.equal(resident.retired[0].byteLength,0);assert.equal(resident.live.size,0);assert.equal(graphs,0);assert.equal(hybrid.hybridConvolutions,0);
console.log(JSON.stringify({status:'passed',nativeKernelSha256:createHash('sha256').update(wasm).digest('hex'),input:[...values],output:[...expected.data],cpuIdentityThenSoftplusExact:true,residentSoftplusExact:true,realMemoryGrowthEvents:2,allPointersReleased:true,modelWeightsUsed:false},null,2));
