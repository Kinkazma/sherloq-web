// Contract-only checks: no browser, image, inference, benchmark or allocation probe.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {toolCatalog,toolFields,neuralSelection} from '../sherloq-browser/assets/tool-catalog.js';
import {toolGroups} from '../sherloq-browser/assets/tool-tree.js';
import {validIndividualSettings} from '../sherloq-browser/assets/settings.js';
import {PIXEL_OPERATIONS} from '../../engine-source/src/pixel-operations.js';
import {sparseCopyParams,SPARSE_COPY_ALGORITHMS} from '../../engine-source/src/sparse-copy.js';
import {sparseParameters} from '../sherloq-browser/assets/sparse-controls.js';
import {CLONE_ALGORITHMS,isDenseClone,cloneOperation,changeCloneAlgorithm} from '../sherloq-browser/assets/clone-methods.js';
import {denseCopyParams} from '../../engine-source/src/dense-adapter.js';
import {safireParams} from '../../engine-source/src/safire.js';
import {resultResources,createToolClient} from '../sherloq-browser/assets/tool-client.js';
import {SELFDM_PROPOSAL_MODELS} from '../../engine-source/src/selfdm-proposal-assets.js';
import {SEGMENTATION_MODELS} from '../../engine-source/experiments/segmentation/models.js';

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
 const root=fileURLToPath(new URL('../',import.meta.url)),repository=path.resolve(root,'../..'),publicAssets=path.join(root,'sherloq-browser/assets/individual-assets');
 const lock=JSON.parse(await fs.readFile(path.join(root,'runtime-lock.json'))).runtimes.find(r=>r.destination.endsWith('/individual-assets')).files;
 const policyPaths=[process.env.SHERLOQ_TEST_RESOURCE_POLICY,path.join(repository,'.build/method-resources/resource-policy.json'),path.join(repository,'web-assets/manifest-template.json')].filter(Boolean);let policy;
 for(const filename of policyPaths){let value;try{value=JSON.parse(await fs.readFile(filename));}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(value.schema==='sherloq.resource-policy/1'){policy=value.files;break;}
  if(value.schema==='sherloq.dependencies/1'&&Object.values(value.files).some(f=>f.localOnly===true)){policy=Object.fromEntries(Object.entries(value.files).filter(([,f])=>f.localOnly===true).map(([name,f])=>[name,{localOnly:true,sha256:f.sha256,bytes:f.size,chunks:f.chunks.map(sha256=>({sha256,bytes:value.chunks[sha256]}))}]));break;}
 }
 assert.ok(policy,'Missing reviewed local-only graph policy');
 const restrictedNames=['selfdm','superpoint','superpoint-post','superglue'],expectedRestricted=restrictedNames.map(key=>'individual-assets/segmentation/selfdm-proposal/'+SELFDM_PROPOSAL_MODELS[key].file);
 assert.deepEqual(Object.keys(policy).sort(),expectedRestricted.sort());
 for(const key of restrictedNames){const expected=SELFDM_PROPOSAL_MODELS[key],name='segmentation/selfdm-proposal/'+expected.file,record=policy['individual-assets/'+name];
  assert.deepEqual(record,{localOnly:true,sha256:expected.sha256,bytes:expected.bytes,chunks:[{sha256:expected.sha256,bytes:expected.bytes}]},name);
  assert.equal(lock[name],undefined,'Restricted graph must not enter the physical runtime lock: '+name);
  await assert.rejects(fs.stat(path.join(publicAssets,name)),error=>error.code==='ENOENT',name);
  for(const part of record.chunks)await assert.rejects(fs.stat(path.join(repository,'web-assets/chunks',part.sha256+'.bin')),error=>error.code==='ENOENT','Restricted graph must not be hosted: '+name);
 }
 async function qualify(assets,{publicBuild}={}){
  const catalogBytes=await fs.readFile(path.join(assets,'individual-models.json')),catalog=JSON.parse(catalogBytes),visited=new Set(),localOnlyVisited=new Set();
  if(publicBuild)assert.equal(createHash('sha256').update(catalogBytes).digest('hex'),lock['individual-models.json']);
  async function visitFile(name,sha,bytes){name=path.normalize(name);assert.ok(!path.isAbsolute(name)&&name!=='..'&&!name.startsWith('../'),'Unsafe resource path: '+name);
   if(!lock[name]){const optional=policy['individual-assets/'+name];assert.ok(optional?.localOnly===true,'Missing execution resource: '+name);assert.ok(sha&&Number.isSafeInteger(bytes),'Missing exact local-only identity: '+name);assert.equal(optional.sha256,sha,name);assert.equal(optional.bytes,bytes,name);localOnlyVisited.add(name);visited.add(name);return;}
   if(sha)assert.equal(lock[name],sha,name);const file=path.join(assets,name),stat=await fs.stat(file);if(bytes!==undefined)assert.equal(stat.size,bytes,name);
   if(visited.has(name))return;visited.add(name);if(!name.endsWith('.json'))return;
   const data=await fs.readFile(file);assert.equal(createHash('sha256').update(data).digest('hex'),lock[name],name);await walk(JSON.parse(data),path.dirname(name));
  }
  async function walk(v,folder){if(!v||typeof v!=='object')return;
   if(v.schema==='sherloq.ssg-structured-forest/1'){
    assert.deepEqual(v.arrays.map(a=>a.name),['thrs','fids','child','segs','nSegs','eBins','eBnds']);assert.deepEqual(Object.keys(v.runtime).sort(),['edges-shared.mjs','edges-shared.wasm','edges.mjs','edges.wasm']);
    assert.deepEqual(v.original,{bytes:24433845,file:'Function/EDGE/model.mat',sha256:'ff1dc0c8f843335e0e2324bb4d8cfed13870232ea2623f4e6befa0c6df06f0ce'});
    // Original MAT and source-file hashes describe provenance. Only the seven
    // NPY arrays, four runtime files and retained notices are execution assets.
    for(const [name,spec]of Object.entries(v.runtime))await visitFile(path.join(folder,name),spec.sha256,spec.bytes);
    for(const name of v.licenses)await visitFile(path.join(folder,name));
    for(const [key,child]of Object.entries(v))if(!['original','sourceFiles','runtime','licenses'].includes(key))await walk(child,folder);return;
   }
   if(v.family==='selfdm-proposal'){assert.deepEqual(Object.keys(v.models).sort(),Object.keys(SELFDM_PROPOSAL_MODELS).sort(),'Every Proposal graph must be declared');for(const [key,expected]of Object.entries(SELFDM_PROPOSAL_MODELS))assert.deepEqual(v.models[key],expected,'Pinned Proposal graph identity: '+key);}
   if(v.file&&v.sha256)await visitFile(path.join(folder,v.file),v.sha256,v.bytes);for(const child of Object.values(v))await walk(child,folder);
  }
  async function resources(v){if(!v||typeof v!=='object')return;if(v.url){assert.ok(v.url.startsWith('../individual-assets/'),'Unexpected model URL: '+v.url);await visitFile(v.url.slice('../individual-assets/'.length),v.sha256,v.bytes);}for(const child of Object.values(v))await resources(child);}
  await resources(catalog);
  for(const name of ['trufor-split-value/manifest.json','catnet-segments/manifest.json','cfa-m2/program-manifest.json','trufor-npp/native-manifest.json','cfa-m2/operators.mjs','cfa-m2/operators.wasm','catnet/jpeg.mjs','catnet/jpeg.wasm'])await visitFile(name);
  const expectedMethods=Object.keys(SEGMENTATION_MODELS).filter(key=>publicBuild||!key.startsWith('selfdm-')).sort();assert.deepEqual(Object.keys(catalog.segmentation).sort(),expectedMethods);assert.ok(visited.size>10);
  if(publicBuild){assert.deepEqual([...localOnlyVisited].sort(),restrictedNames.map(key=>'segmentation/selfdm-proposal/'+SELFDM_PROPOSAL_MODELS[key].file).sort());for(const name of ['m3/ssg/segs.npy','m3/ssg/edges-shared.mjs','m3/ssg/edges-shared.wasm','m3/efficient-loftr-full-fp32.onnx'])assert.ok(visited.has(name),name);}
 }
 await qualify(publicAssets,{publicBuild:true});
 if(process.env.SHERLOQ_TEST_ASSET_ROOT)await qualify(path.join(process.env.SHERLOQ_TEST_ASSET_ROOT,'individual-assets'));
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
 for(const algorithm of CLONE_ALGORITHMS){const p={...toolCatalog['tampering.copyMove.sparse'].params,algorithm};changeCloneAlgorithm(p,'PatchMatch Zernike');const rectangles=algorithm==='EfficientLoFTR'?[{id:'a',x0:0,y0:0,x1:32,y1:32},{id:'b',x0:40,y0:0,x1:72,y1:32}]:[];const params=sparseParameters(p,rectangles);assert.doesNotThrow(()=>(isDenseClone(algorithm)?denseCopyParams:sparseCopyParams)(params),algorithm);assert.equal(cloneOperation(algorithm),isDenseClone(algorithm)?'tampering.copyMove.dense':'tampering.copyMove.sparse');}
 assert.doesNotThrow(()=>safireParams(toolCatalog['ai.sources.safire'].params));
 const algorithm=toolFields('tampering.copyMove.sparse').find(f=>f.key==='algorithm');
 assert.deepEqual(algorithm.choices.map(c=>c.value),CLONE_ALGORITHMS);assert.equal(CLONE_ALGORITHMS.length,22);assert.deepEqual(CLONE_ALGORITHMS.filter(a=>!isDenseClone(a)),SPARSE_COPY_ALGORITHMS);
});

