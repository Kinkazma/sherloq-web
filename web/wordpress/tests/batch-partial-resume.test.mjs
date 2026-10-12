import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createBatchImporter} from '../sherloq-browser/assets/batch-import.js';
import {writeBatchZip,readBatchZip,ZIP_CHUNK_BYTES} from '../sherloq-browser/assets/batch-zip.js';
import {d2prlNpz} from '../../engine-source/src/npz.js';

const hash='9'.repeat(64),id='image-'+hash.slice(0,24),width=80,height=64;
const pair={pixelHash:hash,width,height,source:'manual',regions:[{x0:4,y0:8,x1:36,y1:40},{x0:44,y0:12,x1:76,y1:44}]};
const error={code:'MEMORY_ALLOCATION',message:'Useful native allocation refused',details:{allocationKind:'wasm'},cause:{code:'ASSET_HTTP',message:'HTTP 503',details:{status:503,url:'https://example.invalid/native-model.onnx'}}};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function memoryStore(){const records=new Map(),writes=[];return {writes,keys:()=>records.keys(),has:p=>records.has(p),get:async p=>records.get(p),set:async(p,blob)=>{writes.push(p);records.set(p,blob);},clear:async()=>records.clear(),dispose:async()=>records.clear()};}
async function archive({complete=false,badPair=false,badHash=false,missingResult=false,unfinished=false}={}){
 const map=new Float32Array(width*height).fill(.75),mask=new Uint8Array(map.length).fill(1),zero=new Uint8Array(map.length);
 const npz=d2prlNpz({data:{width,height,map,mask,analyzed:mask,candidates:zero,target:map,source:map,metadata:{scope:'Synthetic scientific transport fixture'}},provenance:{test:'batch-partial-resume'}},1024**2).bytes;
 const current='resultats/'+id+'/detector.npz',failed='resultats/'+id+'/detector-error.json',past='historique/attempt/resultats/'+id+'/previous.npz';
 const manifest={schema:'sherloq.batch/1',engine:{version:'pinned',commit:'fixed'},configuration:{pairSelections:{[hash]:badPair?{...pair,pixelHash:'wrong'}:pair},options:{panels:false},recipes:[]},studies:[{id:'study-old',name:'source.png',archivePath:'documents/source.png',kind:'image',errors:['Original import warning']}],images:[{id,hash:badHash?'wrong':hash,width,height,name:'source.png',archivePath:'images/source.png',selected:true,family:'photography',state:complete?'done':'incomplete',score:{clones:1,additional:0,total:1,incomplete:!complete},occurrences:[{studyId:'study-old',page:null},{studyId:'study-old',page:2}],runs:[{toolId:'detector',title:'Detector',operation:'ai.clones.segmentation',status:complete?'done':'error',error:complete?undefined:error,files:[current,failed]}],history:[{at:'2026-10-12T00:00:00Z',runs:[{title:'Previous detector',status:'error',error,files:[past]}]}]}],errors:[{name:'archive-source',message:'Previous session warning',cause:error}]};
 if(unfinished){manifest.images[0].runs[0].status='running';delete manifest.images[0].runs[0].error;}
 const blobs=new Map([['sherloq-batch.json',new Blob([JSON.stringify(manifest)])],['documents/source.png',new Blob(['source-image'])],['images/source.png',new Blob(['source-image'])],[failed,new Blob([JSON.stringify({error})])],[past,new Blob([npz])]]);if(!missingResult)blobs.set(current,new Blob([npz]));
 let data=new Uint8Array(2*1024**2),position=0,length=0,maximumWrite=0;
 const writer={async write(value){if(value.type==='write'){data.set(value.data,value.position);length=Math.max(length,value.position+value.data.length);return;}maximumWrite=Math.max(maximumWrite,value.length);data.set(value,position);position+=value.length;length=Math.max(length,position);},async seek(value){position=value;},async close(){},async abort(){}};
 await writeBatchZip([...blobs].map(([path,blob])=>({path,size:blob.size,read:async()=>blob})),writer,{compress:false,zip64:true});assert.ok(maximumWrite<=ZIP_CHUNK_BYTES);
 const file=new Blob([data.slice(0,length)],{type:'application/zip'});file.name='session.zip';return {file,npz,manifest,current,failed,past};
}
async function restore(source){
 const artifacts=memoryStore(),importer=await createBatchImporter({artifactStoreFactory:async()=>artifacts,libraryLoader:async()=>({}),identify:async()=>({hash,width,height,thumbnail:new Blob(['thumbnail'])})});
 await importer.import([source.file]);return {importer,artifacts,image:importer.images[0]};
}
test('a partial ZIP64 roundtrip restores exact manual pair inputs, complete diagnostics and NPZ bytes without marking calculations done',async()=>{
 const source=await archive(),{importer,artifacts,image}=await restore(source);
 assert.equal(importer.images.length,1);assert.equal(image.occurrences.length,2);assert.deepEqual(image.pairSelection,pair);assert.equal(image.state,'incomplete');assert.equal(image.score.incomplete,true);assert.equal(image.restored,undefined);assert.equal(image.restoredDiagnostics,true);
 assert.deepEqual(image.runs[0].error,error);assert.deepEqual(image.history[0].runs[0].error,error);assert.equal(image.history.length,1);assert.equal(importer.studies[0].errors[0],'Original import warning');assert.deepEqual(importer.errors[0].cause,error);
 for(const path of [source.current,source.past])assert.equal(sha(new Uint8Array(await (await artifacts.get(path)).arrayBuffer())),sha(source.npz));
 assert.equal(artifacts.writes.length,3);assert.equal(JSON.parse(await (await artifacts.get(source.failed)).text()).error.cause.details.status,503);
});
test('valid completed scientific attempts keep the existing exact-engine reuse contract alongside recovered inputs and history',async()=>{
 const source=await archive({complete:true}),{image}=await restore(source);assert.equal(image.state,'done');assert.equal(image.restored.engine.commit,'fixed');assert.deepEqual(image.pairSelection,pair);assert.equal(image.history[0].runs[0].status,'error');
});
test('missing result files downgrade a claimed complete attempt to inspection-only incomplete diagnostics',async()=>{
 const source=await archive({complete:true,missingResult:true}),{image}=await restore(source);assert.equal(image.state,'incomplete');assert.equal(image.restored,undefined);assert.equal(image.score.incomplete,true);assert.deepEqual(image.pairSelection,pair);
});
test('invalid pair identity is reported while preserving the actual image and its valid diagnostic attempt',async()=>{
 const source=await archive({badPair:true}),{image}=await restore(source);assert.equal(image.pairSelection,undefined);assert.equal(image.pairError.code,'BATCH_PAIR_REQUIRED');assert.equal(image.state,'incomplete');assert.deepEqual(image.runs[0].error.cause,error.cause);
});
test('different decoded pixel hashes cannot import another image’s regions, success states or history',async()=>{
 const source=await archive({badHash:true}),{image,artifacts}=await restore(source);assert.equal(image.state,'ready');assert.equal(image.pairSelection,undefined);assert.equal(image.history,undefined);assert.equal(image.runs.length,0);assert.equal(artifacts.writes.length,0);
});
test('an interrupted running attempt cannot be displayed as a live calculation after archive import',async()=>{
 const {image}=await restore(await archive({unfinished:true}));assert.equal(image.state,'incomplete');assert.equal(image.runs[0].status,'partial');assert.equal(image.runs[0].archivedStatus,'running');assert.equal(image.runs[0].error.code,'INTERRUPTED_ARCHIVE');
});
test('the real ZIP reader still exposes the scientific output as ordinary byte-identical NPZ files',async()=>{
 const source=await archive(),zip=await readBatchZip(source.file);assert.equal(sha(new Uint8Array(await (await zip.file(source.current).async('blob')).arrayBuffer())),sha(source.npz));
 const npz=await readBatchZip(new Blob([source.npz]));assert.ok(npz.file('map.npy'));assert.ok(npz.file('mask.npy'));const mask=new Uint8Array(await (await npz.file('mask.npy').async('blob')).arrayBuffer());assert.equal(mask.at(-1),1);
});
