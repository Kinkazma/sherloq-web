import test from 'node:test';
import vm from 'node:vm';
import {parseHTML,DOMParser} from 'linkedom';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';
import {toolGroups} from '../sherloq-browser/assets/tool-tree.js';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {EXTENSION_TOOLS,extensionWeightBytes,extensionModelAssets,extensionSummary,extensionDisplays,extensionProgressText,extensionConfiguration} from '../sherloq-browser/assets/extension-tools.js';
import {generationReading} from '../sherloq-browser/assets/ai-generation-gauge.js';
import {toolCatalog} from '../sherloq-browser/assets/tool-catalog.js';
import {resultDisplays} from '../sherloq-browser/assets/tool-displays.js';
import {createToolClient,resultResources} from '../sherloq-browser/assets/tool-client.js';
import {createWorkspaceEnginePool} from '../sherloq-browser/assets/workspace-engine-pool.js';
const methods=EXTENSION_TOOLS.map(tool=>tool.method);
const map=(id,format='float32')=>({id,revision:1,width:3,height:2,format,range:[0,1]});
function envelope(task,method){const operation=EXTENSION_TOOLS.find(t=>t.method===method).id;return {id:task.id,imageId:task.imageId,operation,status:'ok',data:{method,...(['bfree','spai'].includes(method)?{scores:{global_logit:method==='bfree'?-1.23456:2.5}}:{})},...(!['bfree','spai'].includes(method)?{surface:map(task.id+'-'+method,method==='comprint'?'float64':'float32'),layers:[{id:method==='doctamper'?'foreground':method==='comprint'?'anomaly':'focus'}],...(method==='doctamper'?{maskSurfaces:{analyzed:map(task.id+'-valid','mask8')}}:{})}:{})};}
function fixture(){
 const calls=[],images=new Map(),surfaces=new Map();let configured=false,active=0,disposed=false;const assertIdle=()=>assert.equal(active,0,'one guarded public engine call at a time');
 const engine={async capabilities(){assertIdle();return {extensions:{configured},operations:[],memory:{budgetBytes:8*1024**3}};},async loadExtensionModels(configuration){assertIdle();calls.push(['configure',configuration]);configured=true;await new Promise(r=>setImmediate(r));return {weightsFetched:false};},
 async loadBlob(input){assertIdle();calls.push(['load',input.id]);const source={id:input.id,sha256:'a'.repeat(64),surface:{...map(input.id+'-source','rgb8')}};images.set(input.id,source);surfaces.set(source.surface.id,source.surface);return source;},
 async unload(id){assertIdle();calls.push(['unload',id]);surfaces.delete(images.get(id)?.surface.id);images.delete(id);},
 async run(task,hooks){return perform(task,hooks);},
 async reserveExternalMemory({bytes}){assertIdle();return{id:'lease',bytes};},async releaseExternalMemory(){assertIdle();},
 async releaseSurface(id){assertIdle();calls.push(['release',id]);surfaces.delete(id);},async releaseTable(){},async dispose(){assertIdle();calls.push(['dispose']);images.clear();surfaces.clear();disposed=true;},
 async readPlane({surfaceId}){assertIdle();assert(surfaces.has(surfaceId));return {plane:{data:new Float64Array([.125,NaN,1,0,.5,.75]),width:3,height:2}};},
 async readDisplay({surfaceId,tile}){assertIdle();assert(surfaces.has(surfaceId));calls.push(['display',surfaceId]);return {pixels:{width:tile.w,height:tile.h,format:'rgb8',data:new Uint8Array(tile.w*tile.h*3)}};}
 };
 async function perform(task,hooks){assertIdle();assert(configured);assert(images.has(task.imageId));active++;calls.push(['run',task.id]);try{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,3);hooks?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(Object.assign(Error('Cancelled'),{code:'CANCELLED'}));},{once:true});});const result=envelope(task,EXTENSION_TOOLS.find(t=>t.id===task.operation).method);for(const surface of resultResources(result).surfaces)surfaces.set(surface.id,surface);return result;}finally{active--;}}
 return {engine,calls,images,surfaces,get disposed(){return disposed;}};
}
async function setup(fn){const previous=globalThis.fetch;const requested=[];globalThis.fetch=async url=>{requested.push(String(url));assert(String(url).endsWith('/integrated-config.json'),'no model download during tool/client opening');return {ok:true,json:async()=>({assetBase:'./unified-assets/'})};};try{return await fn(requested);}finally{globalThis.fetch=previous;}}
const task=(id,operation)=>({id,operation,backend:'auto',params:{},regions:[]});

