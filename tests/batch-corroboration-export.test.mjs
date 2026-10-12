import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,stat,rm,readdir} from 'node:fs/promises';
import {openSync,closeSync,readSync,writeSync,ftruncateSync,fstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {Budget} from '../web/wordpress/sherloq-browser/assets/unified-engine/src/cache.js';
import {createCloneCorroboration} from '../web/wordpress/sherloq-browser/assets/unified-engine/src/clone-corroboration.js';
import {SIFT_SOURCE} from '../web/wordpress/sherloq-browser/assets/unified-engine/src/clone-relations.js';
import {evidenceContext} from '../web/wordpress/sherloq-browser/assets/batch-evidence.js';
import {createBatchArtifactStore} from '../web/wordpress/sherloq-browser/assets/batch-artifacts.js';
import {renderBatchCorroboration,BATCH_CORROBORATION_PALETTE} from '../web/wordpress/sherloq-browser/assets/batch-corroboration-export.js';
import {unpackScientificNpz} from '../web/engine-source/tests/automatic-npz-fixture.js';

const pngWasm=await readFile(new URL('../web/engine-source/vendor/png-export/png-export.wasm',import.meta.url)),compositionWasm=await readFile(new URL('../web/engine-source/vendor/composition/composition.wasm',import.meta.url));
const sha='a'.repeat(64),crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;}),crc=bytes=>{let value=0xffffffff;for(const b of bytes)value=crcTable[(value^b)&255]^(value>>>8);return(value^0xffffffff)>>>0;};
function checkZip(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0,count=0;while(v.getUint32(at,true)===0x04034b50){assert.equal(v.getUint16(at+8,true),0);const size=v.getUint32(at+18,true),start=at+30+v.getUint16(at+26,true)+v.getUint16(at+28,true);assert.equal(crc(bytes.subarray(start,start+size)),v.getUint32(at+14,true));at=start+size;count++;}assert.equal(v.getUint32(at,true),0x02014b50);return count;}
function decodePng(bytes){
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks=[];let width,height;
 for(let at=8;at<bytes.length;){const length=view.getUint32(at),name=new TextDecoder().decode(bytes.subarray(at+4,at+8)),data=bytes.subarray(at+8,at+8+length);assert.equal(crc(bytes.subarray(at+4,at+8+length)),view.getUint32(at+8+length));if(name==='IHDR'){width=view.getUint32(at+8);height=view.getUint32(at+12);assert.equal(data[8],8);assert.equal(data[9],2);}if(name==='IDAT')chunks.push(data);at+=12+length;}
 const filtered=inflateSync(Buffer.concat(chunks)),rowBytes=width*3,result=new Uint8Array(rowBytes*height);let at=0;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=filtered[at++];for(let i=0;i<rowBytes;i++){const left=i>=3?result[y*rowBytes+i-3]:0,above=y?result[(y-1)*rowBytes+i]:0,diagonal=y&&i>=3?result[(y-1)*rowBytes+i-3]:0;const prediction=filter===0?0:filter===1?left:filter===2?above:filter===3?Math.floor((left+above)/2):paeth(left,above,diagonal);result[y*rowBytes+i]=(filtered[at++]+prediction)&255;}}
 assert.equal(at,filtered.length);return {width,height,data:result};
}
function notFound(){return Object.assign(Error('No test handle'),{name:'NotFoundError'});}
class DiskFile {
 constructor(location){this.location=location;}
 async createSyncAccessHandle(){const fd=openSync(this.location,'r+');let closed=false;return {mode:'read-write',write(bytes,{at=0}={}){return writeSync(fd,bytes,0,bytes.byteLength,at);},read(bytes,{at=0}={}){return readSync(fd,bytes,0,bytes.byteLength,at);},truncate(n){ftruncateSync(fd,n);},getSize(){return fstatSync(fd).size;},flush(){},close(){if(!closed){closed=true;closeSync(fd);}}};}
 async createWritable(){const fd=openSync(this.location,'w');let at=0,closed=false;return{async write(value){const bytes=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value;at+=writeSync(fd,bytes,0,bytes.byteLength,at);},async close(){if(!closed){closed=true;closeSync(fd);}},async abort(){if(!closed){closed=true;closeSync(fd);}}};}
 async getFile(){return new Blob([await readFile(this.location)]);}
}
class DiskDirectory {
 constructor(location){this.location=location;}
 async getDirectoryHandle(name,{create=false}={}){const location=path.join(this.location,name);if(create)await mkdir(location,{recursive:true});else try{if(!(await stat(location)).isDirectory())throw notFound();}catch{throw notFound();}return new DiskDirectory(location);}
 async getFileHandle(name,{create=false}={}){const location=path.join(this.location,name);if(create){const fd=openSync(location,'a');closeSync(fd);}else try{await stat(location);}catch{throw notFound();}return new DiskFile(location);}
 async removeEntry(name,{recursive=false}={}){try{await rm(path.join(this.location,name),{recursive});}catch(error){if(error.code==='ENOENT')throw notFound();throw error;}}
 async *entries(){for(const name of await readdir(this.location)){const s=await stat(path.join(this.location,name));yield [name,s.isDirectory()?new DiskDirectory(path.join(this.location,name)):new DiskFile(path.join(this.location,name))];}}
}
async function browserDisk(run){
 const location=await mkdtemp(path.join(tmpdir(),'sherloq-corroboration-')),directory=new DiskDirectory(location),previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),previousFile=globalThis.FileSystemFileHandle;
 Object.defineProperty(globalThis,'navigator',{value:{storage:{getDirectory:async()=>directory,estimate:async()=>({quota:10*1024**3,usage:0})}},configurable:true});globalThis.FileSystemFileHandle=DiskFile;
 try{await run(directory,location);}finally{if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else delete globalThis.navigator;if(previousFile===undefined)delete globalThis.FileSystemFileHandle;else globalThis.FileSystemFileHandle=previousFile;await rm(location,{recursive:true,force:true});}
}
function fixture(methods=2){
 const width=47,height=69,original=Uint8Array.from({length:width*height*3},(_,i)=>(i*73+19)%256),maskA=new Uint8Array(width*height),maskB=new Uint8Array(width*height);
 for(let y=3;y<66;y++)for(let x=2;x<44;x++){if(x<36)maskA[y*width+x]=1;if(x>10)maskB[y*width+x]=1;}maskA[18*width+15]=0;maskB[18*width+15]=0;
 const scope={schema:'sherloq.scientific-scope/1',version:'test/1',coordinates:'original-pixels',width,height,sourceSha256:sha,fingerprint:'test-filtered-scope',regions:[{x0:0,y0:0,x1:19,y1:height},{x0:30,y0:0,x1:width,y1:height}],excluded:[[[3,9],[8,9],[8,14],[3,14]]],status:'ready'},image={id:'scientific-image',name:'study-p4-figure.png',width,height,sourceSha256:sha,preparation:scope},entries=[{source:SIFT_SOURCE,methodKey:'native-sift',origin:[0,0],pixel_mask:{width,height,data:maskA},polygons:[]}];if(methods>1)entries.push({source:SIFT_SOURCE,methodKey:'native-forgeryscope',origin:[0,0],pixel_mask:{width,height,data:maskB},polygons:[]});
 let readCalls=0,maxSourceBytes=0;const client={source:{sha256:sha,surface:{id:'rgb',revision:1,width,height,format:'rgb8'}},async readWindow(_descriptor,{x,y,width:w,height:h}){readCalls++;maxSourceBytes=Math.max(maxSourceBytes,w*h*3);const data=new Uint8Array(w*h*3);for(let row=0;row<h;row++)data.set(original.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3),row*w*3);return {width:w,height:h,format:'rgb8',data};}},context=evidenceContext({composerFactory:({budget})=>createCloneCorroboration({budget,wasmBinary:compositionWasm})});context.validateScope(scope,{width,height,sourceSha256:sha});
 const expected=new Uint32Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if((x<=19||x>=30)&&!(x>=3&&x<=8&&y>=9&&y<=14))expected[y*width+x]=maskA[y*width+x]+(methods>1?maskB[y*width+x]:0);
 return{image,entries,client,context,original,expected,reads:()=>({readCalls,maxSourceBytes})};
}

