import test from 'node:test';
import assert from 'node:assert/strict';
const assets=new URL('../sherloq-browser/assets/',import.meta.url);
const {SPLICEBUSTER_OPERATION:id,splicebusterViews,createSplicebusterSummary}=await import(new URL('splicebuster-ui.js',assets));
const {toolGroups}=await import(new URL('tool-tree.js',assets));
const {toolCatalog}=await import(new URL('tool-catalog.js',assets));
const {resultDisplays}=await import(new URL('tool-displays.js',assets));
const {m2ToolConfiguration}=await import(new URL('tool-models.js',assets));
const {createToolClient}=await import(new URL('tool-client.js',assets));
const {createToolWorkspace}=await import(new URL('tool-workspace.js',assets));
const {parseHTML}=await import('linkedom');

function output({abstained=false}={}){
 const foreign={id:'source-other-owner',revision:1,width:10000,height:10000,format:'rgb8'};
 return {operation:id,m2Result:{id:7},data:{mapShape:abstained?[0,0]:[4,5],source:{dimensions:foreign},metadata:{abstained,validCells:17,totalCells:20,minimum:3.5,maximum:24}},views:splicebusterViews({metadata:{abstained}}).map(view=>({...foreign,id:'m2-7-'+view,m2Result:7,view}))};
}
test('the catalogue places Splicebuster immediately after Noisesniffer and preserves native defaults',()=>{
 const group=toolGroups.find(group=>group.en==='Noise'),at=group.items.findIndex(item=>item.id===id);
 assert.equal(group.items[at-1].id,'noise.noisesniffer');assert.equal(group.items[at].fr,'Splicebuster');assert.equal(group.items[at].en,'Splicebuster');
 assert.deepEqual(toolCatalog[id].params,{});assert.deepEqual(toolCatalog[id].exports,['json','npz']);
});
test('Splicebuster initializes its own M2 method without requesting neural models',async()=>{
 const fetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected dependency fetch');};
 try{assert.deepEqual(await m2ToolConfiguration('splicebuster'),{});}
 finally{globalThis.fetch=fetch;}
});
test('published score and validity views stay separate and never select foreign source metadata',()=>{
 const value=output(),fr=resultDisplays(value),en=resultDisplays(value,{language:'en'});
 assert.deepEqual(fr.map(view=>view.display.view),['map','valid']);assert.deepEqual(fr.map(view=>view.label),['Anomalies · score brut','Validité des cellules']);assert.deepEqual(en.map(view=>view.label),['Anomalies · raw score','Cell validity']);
 assert.equal(fr.some(view=>view.display.id==='source-other-owner'),false);
 const trufor={...value,operation:'m2.trufor'};assert.equal(resultDisplays(trufor)[0].label,'Carte des anomalies');
 assert.deepEqual(resultDisplays(output({abstained:true})),[]);
});
test('Blob source, backend, bounded display and streamed NPZ use the M2 provider',async()=>{
 const previousFetch=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});
 const calls=[],file=new Blob(['encoded image transport']),descriptor={id:7,width:10000,height:10000,fields:{map:{type:'Float64Array'},valid:{type:'Uint8Array'}}};
 const source={id:'source',sha256:'a'.repeat(64),surface:{id:'original',revision:1,width:10000,height:10000,format:'rgb8'}},memory={budgetBytes:512*1024**2,retainedBytes:0,cacheBytes:0,knownHeapCapacityBytes:0};
 const scientific={range0:Float64Array.of(10,18,26,34),range1:Float64Array.of(10,18,26,34,42),map:Float64Array.from({length:20},(_,i)=>.123456789123+i*.01),valid:new Uint8Array(20).fill(1)};scientific.valid[6]=0;
 const engine={loadBlob:async input=>(assert.equal(input.blob,file),assert.equal(input.layout,'segmented'),source),capabilities:async()=>({memory}),unload:async()=>{},dispose:async()=>calls.push('engine-dispose')};
 const m2={ready:{windowBytes:4},analyzeBlob:async(method,input,params,hooks)=>(calls.push('analyze'),assert.equal(method,'splicebuster'),assert.equal(input,file),assert.deepEqual(params,{}),assert.equal(hooks.backend,'webgpu'),descriptor),metadata:async()=>output().data,
  readDisplay:async(result,view,tile)=>(calls.push('display:'+view),assert.equal(result,7),assert.deepEqual(tile,{x:9998,y:9998,w:2,h:2,step:1}),{pixels:{width:2,height:2,format:'rgb8',data:new Uint8Array(12)}}),
  readArray:async(result,field,offset,count)=>(assert.equal(result,7),calls.push('scalar:'+field+':'+offset+':'+count),scientific[field].subarray(offset,offset+count)),
  beginExport:async result=>(assert.equal(result,7),{id:11,bytes:5}),readExport:async(id,offset,count)=>(assert.equal(id,11),assert.ok(count<=4),calls.push('read:'+offset+':'+count),new Uint8Array(count).fill(7)),releaseExport:async id=>calls.push('export-release:'+id),release:async id=>calls.push('release:'+id),dispose:async()=>calls.push('m2-dispose')};
 let client;
 try{
  client=await createToolClient({engineFactory:()=>engine,m2Factory:async config=>(assert.equal(config.method,'splicebuster'),assert.deepEqual(config.configuration,{}),m2)});
  await client.load({id:'source',blob:file});const result=await client.run({id:'test',operation:id,params:{},backend:'webgpu'},{file});
  assert.deepEqual(result.views.map(view=>view.view),['map','valid']);assert.equal(result.views[0].width,10000);
  await client.readTile(result.views[1],{x:9998,y:9998,w:2,h:2,step:1});
  const raw=await client.readScalar(result.views[0],{x:16,y:16,width:2,height:2});assert.ok(raw instanceof Float64Array);assert.equal(raw[0],scientific.map[6]);assert.notEqual(raw[0],Math.fround(raw[0]));
  const valid=await client.readScalar(result.views[1],{x:16,y:16,width:2,height:2});assert.ok(valid instanceof Uint8Array);assert.deepEqual([...valid],[0,0,0,0]);assert.ok(calls.includes('scalar:map:6:1'));
  await assert.rejects(client.readScalar({...result.views[0],m2Result:99},{x:16,y:16,width:2,height:2}),{code:'INVALID_INPUT'});
  const archive=await client.export('npz');assert.equal(archive.blob.size,5);await archive.cleanup();assert.deepEqual(calls.filter(x=>x.startsWith('read:')),['read:0:4','read:4:1']);assert.ok(calls.includes('export-release:11'));await client.release();assert.ok(calls.includes('release:7'));
 }finally{await client?.dispose();globalThis.fetch=previousFetch;}
});
test('the compact panel keeps CPU/GPU, validity and exports without a help paragraph through translation',async()=>{
 const previous={document:globalThis.document,window:globalThis.window,Option:globalThis.Option,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div><button id="export-png"></button></body></html>');
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:600,left:0,top:0});window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.checkValidity=()=>true;
 Object.defineProperty(globalThis,'window',{value:window,configurable:true,writable:true});Object.defineProperty(globalThis,'requestAnimationFrame',{value:fn=>setTimeout(fn,0),configurable:true,writable:true});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:clearTimeout,configurable:true,writable:true});
 Object.defineProperty(globalThis,'document',{value:document,configurable:true,writable:true});Object.defineProperty(globalThis,'Option',{value:class{constructor(label,value){const option=document.createElement('option');option.textContent=label;option.value=value;return option;}},configurable:true,writable:true});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 let language='fr';const shown=[];
 try{
  const panel=createToolWorkspace({document,language:()=>language,getClient:async()=>{throw Error('No worker in DOM test');},run(){},cancel(){},showSurface:view=>shown.push(view),download(){},notify(){}});
  panel.select(id);assert.deepEqual(panel.params([{x0:0,y0:0,x1:100,y1:100}]),{});assert.equal(panel.operation(),id);
  const backend=document.getElementById('tool-backend');assert.deepEqual([...backend.options].map(option=>option.value),['auto','cpu','webgpu']);backend.value='webgpu';backend.dispatchEvent(new window.Event('input',{bubbles:true}));backend.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(panel.backend(),'webgpu');
  assert.equal(document.querySelector('[data-splicebuster-help]'),null);
  await panel.render(output());const layers=document.getElementById('tool-layer');layers.value='1';layers.onchange();assert.equal(shown.at(-1).view,'valid');assert.match(document.querySelector('[data-splicebuster-summary]').textContent,/3\.5/);
  assert.equal(document.querySelectorAll('.tool-exports [data-export-format="npz"]').length,1);
  language='en';panel.translate();assert.equal(layers.value,'1');assert.equal(layers.options[1].textContent,'Cell validity');assert.equal(document.querySelector('[data-splicebuster-help]'),null);assert.equal(panel.backend(),'webgpu');
  const serialized=panel.serialize();panel.restore(serialized);assert.equal(panel.backend(),'webgpu');assert.deepEqual(panel.params(),{});
 }finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
});
test('an abstention explains the lack of a map without a fabricated score',()=>{
 const {document}=parseHTML('<html><body></body></html>'),summary=createSplicebusterSummary(document,{data:{metadata:{abstained:true}}},'fr');
 assert.match(summary.textContent,/Aucune cellule exploitable/);assert.equal(summary.querySelectorAll('table').length,0);assert.equal(summary.textContent.includes('%'),false);
});
test('a failed Splicebuster worker cleanup keeps its handle until retry succeeds before a new calculation',async()=>{
 const previousFetch=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});
 const file=new Blob(['encoded source']),source={id:'source',sha256:'a'.repeat(64),surface:{id:'original',revision:1,width:20,height:14,format:'rgb8'}},memory={budgetBytes:512*1024**2,retainedBytes:0,cacheBytes:0,knownHeapCapacityBytes:0};
 const events=[],primary=Object.assign(Error('worker refused'),{code:'WORKER_FAILED'}),cleanup=Object.assign(Error('storage close refused'),{code:'STORAGE_CLOSE'});let attempts=0,factories=0,client;
 const engine={loadBlob:async()=>source,capabilities:async()=>({memory}),unload:async()=>{},dispose:async()=>events.push('engine-dispose')};
 const failed={analyzeBlob:async()=>{events.push('old-analysis');throw primary;},dispose:async()=>{events.push('old-dispose-'+(++attempts));if(attempts===1)throw cleanup;}};
 const healthy={analyzeBlob:async()=>{events.push('new-analysis');return{id:8,width:20,height:14};},metadata:async()=>({mapShape:[2,3],metadata:{abstained:false}}),release:async()=>{},dispose:async()=>events.push('new-dispose')};
 try{
  client=await createToolClient({engineFactory:()=>engine,m2Factory:async()=>{factories++;events.push('factory-'+factories);return factories===1?failed:healthy;}});await client.load({id:'source',blob:file});
  await assert.rejects(client.run({id:'first',operation:id,params:{},backend:'cpu'},{file}),e=>e===primary);assert.equal(primary.cleanupError,cleanup);assert.equal(factories,1);assert.equal(attempts,1);
  const result=await client.run({id:'second',operation:id,params:{},backend:'cpu'},{file});assert.equal(result.m2Result.id,8);assert.equal(attempts,2);assert.equal(factories,2);assert.deepEqual(events.slice(0,6),['factory-1','old-analysis','old-dispose-1','old-dispose-2','factory-2','new-analysis']);
 }finally{await client?.dispose();globalThis.fetch=previousFetch;}
});
