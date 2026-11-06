import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';

// A qualification fixture may point to the composed canonical sources before
// final runtime/resource reconstruction. Normal package tests use served assets.
const base=process.env.SHERLOQ_UI_ASSETS?pathToFileURL(process.env.SHERLOQ_UI_ASSETS.replace(/\/$/,'')+'/'):new URL('../sherloq-browser/assets/',import.meta.url);
const load=name=>import(new URL(name,base));
const [{toolGroups},{toolCatalog},{batchCatalog},{gpuBackendEligible,BackendModePreferences},{m2ToolConfiguration},{createToolClient},{createToolWorkspace},{truforHeatFrame},{nativeContextScalarPlan,readNativeContextScalar},{mapEvidence}]=await Promise.all([
 load('tool-tree.js'),load('tool-catalog.js'),load('batch-catalog.js'),load('backend-mode-preferences.js'),load('tool-models.js'),load('tool-client.js'),load('tool-workspace.js'),load('trufor-palette.js'),load('native-context-scalar.js'),load('batch-evidence.js')]);

test('Mini is distinct in the AI menu, native-map batch catalogue and backend preferences',()=>{
 const group=toolGroups.find(group=>group.items.some(tool=>tool.id==='m2.trufor'));
 assert(group.items.some(tool=>tool.id==='m2.trufor-mini'&&tool.en==='TruFor Mini'&&tool.fr==='TruFor Mini'));
 assert.equal(group.items.filter(tool=>tool.id==='m2.trufor').length,1);
 assert.deepEqual(toolCatalog['m2.trufor-mini'].params,{});
 const recipe=batchCatalog.find(item=>item.operation==='m2.trufor-mini');
 assert.equal(recipe.kind,'map');assert.equal(recipe.group,'complement');
 assert(gpuBackendEligible('m2.trufor-mini'));
 const preferences=new BackendModePreferences();preferences.set('m2.trufor','default','cpu');preferences.set('m2.trufor-mini','default','webgpu');
 assert.equal(preferences.get('m2.trufor'),'cpu');assert.equal(preferences.get('m2.trufor-mini'),'webgpu');
});

test('Mini loads its own exact graph manifest through the shared CPU and GPU runtime',async()=>{
 const previous=globalThis.fetch,requests=[];
 globalThis.fetch=async address=>{const url=String(address);requests.push(url);return{ok:true,json:async()=>url.endsWith('/neural-runtime/manifest.json')?{providers:{wasm:{factory:'wasm.mjs',wasm:'wasm.wasm'},webgpu:{factory:'gpu.mjs',wasm:'gpu.wasm'}}}:{method:'trufor-mini',stateSha256:'a'.repeat(64),assets:{decoder:{file:'mini-decode.onnx',sha256:'b'.repeat(64),bytes:4}}}};};
 try{
  const configuration=await m2ToolConfiguration('trufor-mini');
  assert.equal(configuration.segments.method,'trufor-mini');assert.match(configuration.segments.assets.decoder.url,/individual-assets\/trufor-mini\/mini-decode\.onnx$/);
  assert.deepEqual(Object.keys(configuration.runtimes),['wasm','webgpu']);
  assert.equal(configuration.noiseprint,undefined);
  assert.equal(requests.length,2);assert(!requests.some(url=>/trufor-(?:npp|neuron333|segments)/.test(url)));
 }finally{globalThis.fetch=previous;}
});

test('Mini owns only real fields, pins the loaded source and changes palette without inference',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});
 const source={id:'source',sha256:'a'.repeat(64),surface:{id:'source-rgb',revision:1,width:9,height:3,format:'rgb8'}},values=Float32Array.from({length:27},(_,i)=>(i%9)/8),calls=[],leases=new Set();let runs=0;
 const engine={loadBlob:async()=>source,capabilities:async()=>({memory:{budgetBytes:2**30,retainedBytes:0,cacheBytes:0,knownHeapCapacityBytes:0}}),dispose:async()=>{}};
 const m2={ready:{windowBytes:64},async analyzeBlob(method,blob,params,options){runs++;calls.push({method,options});return{id:1,width:9,height:3,fields:{map:{type:'Float32Array',length:27,byteLength:108}}};},metadata:async()=>({metadata:{method:'trufor-mini'},provenance:{originalSourceSha256:source.sha256}}),async reserveExternalMemory({bytes}){const id=Symbol();leases.add(id);return{id,bytes};},async releaseExternalMemory(id){assert(leases.delete(id));},async readArray(id,field,offset,count){assert.equal(field,'map');return values.slice(offset,offset+count);},readDisplay:async()=>({pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(9,8,7)}}),release:async()=>{},dispose:async()=>{}};
 const client=await createToolClient({engineFactory:()=>engine,m2Factory:async()=>m2});
 try{
  const file=new Blob(['source']);await client.load({id:'source',blob:file});
  const result=await client.run({id:'mini',operation:'m2.trufor-mini',params:{},backend:'cpu'},{file});
  assert.equal(calls[0].method,'trufor-mini');assert.equal(calls[0].options.expectedSourceSha256,source.sha256);assert.equal(calls[0].options.backend,'cpu');
  assert.deepEqual(result.views.map(view=>view.view),['map','map_alternative']);assert(!result.views.some(view=>['confidence','neuron333'].includes(view.view)));
  assert.equal(result.data.score,undefined);
  const pixels=await client.readWindow(result.views[1],{x:0,y:0,width:9,height:3});assert.deepEqual(pixels.data,truforHeatFrame(9,3,values).data);assert.equal(runs,1);assert.equal(leases.size,0);
 }finally{await client.dispose();globalThis.fetch=previous;}
});