test('Full-resolution native PNG and uint32 NPZ preserve source pixels, mask holes and graph/text exclusions',async()=>browserDisk(async directory=>{
 const data=fixture(),before=data.original.slice(),budget=new Budget(256*1024**2),artifacts=await createBatchArtifactStore({rootFactory:async()=>directory,locks:null});
 try{
  const result=await renderBatchCorroboration({...data,artifacts,path:'resultats/final',dependencies:{budget,wasmBinary:pngWasm}});assert.equal(result.mode,'corroboration');assert.equal(result.maximum,2);assert.deepEqual(result.methods,['native-sift','native-forgeryscope']);assert.equal(result.scopeFingerprint,'test-filtered-scope');assert.deepEqual(result.files,['resultats/final.png','resultats/final.npz','resultats/final.json']);
  const bytes=new Uint8Array(await(await artifacts.get(result.files[1])).arrayBuffer());assert.equal(checkZip(bytes),6);const npz=unpackScientificNpz(bytes);assert.equal(npz.corroboration.dtype,'<u4');assert.deepEqual(npz.corroboration.shape,[data.image.height,data.image.width]);const counts=new Uint32Array(npz.corroboration.data.buffer);assert.deepEqual(counts,data.expected);assert.equal(counts[18*data.image.width+15],0);const metadata=JSON.parse(npz.metadata_json.text);assert.equal(metadata.scopeFingerprint,'test-filtered-scope');assert.deepEqual(metadata.methods,result.methods);assert.equal(metadata.array.order,'C');
  const png=decodePng(new Uint8Array(await(await artifacts.get(result.files[0])).arrayBuffer()));assert.equal(png.width,data.image.width);assert.equal(png.height,data.image.height);
  for(let i=0;i<counts.length;i++)for(let c=0;c<3;c++){const color=BATCH_CORROBORATION_PALETTE.buckets[counts[i]],expected=counts[i]?Math.round(before[i*3+c]*(1-color.opacity)+color.rgb[c]*color.opacity):before[i*3+c];assert.equal(png.data[i*3+c],expected);}
  assert.deepEqual(data.original,before);assert.ok(data.reads().readCalls>=3);assert.ok(data.reads().maxSourceBytes<=data.image.width*32*3);assert.equal(budget.total(),0);assert.equal(result.metrics.countStorage,'temporary');assert.equal(artifacts.size,3);
 }finally{data.context.dispose();await artifacts.dispose();}assert.equal(budget.total(),0);
}));

