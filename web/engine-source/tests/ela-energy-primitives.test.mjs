import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {describeEnergy,energyGrayPixel} from '../experiments/ela-energy/primitives.js';
const base=new URL('../fixtures/ela-energy/',import.meta.url),reference=JSON.parse(await readFile(new URL('primitives.json',base))),compressed=await readFile(new URL('primitives.bin.gz',base)),payload=gunzipSync(compressed),domain=JSON.parse(await readFile(new URL('gray-domain.json',base))),sha=data=>createHash('sha256').update(data).digest('hex');
const bytes=part=>payload.subarray(part.offset,part.offset+part.length),image=(row,key)=>({width:row.width,height:row.height,format:'rgb8',data:bytes(row[key])});
test('Float32 residual luminance is exact for all RGB8 colours in native vector and scalar-tail orders',()=>{
 for(const row of domain.cases){const vector=new Float32Array(65536),scalar=new Float32Array(65536);for(let i=0;i<vector.length;i++){vector[i]=energyGrayPixel(row.red,i>>8,i&255);scalar[i]=energyGrayPixel(row.red,i>>8,i&255,true);}assert.equal(sha(new Uint8Array(vector.buffer)),row.vectorSha256);assert.equal(sha(new Uint8Array(scalar.buffer)),row.scalarSha256);}
});
test('Sixty native residual gray and 7x7 energy blur pairs are bit exact including tails and tiny reflected borders',async()=>{
 assert.equal(sha(compressed),reference.payload.compressedSha256);assert.equal(sha(payload),reference.payload.sha256);
 for(const row of reference.cases){let accounted=0;const result=await describeEnergy(image(row,'original'),image(row,'compressed'),{account:n=>accounted+=n});for(const key of ['gray','energy'])assert.deepEqual(new Uint8Array(result[key].buffer),new Uint8Array(bytes(row[key])),row.name+' '+key);assert.equal(accounted,row.width*row.height*16);}
});
test('Energy primitive input/budget checks and cooperative cancellation do not produce a partial scientific result',async()=>{
 const row=reference.cases.find(x=>x.name==='noise-1031-1024'),a=image(row,'original'),b=image(row,'compressed');
 await assert.rejects(describeEnergy(a,{...b,width:b.width+1}),{code:'INVALID_INPUT'});await assert.rejects(describeEnergy(a,b,{account:()=>{throw Error('denied');}}),/denied/);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1);try{await assert.rejects(describeEnergy(a,b,{signal:controller.signal}),{code:'CANCELLED'});}finally{clearTimeout(timer);}
});
