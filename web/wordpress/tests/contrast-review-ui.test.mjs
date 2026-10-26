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
 const previous=new Map(),frames=new Map();let nextFrame=0,language='fr',runs=0,exports=0,time=0,serial=0;const timers=new Map(),events=[];
 for(const [key,value]of Object.entries({document,Option:function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;},requestAnimationFrame:callback=>{const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id)})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const shown=[],settings=[],prepared=[],client={prepareDisplayPreview:async display=>prepared.push(display),export:async()=>new Blob(['native'])};document.getElementById('export-png').onclick=()=>{exports++;};
 const ui=createToolWorkspace({document,interactiveControlOptions:{now:()=>time,delay:(fn,ms)=>{timers.set(++serial,{fn,at:time+ms});return serial;},cancelDelay:id=>timers.delete(id)},onInteractive:event=>events.push(event),language:()=>language,getClient:async()=>client,run(){runs++;},cancel(){},showSurface:display=>shown.push(display),download(){},notify:message=>{throw Error(message);},onSettings:event=>settings.push(event)});
 return{document,window,ui,events,advance(ms){const until=time+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=until;},emit(target,type,properties={}){target.dispatchEvent(Object.assign(new window.Event(type,{bubbles:true}),properties));},shown,settings,prepared,frames,get runs(){return runs;},get exports(){return exports;},set language(value){language=value;},flush(){for(const [id,callback]of [...frames]){frames.delete(id);callback();}},dispose(){for(const [key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
}


const input=(e,key)=>e.document.getElementById('tool-param-'+key);
test('Contrast select changes are discrete exact commits even when held beyond120ms',()=>{const e=environment();try{e.ui.select('tampering.contrast');for(const [field,value]of [['block',32],['mode',0],['block',256],['mode',1],['mode',2]]){const target=input(e,field);e.emit(target,'pointerdown',{pointerId:1,button:0});target.value=JSON.stringify(value);e.emit(target,'input');e.advance(200);e.flush();assert.equal(e.events.filter(x=>x.phase==='preview').length,0,'enum selection must never become a sampled draft');e.emit(target,'change');e.emit(e.document,'pointerup',{pointerId:1});assert.equal(e.events.at(-1).phase,'commit');assert.equal(e.events.at(-1).params[field],value);assert.equal(e.events.at(-1).continuous,false)}assert.equal(e.runs,0)}finally{e.ui.dispose();e.dispose()}});
test('Contrast block and indicator persistence, native defaults, lock/unlock state',()=>{const e=environment();try{e.ui.select('tampering.contrast');assert.deepEqual(e.ui.params(),{block:64,mode:2});const saved=e.ui.serialize();saved['tampering.contrast']={block:256,mode:0};e.ui.restore(saved);assert.deepEqual(e.ui.params(),{block:256,mode:0});assert.equal(input(e,'block').value,'256');assert.equal(input(e,'mode').value,'0');e.ui.lock(true,true);assert.equal(input(e,'block').disabled,true);assert.equal(input(e,'mode').disabled,true);e.ui.lock(false,true);assert.equal(input(e,'block').disabled,false);assert.equal(input(e,'mode').disabled,false);assert.equal(e.events.filter(x=>x.phase==='preview').length,0)}finally{e.ui.dispose();e.dispose()}});
