// Real HTML + handlers in a DOM implementation, without browser/image/inference.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountAnalysisPanel} from '../sherloq-browser/assets/app.js';
const html=await readFile(new URL('../sherloq-browser/assets/panel.html',import.meta.url),'utf8');
function environment(){
 const {document,window}=parseHTML('<html><body></body></html>');
 for(const [key,value] of Object.entries({document,window,location:{href:'http://localhost/app.html',hash:''},localStorage:{getItem:()=>null,setItem(){}},navigator:{hardwareConcurrency:8},isSecureContext:true,devicePixelRatio:1,innerWidth:1280,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,ResizeObserver:class{observe(){}disconnect(){}},Worker:class{},Option:class{constructor(label,value){const option=document.createElement('option');option.textContent=label;option.value=value;return option;}}}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 // LinkeDOM lacks the browser's select.value setter; model that DOM property.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 // LinkeDOM supplies parsing/events/Shadow DOM; dimensions and canvas are transports.
 Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{get:()=>800,configurable:true});Object.defineProperty(window.HTMLElement.prototype,'clientHeight',{get:()=>600,configurable:true});
 window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
 const controls=[];
 function mount(toolId,sourceOnly=false){
  const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'}),parsed=parseHTML(html).document;for(const child of [...parsed.body.children])if(child.tagName!=='SCRIPT')root.append(document.importNode(child,true));
  const scoped={getElementById:id=>root.getElementById(id),querySelectorAll:s=>root.querySelectorAll(s),createElement:t=>document.createElement(t),documentElement:host,addEventListener:(...args)=>root.addEventListener(...args)};
  const controller=mountAnalysisPanel(scoped,{managed:true,toolId,sourceOnly,language:'fr',theme:'dark',visible:()=>true,changed(){}});controls.push(controller);return {controller,root,host};
 }
 return {mount,async dispose(){await Promise.all(controls.map(c=>c.dispose()));}};
}
test('Independent tool panels mount with all details closed; translation preserves controls and openness',async()=>{
 const env=environment();try{
  const a=env.mount('inspection.histogram'),b=env.mount('analysis.complete');
  assert.equal([...a.root.querySelectorAll('details')].some(x=>x.open),false);assert.equal([...b.root.querySelectorAll('details')].some(x=>x.open),false);
  const details=b.root.querySelector('.automatic-progress');details.open=true;b.root.getElementById('automatic-opacity').value='43';
  b.controller.setLanguage('en');assert.equal(details.open,true);assert.equal(b.root.getElementById('automatic-opacity').value,'43');
  a.root.getElementById('tool-param-channel').value='1';a.root.getElementById('tool-param-channel').onchange();a.controller.setLanguage('en');assert.equal(a.root.getElementById('tool-param-channel').value,'1');assert.notEqual(a.root.getElementById('viewport'),b.root.getElementById('viewport'));
 }finally{await env.dispose();}
});
test('Adopted original pixels remain owned by their document when another tab closes',async()=>{
 const env=environment();let releases=0;try{
  const a=env.mount('inspection.adjust'),b=env.mount('file.hex');const source={width:640,height:480,draw(){},close(){releases++;}},file=new Blob(['transport only']);
  const input={source,file,imageId:'one-source',hash:'fingerprint',description:'test'};a.controller.adopt(input);b.controller.adopt(input);
  a.controller.setLanguage('en');await a.controller.dispose();assert.equal(releases,0);assert.equal(b.controller.input().file,file);assert.equal(b.controller.input().imageId,'one-source');
 }finally{await env.dispose();}
});