test('approved catalogue, temporary scientific storage and exact model sizes stay lazy',async()=>{
 assert.equal(extensionConfiguration().resultStorage,'temporary');
 const nativeManifest=JSON.parse(await fs.readFile((process.env.EXTENSION_MODEL_MANIFEST??new URL('../../extensions-source/models/manifest.json',import.meta.url)),'utf8'));for(const tool of EXTENSION_TOOLS)for(const[path,asset]of Object.entries(extensionModelAssets(tool.id))){assert.equal(asset.bytes,nativeManifest.assets[path].bytes);assert.equal(asset.sha256,nativeManifest.assets[path].sha256);}
 assert.equal(EXTENSION_TOOLS.length,4);assert.equal(new Set(methods).size,4);
 const placement={'ai.generation.bfree':'AI Solutions','ai.generation.spai':'AI Solutions','ai.text.doctamper':'Tampering','jpeg.comprint':'JPEG'};
 for(const tool of EXTENSION_TOOLS){assert(toolCatalog[tool.id]);assert.equal(tool.newFeature,'yellow');assert.equal(toolCatalog[tool.id].newFeature,'yellow');const groups=toolGroups.filter(group=>group.items.some(item=>item.id===tool.id));assert.equal(groups.length,1);assert.equal(groups[0].en,placement[tool.id]);}
 assert.equal(toolCatalog['analysis.extensions'],undefined);assert.equal(toolGroups.flatMap(group=>group.items).filter(tool=>tool.id==='analysis.extensions').length,0);
 assert.equal(extensionWeightBytes('ai.generation.bfree'),346253355);assert.equal(extensionWeightBytes('ai.generation.spai'),531022510);assert.equal(extensionWeightBytes('ai.text.doctamper'),268570166);assert.equal(extensionWeightBytes('jpeg.comprint'),2677173);assert.equal(EXTENSION_TOOLS.reduce((sum,tool)=>sum+extensionWeightBytes(tool.id),0),1148523204);
 for(const tool of EXTENSION_TOOLS)for(const asset of Object.values(extensionModelAssets(tool.id)))assert.match(asset.sha256,/^[a-f0-9]{64}$/);
 assert.equal(EXTENSION_TOOLS.some(t=>/FUSED|AIDE|MaskCLIP|OSTF|DAF/.test(t.id+t.fr)),false);
});
test('independent documents share original and configuration while display changes preserve siblings',()=>setup(async downloads=>{
 const native=fixture();let engines=0;const pool=createWorkspaceEnginePool(()=>{engines++;return native.engine;});const a=await createToolClient({engineFactory:pool}),b=await createToolClient({engineFactory:pool});
 assert.equal(downloads.length,2);assert.equal(native.calls.length,0);const blob=new Blob(['original']);await a.load({id:'same',blob});await b.load({id:'same',blob});assert.equal(native.calls.filter(c=>c[0]==='load').length,1);
 const [local,single]=await Promise.all([a.run(task('document','ai.text.doctamper')),b.run(task('single','ai.generation.spai'))]);assert.equal(engines,1);assert.equal(native.calls.filter(c=>c[0]==='configure').length,1);assert.equal(native.calls.filter(c=>c[0]==='run').length,2);assert.equal(local.operation,'ai.text.doctamper');assert.equal(single.data.scores.global_logit,2.5);
 const before=native.calls.filter(c=>c[0]==='run').length;const displays=resultDisplays(local);assert.equal(displays.length,2);for(const {display}of displays)await a.readTile(display,{x:0,y:0,w:2,h:1,step:1});assert.equal(native.calls.filter(c=>c[0]==='run').length,before);
 await b.dispose();assert.equal(native.images.size,1);assert.equal(native.disposed,false);for(const {display}of displays)assert(native.surfaces.has(display.id));await a.dispose();assert.equal(native.disposed,true);assert.equal(native.images.size,0);assert.equal(native.surfaces.size,0);
}));
test('one cancelled document does not cancel a queued sibling',()=>setup(async()=>{
 const native=fixture(),pool=createWorkspaceEnginePool(()=>native.engine),a=await createToolClient({engineFactory:pool}),b=await createToolClient({engineFactory:pool}),blob=new Blob(['original']);await a.load({id:'same',blob});await b.load({id:'same',blob});
 const run=a.run(task('cancelled','ai.text.doctamper'));await new Promise(r=>setTimeout(r,1));const next=b.run(task('survivor','ai.generation.bfree'));a.cancel();await assert.rejects(run,{code:'CANCELLED'});assert.equal((await next).status,'ok');await a.dispose();assert(native.images.has('same'));await b.dispose();assert.equal(native.surfaces.size,0);
}));
test('successful methods omit redundant notices and keep all native scientific surfaces',()=>{
 const outputs=methods.map(method=>envelope({id:'x',imageId:'i'},method));outputs[0].data.source=map('foreign-source');
 const rows=outputs.flatMap(output=>extensionSummary(output));assert.deepEqual(rows,[]);
 const displays=outputs.flatMap(output=>extensionDisplays(output));assert.equal(displays.length,5);assert(!displays.some(v=>v.display.id==='foreign-source'));assert.equal(displays.find(v=>v.display.comprintPresentation).display.comprintPresentation.score.format,'float64');assert.deepEqual(displays.filter(v=>v.display.dtdPresentation).map(v=>v.display.dtdPresentation.mode),['heat','overlay']);
 const error=extensionSummary({operation:'ai.generation.spai',status:'error',error:{code:'MEMORY_LIMIT',message:'Capacity unavailable'}});assert.match(error[0].text,/MEMORY_LIMIT/);
});
test('download progress names the graph and displays actual supplied byte counts only',()=>{
 const a=extensionProgressText({phase:'model-load',model:'models/spai/encoder.onnx'});assert.match(a,/Chargement du modèle/);assert.match(a,/encoder.onnx/);assert(!a.includes('octets'));
 const b=extensionProgressText({phase:'model-download',model:'models/spai/encoder.onnx',loadedBytes:1000,totalBytes:453096948});assert.match(b,/Téléchargement/);assert.match(b,/encoder.onnx/);assert.match(b,/octets/);
});
test('all four added tools schedule an automatic calculation on adoption and preserve manual clone workflows',async()=>{
 const app=await fs.readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8'),start=app.indexOf('function queueAnalysis()'),code=app.slice(start,app.indexOf('\nlet layouts',start));
 for(const operation of [...EXTENSION_TOOLS.map(t=>t.id),'ai.clones.d2prl']){
  let runs=0;const environment={autoRunTimer:null,fileInput:{},host:{changed(){}},$(){return {classList:{contains(){return false;}}};},localMagnifier:()=>false,busy:false,energyViewBusy:false,elaPreviewBusy:false,pendingMagnifier:false,activeAnalysis:operation,regionController:{active:()=>false},individualMode:()=>true,individualUI:{canRun:()=>true},regions:[],drawing:false,clearTimeout(){},setTimeout(fn,delay){assert.equal(delay,250);fn();return 1;},run(){runs++;},status(){},autoText:fr=>fr};
  vm.runInNewContext(code+';queueAnalysis();',environment);assert.equal(runs,operation==='ai.clones.d2prl'?0:1,operation);
 }
});


