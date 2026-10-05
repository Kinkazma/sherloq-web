import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initQualityArithmetic,normalizeQualityCurve} from '../src/quality-arithmetic.js';
import {resourceAllocationKind,serializeEngineError,deserializeEngineError} from '../src/errors.js';
import {initContrastWasm,contrastRows} from '../src/contrast-math.js';

// Real native arithmetic: inject refusals at the actual allocator/copy boundary,
// then reuse the same module. Earlier native pointers must be freed on every try.
test('native malloc and output-copy failures retain distinct domains, sizes and resumability',async()=>{
 const m=await initQualityArithmetic({wasmBinary:await readFile(new URL('../vendor/quality/quality.wasm',import.meta.url))}),values=Float64Array.from({length:100},(_,i)=>i*i+3),expected=await normalizeQualityCurve(values),malloc=m._malloc,free=m._free;
 for(const failAt of [1,2]){
  let calls=0;const live=new Set();m._malloc=bytes=>{if(++calls===failAt)return 0;const p=malloc(bytes);live.add(p);return p;};m._free=p=>{live.delete(p);free(p);};
  try{await assert.rejects(normalizeQualityCurve(values),error=>{const transported=deserializeEngineError(serializeEngineError(error));assert.equal(transported.code,'MEMORY_ALLOCATION');assert.equal(resourceAllocationKind(transported),'wasm');assert.equal(transported.details.requestedBytes,800);assert.equal(transported.details.currentBytes,m.HEAPU8.byteLength);return true;});assert.equal(live.size,0);}finally{m._malloc=malloc;m._free=free;}
  assert.deepEqual(await normalizeQualityCurve(values),expected);
 }
 const original=m.HEAPF64.subarray,cause=new RangeError('Injected useful output allocation refusal');
 m.HEAPF64.subarray=function(...args){const view=original.apply(this,args);Object.defineProperty(view,'constructor',{value:class RefusedCopy extends Float64Array {constructor(){throw cause;}}});return view;};
 try{await assert.rejects(normalizeQualityCurve(values),error=>error.code==='MEMORY_ALLOCATION'&&resourceAllocationKind(error)==='array-buffer'&&error.details.requestedBytes===800&&error.cause===cause);}finally{m.HEAPF64.subarray=original;}
 assert.deepEqual(await normalizeQualityCurve(values),expected);
});

test('a native kernel allocation status frees staged pointers and preserves invalid-input distinction',async()=>{
 const m=await initContrastWasm({wasmBinary:await readFile(new URL('../vendor/contrast/contrast.wasm',import.meta.url))}),image={width:32,height:32,data:Uint8Array.from({length:32*32*3},(_,i)=>i%251)},expected=await contrastRows(image,0,32,32),run=m._contrast_rows,malloc=m._malloc,free=m._free,live=new Set();
 m._malloc=n=>{const p=malloc(n);live.add(p);return p;};m._free=p=>{live.delete(p);free(p);};
 try{
  m._contrast_rows=()=>-1;
  await assert.rejects(contrastRows(image,0,32,32),error=>error.code==='MEMORY_ALLOCATION'&&resourceAllocationKind(error)==='wasm'&&error.details.currentBytes===m.HEAPU8.byteLength);
  assert.equal(live.size,0);
  m._contrast_rows=()=>0;
  await assert.rejects(contrastRows(image,0,32,32),{code:'INVALID_INPUT'});assert.equal(live.size,0);
 }finally{m._contrast_rows=run;m._malloc=malloc;m._free=free;}
 assert.deepEqual(await contrastRows(image,0,32,32),expected);
});
