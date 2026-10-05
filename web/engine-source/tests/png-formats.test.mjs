import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEngine} from '../src/index.js';import {imageCodec} from '../src/codecs.js';
const root=new URL('./data/png-formats/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',root))),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('native PNG packed gray, palette/tRNS, Adam7 and EXIF orientation through both load paths',async()=>{
 const engine=createEngine({cpuKernel:'single'});try{for(const [i,item]of ref.cases.entries()){
  const bytes=new Uint8Array(await readFile(new URL(item.file,root))),header=imageCodec.inspect(bytes);assert.equal(header.depth,item.depth);assert.equal(header.colorType,item.colorType);assert.equal(header.interlace,item.interlace);
  const loaded=i%2?await engine.loadBlob({id:'i',blob:new Blob([bytes])}):await engine.load({id:'i',bytes});assert.equal(loaded.width,item.width);assert.equal(loaded.height,item.height);assert.equal(sha(engine.imagePixels('i').data),item.rgbSha256,item.file);assert.equal(loaded.provenance.sourceDepth,item.depth);assert.equal(loaded.provenance.orientation,item.orientation);assert.deepEqual(engine.original('i'),bytes);engine.unload('i');
 }}finally{engine.dispose();}
});
test('unsupported PNG depth/type and coding methods fail before decode',async()=>{
 const source=new Uint8Array(await readFile(new URL(ref.cases[0].file,root)));for(const [position,value]of [[24,3],[25,1],[26,1],[27,1],[28,2]]){const bytes=source.slice();bytes[position]=value;assert.throws(()=>imageCodec.inspect(bytes),{code:'UNSUPPORTED_FORMAT'});}
});
