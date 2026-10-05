import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../.build/digest-extra/',import.meta.url),{default:create}=await import(new URL('../vendor/digest-extra/digest.js',import.meta.url)),m=await create({wasmBinary:await readFile(new URL('../vendor/digest-extra/digest.wasm',import.meta.url))}),results=[];
for(const item of JSON.parse(await readFile(new URL('reference.json',base)))){
 const input=await readFile(new URL('../fixtures/'+item.file,import.meta.url)),ptr=m._malloc(input.length);m.HEAPU8.set(input,ptr);
 try{for(const stage of item.stages){if(!m._digest_extra(ptr,item.width,item.height,stage.kind,stage.stage))throw Error('Kernel failed');const Type=stage.dtype==='|u1'?Uint8Array:stage.dtype==='<f4'?Float32Array:Float64Array,actual=new Type(m.HEAPU8.slice(m._digest_data(),m._digest_data()+m._digest_size()).buffer),raw=await readFile(new URL(stage.file,base)),expected=new Type(raw.buffer,raw.byteOffset,raw.length/Type.BYTES_PER_ELEMENT);let changed=0,max=0;for(let i=0;i<actual.length;i++){changed+=Number(actual[i]!==expected[i]);max=Math.max(max,Math.abs(actual[i]-expected[i]));}results.push({input:item.file,kind:stage.kind,stage:stage.stage,changed,max});m._digest_release();}}
 finally{m._free(ptr);}
}
await writeFile(new URL('proof.json',base),JSON.stringify(results,null,2)+'\n');console.log(results.filter(r=>r.changed));
