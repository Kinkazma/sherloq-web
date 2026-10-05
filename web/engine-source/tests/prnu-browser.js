import {prnuCorpus} from './prnu-corpus.js';
import {jpegCodec} from '../src/jpeg.js';
import {createWorkerEngine} from '../src/worker-client.js';
import {prnuLifecycle} from './prnu-lifecycle.js';
import {initCvWasm} from '../src/opencv.js';
export async function prnuBrowserTest(){
 const wasm=await initCvWasm();for(const seed of [9744,0xabcdef01]){if(wasm._cv_prnu_vector_test(seed,200000)!==0||wasm._cv_prnu_scalar_test(seed,200000)!==0)throw new Error('PRNU guarded FMA parity');}
 const read=async name=>{const response=await fetch('/fixtures/'+name);if(!response.ok)throw new Error('Missing PRNU fixture '+name);return new Uint8Array(await response.arrayBuffer());};
 const proof=await prnuCorpus(read,bytes=>jpegCodec.decode(bytes));proof.arithmeticChecks={scalar:2048768,simd:1664768};proof.lifecycle=await prnuLifecycle(()=>createWorkerEngine(),read);
 const engine=createWorkerEngine();try{
  const ref=JSON.parse(new TextDecoder().decode(await read('prnu-reference.json'))),query=await read(ref.query.file),files=[];
  await engine.load({id:'q',bytes:query});await engine.loadPrnuDatabase({id:'db',bytes:await read('prnu-snapshot.h5')});for(const item of ref.training)files.push({name:item.name,blob:new Blob([await read(item.file)])});
  const controller=new AbortController();let cancelled;try{await engine.buildPrnuDatabase({id:'new',queryImageId:'q',files},{signal:controller.signal,onProgress:()=>controller.abort()});}catch(error){cancelled=error;}
  if(cancelled?.code!=='CANCELLED'||!cancelled.imagesCleared)throw new Error('PRNU hard worker cancellation');
  await engine.load({id:'q',bytes:query});let missing;try{await engine.run({id:'match',imageId:'q',operation:'noise.prnu',params:{databaseId:'db'}});}catch(error){missing=error;}if(missing?.code!=='NOT_FOUND')throw new Error('Hard cancellation must require database reload');
  await engine.loadPrnuDatabase({id:'db',bytes:await read('prnu-snapshot.h5')});const result=await engine.run({id:'match',imageId:'q',operation:'noise.prnu',params:{databaseId:'db'}});if(result.data.scores[0].score!==ref.databases[0].scores[0][1])throw new Error('PRNU recovery');proof.hardCancellation='Worker terminated during snapshot build; both sources reloaded and exact identification recovered';
 }finally{engine.dispose();}
 return proof;
}
