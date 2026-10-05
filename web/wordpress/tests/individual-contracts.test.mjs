// Contract-only checks: no browser, image, inference, benchmark or allocation probe.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {toolCatalog,toolFields,neuralSelection} from '../sherloq-browser/assets/tool-catalog.js';
import {toolGroups} from '../sherloq-browser/assets/tool-tree.js';
import {validIndividualSettings} from '../sherloq-browser/assets/settings.js';
import {PIXEL_OPERATIONS} from '../sherloq-browser/assets/unified-engine/src/pixel-operations.js';
import {sparseCopyParams,SPARSE_COPY_ALGORITHMS} from '../sherloq-browser/assets/unified-engine/src/sparse-copy.js';
import {sparseParameters} from '../sherloq-browser/assets/sparse-controls.js';
import {CLONE_ALGORITHMS,isDenseClone,cloneOperation,changeCloneAlgorithm} from '../sherloq-browser/assets/clone-methods.js';
import {denseCopyParams} from '../sherloq-browser/assets/unified-engine/src/dense-adapter.js';
import {safireParams} from '../sherloq-browser/assets/unified-engine/src/safire.js';
import {resultResources,createToolClient} from '../sherloq-browser/assets/tool-client.js';

test('Every tree entry has a concrete adapter and native default parameters validate',()=>{
 const existing=new Set(['original','ela.classic','composite','analysis.complete','analysis.clones']);
 for(const item of toolGroups.flatMap(g=>g.items)){
  assert.notEqual(item.id,'unavailable');assert.ok(existing.has(item.id)||toolCatalog[item.id],item.id);
  if(PIXEL_OPERATIONS[item.id])assert.doesNotThrow(()=>PIXEL_OPERATIONS[item.id].validate(toolCatalog[item.id].params),item.id);
  if(toolCatalog[item.id])for(const field of toolFields(item.id)){
   if(field.choices)assert.ok(field.choices.some(c=>c.value===field.value),item.id+'/'+field.key);
   if(typeof field.value==='number'){if(field.min!==undefined)assert.ok(field.value>=field.min,item.id+'/'+field.key);if(field.max!==undefined)assert.ok(field.value<=field.max,item.id+'/'+field.key);}
  }
 }
});
test('Portable tool settings retain null automatic values and nested selections safely',()=>{
 const values=Object.fromEntries(Object.entries(toolCatalog).map(([id,tool])=>[id,tool.params]));
 assert.deepEqual(validIndividualSettings(values),values);
 assert.throws(()=>validIndividualSettings(JSON.parse('{"__proto__":{"polluted":true}}')));
});
test('Result descriptors are deduplicated and table handles stay distinct from surfaces',()=>{
 const s={id:'plane',revision:1,width:10,height:10,format:'float32'},t={id:'table',revision:1,columns:['x'],rowCount:3,format:'uint32-table'};
 assert.deepEqual(resultResources({surface:s,planeSurfaces:{map:s},tables:{points:t},data:new Float32Array(4)}),{surfaces:[s],tables:[t]});
});
test('Queued source windows and releases cannot overlap regular worker calls',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});let active=0,maximum=0;const calls=[];
 const record=async(name,value)=>{active++;maximum=Math.max(active,maximum);calls.push(name);await new Promise(r=>setImmediate(r));active--;return value;};
 const source={id:'source',surface:{id:'original',revision:1,width:2,height:2,format:'rgb8'}};
 const surface={id:'result',revision:1,width:2,height:2,format:'rgb8'};
 const engine={loadBlob:()=>record('load',source),run:()=>record('run',{surface,planeSurfaces:{same:surface},data:{originalSurface:source.surface}}),readPixels:()=>record('read',{pixels:{data:Uint8Array.of(1,2,3),width:1,height:1}}),releaseSurface:id=>record('release:'+id),dispose:()=>record('dispose')};
 let client;
 try{client=await createToolClient({engineFactory:()=>engine});await client.load({id:'source',blob:new Blob(['fixture'])});await client.run({operation:'file.hex',params:{offset:0,length:1}});await Promise.all([client.readWindow(surface,{x:0,y:0,width:1,height:1}),client.readWindow(surface,{x:1,y:0,width:1,height:1}),client.release()]);assert.equal(maximum,1);assert.deepEqual(calls,['load','run','read','read','release:result']);}
 finally{await client?.dispose();globalThis.fetch=originalFetch;}
});
test('Pinned model closure includes nested backbones, runtime factories and every graph URL',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),assets=path.join(root,'sherloq-browser/assets/individual-assets');
 const lock=JSON.parse(await fs.readFile(path.join(root,'runtime-lock.json'))).runtimes.find(r=>r.destination.endsWith('/individual-assets')).files;
 const catalog=JSON.parse(await fs.readFile(path.join(assets,'individual-models.json'))),visited=new Set();
 async function visitFile(name,sha){name=path.normalize(name);assert.ok(!name.startsWith('../'));assert.ok(lock[name],name);if(sha)assert.equal(lock[name],sha,name);if(visited.has(name)||!name.endsWith('.json'))return;visited.add(name);await walk(JSON.parse(await fs.readFile(path.join(assets,name))),path.dirname(name));}
 async function walk(v,folder){if(!v||typeof v!=='object')return;if(v.file&&v.sha256)await visitFile(path.join(folder,v.file),v.sha256);for(const child of Object.values(v))await walk(child,folder);}
 async function resources(v){if(!v||typeof v!=='object')return;if(v.url){const name=v.url.replace('../individual-assets/','');await visitFile(name,v.sha256);}for(const child of Object.values(v))await resources(child);}
 await resources(catalog);
 for(const name of ['trufor-split-value/manifest.json','catnet-segments/manifest.json','cfa-m2/program-manifest.json','trufor-npp/native-manifest.json','cfa-m2/operators.mjs','cfa-m2/operators.wasm','catnet/jpeg.mjs','catnet/jpeg.wasm'])await visitFile(name);
 assert.equal(Object.keys(catalog.segmentation).length,9);assert.ok(visited.size>10);
});