test('scoped DOM renderer without createTextNode keeps scores and native layers visible and keeps the standard image export',async()=>{
 const {document,window}=parseHTML('<html><body><div id="analysis-controls"></div><div id="viewport"></div><button id="export-png"></button></body></html>');
 const previous=globalThis.document,previousOption=globalThis.Option;globalThis.document=document;globalThis.Option=class{constructor(text,value){const node=document.createElement('option');node.textContent=text;node.value=value;return node;}};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 let language='fr';const shown=[],exported=[],client={async export(format,selected){exported.push({format,selected});return new Blob(['npz']);}};
 try{
  const scopedDocument={createElement:document.createElement.bind(document),getElementById:document.getElementById.bind(document)};assert.equal(scopedDocument.createTextNode,undefined);
  const ui=createToolWorkspace({document:scopedDocument,language:()=>language,getClient:async()=>client,run(){},cancel(){},showSurface:display=>shown.push(display),download:async()=>{},notify:message=>{throw Error(message);}});ui.select('ai.text.doctamper');
  const outputs=methods.map(method=>envelope({id:'x',imageId:'i'},method)),dtd=outputs.find(output=>output.operation==='ai.text.doctamper');await ui.render(dtd);ui.setOriginal(false);
  const warning=document.getElementById('tool-method-warning');assert.equal(warning.hidden,false);assert.match(warning.textContent,/⚠️ EXPÉRIMENTAL/);assert.match(warning.textContent,/ne constitue pas une preuve/);const trigger=warning.querySelector('span'),popup=document.getElementById('tool-dtd-evaluation');assert.equal(popup.parentElement.id,'viewport');assert.equal(popup.hidden,true);trigger.onmouseenter();assert.equal(popup.hidden,false);assert.equal(popup.querySelectorAll('table').length,2);assert.match(popup.textContent,/36,50/);assert.match(popup.textContent,/0,0308/);assert.match(popup.textContent,/77,1/);assert.match(popup.textContent,/84,9/);trigger.onmouseleave();popup.onmouseenter();await new Promise(resolve=>setTimeout(resolve,210));assert.equal(popup.hidden,false);popup.onmouseleave();await new Promise(resolve=>setTimeout(resolve,210));assert.equal(popup.hidden,true);trigger.onfocus();assert.equal(popup.hidden,false);trigger.onkeydown({key:'Escape'});assert.equal(popup.hidden,true);const summary=document.querySelector('.tool-result-summary');assert.equal(summary.hidden,true);assert.equal(document.querySelector('[data-extension-weights]'),null);assert.equal(document.querySelector('#tool-results').hidden,true);assert.equal(shown.length,1);
  const layers=document.getElementById('tool-layer');assert.equal(layers.options.length,2);layers.value='0';layers.onchange();assert.equal(shown.at(-1).dtdPresentation.mode,'heat');
  language='en';ui.translate();assert.match(warning.textContent,/EXPERIMENTAL/);assert.match(warning.textContent,/does not constitute proof/);assert.match(popup.textContent,/36.50/);assert.match(popup.textContent,/Original study/);assert.match([...layers.options].map(o=>o.textContent).join(' '),/Heatmap/);assert.equal(layers.value,'0');
  ui.select('jpeg.comprint');assert.equal(warning.hidden,true);await ui.render(outputs.find(output=>output.operation==='jpeg.comprint'));assert.equal(shown.at(-1).comprintPresentation.mode,'heat-overlay');const npz=[...document.querySelectorAll('.tool-exports button')].filter(b=>b.textContent.includes('NPZ scientifique'));assert.equal(npz.length,0);for(const output of outputs){ui.select(output.operation);await ui.render(output);assert.equal([...document.querySelectorAll('.tool-exports button')].filter(b=>/JSON|NPZ|Exporter cette couche|Export this layer/.test(b.textContent)).length,0,output.operation);}
  ui.select('ai.generation.bfree');await ui.render(outputs[0]);ui.setOriginal(false);assert.equal(document.querySelector('#tool-results').hidden,false);assert.equal(layers.hidden,true);assert.equal(summary.hidden,true);assert.match(document.querySelector('.generation-gauge').textContent,/EXPERIMENTAL/);assert.match(document.querySelector('.generation-data').textContent,/-1.23456/);assert.equal(document.querySelectorAll('.generation-evaluation tbody tr').length,4);assert.match(document.querySelector('.generation-data').textContent,/global_logit/);assert.equal(document.querySelector('.generation-gauge svg').namespaceURI,'http://www.w3.org/2000/svg');language='fr';ui.translate();assert.match(document.querySelector('.generation-gauge').textContent,/EXPÉRIMENTAL/);assert.match(document.querySelector('.generation-gauge').textContent,/très peu fiable/);assert.match(document.querySelector('.generation-context').textContent,/ne dit pas si l’image représente la réalité/);assert.match(document.querySelector('.generation-context').textContent,/régénérée par IA/);assert.doesNotMatch(document.querySelector('.generation-evaluation').textContent,/vrais positifs|faux négatifs/);assert.match(document.querySelector('.generation-data').textContent,/-1.23456/);assert.equal(document.querySelectorAll('.generation-evaluation tbody tr').length,4);ui.select('ai.text.doctamper');await ui.render(dtd);assert.equal(document.querySelector('.generation-gauge'),null);assert(!document.querySelector('#tool-results').classList.contains('generation-results'));
  ui.invalidateResult();assert.equal(summary.hidden,true);
 }finally{globalThis.document=previous;globalThis.Option=previousOption;}
});


