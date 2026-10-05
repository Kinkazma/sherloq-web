import {bindSliderReset} from '../sherloq-browser/assets/slider-reset.js';
import * as media from '../sherloq-browser/assets/media-settings.js';
// Integration tests of the shipped app handlers, with a minimal DOM and a controlled
// Worker transport. No engine/formula simulation or browser-rendering claim.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolveComputeProfile} from '../sherloq-browser/assets/resource-policy.js';
import {webcrypto} from 'node:crypto';
import * as settings from '../sherloq-browser/assets/settings.js';
import {bindViewerNavigation,doubleClickCamera} from '../sherloq-browser/assets/viewer-input.js';
import {TileCache} from '../sherloq-browser/assets/tiled-surface.js';
import {createErrorJournal,errorEvidence} from '../sherloq-browser/assets/error-journal.js';
import {localizeStatus} from '../sherloq-browser/assets/ui-errors.js';
import {strings} from '../sherloq-browser/assets/i18n.js';
import {toolGroups} from '../sherloq-browser/assets/tool-tree.js';
const appURL=new URL('../sherloq-browser/assets/app.js',import.meta.url);
const code=(await readFile(appURL,'utf8')).replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(appURL.href)).replace('export function mountAnalysisPanel(document=globalThis.document,host={}) {','const host={};').replace(/\n if\(host.managed\)\{[\s\S]*$/, '');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const copy=value=>JSON.parse(JSON.stringify(value));
function harness(blockStorage=false){
 const nodes=new Map(),workers=[],timers=new Map();let timerId=0;
 class Element {
  constructor(){this.listeners={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.options=[];this.dataset={};this.attrs={};this.children=[];this.clientWidth=800;this.clientHeight=600;const classes=new Set();this.classList={contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,v)=>{v=v??!classes.has(k);v?classes.add(k):classes.delete(k);return v;}};}
  querySelectorAll(){return [];} removeAttribute(k){delete this.attrs[k];} setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
  replaceChildren(...items){this.children=items;this.options=items;}
  append(...items){this.children.push(...items);} addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);} emit(type,event={}){for(const fn of this.listeners[type]||[])fn(event);} focus(){} click(){}
  showModal(){this.open=true;} close(){this.open=false;}
  getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});}
 }
 const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 for(const [k,v]of Object.entries(settings.defaults))$(k)[typeof v==='boolean'?'checked':'value']=v;
 for(const [k,v]of Object.entries({preset:'native','zone-mode':'whole','compute-profile':'aggressive',layer:'source'}))$(k).value=v;
 $('show-zones').checked=true;
 const document={getElementById:$,createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){},documentElement:new Element()};
 class Worker {
  constructor(){this.calls=[];workers.push(this);}
  postMessage(call,transfer=[]){const bytes=call.payload?.bytes;this.calls.push(structuredClone(call,{transfer}));if(bytes)this.inputDetached=bytes.byteLength===0;} terminate(){this.terminated=true;}
  reply(call,result){this.onmessage({data:{id:call.id,result}});}
  progress(call){this.onmessage({data:{id:call.id,progress:{fraction:.75,phase:'late'}}});}
 }
 const sandbox={bindSliderReset,...media,createPointerLoupe:()=>({enabled:false,set(){},draw(){},cancelImage(){},dispose(){}}),createErrorJournal,errorEvidence,localizeStatus,toolCatalog:{},toolTitle:id=>id,createToolWorkspace:()=>({select(){},lock(){},hideResult(){},invalidateResult(){},setFile(){},restore(){},serialize(){return {};}}),resolveComputeProfile,createRemoteSurface:p=>({width:p.width,height:p.height,byteLength:0,draw(){},close(){}}),removeTerminatedTemporarySession:async()=>{},createEnergyUI:()=>({bundle:()=>settings.validEnergySettings(),load(){},translate(){}}),...settings,bindViewerNavigation,doubleClickCamera,TileCache,createTiledSurface:p=>({width:p.width,height:p.height,byteLength:p.data.byteLength,pixels:p,draw(){},close(){this.byteLength=0;}}),exportRGBPNG:()=>{throw new Error('Not used by state tests');},strings,toolGroups,document,Worker,URL,URLSearchParams,Uint8Array,Uint8ClampedArray,structuredClone,crypto:webcrypto,console,queueMicrotask,clearInterval(){},setInterval(){return 0;},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),location:{hash:'',href:appURL.href},navigator:{hardwareConcurrency:8},performance:{},isSecureContext:true,devicePixelRatio:1,innerWidth:1000,localStorage:{getItem:()=>null,setItem(){if(blockStorage)throw Error("Storage denied");}},matchMedia:()=>({matches:false}),window:{addEventListener(){}},ResizeObserver:class{observe(){}},Option:class{constructor(text,value){this.text=text;this.value=value;}},createWindowLayout:()=>({mode:'tabs',set(mode){this.mode=mode;},draw(){},fit(){},focus(){}})};
 const context=vm.createContext(sandbox);new vm.Script(code,{filename:appURL.pathname}).runInContext(context);
 const read=expression=>copy(vm.runInContext(expression,context));
 function edit(key,value){$(key)[typeof settings.defaults[key]==='boolean'?'checked':'value']=value;$(key).onchange();}
 function saveProfile(){ $('profile-name').value='Custom';$('save-profile-form').onsubmit({preventDefault(){}});return $('preset').value; }
 async function open(){const bytes=new Uint8Array([255,216,255,217]);const done=$('file').onchange({target:{files:[Object.assign(new Blob([bytes],{type:'image/jpeg'}),{name:'transport-fixture.jpg'})]}});while(!workers.length||!workers.at(-1).calls.length)await tick();const worker=workers.at(-1);worker.reply(worker.calls[0],{});await tick();worker.reply(worker.calls[1],{width:1,height:1,sha256:'fixture',surface:{id:'fixture',width:1,height:1,revision:0}});await done;return worker;}
 return{$,workers,read,edit,saveProfile,open,flush(){const batch=[...timers.values()];timers.clear();for(const fn of batch)fn();}};
}
test('each classic ELA field leaves all other values and the stored profile untouched',()=>{
 for(const [key,value]of Object.entries({quality:82,scale:61,contrast:33,linear:false,grayscale:false})){
  const h=harness();
  for(const [field,initial]of Object.entries({quality:91,scale:69,contrast:28,linear:true,grayscale:true}))h.edit(field,initial);
  const id=h.saveProfile(),before=h.read('params'),saved=h.read('profiles');
  h.edit(key,value);
  assert.deepEqual(h.read('params'),{...before,[key]:value});assert.equal(h.$('preset').value,'manual');assert.deepEqual(h.read('profiles'),saved);
  h.$('preset').onchange();assert.deepEqual(h.read('params'),{...before,[key]:value},'selecting Manual must not restore defaults');
  h.$('preset').value=id;h.$('preset').onchange();assert.deepEqual(h.read('params'),before,'only explicit profile selection restores the full snapshot');
 }
});
test('late messages after cancellation cannot overwrite manual settings or publish a stale result',async()=>{
 const h=harness();h.saveProfile();const worker=await h.open();const done=h.$('run').onclick();const call=worker.calls.at(-1);
 for(const key of Object.keys(settings.defaults))assert.equal(h.$(key).disabled,true);
 h.$('cancel').onclick();h.edit('scale',63);const before=h.read('params'),status=h.$('status').textContent;
 worker.progress(call);worker.reply(call,{display:{width:1,height:1,revision:1},params:{quality:1,scale:1,contrast:1}});await done;
 assert.deepEqual(h.read('params'),before);assert.equal(h.$('preset').value,'manual');assert.equal(h.read('resultMeta'),null);assert.equal(h.$('export-report').disabled,true);assert.equal(h.$('status').textContent,status);
});
test('already resolved worker result is discarded if interaction invalidates its generation before continuation',async()=>{
 const h=harness(),worker=await h.open();const done=h.$('run').onclick();const call=worker.calls.at(-1);
 worker.reply(call,{display:{width:1,height:1,revision:1}});
 h.$('cancel').onclick();h.edit('contrast',44);await done;
 assert.equal(h.read('params.contrast'),44);assert.equal(h.$('preset').value,'manual');assert.equal(h.read('resultMeta'),null);assert.equal(h.$('run').disabled,false);
});
test('ordinary calculation response cannot apply parameters returned by a worker',async()=>{
 const h=harness();h.edit('quality',83);const before=h.read('params'),worker=await h.open();const done=h.$('run').onclick(),call=worker.calls.at(-1);
 assert.deepEqual(copy(call.payload.params),before);
 worker.reply(call,{display:{width:1,height:1,revision:1},params:{quality:1,scale:1,contrast:1}});await tick();worker.reply(worker.calls.at(-1),{});await done;
 assert.deepEqual(h.read('params'),before);assert.deepEqual(h.read('resultMeta.parameters'),before);assert.equal(h.$('preset').value,'manual');assert.equal(h.$('export-report').disabled,false);
});
test('committing the same classic value still selects Manual without applying a profile',()=>{
 const h=harness();h.edit('quality',100);h.edit('scale',68);h.saveProfile();const before=h.read('params'),saved=h.read('profiles');
 h.edit('quality',100);
 assert.equal(h.$('preset').value,'manual');assert.deepEqual(h.read('params'),before);assert.deepEqual(h.read('profiles'),saved);
});

