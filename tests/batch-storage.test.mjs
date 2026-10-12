import test from 'node:test';import assert from 'node:assert/strict';
import {createBatchArtifactStore} from '../web/wordpress/sherloq-browser/assets/batch-artifacts.js';
import {writeBatchZip,readBatchZip,ZIP_CHUNK_BYTES} from '../web/wordpress/sherloq-browser/assets/batch-zip.js';
function directory(){const entries=new Map();return {entries,async getDirectoryHandle(name,{create}={}){if(!entries.has(name)){if(!create)throw Object.assign(Error(),{name:'NotFoundError'});entries.set(name,directory());}return entries.get(name);},async getFileHandle(name){let value=entries.get(name);if(!value){value={async getFile(){return value.blob;},async createWritable(){return {async write(blob){value.pending=blob;},async close(){value.blob=value.pending;delete value.pending;},async abort(){delete value.pending;}};}};entries.set(name,value);}return value;},async removeEntry(name){entries.delete(name);}};}
test('Result storage exceeds the former 512 MiB aggregate cap without retaining result Blobs',async()=>{
 const root=directory(),store=await createBatchArtifactStore({rootFactory:async()=>root});
 // Fake backing deliberately owns the payload. The public batch index holds
 // only handles; retention is checked separately from disk byte accounting.
 const first=new Blob(['first']);Object.defineProperty(first,'size',{value:300*1024**2});const second=new Blob(['second']);Object.defineProperty(second,'size',{value:300*1024**2});
 await store.set('a.npz',first);await store.set('b.npz',second);assert.equal(store.snapshot().bytes,600*1024**2);assert.equal(store.snapshot().retainedResultBlobBytes,0);assert.equal(await (await store.get('a.npz')).text(),'first');
 await store.set('a.npz',new Blob(['replaced']));assert.equal(store.size,2);assert.equal(await (await store.get('a.npz')).text(),'replaced');
 await store.delete('b.npz');assert.equal(store.size,1);await store.clear();assert.equal(store.size,0);await store.dispose();assert.equal([...root.entries.values()][0].entries.size,0);
});
test('A failed replacement preserves the previous output and cleans the incomplete file',async()=>{
 const root=directory(),store=await createBatchArtifactStore({rootFactory:async()=>root});await store.set('a',new Blob(['kept']));const owned=[...root.entries.values()][0],backing=[...owned.entries.values()][0],get=backing.getFileHandle.bind(backing);backing.getFileHandle=async name=>{const handle=await get(name);handle.createWritable=async()=>({async write(){throw Object.assign(Error('full'),{name:'QuotaExceededError'});},async abort(){}});return handle;};
 await assert.rejects(store.set('a',new Blob(['lost'])),{code:'STORAGE_QUOTA'});assert.equal(await (await store.get('a')).text(),'kept');assert.equal(backing.entries.size,1);await store.dispose();
});
function sink(){let data=new Uint8Array(0),position=0,maxWrite=0,closed=false,aborted=false;return {get data(){return data;},get maxWrite(){return maxWrite;},get closed(){return closed;},get aborted(){return aborted;},async write(input){const value=input.data??input;if(input.type==='write')position=input.position;maxWrite=Math.max(maxWrite,value.length);if(position+value.length>data.length){const next=new Uint8Array(position+value.length);next.set(data);data=next;}data.set(value,position);position+=value.length;},async seek(at){position=at;},async close(){closed=true;},async abort(){aborted=true;}};}
for(const zip64 of [false,true])test('Streaming ZIP '+(zip64?'64':'32')+' preserves bytes and bounded reads, and resumes from file slices',async()=>{
 const writer=sink(),payload=new Uint8Array(ZIP_CHUNK_BYTES*2+17);for(let i=0;i<payload.length;i++)payload[i]=i%251;const blob=new Blob([payload]);let maximumRead=0;
 const wrapped={size:blob.size,slice(a,b){maximumRead=Math.max(maximumRead,Math.min(b,blob.size)-a);return blob.slice(a,b);}};
 const entries=[{path:'sorties/épreuve.npz',size:blob.size,read:async()=>wrapped},{path:'sherloq-batch.json',size:2,read:async()=>new Blob(['{}'])}];
 const plan=await writeBatchZip(entries,writer,{zip64});assert.equal(writer.closed,true);assert.equal(writer.data.length,plan.capacity);assert.ok(writer.data.length<payload.length/10);assert.ok(maximumRead<=ZIP_CHUNK_BYTES);assert.ok(writer.maxWrite<=ZIP_CHUNK_BYTES);
 const input=new Blob([writer.data]),zip=await readBatchZip(input);assert.deepEqual(new Uint8Array(await (await zip.file('sorties/épreuve.npz').async('blob')).arrayBuffer()),payload);assert.equal(await zip.file('sherloq-batch.json').async('string'),'{}');
 // Independent extractor validates CRCs, headers and UTF-8 paths.
 const {execFileSync}=await import('node:child_process'),{mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'sherloq-zip-'));
 try{const path=join(dir,'result.zip');await writeFile(path,writer.data);execFileSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read('sherloq-batch.json')==b'{}'",path]);}finally{await rm(dir,{recursive:true,force:true});}
});
test('Streaming export aborts the backing on cancellation and rejects changed input size',async()=>{
 const writer=sink(),controller=new AbortController();controller.abort();await assert.rejects(writeBatchZip([{path:'a',size:1,read:async()=>new Blob(['a'])}],writer,{signal:controller.signal}));assert.equal(writer.aborted,true);
 const changed=sink();await assert.rejects(writeBatchZip([{path:'a',size:2,read:async()=>new Blob(['a'])}],changed),/Taille/);assert.equal(changed.aborted,true);
});
test('Already compressed PNG bytes use STORE and round-trip without inflation',async()=>{
 const blob=new Blob(['PNG bytes']),writer=sink();await writeBatchZip([{path:'image.png',size:blob.size,read:async()=>blob}],writer);assert.equal(new DataView(writer.data.buffer).getUint16(8,true),0);const zip=await readBatchZip(new Blob([writer.data]));assert.equal(await zip.file('image.png').async('string'),'PNG bytes');
});
test('Resume uses the bounded one-entry JSZip fallback when raw DEFLATE streams are unavailable',async()=>{
 const blob=new Blob(['scientific output '.repeat(100)]),writer=sink();await writeBatchZip([{path:'output.npz',size:blob.size,read:async()=>blob}],writer);const native=globalThis.DecompressionStream;
 try{globalThis.DecompressionStream=class{constructor(){throw new TypeError('unsupported');}};const zip=await readBatchZip(new Blob([writer.data]));assert.equal(await zip.file('output.npz').async('string'),await blob.text());}finally{globalThis.DecompressionStream=native;}
});
