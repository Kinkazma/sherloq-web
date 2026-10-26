import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {parseHTML}=await import(process.env.SHERLOQ_LINKEDOM??'linkedom');
const modules=new Map();
const uiAssetURL=file=>new URL(import.meta.resolve('../sherloq-browser/assets/'+file));
async function readUIAsset(file){return readFile(uiAssetURL(file),'utf8');}
async function uiModule(file){
 if(modules.has(file))return modules.get(file);
 const promise=(async()=>{
  const url=uiAssetURL(file);
  let text=await readFile(url,'utf8');
  const imports=[...text.matchAll(/(from\s*|import\s*)(['"])(\.\.?\/[^'"]+)\2/g)];
  for(const match of imports){const relative=new URL(match[3],url),name=relative.pathname.split('/').at(-1),local=['tool-workspace.js','tool-catalog.js','tool-tree.js'].includes(name)&&relative.pathname.endsWith('/'+name);const target=local?await uiModule(name):relative.href;text=text.replace(match[0],match[1]+JSON.stringify(target));}
  return 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
 })();modules.set(file,promise);return promise;
}
const {toolGroups}=await import(await uiModule('tool-tree.js')),{toolCatalog}=await import(await uiModule('tool-catalog.js')),{createToolWorkspace}=await import(await uiModule('tool-workspace.js'));
function environment(){
 const {document,window}=parseHTML('<html><body><div id="analysis-controls"></div><div id="viewport"></div><button id="export-png"></button></body></html>');
 const previous=new Map(),frames=new Map();let nextFrame=0,language='fr',runs=0,exports=0;
 for(const [key,value]of Object.entries({document,Option:function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;},requestAnimationFrame:callback=>{const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id)})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const shown=[],settings=[],prepared=[],client={prepareDisplayPreview:async display=>prepared.push(display),export:async()=>new Blob(['native'])};document.getElementById('export-png').onclick=()=>{exports++;};
 const ui=createToolWorkspace({document,language:()=>language,getClient:async()=>client,run(){runs++;},cancel(){},showSurface:display=>shown.push(display),download(){},notify:message=>{throw Error(message);},onSettings:event=>settings.push(event)});
 return{document,ui,shown,settings,prepared,frames,get runs(){return runs;},get exports(){return exports;},set language(value){language=value;},flush(){for(const [id,callback]of [...frames]){frames.delete(id);callback();}},dispose(){for(const [key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
}

const frame=(id,width=17,height=13)=>({id,revision:1,width,height,format:'rgb8'});
function output(tag='a'){const surface=frame(tag+'-fourier0',16,16),rgbSurfaces={probability0:frame(tag+'-probability0'),fourier1:frame(tag+'-fourier1',24,24)};return{operation:'tampering.resampling',status:'ok',surface,rgbSurfaces,layers:[{id:'tampering.resampling',surfaceId:surface.id},...Object.entries(rgbSurfaces).map(([id,v])=>({id,surfaceId:v.id}))],data:{fourier:[{id:'fourier0',geometry:{outputSide:16}},{id:'fourier1',geometry:{outputSide:24}}]}};}
test('resampling displayed Fourier layer is transported to retained drafts and survives native replacement',async()=>{const e=environment();try{e.ui.select('tampering.resampling');await e.ui.render(output());const select=e.document.getElementById('tool-layer');select.value='2';select.onchange();assert.deepEqual(e.ui.view(),{id:'fourier1'});e.ui.invalidateResult({preserve:true});await e.ui.render(output('b'));assert.equal(e.shown.at(-1).id,'b-fourier1');assert.deepEqual(e.ui.view(),{id:'fourier1'});assert.equal(e.runs,0);}finally{e.ui.dispose();e.dispose();}});
test('resampling probability map selection is identified separately from Fourier and persists',async()=>{const e=environment();try{e.ui.select('tampering.resampling');await e.ui.render(output());const select=e.document.getElementById('tool-layer');select.value='1';select.onchange();assert.deepEqual(e.ui.view(),{id:'probability0'});const original=e.ui.params(),saved=e.ui.serialize();assert.equal(saved.uiOptions.resamplingView,'probability0');e.ui.restore(saved);await e.ui.render(output('restored'));assert.equal(e.shown.at(-1).id,'restored-probability0');assert.deepEqual(e.ui.params(),original);assert.equal(e.runs,0);}finally{e.ui.dispose();e.dispose();}});
