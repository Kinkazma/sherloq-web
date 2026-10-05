import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {streamedImageHashes} from '../src/digest-stream.js';import {Budget} from '../src/cache.js';import {fileDigest} from '../src/digest.js';
const reference=JSON.parse(await readFile(new URL('./data/radial-native.json',import.meta.url)));
function fill(data,width,y0,height,mode){let i=0;for(let y=y0;y<y0+height;y++)for(let x=0;x<width;x++){data[i++]=(mode?x*x+3*y:x+y)%256;data[i++]=(mode?x+7*y*y:2*x+3*y)%256;data[i++]=(mode?(x^y)*13:5*x+7*y)%256;}}
test('native fixed-angle projection and floating normalization match six large independent patterns',async()=>{
 for(const {width,height,mode,hash}of reference.cases){const budget=new Budget(80*1024**2),surface={descriptor:{width,height,format:'rgb8'},async readWindow({y,height}){const release=budget.reserve(width*height*3),data=new Uint8Array(width*height*3);fill(data,width,y,height,mode);return {pixels:{data},release};}};
 const result=await streamedImageHashes(surface,{account:n=>budget.reserve(n),algorithms:[5]});assert.deepEqual([...result.hashes['Radial variance']],hash,`${width}x${height}/${mode}`);assert.equal(budget.total(),0);}
});
test('contiguous digest uses the identical corrected radial arithmetic',async()=>{
 const {width,height,mode,hash}=reference.cases[2],data=new Uint8Array(width*height*3);fill(data,width,0,height,mode);const budget=new Budget(256*1024**2),result=await fileDigest({width,height,data,format:'rgb8'},{imageHashes:true},{},{bytes:new Uint8Array([1,2,3]),reserveMemory:n=>budget.reserve(n)});assert.deepEqual([...result.data.imageHashes['Radial variance']],hash);assert.equal(budget.total(),0);
});
