import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {jpegCodec,initJpegWasm,inspectJpeg} from '../src/jpeg.js';
const read=p=>readFile(new URL(p,import.meta.url));
await initJpegWasm({wasmBinary:await read('../vendor/libjpeg/jpeg.wasm')});
const bytes=new Uint8Array(await read('../fixtures/synthetic.jpg'));
test('JPEG source and recompression measured independently',async()=>{
 const decoded=await jpegCodec.decode(bytes),ref=new Uint8Array(await read('../fixtures/synthetic.rgb'));
 const rec=await jpegCodec.recompress(decoded,75),refRec=new Uint8Array(await read('../fixtures/synthetic.q75.rgb'));
 const diff=(a,b)=>({different:a.reduce((n,x,i)=>n+(x!==b[i]),0),max:a.reduce((n,x,i)=>Math.max(n,Math.abs(x-b[i])),0),mae:a.reduce((n,x,i)=>n+Math.abs(x-b[i]),0)/a.length});
 console.log(JSON.stringify({source:diff(decoded.data,ref),recompression:diff(rec.data,refRec)}));
 assert.equal(decoded.width,64);assert.equal(decoded.height,48);
 assert.deepEqual(decoded.data,ref);assert.deepEqual(rec.data,refRec);
});
test('Rejects unsupported format and malformed source without canvas conversion',()=>{
 assert.throws(()=>inspectJpeg(new Uint8Array([1,2,3,4])),{code:'UNSUPPORTED_FORMAT'});
 assert.throws(()=>inspectJpeg(new Uint8Array([255,216,255,225,0,2,255,217])),{code:'INVALID_INPUT'});
});
import {createHash} from 'node:crypto';
const codecReference=JSON.parse(await read('../fixtures/codec-reference.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const f of codecReference.cases)test(`JPEG parity ${f.file}: all declared qualities`,async()=>{
 const decoded=await jpegCodec.decode(new Uint8Array(await read('../fixtures/'+f.file)));
 assert.equal(hash(decoded.data),f.decodedSha256);
 for(const expected of f.recompressed)assert.equal(hash((await jpegCodec.recompress(decoded,expected.quality)).data),expected.sha256,`quality ${expected.quality}`);
});
