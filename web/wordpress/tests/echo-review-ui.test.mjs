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
test('Echo numeric brief clicks and grayscale checkbox are exact discrete commits without drafts',()=>{const e=environment();try{e.ui.select('detail.echo');const radius=input(e,'radius'),contrast=input(e,'contrast'),gray=input(e,'grayscale');assert.equal(radius.value,'2');assert.equal(contrast.value,'85');assert.equal(gray.checked,false);for(let value=3;value<=10;value++){e.emit(radius,'pointerdown',{pointerId:value,button:0});radius.value=String(value);e.emit(radius,'input');e.flush();e.emit(e.document,'pointerup',{pointerId:value});assert.equal(e.events.at(-1).phase,'commit');assert.equal(e.events.at(-1).params.radius,value);assert.equal(e.events.at(-1).continuous,false);e.advance(150);e.flush();}assert.equal(e.events.filter(x=>x.phase==='preview').length,0);gray.checked=true;e.emit(gray,'change');assert.equal(e.events.at(-1).phase,'commit');assert.equal(e.events.at(-1).params.grayscale,true);assert.equal(e.events.at(-1).continuous,false);assert.equal(e.runs,0);}finally{e.ui.dispose();e.dispose();}});
test('Echo held contrast previews after120ms and release uses the latest value without stale frames',()=>{const e=environment();try{e.ui.select('detail.echo');const contrast=input(e,'contrast');e.emit(contrast,'pointerdown',{pointerId:1,button:0});contrast.value='50';e.emit(contrast,'input');e.advance(119);e.flush();assert.equal(e.events.filter(x=>x.phase==='preview').length,0);e.advance(1);e.flush();assert.equal(e.events.at(-1).phase,'preview');assert.equal(e.events.at(-1).params.contrast,50);contrast.value='49';e.emit(contrast,'input');e.emit(e.document,'pointerup',{pointerId:1});assert.equal(e.events.at(-1).phase,'commit');assert.equal(e.events.at(-1).params.contrast,49);assert.equal(e.events.at(-1).usedPreview,true);const length=e.events.length;e.flush();e.advance(200);e.flush();assert.equal(e.events.length,length);}finally{e.ui.dispose();e.dispose();}});
test('Echo save/restore retains radius15 contrast0 grayscale and locked controls',()=>{const e=environment();try{e.ui.select('detail.echo');const state=e.ui.serialize();state['detail.echo']={radius:15,contrast:0,grayscale:true};e.ui.restore(state);assert.deepEqual(e.ui.params(),{radius:15,contrast:0,grayscale:true});assert.equal(input(e,'radius').value,'15');assert.equal(input(e,'contrast').value,'0');assert.equal(input(e,'grayscale').checked,true);e.ui.lock(true,true);assert.equal(input(e,'radius').disabled,true);assert.equal(input(e,'contrast').disabled,true);e.ui.lock(false,true);assert.equal(input(e,'radius').disabled,false);assert.equal(input(e,'contrast').disabled,false);assert.equal(e.runs,0);}finally{e.ui.dispose();e.dispose();}});