test('numeric edit intentions invalidate before value events, including either limit',()=>{
 for(const [key,limits]of Object.entries({quality:[1,100],scale:[1,100],contrast:[0,100]}))for(const limit of limits)for(const [type,event]of [['pointerdown',{button:0,isPrimary:true}],['keydown',{key:limit===100?'ArrowUp':'ArrowDown'}],['beforeinput',{inputType:'insertText'}]]){
  const h=harness();h.edit(key,limit);h.saveProfile();const before=h.read('params'),revision=h.read('revision');
  h.$(key).emit(type,event);
  assert.equal(h.$('preset').value,'manual');assert.deepEqual(h.read('params'),before);assert.ok(h.read('revision')>revision);
 }
});
test('focus, navigation, secondary pointer, unsupported wheel and disabled controls preserve the profile',()=>{
 for(const [type,event]of [['focus',{}],['keydown',{key:'Tab'}],['keydown',{key:'Home'}],['keydown',{key:'End'}],['keydown',{key:'ArrowLeft'}],['keydown',{key:'ArrowUp',ctrlKey:true}],['pointerdown',{button:2}],['pointerdown',{button:0,isPrimary:false}],['wheel',{deltaY:20}]]){
  const h=harness(),id=h.saveProfile(),before=h.read('params'),revision=h.read('revision');h.$('quality').emit(type,event);
  assert.equal(h.$('preset').value,id);assert.deepEqual(h.read('params'),before);assert.equal(h.read('revision'),revision);
 }
 const h=harness(),id=h.saveProfile();h.$('quality').disabled=true;h.$('quality').emit('keydown',{key:'ArrowUp'});assert.equal(h.$('preset').value,id);
});