test('A single selected clone method renders biomes while retaining its exact scientific count array',async()=>browserDisk(async directory=>{
 const data=fixture(1),artifacts=await createBatchArtifactStore({rootFactory:async()=>directory,locks:null});
 try{const result=await renderBatchCorroboration({...data,artifacts,path:'single',dependencies:{wasmBinary:pngWasm}});assert.equal(result.mode,'biomes');assert.equal(result.maximum,1);const npz=unpackScientificNpz(new Uint8Array(await(await artifacts.get('single.npz')).arrayBuffer()));assert.deepEqual(new Uint32Array(npz.corroboration.data.buffer),data.expected);}finally{data.context.dispose();await artifacts.dispose();}
}));

test('Two configured methods with zero clone entries still export the full original RGB and an all-zero uint32 map',async()=>browserDisk(async directory=>{
 const data=fixture(),artifacts=await createBatchArtifactStore({rootFactory:async()=>directory,locks:null}),budget=new Budget(256*1024**2);data.entries=[];
 try{const result=await renderBatchCorroboration({...data,methods:['native-sift','native-forgeryscope'],artifacts,path:'zero',dependencies:{budget,wasmBinary:pngWasm}});assert.equal(result.mode,'corroboration');assert.equal(result.maximum,0);assert.deepEqual(result.methods,['native-sift','native-forgeryscope']);assert.deepEqual(result.activeMethods,[]);const png=decodePng(new Uint8Array(await(await artifacts.get('zero.png')).arrayBuffer()));assert.deepEqual(png.data,data.original);const bytes=new Uint8Array(await(await artifacts.get('zero.npz')).arrayBuffer());assert.equal(checkZip(bytes),6);const npz=unpackScientificNpz(bytes);assert.deepEqual(npz.corroboration.shape,[data.image.height,data.image.width]);assert.equal(npz.corroboration.dtype,'<u4');assert.equal(npz.corroboration.data.byteLength,data.image.width*data.image.height*4);assert.ok(npz.corroboration.data.every(v=>v===0));assert.equal(budget.total(),0);}finally{data.context.dispose();await artifacts.dispose();}
}));