test('Neural selections preserve source coordinates and keep native exclusions separate',()=>{
 const rectangle={id:'zone-a',x0:11,y0:29,x1:1011,y1:529};
 assert.deepEqual(neuralSelection([rectangle]),{params:{selectionPresent:false},regions:[]});
 assert.deepEqual(neuralSelection([rectangle],'regions',true),{params:{selectionPresent:true},regions:[{id:'zone-a',kind:'region',bounds:[11,29,1011,529]}]});
 assert.deepEqual(neuralSelection([rectangle],'exclude'),{params:{selectionPresent:false,exclusions:[[11,29,1011,529]]},regions:[]});
 assert.throws(()=>neuralSelection([],'regions'));
 assert.throws(()=>neuralSelection([rectangle],'exclude',true));
});

test('Learned-tool controls use native algorithms and valid scientific defaults',()=>{
 for(const algorithm of CLONE_ALGORITHMS){const p={...toolCatalog['tampering.copyMove.sparse'].params,algorithm};changeCloneAlgorithm(p,'PatchMatch Zernike');const params=sparseParameters(p,[]);assert.doesNotThrow(()=>(isDenseClone(algorithm)?denseCopyParams:sparseCopyParams)(params),algorithm);assert.equal(cloneOperation(algorithm),isDenseClone(algorithm)?'tampering.copyMove.dense':'tampering.copyMove.sparse');}
 assert.doesNotThrow(()=>safireParams(toolCatalog['ai.sources.safire'].params));
 const algorithm=toolFields('tampering.copyMove.sparse').find(f=>f.key==='algorithm');
 assert.deepEqual(algorithm.choices.map(c=>c.value),CLONE_ALGORITHMS);assert.equal(CLONE_ALGORITHMS.length,20);assert.deepEqual(CLONE_ALGORITHMS.filter(a=>!isDenseClone(a)),SPARSE_COPY_ALGORITHMS);
});

test('Dense NPZ uses the live worker surface archive and releases every export handle',async()=>{
 const old=globalThis.fetch,calls=[],surface={id:'dense-result',revision:1,width:2,height:2,format:'rgb8'};globalThis.fetch=async()=>({json:async()=>({assetBase:'./'})});let client;
 const engine={loadBlob:async({id})=>({id,surface:{...surface,id:'source'}}),run:async()=>({operation:'tampering.copyMove.dense',status:'ok',surface}),async exportSurface(request){calls.push(request);return {id:'archive',revision:1,byteLength:3};},async readExport(){return {bytes:Uint8Array.of(1,2,3)};},async releaseExport(id){calls.push(id);},releaseSurface:async()=>{},dispose:async()=>{},exportResult(){throw Error('Dense must not use the sparse NPZ export');}};
 try{client=await createToolClient({engineFactory:()=>engine});await client.load({id:'input',blob:new Blob(['transport'])});await client.run({operation:'tampering.copyMove.dense',params:{profile:'PatchMatch Zernike'}});const output=await client.export('npz');assert.deepEqual([...new Uint8Array(await output.blob.arrayBuffer())],[1,2,3]);await output.cleanup();assert.deepEqual(calls,[{surfaceId:'dense-result',revision:1,format:'npz',storage:'temporary'},'archive']);}finally{await client?.dispose();globalThis.fetch=old;}
});
