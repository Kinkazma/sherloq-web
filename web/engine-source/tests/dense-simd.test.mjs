import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDenseMath} from '../src/dense-math.js';

test('SIMD independent pixels preserve scalar descriptor bits and global candidate decisions',async()=>{
 const scalar=await createDenseMath({wasmVariant:'scalar',print:()=>{}}),simd=await createDenseMath({wasmVariant:'simd',print:()=>{}});
 for(const [width,height,patch,method]of [[25,27,8,0],[43,37,3,0],[103,105,32,0],[71,63,3,1],[71,63,8,1]])for(const reflection of [false,true]){
  const gray=Float32Array.from({length:width*height},(_,i)=>(i*37+i%17*23)%256),settings={method,patch,reflection};
  const a=scalar.features(gray,width,height,settings),b=simd.features(gray,width,height,settings);
  for(const key of ['first','second'])assert.deepEqual(new Uint32Array(a[key].buffer),new Uint32Array(b[key].buffer),JSON.stringify({width,height,...settings,key}));
  const mask=Uint8Array.from({length:a.width*a.height},(_,i)=>i%13?1:0),options={dimensions:a.dimensions,minimum:3,radius:20,iterations:2};
  assert.deepEqual(scalar.field(a.first,a.second,mask,a.width,a.height,options),simd.field(b.first,b.second,mask,b.width,b.height,options));
 }
});

test('compatibility fallback compiles the real scalar job without a capability probe',async t=>{
 const {default:create}=await import('../vendor/dense/dense.js?fallback-regression'),binary=await readFile(new URL('../vendor/dense/dense.wasm',import.meta.url)),compile=WebAssembly.compile;
 const sizes=[];WebAssembly.compile=async bytes=>{sizes.push(bytes.byteLength);if(sizes.length===1)throw new WebAssembly.CompileError('SIMD unsupported in regression environment');return compile(bytes);};
 t.after(()=>{WebAssembly.compile=compile;});
 const module=await create({wasmBinary:binary,print:()=>{}});
 assert.equal(module.denseVariant,'scalar');assert.equal(sizes.length,2);assert.equal(sizes[0],binary.byteLength);assert.ok(sizes[1]>100000,'the complete scalar runtime was compiled');
 const pointer=module._malloc(64);assert.ok(pointer);module.HEAPF32[pointer/4]=7;assert.equal(module.HEAPF32[pointer/4],7);module._free(pointer);
});

test('allocation and download failures are not hidden by a scalar fallback',async t=>{
 const {default:create}=await import('../vendor/dense/dense.js?failure-regression'),compile=WebAssembly.compile;let calls=0;
 WebAssembly.compile=async()=>{calls++;throw new RangeError('allocation failed');};t.after(()=>{WebAssembly.compile=compile;});
 await assert.rejects(create({wasmBinary:new Uint8Array(16)}),/allocation failed/);assert.equal(calls,1);
 WebAssembly.compile=compile;await assert.rejects(create({locateFile:()=>new URL('../.build/no-such-dense.wasm',import.meta.url).href}),{code:'ENOENT'});
});