test('experimental opt-in persists independently of highlighting and hides all three commands and favorites',async()=>{
 const html=await fs.readFile(new URL('../sherloq-browser/assets/app.html',import.meta.url),'utf8'),panel=await fs.readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8'),{document,window}=parseHTML(html),controllers=new Map(),previous=new Map(),stored=new Map();
 for(const[key,value]of Object.entries({document,window,DOMParser,location:{hash:'#lang=fr',href:'http://localhost/app.html',origin:'http://localhost'},localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value)),removeItem:key=>stored.delete(key)},requestAnimationFrame:()=>1,confirm:()=>true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 let workspace;
 try{
  workspace=mountWorkspace(document,{fetcher:async()=>({ok:true,text:async()=>panel}),panelFactory(_,{toolId,sourceOnly}){let input;const controller={async load(file){input={file,imageId:'source',hash:'a'.repeat(64),source:{width:4,height:3,draw(){},close(){}}};},adopt(value){input=value;},input:()=>input,snapshot:()=>({busy:false,status:'ready',hasResult:false,hasReport:false}),activate(){},settings:()=>({}),setHighlight(value){controller.highlight=value;},setLanguage(){},setTheme(){},setComputeProfile(){},setNavigation(){},setLoupe(){},dispose(){},fit(){}};controllers.set(sourceOnly?'original':toolId,controller);return controller;}});
  const experimental=document.getElementById('experimental-tools');assert.equal(experimental.checked,false);assert.match(experimental.parentElement.textContent,/Activer les outils expérimentaux/);
  for(const tool of EXTENSION_TOOLS)assert.equal(!!document.querySelector(`button.tool-open[data-tool-id="${tool.id}"]`),!tool.experimental);
  await workspace.openImage(new Blob(['source']));for(const tool of EXTENSION_TOOLS.filter(t=>t.experimental)){await workspace.openTool(tool.id);assert(!workspace.state.documents.has(tool.id));assert(!controllers.has(tool.id));}
  experimental.checked=true;experimental.onchange();assert.equal(JSON.parse(stored.get('sherloq.workspace.preferences')).experimentalTools,true);
  for(const tool of EXTENSION_TOOLS){const button=document.querySelector(`button.tool-open[data-tool-id="${tool.id}"]`);assert(button);assert.equal(button.dataset.newFeature,'yellow');assert.equal(button.closest('details').querySelector('summary').textContent,toolGroups.find(group=>group.en===tool.group).fr);}
  assert.equal(document.querySelector('[data-tool-id="analysis.extensions"]'),null);await workspace.openImage(new Blob(['source']));await workspace.openTool(EXTENSION_TOOLS[0].id);
  const checkbox=document.getElementById('highlight-tools');assert(!document.getElementById('workspace-app').classList.contains('highlight-new-features'));checkbox.checked=true;checkbox.onchange();assert(document.getElementById('workspace-app').classList.contains('highlight-new-features'));
  for(const tool of EXTENSION_TOOLS){await workspace.openTool(tool.id);assert.equal(controllers.get(tool.id).highlight,true);}checkbox.checked=false;checkbox.onchange();assert(!document.getElementById('workspace-app').classList.contains('highlight-new-features'));for(const tool of EXTENSION_TOOLS)assert.equal(controllers.get(tool.id).highlight,false);
  workspace.state.toggleFavorite('ai.text.doctamper');workspace.savePreferences();experimental.checked=false;experimental.onchange();
  for(const tool of EXTENSION_TOOLS.filter(t=>t.experimental)){assert.equal(document.querySelector(`[data-tool-id="${tool.id}"]`),null);assert(!workspace.state.documents.has(tool.id));}assert(workspace.state.documents.has('jpeg.comprint'));assert(workspace.state.favorites.has('ai.text.doctamper'));assert.equal(JSON.parse(stored.get('sherloq.workspace.preferences')).experimentalTools,false);
  experimental.checked=true;experimental.onchange();assert.equal(document.querySelectorAll('[data-tool-id="ai.text.doctamper"]').length,2);document.getElementById('language-toggle').onclick();assert.match(experimental.parentElement.textContent,/Enable experimental tools/);
  const recovered=(await import('../sherloq-browser/assets/preferences-recovery.js')).recoverWorkspacePreferences(JSON.parse(stored.get('sherloq.workspace.preferences')));assert.equal(recovered.value.experimentalTools,true);assert(!recovered.issues.some(x=>x.path==='experimentalTools'));

 }finally{await workspace?.closeAll();for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});


test('generation gauges use existing uncalibrated scores and preserve experimental meaning at the threshold',()=>{
 const output={operation:'ai.generation.bfree',status:'ok',data:{scores:{global_logit:-1.1729932487010957,sigmoid_score_uncalibrated:0.23631436672569703,default_logit_threshold:0}}};
 const before=structuredClone(output),reading=generationReading(output,'fr');assert.equal(reading.direction,'real');assert.equal(reading.score,'23,6');assert.match(reading.warning,/très peu fiable/);assert.match(reading.warning,/modèle d’origine/);assert.deepEqual(output,before);
 const spai=generationReading({operation:'ai.generation.spai',status:'ok',data:{scores:{global_logit:2.1011998653411865,sigmoid_score_uncalibrated:0.8910197446750121}}},'en');assert.equal(spai.direction,'ai');assert.equal(spai.score,'89.1');assert.equal(spai.experimental,'EXPERIMENTAL');assert.deepEqual(reading.corpus.map(m=>m.value),[52.72,47.28,27.81,72.19,65.65,62.42]);assert.deepEqual(spai.corpus.map(m=>m.value),[41.48,58.52,24.66,75.34,62.90,58.34]);assert.equal(reading.corpus[0].formatted,'52,72 %');assert.equal(spai.corpus[0].formatted,'41.48 %');
 for(const[value,direction]of [[0,'real'],[.5,'threshold'],[1,'ai'],[NaN,'unavailable'],[Infinity,'unavailable'],[-.1,'unavailable'],[1.1,'unavailable']])assert.equal(generationReading({...output,data:{scores:{sigmoid_score_uncalibrated:value}}}).direction,direction);
 assert.equal(generationReading({...output,status:'error'}),null);assert.equal(generationReading({...output,operation:'jpeg.comprint'}),null);
 for(const id of ['ai.generation.bfree','ai.generation.spai']){assert.match(toolCatalog[id].fr,/Détecteur d’IA/);assert.match(toolCatalog[id].en,/AI detector/);}
});
