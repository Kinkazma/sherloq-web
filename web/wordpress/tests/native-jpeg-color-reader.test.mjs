import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,open,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeJpegColorReader} from '../sherloq-browser/assets/native-jpeg-color-reader.js';
import {Budget} from '../sherloq-browser/assets/unified-engine/src/cache.js';
import {byteView} from '../sherloq-browser/assets/unified-engine/src/memory-range.js';

const MiB=1024**2,root=new URL('./data/native-jpeg-color/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const wasmBinary=new Uint8Array(await readFile(new URL('../sherloq-browser/assets/vendor/local-jpeg-color/jpeg-color.wasm',import.meta.url)));
async function fixture(name){const item=manifest.fixtures.find(value=>value.name===name),bytes=new Uint8Array(await readFile(new URL(item.encoded,root))),reference=new Uint8Array(await readFile(new URL(item.reference,root)));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(createHash('sha256').update(reference).digest('hex'),item.referenceSha256);return{...item,bytes,reference};}
const options=(value,budget,extra={})=>({blob:new Blob([value.bytes]),sourceSha256:value.sha256,width:value.width,height:value.height,budget,wasmBinary,...extra});
function memorySession(budget){
 const stores=new Set();let created=0,maxWrite=0,reads=0,writes=0;
 return{backend:'accounted-test-memory',get created(){return created;},get live(){return stores.size;},get maxWrite(){return maxWrite;},get reads(){return reads;},get writes(){return writes;},async create(byteLength){const release=budget.reserve(byteLength),data=new Uint8Array(byteLength);let closed=false;const store={byteLength,write(input,offset=0){assert.equal(closed,false);const view=byteView(input);assert.ok(offset>=0&&offset+view.length<=byteLength);data.set(view,offset);writes++;maxWrite=Math.max(maxWrite,view.length);},readInto(target,offset=0){assert.equal(closed,false);const view=byteView(target);assert.ok(offset>=0&&offset+view.length<=byteLength);view.set(data.subarray(offset,offset+view.length));reads++;},flush(){},async dispose(){if(closed)return;closed=true;stores.delete(store);release();}};stores.add(store);created++;return store;},async dispose(){for(const store of [...stores])await store.dispose();}};
}
async function fileSession(){
 const folder=await mkdtemp(join(process.env.SHERLOQ_TEST_WORKDIR??tmpdir(),'sherloq-native-color-')),stores=new Set();let serial=0,maxWrite=0;
 return{backend:'host-test-file',get live(){return stores.size;},get maxWrite(){return maxWrite;},async create(byteLength){const path=join(folder,String(++serial)),file=await open(path,'w+');await file.truncate(byteLength);let closed=false;const store={byteLength,async write(input,offset=0){const view=byteView(input);assert.ok(offset>=0&&offset+view.length<=byteLength);let done=0;while(done<view.length){const result=await file.write(view,done,view.length-done,offset+done);assert.ok(result.bytesWritten>0);done+=result.bytesWritten;}maxWrite=Math.max(maxWrite,view.length);},async readInto(target,offset=0){const view=byteView(target);assert.ok(offset>=0&&offset+view.length<=byteLength);let done=0;while(done<view.length){const result=await file.read(view,done,view.length-done,offset+done);assert.ok(result.bytesRead>0);done+=result.bytesRead;}},flush(){return file.sync();},async dispose(){if(closed)return;await file.close();await rm(path);closed=true;stores.delete(store);}};stores.add(store);return store;},async dispose(){for(const store of [...stores])await store.dispose();await rm(folder,{recursive:true,force:true});}};
}
function expectedWindow(value,rect){const n=value.space==='CMYK'?4:value.space==='RGB'?3:1,result=new Uint8Array(rect.width*rect.height*n);for(let row=0;row<rect.height;row++)result.set(value.reference.subarray(((rect.y+row)*value.width+rect.x)*n,((rect.y+row)*value.width+rect.x+rect.width)*n),row*rect.width*n);return result;}

test('CMYK ink channels, gray and RGB match independent Pillow decoding and all eight orientations exactly',async()=>{
 for(const entry of manifest.fixtures){const value=await fixture(entry.name),budget=new Budget(128*MiB);if(entry.name==='cmyk-no-adobe'){await assert.rejects(createNativeJpegColorReader(options(value,budget)),{code:'NATIVE_COLOR_UNSUPPORTED'});assert.equal(budget.total(),0);continue;}const reader=await createNativeJpegColorReader(options(value,budget));
  try{assert.equal(reader.capability.space,value.space);assert.equal(reader.capability.iccApplied,false);assert.equal(reader.width,value.width);assert.equal(reader.height,value.height);const rect={x:0,y:0,width:reader.width,height:reader.height},window=await reader.readWindow(rect);try{assert.deepEqual(window.pixels.data,value.reference,entry.name);assert.equal(window.pixels.format,value.space.toLowerCase()+'8');if(value.space==='CMYK')assert.deepEqual(reader.capability.channels,['C','M','Y','K']);}finally{window.release();}
   for(const [x,y]of [[0,0],[reader.width-3,0],[0,reader.height-2],[reader.width-3,reader.height-2]]){const box={x,y,width:3,height:2},part=await reader.readWindow(box);try{assert.deepEqual(part.pixels.data,expectedWindow(value,box),entry.name+' '+JSON.stringify(box));}finally{part.release();}}
  }finally{await reader.dispose();assert.equal(budget.total(),0,entry.name+' retired all financing');}
 }
});
test('Progressive coefficients and decoded channels use the existing backing protocol under a low RAM grant',async()=>{
 const value=await fixture('cmyk-progressive'),budget=new Budget(68*MiB),session=await fileSession(),reader=await createNativeJpegColorReader(options(value,budget,{cacheBytes:65536,getTemporarySession:async()=>session}));
 try{assert.equal(reader.metrics.storage,'temporary');assert.ok(reader.metrics.coefficientStores>0);assert.ok(reader.metrics.coefficientReadBytes>0);assert.ok(reader.metrics.coefficientWriteBytes>0);assert.ok(session.maxWrite<=MiB);assert.ok(reader.metrics.maxEncodedReadBytes<=65536);assert.ok(reader.metrics.heapCapacityBytes<=64*MiB);const part=await reader.readWindow({x:0,y:0,width:value.width,height:value.height});try{assert.deepEqual(part.pixels.data,value.reference);}finally{part.release();}assert.equal(session.live,1,'only the authoritative channel bank survives the decode');}
 finally{await reader.dispose();assert.equal(session.live,0);assert.equal(budget.total(),0);await session.dispose();}
});
test('A capable RAM grant keeps the native channel bank in RAM and never opens temporary storage',async()=>{
 const value=await fixture('cmyk-orientation-1'),budget=new Budget(128*MiB);let sessions=0;const reader=await createNativeJpegColorReader(options(value,budget,{getTemporarySession:async()=>{sessions++;throw Error('Unexpected spill');}}));try{assert.equal(reader.metrics.storage,'memory');assert.equal(sessions,0);assert.equal(reader.metrics.coefficientStores,0);assert.ok(budget.total()<MiB,'the codec heap is retired after preparation');}finally{await reader.dispose();assert.equal(budget.total(),0);}
});
test('Incorrect source identities, grids and resources fail without leaving reservations',async()=>{
 const value=await fixture('cmyk-orientation-1');for(const extra of [{sourceSha256:'0'.repeat(64)},{width:value.width+1},{height:value.height+1},{wasmBinary:new Uint8Array(wasmBinary.length)}]){const budget=new Budget(128*MiB);await assert.rejects(createNativeJpegColorReader(options(value,budget,extra)));assert.equal(budget.total(),0);}
 const budget=new Budget(8*MiB);await assert.rejects(createNativeJpegColorReader(options(value,budget)),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
});
test('Native windows reject invalid coordinates and cannot grow beyond 1024 squared',async()=>{
 const value=await fixture('cmyk-progressive'),budget=new Budget(128*MiB),reader=await createNativeJpegColorReader(options(value,budget));try{for(const rect of [{x:-1,y:0,width:2,height:2},{x:0,y:0,width:0,height:2},{x:0,y:0,width:513,height:1},{x:0,y:0,width:1,height:513},{x:1.5,y:0,width:1,height:1},{x:0,y:0,width:1025,height:1025}])await assert.rejects(reader.readWindow(rect),{code:'INVALID_INPUT'});}finally{await reader.dispose();assert.equal(budget.total(),0);}
});
test('Closing retires held windows, is idempotent and prevents further reads',async()=>{
 const value=await fixture('cmyk-orientation-6'),budget=new Budget(128*MiB),reader=await createNativeJpegColorReader(options(value,budget)),part=await reader.readWindow({x:0,y:0,width:2,height:3});assert.ok(part.pixels.data);await reader.dispose();assert.equal(part.pixels.data,null);assert.equal(budget.total(),0);part.release();await reader.dispose();await assert.rejects(reader.readWindow({x:0,y:0,width:1,height:1}),{code:'CANCELLED'});
});
test('Aborted preparation and overlapping window cancellation acknowledge cleanup before returning credit',async()=>{
 const value=await fixture('cmyk-progressive'),budget=new Budget(128*MiB),controller=new AbortController();controller.abort();await assert.rejects(createNativeJpegColorReader(options(value,budget,{signal:controller.signal})),{code:'CANCELLED'});assert.equal(budget.total(),0);
 const reader=await createNativeJpegColorReader(options(value,budget)),read=reader.readWindow({x:0,y:0,width:128,height:96}),closed=reader.dispose();await assert.rejects(read,{code:'CANCELLED'});await closed;assert.equal(budget.total(),0);
});
test('Input corruption after a valid JPEG header closes the native codec and its partial channel bank',async()=>{
 const value=await fixture('cmyk-progressive'),truncated=value.bytes.slice(0,-100),budget=new Budget(128*MiB),sourceSha256=createHash('sha256').update(truncated).digest('hex');await assert.rejects(createNativeJpegColorReader({...options(value,budget),blob:new Blob([truncated]),sourceSha256}));assert.equal(budget.total(),0);
});
