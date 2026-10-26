import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
import {NEURAL_METHODS,neuralOperation,neuralDrawingScope,forgeryscopeParams,neuralDisplays,composeCloneFrame,sampleCloneField,d2AnalysisKey} from '../sherloq-browser/assets/neural-clone-ui.js';
const plane=(id,format='float32')=>({id,revision:1,width:4,height:1,format});
const result=()=>({operation:'ai.clones.d2prl',surface:plane('map'),planeSurfaces:{source:plane('source'),target:plane('target')},maskSurfaces:{mask:plane('mask','mask8'),analyzed:plane('analyzed','mask8')},data:{metadata:{analysisId:'raw-1'}}});

test('Individual retained D2 identity binds exact exclusion geometry even with an unchanged fingerprint',()=>{
 const scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',width:32,height:32,sourceSha256:'a'.repeat(64),fingerprint:'b'.repeat(64),regions:[{x0:0,y0:0,x1:32,y1:32}],excluded:[[[4,4],[8,4],[8,8],[4,8]]]};
 const task={imageId:'image',backend:'auto',params:{selectionPresent:true,scientificScope:scope},regions:[{id:'one',kind:'region',bounds:[0,0,32,32]}]};
 assert.equal(d2AnalysisKey(task),d2AnalysisKey(structuredClone(task)));
 const changed=structuredClone(task);changed.params.scientificScope.excluded[0][1][0]=9;
 assert.notEqual(d2AnalysisKey(task),d2AnalysisKey(changed));
 const minimum=structuredClone(task);minimum.params.minimum=200;assert.equal(d2AnalysisKey(task),d2AnalysisKey(minimum));
});

test('manual neural drawing preserves supported exclusion/comparison modes and never selects nonexistent Forgeryscope regions',()=>{
 for(const [method]of NEURAL_METHODS){const fg=method.startsWith('forgeryscope-');assert.equal(neuralDrawingScope(method,'whole'),fg?method==='forgeryscope-auto'?'exclude':'compare':'regions');}
 assert.equal(neuralDrawingScope('d2prl','exclude'),'exclude');assert.equal(neuralDrawingScope('mgcfdn','exclude'),'regions');
 for(const [method]of NEURAL_METHODS.filter(([m])=>m.startsWith('forgeryscope-'))){assert.equal(neuralDrawingScope(method,'exclude'),'exclude');assert.equal(neuralDrawingScope(method,'compare'),method==='forgeryscope-auto'?'exclude':'compare');assert.notEqual(neuralDrawingScope(method,''),'regions');}
});