test('original file uses Blob transport without a UI arrayBuffer copy',async()=>{const h=harness(),worker=await h.open();const payload=worker.calls[1].payload;assert.equal(payload.bytes,undefined);assert.ok(payload.blob instanceof Blob);assert.deepEqual([...new Uint8Array(await payload.blob.arrayBuffer())],[255,216,255,217]);});
test('zoom and pan keep hit-testing in full source coordinates, with source-edge clamping',()=>{
 const h=harness();
 assert.deepEqual(h.read('source={width:4800,height:3200};zoom=.25;offset={x:-120,y:50};imagePoint({x:180,y:250})'),{x:1200,y:800});
 assert.deepEqual(h.read('zoom=.5;offset={x:-420,y:-150};imagePoint({x:180,y:250})'),{x:1200,y:800});
 assert.deepEqual(h.read('imagePoint({x:-99999,y:99999})'),{x:0,y:3200});
});
test('main viewport double click uses actual fit framing without changing scientific settings',async()=>{
 const h=harness();await h.open();h.$('viewport').getBoundingClientRect=()=>({left:0,top:0});
 const initial=h.read('params');const click={button:0,clientX:200,clientY:200,preventDefault(){}};
 h.$('viewport').emit('dblclick',click);assert.equal(h.read('zoom'),1140);
 h.$('viewport').emit('dblclick',click);assert.equal(h.read('zoom'),570);
 assert.deepEqual(h.read('params'),initial);assert.deepEqual(h.read('regions'),[]);
});

test('opening an image schedules ELA automatically; cancellation prevents a queued run',async()=>{
 const h=harness(),worker=await h.open();assert.equal(worker.calls.filter(x=>x.action==='run').length,0);h.flush();const call=worker.calls.at(-1);assert.equal(call.action,'run');assert.equal(call.payload.operation,'ela.classic');h.$('cancel').onclick();
 h.edit('scale',63);h.$('cancel').onclick();h.flush();assert.equal(h.workers.length,1);
});
test('editing settings recalculates automatically, and Original tab cancels a queued calculation',async()=>{
 const h=harness(),worker=await h.open();h.$('tab-original').onclick();h.flush();assert.equal(worker.calls.filter(x=>x.action==='run').length,0);
 h.$('tab-ela').onclick();h.edit('contrast',42);h.flush();const call=worker.calls.at(-1);assert.equal(call.action,'run');assert.equal(call.payload.params.contrast,42);h.$('cancel').onclick();
});

test('new-feature highlights only change presentation, even when storage is unavailable',()=>{const h=harness(true),before=h.read('({params,revision,zoom,offset})');assert.equal(h.$('highlight-new-features').checked,false);h.$('highlight-new-features').checked=true;h.$('highlight-new-features').onchange();assert.equal(h.$('app').classList.contains('highlight-new-features'),true);assert.deepEqual(h.read('({params,revision,zoom,offset})'),before);assert.equal(h.workers.length,0);});
