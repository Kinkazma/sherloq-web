import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import factory from'../vendor/segmentation/cmseg-winograd.js';
test('Native depthwise Winograd float32 order preserves complete tensors, odd borders and bias',async()=>{
 const base=new URL('../fixtures/cmseg-winograd/',import.meta.url),reference=JSON.parse(await readFile(new URL('reference.json',base))),module=await factory();assert.equal(module.HEAPU8.byteLength,64*1024**2);
 const read=async spec=>{const b=await readFile(new URL(spec.file,base));assert.equal(b.length,spec.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),spec.sha256);return b;};
 for(const row of reference.records){const pointers=[],load=async spec=>{const bytes=await read(spec),ptr=module._malloc(bytes.length);assert.ok(ptr);pointers.push(ptr);module.HEAPU8.set(bytes,ptr);return ptr;};try{
  const input=await load(row.input),weights=await load(row.weight),bias=await load(row.bias),out=module._malloc(row.output.bytes);assert.ok(out);pointers.push(out);assert.equal(module._cmseg_winograd(input,weights,bias,row.channels,row.height,row.width,row.padding,out),1);assert.deepEqual(Buffer.from(module.HEAPU8.subarray(out,out+row.output.bytes)),await read(row.output),row.name);
  assert.equal(module._cmseg_winograd(input,weights,bias,0,row.height,row.width,row.padding,out),0);assert.equal(module._cmseg_winograd(input,weights,bias,row.channels,row.height,row.width,2,out),0);
 }finally{pointers.forEach(p=>module._free(p));}}
});
