import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {filenameBallistics,sourceFileInfo} from '../src/source-file.js';import {createEngine} from '../src/index.js';import {fileDigest} from '../src/digest.js';
test('native filename naming hints preserve regex boundaries and Unicode folding',async()=>{const ref=JSON.parse(await readFile(new URL('./data/filename-native.json',import.meta.url)));for(const row of ref.cases)assert.equal(filenameBallistics(row.name),row.hint,JSON.stringify(row.name));});
test('bytes and File input retain supplied metadata separately from signature evidence',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('./data/recompression-0.png',import.meta.url))),engine=createEngine({cpuKernel:'single'}),stamp=1234567890000;
 try{
  const loaded=await engine.load({id:'a',bytes,name:'IMG_0001.JPG',mime:'image/jpeg',lastModified:stamp});assert.equal(loaded.file.name,'IMG_0001.JPG');loaded.file.name='altered';
  const a=await engine.run({id:'a',imageId:'a',operation:'file.digest',params:{imageHashes:false}});assert.deepEqual(a.data.physicalFile,{name:'IMG_0001.JPG',sizeBytes:bytes.length,declaredMimeType:'image/jpeg',signatureMimeType:'image/png',lastModified:stamp,metadataOrigin:'caller',nameBallistics:'Canon DSLR or iPhone camera',unavailable:['parentFolder','owner','permissions','creationTime','lastAccess','metadataChanged']});
  const file=new File([bytes],'DSCN1234.JPG',{type:'image/png',lastModified:stamp});await engine.loadBlob({id:'b',blob:file});const b=await engine.run({id:'b',imageId:'b',operation:'file.digest',params:{imageHashes:false}});assert.equal(b.data.physicalFile.name,'DSCN1234.JPG');assert.equal(b.data.physicalFile.metadataOrigin,'browser-file');assert.equal(b.data.physicalFile.lastModified,stamp);assert.deepEqual(a.data.hashes,b.data.hashes);
  a.data.physicalFile.name='changed';assert.equal((await engine.run({id:'again',imageId:'a',operation:'file.digest',params:{imageHashes:false}})).data.physicalFile.name,'IMG_0001.JPG');
  await assert.rejects(engine.load({id:'bad',bytes,name:'../IMG_0001.JPG'}),{code:'INVALID_INPUT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }finally{engine.dispose();}
});
test('small streamed chunks identify signatures without pixels; unknown stat remains absent',async()=>{
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10]),source={byteLength:bytes.length,async visit(consume){for(let i=0;i<bytes.length;i+=2)consume(bytes.subarray(i,i+2),i);}},result=await fileDigest(null,{imageHashes:false},{},{source});
 assert.equal(result.data.physicalFile.signatureMimeType,'image/png');assert.equal(result.data.physicalFile.nameBallistics,null);assert.equal(result.data.physicalFile.lastModified,null);assert.throws(()=>sourceFileInfo({lastModified:NaN}),{code:'INVALID_INPUT'});
});
