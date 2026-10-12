import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';

test('Learned matching avoids OCR; Panels + Text alone fetches it and keeps it for subsequent runs', async()=>{
 const before=globalThis.fetch,requested=[],loads=[];
 globalThis.fetch=async url=>{const path=String(url);requested.push(path);return {ok:true,json:async()=>path.includes('individual-models')?{m3:{}}:{assetBase:'./unified-assets/',englishSha256:'pinned'},arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};};
 const engine={loadBlob:async()=>({id:'source',surface:{id:'source-surface',revision:1,width:8,height:8,format:'rgb8'}}),loadM3Models:async x=>loads.push(x),run:async()=>({data:{}}),dispose:async()=>{}};
 const client=await createToolClient({engineFactory:()=>engine});
 try{
  await client.load({id:'source',blob:new Blob(['fixture'])});
  for(const algorithm of ['ALIKED + LightGlue','SIFT','ALIKED rotation + LightGlue'])await client.run({operation:'tampering.copyMove.sparse',params:{algorithm}});
  assert.equal(requested.filter(x=>x.endsWith('eng.traineddata')).length,0);
  assert.equal(loads.length,1);assert.equal(loads[0].language,undefined);
  const task={operation:'tampering.copyMove.sparse',params:{algorithm:'SIFT + G2NN + RANSAC + Panels + Text'}};
  await client.run(task);await client.run(task);
  assert.equal(requested.filter(x=>x.endsWith('eng.traineddata')).length,1);
  assert.equal(loads.length,2);assert.deepEqual(loads[1].language,{data:Uint8Array.of(1,2,3),sha256:'pinned'});
 }finally{await client.dispose();globalThis.fetch=before;}
});

test('Failed OCR download retains image, HTTP identity and can retry only that dependency',async()=>{
 const before=globalThis.fetch;let fail=true,imageLoads=0,modelLoads=0,runs=0;
 globalThis.fetch=async url=>{const path=String(url);if(path.endsWith('eng.traineddata'))return {ok:!fail,status:fail?503:200,url:path,arrayBuffer:async()=>new ArrayBuffer(3)};return {ok:true,json:async()=>path.includes('individual-models')?{m3:{}}:{assetBase:'./unified-assets/',englishSha256:'pinned'}};};
 const engine={loadBlob:async()=>{imageLoads++;return {id:'source',surface:{id:'s',revision:1,width:8,height:8,format:'rgb8'}};},loadM3Models:async()=>{modelLoads++;},run:async()=>{runs++;return {data:{}};},dispose:async()=>{}};
 const client=await createToolClient({engineFactory:()=>engine});
 try{
  await client.load({id:'source',blob:new Blob(['fixture'])});
  const task={operation:'tampering.copyMove.sparse',params:{algorithm:'SIFT + G2NN + RANSAC + Panels + Text'}};
  await assert.rejects(client.run(task),e=>e.code==='ASSET_HTTP'&&e.details.status===503&&e.details.file==='ocr/eng.traineddata'&&e.details.sha256==='pinned');
  assert.equal(client.source.id,'source');assert.equal(modelLoads,0);assert.equal(runs,0);
  fail=false;await client.run(task);
  assert.equal(imageLoads,1);assert.equal(modelLoads,1);assert.equal(runs,1);
 }finally{await client.dispose();globalThis.fetch=before;}
});