test('Mini native contexts retain explicit missing support and exact batch map observations',async()=>{
 const sha='a'.repeat(64),source={sha256:sha,surface:{width:16,height:8}},domain={origin:[4,2],width:8,height:4,fingerprint:'f'.repeat(64),snapshot:{sourceSha256:sha}};
 const result={operation:'m2.trufor-mini',sourceRegionDomain:domain,provenance:{originalSourceSha256:sha},m2Result:{id:'mini-native',fields:{map:{length:4}}},data:{metadata:{fragmented:true,fragments:[{index:0,bounds:[4,2,6,4],shape:[2,2],offset:0,evaluable:true},{index:1,bounds:[10,4,12,6],shape:[2,2],offset:4,evaluable:false}]}},metrics:{selectedPixels:8,analysedPixels:4,unanalysablePixels:4}};
 const packed=Float32Array.of(.1,.2,.3,.4),readArray=async(id,field,offset,count)=>packed.slice(offset,offset+count);
 const readScalar=(expected,rect,field,options)=>readNativeContextScalar({result,source,rect,field,expected,readArray,windowBytes:8,...options});
 assert.equal(nativeContextScalarPlan(result,source).method,'trufor-mini');
 const raw=await readScalar({m2Result:'mini-native',sourceRegionFingerprint:domain.fingerprint},{x:0,y:0,width:16,height:8},'map');assert.equal(raw.filter(Number.isFinite).length,4);assert.equal(raw.filter(Number.isNaN).length,124);
 let credits=0;const client={source,readScalar,reserveExport:async()=>{credits++;return()=>{credits--;};}};
 const evidence=await mapEvidence(result,{signal:{threshold:.3,minimumPixels:1}},client,{width:16,height:8,sourceSha256:sha});assert.equal(evidence.pixels,2);assert.equal(evidence.evidencePreparation.modeledPixels,4);assert.equal(evidence.evidencePreparation.selectedButNonEvaluablePixels,4);assert.match(evidence.scoreMeaning,/TruFor Mini/);assert.equal(credits,0);
 await assert.rejects(readScalar({m2Result:'other',sourceRegionFingerprint:domain.fingerprint},{x:4,y:2,width:1,height:1},'map'),{code:'INVALID_INPUT'});
});

test('Mini keeps its own remembered layer without changing the complete TruFor selection',async()=>{
 const {document,window}=parseHTML('<html><body><div id="analysis-controls"></div><div id="viewport"></div><button id="export-png"></button></body></html>');
 const savedDocument=globalThis.document,savedOption=globalThis.Option;globalThis.document=document;globalThis.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const shown=[];let runs=0;
 const ui=createToolWorkspace({document,language:()=> 'en',getClient:async()=>({}),run(){runs++;},cancel(){},showSurface:display=>shown.push(display),download(){},notify(){},onSettings(){}});
 const output=operation=>({operation,status:'ok',m2Result:{id:1},data:{metadata:{method:operation.slice(3)}},views:['map','map_alternative'].map(view=>({id:operation+'-'+view,view,m2Result:1,width:2,height:2,revision:1,format:'rgb8',...(view==='map_alternative'?{truforPalette:true}:{})}))});
 try{
  ui.select('m2.trufor-mini');await ui.render(output('m2.trufor-mini'));const layers=document.getElementById('tool-layer');assert.equal(layers.options.length,2);assert.equal(shown.at(-1).view,'map');
  layers.value='1';layers.onchange();assert.equal(shown.at(-1).view,'map_alternative');assert.equal(ui.serialize().uiOptions.truforMiniView,'map_alternative');
  ui.select('m2.trufor');await ui.render(output('m2.trufor'));assert.equal(shown.at(-1).view,'map');
  ui.select('m2.trufor-mini');await ui.render(output('m2.trufor-mini'));assert.equal(shown.at(-1).view,'map_alternative');
  const state=ui.serialize();ui.restore(state);await ui.render(output('m2.trufor-mini'));assert.equal(shown.at(-1).view,'map_alternative');assert.equal(runs,0);
 }finally{ui.dispose();globalThis.document=savedDocument;globalThis.Option=savedOption;}
});
