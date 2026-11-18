// Real HTML + handlers in a DOM implementation, without browser/image/inference.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createOpeningRegionDraft} from '../sherloq-browser/assets/opening-region-draft.js';
import {mountAnalysisPanel} from '../sherloq-browser/assets/app.js';
const html=await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/panel.html')),'utf8');
function environment(){
 const {document,window}=parseHTML('<html><body></body></html>');
 for(const [key,value] of Object.entries({document,window,location:{href:'http://localhost/app.html',hash:''},localStorage:{getItem:()=>null,setItem(){}},navigator:{hardwareConcurrency:8},isSecureContext:true,devicePixelRatio:1,innerWidth:1280,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,ResizeObserver:class{observe(){}disconnect(){}},Worker:class{},Option:class{constructor(label,value){const option=document.createElement('option');option.textContent=label;option.value=value;return option;}}}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 // LinkeDOM lacks the browser's select.value setter; model that DOM property.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 // LinkeDOM lacks constraint validation. Model the native numeric constraints
 // read by the real controller; do not unconditionally accept invalid values.
 window.HTMLInputElement.prototype.checkValidity=function(){
  if(this.disabled||this.readOnly)return true;
  const raw=this.value??'';if(raw==='')return !this.required;
  if(!['number','range'].includes(this.type))return true;
  const value=Number(raw);if(!Number.isFinite(value))return false;
  const low=this.getAttribute('min'),high=this.getAttribute('max');
  if(low!==null&&value<Number(low)||high!==null&&value>Number(high))return false;
  const step=this.getAttribute('step');if(step==='any')return true;
  const size=step===null?1:Number(step),origin=low!==null?Number(low):0;
  return !Number.isFinite(size)||size<=0||Math.abs((value-origin)/size-Math.round((value-origin)/size))<1e-7;
 };
 Object.defineProperty(window.HTMLInputElement.prototype,'validity',{configurable:true,get(){return{valid:this.checkValidity()};}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'selectedIndex',{configurable:true,get(){const index=[...this.options].findIndex(o=>o.hasAttribute('selected'));return index>=0?index:this.options.length?0:-1;}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'validity',{configurable:true,get(){return{valid:!this.required||this.selectedIndex>=0&&this.value!==''};}});
 // LinkeDOM supplies parsing/events/Shadow DOM; dimensions and canvas are transports.
 Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{get:()=>800,configurable:true});Object.defineProperty(window.HTMLElement.prototype,'clientHeight',{get:()=>600,configurable:true});
 window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
 const controls=[];
 function mount(toolId,sourceOnly=false){
  const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'}),parsed=parseHTML(html).document;for(const child of [...parsed.body.children])if(child.tagName!=='SCRIPT')root.append(document.importNode(child,true));
  const scoped={getElementById:id=>root.getElementById(id),querySelectorAll:s=>root.querySelectorAll(s),createElement:t=>document.createElement(t),documentElement:host,addEventListener:(...args)=>root.addEventListener(...args),removeEventListener:(...args)=>root.removeEventListener(...args)};
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

test('Panel Close all keeps adopted original pixels, bytes and settings instead of reloading empty',async()=>{
 const env=environment();try{const panel=env.mount('inspection.adjust'),file=new Blob(['original bytes']),source={width:640,height:480,draw(){},close(){throw Error('Shared original must not be closed by an analysis');}},input={file,source,imageId:'shared-source',hash:'fingerprint',description:'same source'};
 panel.controller.adopt(input);panel.root.getElementById('close-dialog').close=()=>{};panel.root.getElementById('confirm-close').onclick();assert.equal(panel.controller.input().file,file);assert.equal(panel.controller.input().imageId,'shared-source');assert.equal(panel.controller.input().source.width,640);assert.equal(panel.root.getElementById('app').classList.contains('original-mode'),true);assert.equal(panel.root.getElementById('empty').hidden,true);
 }finally{await env.dispose();}
});

test('Original navigation and manual opening zones work before any scientific source is loaded',async()=>{
 const env=environment();let released=0;try{const panel=env.mount('original',true),file=new File(['original'],'photo.avif'),draft=createOpeningRegionDraft({file,generation:1,width:10000,height:8000}),surface={width:10000,height:8000,openingPresentation:true,previewOnly:true,prepare:()=>true,draw(){},close(){released++;}},view=panel.root.getElementById('viewport');view.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});view.setPointerCapture=()=>{};
 assert.equal(panel.controller.showOpeningPresentation(surface,{file,regionDraft:draft}),true);assert.equal(panel.controller.input().source,null);assert.equal(panel.controller.input().file,null);assert.equal(panel.controller.snapshot().hasResult,false);const zoom=panel.controller.snapshot().zoom;panel.controller.zoomBy(1.25);assert.notEqual(panel.controller.snapshot().zoom,zoom);panel.controller.fit();panel.controller.beginOpeningRegion('exclusion');view.onpointerdown({button:0,pointerId:1,clientX:100,clientY:100,target:view});view.onpointermove({pointerId:1,clientX:200,clientY:180,target:view});view.onpointerup({pointerId:1,target:view});assert.equal(draft.snapshot().zones.length,1);assert.equal(draft.snapshot().zones[0].kind,'exclusion');assert.equal(draft.snapshot().sourceSha256,undefined);assert.equal(panel.controller.input().source,null);panel.controller.clearOpeningPresentation();assert.equal(released,1);assert.equal(panel.controller.snapshot().openingPresentation,false);
 }finally{await env.dispose();}
});