test('All native methods and the explicit SelfDM initial map have usable operation routes and descriptive names',()=>{
 assert.equal(NEURAL_METHODS.length,17);assert.equal(new Set(NEURAL_METHODS.map(x=>x[0])).size,17);
 assert.equal(neuralOperation('d2prl'),'ai.clones.d2prl');assert.equal(neuralOperation('mgcfdn-st'),'ai.clones.segmentation');assert.equal(neuralOperation('selfdm-map'),'ai.clones.segmentation');assert.match(NEURAL_METHODS.find(x=>x[0]==='selfdm-map')[1],/carte initiale/);
 for(const [id]of NEURAL_METHODS.filter(x=>x[0].startsWith('forgeryscope-'))){assert.equal(neuralOperation(id),'m2.forgeryscope');assert.deepEqual(forgeryscopeParams(id,'whole',[]),{profile:id.slice(13)});}
 for(const row of NEURAL_METHODS.filter(x=>x[0].startsWith('mgcfdn')))for(const label of row.slice(1))assert.match(label,/MGCFDN 2026/);
 const boxes=[{x0:0,y0:0,x1:20,y1:20},{x0:30,y0:0,x1:50,y1:20}];
 assert.deepEqual(forgeryscopeParams('forgeryscope-microscopy','compare',boxes).panels,[['Microscopy',1,0,0,20,20],['Microscopy',1,30,0,50,20]]);
 assert.throws(()=>forgeryscopeParams('forgeryscope-auto','compare',boxes));
});
test('Filtered overlay preserves original outside the mask; raw map is independent of minimum',()=>{
 const base=new Uint8Array(12).fill(40),values=Float32Array.of(.8,.8,.8,.8),support=Uint8Array.of(1,1,1,0);
 const draw=mask=>composeCloneFrame({width:4,height:1,base,values,support,mask,view:'overlay',masked:true}).data;
 const before=draw(Uint8Array.of(1,1,0,0)),after=draw(Uint8Array.of(0,1,0,0));
 assert.notDeepEqual(before.subarray(0,3),base.subarray(0,3));assert.deepEqual(after.subarray(0,3),base.subarray(0,3));assert.deepEqual(after.subarray(3,6),before.subarray(3,6));assert.deepEqual(after.subarray(6),base.subarray(6));assert.deepEqual(base,new Uint8Array(12).fill(40));
 assert.deepEqual(neuralDisplays(result()).map(x=>x.display.cloneView),['overlay','map','mask','source','target']);
});
test('M2 sampled fields use bounded strips and preserve nonzero crop origins',async()=>{
 const values=Uint8Array.from({length:70},(_,i)=>i),calls=[];
 const c={ready:{windowBytes:22},async readArray(id,field,offset,count){calls.push({id,field,offset,count});assert.ok(count<=22);return values.slice(offset,offset+count);}};
 const out=await sampleCloneField(c,{width:10,height:7,m2Result:3,cloneFields:{mask:{type:'Uint8Array'}}},'mask',{x:2,y:1,w:5,h:5,step:2});
 assert.deepEqual([...out],[12,14,16,32,34,36,52,54,56]);assert.equal(calls.length,3);
});
test('Minimum/exclusion edits refilter retained D2PRL grids; geometry changes and evictions reanalyze',async()=>{
 const fetchBefore=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});const calls=[];let evicted=false;
 const engine={loadBlob:async()=>({id:'source',surface:plane('original','rgb8')}),loadD2prlModel:async()=>{},releaseSurface:async()=>{},unload:async()=>{},dispose:async()=>{},async run(task){calls.push(task);if(evicted&&task.params.refilterOf){evicted=false;throw Object.assign(Error('Evicted'),{code:'CACHE_MISS'});}return result();}};
 const client=await createToolClient({engineFactory:()=>engine});
 try{
  await client.load({id:'source',blob:new Blob(['synthetic'])});const task={operation:'ai.clones.d2prl',params:{minimum:0,selectionPresent:false},regions:[],backend:'auto'};
  await client.run(task);await client.run({...task,params:{...task.params,minimum:100}});
  assert.equal(calls[1].params.refilterOf,'raw-1');assert.equal(calls[1].params.minimum,100);assert.equal(calls[1].regions,undefined);assert.equal(calls[1].params.selectionPresent,undefined);
  await client.run({...task,params:{...task.params,exclusions:[[0,0,8,8]]}});assert.deepEqual(calls[2].params.exclusions,[[0,0,8,8]]);
  evicted=true;await client.run(task);assert.equal(calls.length,5);assert.equal(calls[4].params.refilterOf,undefined);assert.deepEqual(calls[3].params.exclusions,[]);
  await client.run({...task,regions:[{id:'r',kind:'region',bounds:[0,0,8,8]}],params:{minimum:1,selectionPresent:true}});assert.equal(calls[5].params.refilterOf,undefined);
 }finally{await client.dispose();globalThis.fetch=fetchBefore;}
});
test('Actual panel chooses overlay, switches views without inference and preserves view/settings',async()=>{
 const {document,window}=parseHTML('<div id="analysis-controls"></div><div id="viewport"></div>');globalThis.document=document;
 window.HTMLInputElement.prototype.reportValidity=()=>true;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 globalThis.Option=function(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o;};
 const shown=[],settings=[],interactive=[];const ui=createToolWorkspace({document,language:()=> 'fr',getClient:async()=>({}),run(){},cancel(){},showSurface:d=>shown.push(d),download(){},notify(){},onSettings:v=>settings.push(v),onInteractive:v=>interactive.push(v)});
 ui.select('ai.clones.d2prl');assert.equal(document.getElementById('tool-neural-method').options.length,17);assert.equal(ui.params().minimum,500);
 await ui.render(result());assert.equal(shown.at(-1).cloneView,'overlay');const layers=document.getElementById('tool-layer');layers.value='2';layers.onchange();assert.equal(shown.at(-1).cloneView,'mask');assert.deepEqual(settings.at(-1),{presentationOnly:true});
 await ui.render(result());assert.equal(shown.at(-1).cloneView,'mask');assert.equal(ui.serialize().uiOptions.neuralView,'mask');
 const min=document.getElementById('tool-param-minimum');min.value='750';min.onchange();assert.equal(ui.params().minimum,750);assert.equal(interactive.at(-1).phase,'commit');assert.equal(interactive.at(-1).operation,'ai.clones.d2prl');assert.equal(interactive.at(-1).params.minimum,750);
 const method=document.getElementById('tool-neural-method');method.value='forgeryscope-auto';method.onchange();assert.equal(ui.operation(),'m2.forgeryscope');assert.deepEqual(ui.params(),{profile:'auto'});assert.deepEqual(ui.taskRegions([]),[]);assert.equal(min.parentElement.hidden,true);
 for(const key of ['mgcfdn-st','cmseg-generalization','selfdm-map','selfdm-proposal']){const option=[...method.options].find(o=>o.value===key);assert.equal(option.dataset.newFeature,'yellow');assert.match(option.textContent,/202[256]/);}
 const backend=document.getElementById('tool-backend'),gpu=[...backend.options].find(option=>option.value==='webgpu');backend.value='webgpu';backend.onchange();
 method.value='selfdm-proposal';method.onchange();assert.equal(gpu.disabled,false);assert.equal(ui.backend(),'webgpu');assert.deepEqual(ui.params(),{variant:'selfdm-proposal',selectionPresent:false});
 method.value='mgcfdn';method.onchange();assert.equal(gpu.disabled,false);
});
test('Forgeryscope tools use the real M2 API, sampled masks, original overlay and result release',async()=>{
 const fetchBefore=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});const calls=[];
 const fields={map:{type:'Float32Array'},mask:{type:'Uint8Array'},candidates:{type:'Uint8Array'},branch_microscopy:{type:'Uint8Array'}};
 const m2={ready:{windowBytes:4*1024**2},async analyzeBlob(method,blob,params){calls.push(['analyze',method,params]);return {id:1,width:4,height:1,fields};},metadata:async()=>({metadata:{status:'ok'}}),async readArray(id,field,at,count){return Float32Array.from([0,1,0,0].slice(at,at+count));},async release(id){calls.push(['release',id]);},dispose:async()=>{}};
 const engine={loadBlob:async()=>({id:'source',surface:plane('original','rgb8')}),capabilities:async()=>({memory:{budgetBytes:1024**3,retainedBytes:0,cacheBytes:0,knownHeapCapacityBytes:0}}),readDisplay:async()=>({pixels:{width:4,height:1,format:'rgb8',data:new Uint8Array(12).fill(40)}}),dispose:async()=>{}};
 const client=await createToolClient({engineFactory:()=>engine,m2Factory:async config=>{assert.equal(config.method,'forgeryscope');return m2;}});
 try{
  const blob=new Blob(['fixture']);await client.load({id:'source',blob});
  const output=await client.run({operation:'m2.forgeryscope',params:{profile:'auto'}},{file:blob});
  const displays=neuralDisplays(output);assert.deepEqual(displays.map(x=>x.display.cloneView),['overlay','map','mask','candidates','branch_microscopy']);
  const pixels=await client.readTile(displays[0].display,{x:0,y:0,w:4,h:1,step:1});assert.deepEqual([...pixels.data.slice(0,3)],[40,40,40]);assert.notDeepEqual([...pixels.data.slice(3,6)],[40,40,40]);
  assert.deepEqual(await client.readWindow(displays[0].display,{x:0,y:0,width:4,height:1}),pixels);
  await client.release();assert.deepEqual(calls,[['analyze','forgeryscope',{profile:'auto'}],['release',1]]);
 }finally{await client.dispose();globalThis.fetch=fetchBefore;}
});
test('Forgeryscope branch highlights are visible and do not require a D2PRL mask',()=>{
 const base=new Uint8Array(6).fill(20),out=composeCloneFrame({width:2,height:1,base,values:Uint8Array.of(0,1),view:'branch_microscopy',masked:true}).data;
 assert.deepEqual([...out.slice(0,3)],[20,20,20]);assert.notDeepEqual([...out.slice(3)],[20,20,20]);
});