test('Dense NPZ uses the live worker surface archive and releases every export handle',async()=>{
 const old=globalThis.fetch,calls=[],surface={id:'dense-result',revision:1,width:2,height:2,format:'rgb8'};globalThis.fetch=async()=>({json:async()=>({assetBase:'./'})});let client;
 const engine={loadBlob:async({id})=>({id,surface:{...surface,id:'source'}}),run:async()=>({operation:'tampering.copyMove.dense',status:'ok',surface}),async exportSurface(request){calls.push(request);return {id:'archive',revision:1,byteLength:3};},async readExport(){return {bytes:Uint8Array.of(1,2,3)};},async releaseExport(id){calls.push(id);},releaseSurface:async()=>{},dispose:async()=>{},exportResult(){throw Error('Dense must not use the sparse NPZ export');}};
 try{client=await createToolClient({engineFactory:()=>engine});await client.load({id:'input',blob:new Blob(['transport'])});await client.run({operation:'tampering.copyMove.dense',params:{profile:'PatchMatch Zernike'}});const output=await client.export('npz');assert.deepEqual([...new Uint8Array(await output.blob.arrayBuffer())],[1,2,3]);await output.cleanup();assert.deepEqual(calls,[{surfaceId:'dense-result',revision:1,format:'npz',storage:'temporary'},'archive']);}finally{await client?.dispose();globalThis.fetch=old;}
});