test('Configured method count selects corroboration even when only one algorithm detects an eligible biome',async()=>browserDisk(async directory=>{
 const data=fixture(1),artifacts=await createBatchArtifactStore({rootFactory:async()=>directory,locks:null});
 try{const result=await renderBatchCorroboration({...data,methods:['native-sift','native-forgeryscope'],artifacts,path:'one-positive',dependencies:{wasmBinary:pngWasm}});assert.equal(result.mode,'corroboration');assert.equal(result.maximum,1);assert.deepEqual(result.activeMethods,['native-sift']);const npz=unpackScientificNpz(new Uint8Array(await(await artifacts.get('one-positive.npz')).arrayBuffer()));assert.deepEqual(new Uint32Array(npz.corroboration.data.buffer),data.expected);}finally{data.context.dispose();await artifacts.dispose();}
}));

test('Counts above the red palette bucket remain exact integers and duplicate zones from one method add no votes',async()=>browserDisk(async directory=>{
 const data=fixture(1),artifacts=await createBatchArtifactStore({rootFactory:async()=>directory,locks:null}),entry=data.entries[0];data.entries=[entry,{...entry,methodKey:'b'},{...entry,methodKey:'c'},{...entry,methodKey:'d'},{...entry,id:'duplicate-zone'}];
 try{const result=await renderBatchCorroboration({...data,artifacts,path:'four',dependencies:{wasmBinary:pngWasm}});assert.equal(result.maximum,4);assert.equal(result.methods.length,4);const npz=unpackScientificNpz(new Uint8Array(await(await artifacts.get('four.npz')).arrayBuffer())),counts=new Uint32Array(npz.corroboration.data.buffer);for(let i=0;i<counts.length;i++)assert.equal(counts[i],data.expected[i]*4);assert.equal(npz.palette_opacity.dtype,'<f8');assert.deepEqual([...new Float64Array(npz.palette_opacity.data.buffer)],BATCH_CORROBORATION_PALETTE.buckets.map(b=>b.opacity));}finally{data.context.dispose();await artifacts.dispose();}
}));

test('Cancellation during a native stripe callback and malformed integer counts leave no artifacts or count storage',async()=>browserDisk(async directory=>{
 for(const mode of ['callback-cancel','non-uint32','out-of-range']){
  const data=fixture(),controller=new AbortController(),budget=new Budget(256*1024**2),artifacts=await createBatchArtifactStore({rootFactory:async()=>directory,locks:null});
  const original=data.context.corroborationStripes;
  data.context.corroborationStripes=async(entries,width,height,consume,options)=>original(entries,width,height,async strip=>{
   if(mode==='callback-cancel'){await consume(strip);controller.abort();}
   else if(mode==='non-uint32')await consume({...strip,values:Float32Array.from(strip.values)});
   else{strip.values[0]=3;await consume(strip);}
  },options);
  try{await assert.rejects(()=>renderBatchCorroboration({...data,artifacts,path:mode,signal:controller.signal,dependencies:{budget,wasmBinary:pngWasm}}));assert.equal(artifacts.size,0);assert.equal(budget.total(),0);}finally{data.context.dispose();await artifacts.dispose();}
 }
}));

test('Native evidence mismatch, source failures and cancellation clean all intermediate exports and reservations',async()=>browserDisk(async directory=>{
 for(const mode of ['mismatch','source','cancel','sink']){
  const data=fixture(),controller=new AbortController(),budget=new Budget(256*1024**2),artifacts=await createBatchArtifactStore({rootFactory:async()=>directory,locks:null});
  if(mode==='mismatch'){const original=data.context.corroborationStripes;data.context.corroborationStripes=async(...args)=>({...await original(...args),maximum:99});}
  if(mode==='source')data.client.readWindow=async()=>{throw Error('source read failed');};
  if(mode==='cancel')controller.abort();
  const deps={budget,wasmBinary:pngWasm};if(mode==='sink')deps.sinkFactory=async()=>{throw Error('sink unavailable');};
  try{await assert.rejects(()=>renderBatchCorroboration({...data,artifacts,path:'bad-'+mode,signal:controller.signal,dependencies:deps}));assert.equal(artifacts.size,0);assert.equal(budget.total(),0);}finally{data.context.dispose();await artifacts.dispose();}
 }
}));
